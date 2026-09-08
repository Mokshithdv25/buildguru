from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
import os
import re
import json
import base64
import hashlib
import hmac
import logging
import math
import requests
import threading
import time
from collections import deque
from pathlib import Path
from urllib.parse import unquote
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid
from datetime import datetime, timezone

# Gemini SDK
try:
    from google import genai as google_genai
    from google.genai import types as genai_types
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

try:
    from supabase import create_client as create_supabase_client
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False

try:
    import razorpay as razorpay_sdk
    _RAZORPAY_SDK_AVAILABLE = True
except ImportError:
    _RAZORPAY_SDK_AVAILABLE = False


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def _bounded_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    """Read an integer setting without allowing unsafe deployment values."""
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# Request limits are deliberately configurable, but always clamped to safe ranges.
HUB_CONTEXT_MAX_BYTES = _bounded_int_env("HUB_CONTEXT_MAX_BYTES", 64 * 1024, 1024, 512 * 1024)
AI_BRIEF_MAX_BYTES = _bounded_int_env("AI_BRIEF_MAX_BYTES", 2 * 1024 * 1024, 1024, 4 * 1024 * 1024)
AI_IMAGE_BUNDLE_MAX_BYTES = _bounded_int_env(
    "AI_IMAGE_BUNDLE_MAX_BYTES", 512 * 1024, 1024, 4 * 1024 * 1024
)
RAZORPAY_WEBHOOK_MAX_BYTES = _bounded_int_env(
    "RAZORPAY_WEBHOOK_MAX_BYTES", 256 * 1024, 1024, 1024 * 1024
)
MAX_REQUEST_BODY_BYTES = _bounded_int_env(
    "MAX_REQUEST_BODY_BYTES", 5 * 1024 * 1024, 64 * 1024, 10 * 1024 * 1024
)

AI_RATE_LIMIT_REQUESTS = _bounded_int_env("AI_RATE_LIMIT_REQUESTS", 12, 1, 1000)
AI_RATE_LIMIT_WINDOW_SECONDS = _bounded_int_env("AI_RATE_LIMIT_WINDOW_SECONDS", 60, 1, 3600)
AI_MAX_CONCURRENT_REQUESTS = _bounded_int_env("AI_MAX_CONCURRENT_REQUESTS", 4, 1, 32)
AI_MAX_CONCURRENT_PER_USER = _bounded_int_env("AI_MAX_CONCURRENT_PER_USER", 2, 1, 8)
AI_CAPACITY_RETRY_SECONDS = _bounded_int_env("AI_CAPACITY_RETRY_SECONDS", 2, 1, 60)
AI_DAILY_IMAGE_PACKS = _bounded_int_env("AI_DAILY_IMAGE_PACKS", 3, 1, 50)

# ---------------------------------------------------------------------------
# MongoDB Atlas connection
# ---------------------------------------------------------------------------
from pymongo import MongoClient

_supabase = None
_mongo_client = None
_db = None
_portfolios = None

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
if _SUPABASE_AVAILABLE and SUPABASE_URL and SUPABASE_KEY:
    _supabase = create_supabase_client(SUPABASE_URL, SUPABASE_KEY)
else:
    _mongo_client = MongoClient(
        os.getenv("MONGO_URL", "mongodb://localhost:27017"),
        serverSelectionTimeoutMS=_bounded_int_env(
            "MONGO_SERVER_SELECTION_TIMEOUT_MS", 3000, 250, 10000
        ),
    )
    _db = _mongo_client[os.getenv("DB_NAME", "buildguru")]
    _portfolios = _db["portfolios"]

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
BILLING_ENABLED = _env_flag("BILLING_ENABLED", False)
ALLOW_LIVE_BILLING = _env_flag("ALLOW_LIVE_BILLING", False)

PAID_PLANS = {
    "homeowner_project_pass": {
        "name": "BuildGuru Project Pass",
        "amount_paise": 499_900,
        "role": "homeowner",
        "duration_days": None,
        "description": "AI design, estimate and project workspace access",
    },
    "pro_growth_30d": {
        "name": "BuildGuru Pro Growth",
        "amount_paise": 199_900,
        "role": "pro",
        "duration_days": 30,
        "description": "30 days of Pro Growth portfolio and directory tools",
    },
}


def _bearer_token(authorization: Optional[str]) -> str:
    value = (authorization or "").strip()
    if not value.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue")
    token = value[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return token


def _require_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Validate the Supabase token in FastAPI's worker thread, not the event loop."""
    token = _bearer_token(authorization)
    api_key = SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY
    if not SUPABASE_URL or not api_key:
        raise HTTPException(status_code=503, detail="Authentication service is not configured")
    try:
        response = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={"apikey": api_key, "Authorization": f"Bearer {token}"},
            timeout=12,
        )
    except requests.RequestException as exc:
        logger.warning("Supabase auth validation failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not validate your session") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    try:
        user = response.json()
    except (TypeError, ValueError) as exc:
        logger.warning("Supabase auth returned malformed JSON")
        raise HTTPException(status_code=503, detail="Could not validate your session") from exc
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    return user


def _bounded_json_object(value: dict, max_bytes: int, label: str) -> dict:
    """Reject oversized or non-JSON objects before they reach provider prompts."""
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must contain valid JSON values") from exc
    if len(encoded) > max_bytes:
        raise ValueError(f"{label} exceeds the {max_bytes}-byte limit")
    return value


# These process-local guards protect provider spend and worker capacity. A shared
# gateway/Redis limiter should replace them if the service is scaled to many workers.
_ai_guard_lock = threading.Lock()
_ai_request_times: dict[str, deque] = {}
_ai_active_by_user: dict[str, int] = {}
_ai_active_total = 0


def _ai_request_slot(user: dict = Depends(_require_user)):
    """Apply a sliding-window user limit and hold a bounded AI concurrency slot."""
    global _ai_active_total

    user_id = str(user.get("id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to continue")

    now = time.monotonic()
    cutoff = now - AI_RATE_LIMIT_WINDOW_SECONDS
    with _ai_guard_lock:
        events = _ai_request_times.setdefault(user_id, deque())
        while events and events[0] <= cutoff:
            events.popleft()

        if len(events) >= AI_RATE_LIMIT_REQUESTS:
            retry_after = max(1, math.ceil(AI_RATE_LIMIT_WINDOW_SECONDS - (now - events[0])))
            raise HTTPException(
                status_code=429,
                detail="AI request limit reached. Please try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )

        user_active = _ai_active_by_user.get(user_id, 0)
        if (
            _ai_active_total >= AI_MAX_CONCURRENT_REQUESTS
            or user_active >= AI_MAX_CONCURRENT_PER_USER
        ):
            raise HTTPException(
                status_code=503,
                detail="AI service is at capacity. Please try again shortly.",
                headers={"Retry-After": str(AI_CAPACITY_RETRY_SECONDS)},
            )

        events.append(now)
        _ai_active_total += 1
        _ai_active_by_user[user_id] = user_active + 1

        # Opportunistic cleanup prevents inactive one-time users growing the map forever.
        if len(_ai_request_times) > 2048:
            stale_users = [
                key
                for key, timestamps in _ai_request_times.items()
                if key != user_id
                and not _ai_active_by_user.get(key)
                and (not timestamps or timestamps[-1] <= cutoff)
            ]
            for key in stale_users:
                _ai_request_times.pop(key, None)

    try:
        yield user
    finally:
        with _ai_guard_lock:
            _ai_active_total = max(0, _ai_active_total - 1)
            remaining = _ai_active_by_user.get(user_id, 1) - 1
            if remaining > 0:
                _ai_active_by_user[user_id] = remaining
            else:
                _ai_active_by_user.pop(user_id, None)


def _seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    elapsed = now.hour * 3600 + now.minute * 60 + now.second
    return max(1, 86400 - elapsed)


def _consume_ai_daily_quota(user_id: str, limit: Optional[int] = None) -> None:
    """Atomically consume one durable UTC-day image-pack allowance."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    if not _supabase or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("AI image quota is unavailable without Supabase service configuration")
        raise HTTPException(
            status_code=503,
            detail="AI usage controls are temporarily unavailable. Please try again.",
            headers={"Retry-After": str(AI_CAPACITY_RETRY_SECONDS)},
        )

    try:
        result = _supabase.rpc(
            "consume_ai_daily_quota",
            {
                "p_user_id": user_id,
                "p_usage_kind": "image_pack",
                "p_limit": limit or AI_DAILY_IMAGE_PACKS,
            },
        ).execute()
    except Exception as exc:
        logger.exception("Could not enforce durable AI image quota")
        raise HTTPException(
            status_code=503,
            detail="AI usage controls are temporarily unavailable. Please try again.",
            headers={"Retry-After": str(AI_CAPACITY_RETRY_SECONDS)},
        ) from exc

    if result.data is False:
        raise HTTPException(
            status_code=429,
            detail="Daily AI image limit reached. Please try again tomorrow.",
            headers={"Retry-After": str(_seconds_until_utc_midnight())},
        )
    if result.data is not True:
        logger.error("AI image quota RPC returned an invalid response")
        raise HTTPException(
            status_code=503,
            detail="AI usage controls are temporarily unavailable. Please try again.",
            headers={"Retry-After": str(AI_CAPACITY_RETRY_SECONDS)},
        )


def _require_billing_config() -> None:
    if not BILLING_ENABLED:
        raise HTTPException(status_code=503, detail="Checkout is not active yet")
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Payments are not active yet")
    if RAZORPAY_KEY_ID.startswith("rzp_live_") and not ALLOW_LIVE_BILLING:
        raise HTTPException(status_code=503, detail="Live checkout is disabled")
    if not _supabase or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Billing storage is not configured")


def _remove_user_storage(user_id: str) -> None:
    """Remove every owner-prefixed object, failing before auth deletion if cleanup is incomplete."""
    if not _supabase:
        return
    for bucket_name in ("project-v0", "portfolio-media", "project-documents"):
        bucket = _supabase.storage.from_(bucket_name)
        pending = [user_id]
        paths: list[str] = []
        while pending:
            prefix = pending.pop()
            offset = 0
            while True:
                try:
                    entries = bucket.list(prefix, {"limit": 100, "offset": offset}) or []
                except Exception as exc:
                    raise RuntimeError(
                        f"Could not enumerate {bucket_name} during account deletion"
                    ) from exc
                for entry in entries:
                    name = entry.get("name") if isinstance(entry, dict) else getattr(entry, "name", None)
                    if not name:
                        continue
                    path = f"{prefix}/{name}"
                    entry_id = entry.get("id") if isinstance(entry, dict) else getattr(entry, "id", None)
                    if entry_id:
                        paths.append(path)
                    else:
                        pending.append(path)
                if len(entries) < 100:
                    break
                offset += len(entries)
        for start in range(0, len(paths), 100):
            bucket.remove(paths[start:start + 100])


def _repo_mode() -> str:
    return "supabase" if _supabase is not None else "mongo"


def _csv_env(name: str, fallback: str = "") -> list[str]:
    raw = os.getenv(name, fallback)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _load_portfolio(portfolio_id: str) -> dict | None:
    if _repo_mode() == "supabase":
        res = _supabase.table("portfolios").select("*").eq("id", portfolio_id).limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None
    return _portfolios.find_one({"id": portfolio_id}, {"_id": 0})


def _find_portfolio_by_slug(slug: str, published_only: bool = False) -> dict | None:
    if _repo_mode() == "supabase":
        q = _supabase.table("portfolios").select("*").eq("slug", slug)
        if published_only:
            q = q.eq("published", True).eq("moderation_status", "approved")
        res = q.limit(1).execute()
        rows = res.data or []
        return rows[0] if rows else None
    query = {"slug": slug}
    if published_only:
        query["published"] = True
        query["moderation_status"] = "approved"
    return _portfolios.find_one(query, {"_id": 0})


def _save_portfolio(doc: dict):
    if _repo_mode() == "supabase":
        _supabase.table("portfolios").upsert(doc, on_conflict="id").execute()
        return
    _portfolios.replace_one({"id": doc["id"]}, doc, upsert=True)


def _slug_exists(slug: str, portfolio_id: str) -> bool:
    if _repo_mode() == "supabase":
        res = (
            _supabase.table("portfolios")
            .select("id")
            .eq("slug", slug)
            .neq("id", portfolio_id)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    existing = _portfolios.find_one({"slug": slug, "id": {"$ne": portfolio_id}}, {"_id": 0})
    return existing is not None


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Cap request bodies while ASGI chunks are read, before JSON parsing allocates them."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                declared = int(raw_length)
            except ValueError:
                response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
                await response(scope, receive, send)
                return
            if declared < 0:
                response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
                await response(scope, receive, send)
                return
            if declared > self.max_bytes:
                response = JSONResponse(status_code=413, content={"detail": "Request body is too large"})
                await response(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _RequestBodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            response = JSONResponse(status_code=413, content={"detail": "Request body is too large"})
            await response(scope, receive, send)


app = FastAPI()
api_router = APIRouter(prefix="/api")


CraftType = Literal[
    "architect",
    "designer",
    "engineer",
    "contractor",
    "plumber",
    "electrician",
    "painter",
    "carpenter",
]

EXPERIENCE_VALUES = {
    "<1 Year": 0,
    "1-2 Years": 2,
    "3-5 Years": 5,
    "6-8 Years": 8,
    "8+ Years": 8,
}


class PortfolioCreate(BaseModel):
    craft: CraftType


class PortfolioUpdate(BaseModel):
    craft: Optional[CraftType] = None
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    city: Optional[str] = None
    years_experience: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    short_bio: Optional[str] = None
    specialties: Optional[List[str]] = None
    photos: Optional[List[str]] = None  # base64 data URLs
    cover_photo: Optional[str] = None
    profile_photo: Optional[str] = None
    step: Optional[int] = None
    profile_strength: Optional[int] = None
    portfolio_theme: Optional[str] = None
    portfolio_layout: Optional[str] = None


class Portfolio(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_user_id: Optional[str] = None
    craft: CraftType
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    city: Optional[str] = None
    years_experience: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    short_bio: Optional[str] = None
    specialties: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)
    cover_photo: Optional[str] = None
    profile_photo: Optional[str] = None
    profile_strength: int = 15
    step: int = 1
    published: bool = False
    moderation_status: Literal["pending", "approved", "rejected"] = "pending"
    slug: Optional[str] = None
    portfolio_theme: Optional[str] = None
    portfolio_layout: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PublicPortfolio(BaseModel):
    """Allow-list for directory profiles; private contact and ownership fields stay server-side."""
    model_config = ConfigDict(extra="ignore")

    id: str
    craft: CraftType
    full_name: Optional[str] = None
    business_name: Optional[str] = None
    city: Optional[str] = None
    years_experience: Optional[str] = None
    short_bio: Optional[str] = None
    specialties: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)
    cover_photo: Optional[str] = None
    profile_photo: Optional[str] = None
    published: bool = True
    slug: Optional[str] = None
    portfolio_theme: Optional[str] = None
    portfolio_layout: Optional[str] = None


def _slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text or "pro"


def _portfolio_media_storage_path(value: Optional[str]) -> Optional[str]:
    marker = "/storage/v1/object/"
    raw = str(value or "")
    marker_index = raw.find(marker)
    if marker_index < 0:
        return None
    remainder = raw[marker_index + len(marker):]
    for prefix in ("public/portfolio-media/", "sign/portfolio-media/"):
        if remainder.startswith(prefix):
            return unquote(remainder[len(prefix):].split("?", 1)[0])
    return None


def _signed_portfolio_media_url(value: Optional[str], expected_prefix: str) -> Optional[str]:
    path = _portfolio_media_storage_path(value)
    if not path:
        return value
    if not expected_prefix or not path.startswith(expected_prefix):
        logger.warning("Rejected a published portfolio media path outside its owner prefix")
        return None
    if not _supabase:
        return value
    try:
        signed = _supabase.storage.from_("portfolio-media").create_signed_url(path, 3600)
    except Exception as exc:
        logger.warning("Could not sign published portfolio media: %s", exc)
        return None
    if isinstance(signed, dict):
        return signed.get("signedURL") or signed.get("signedUrl")
    return None


def _public_portfolio(doc: dict) -> PublicPortfolio:
    profile = PublicPortfolio.model_validate(doc)
    owner_id = str(doc.get("owner_user_id") or "")
    portfolio_id = str(doc.get("id") or "")
    expected_prefix = f"{owner_id}/{portfolio_id}/" if owner_id and portfolio_id else ""
    profile.photos = [
        signed
        for signed in (
            _signed_portfolio_media_url(url, expected_prefix) for url in profile.photos
        )
        if signed
    ]
    profile.cover_photo = _signed_portfolio_media_url(profile.cover_photo, expected_prefix)
    profile.profile_photo = _signed_portfolio_media_url(profile.profile_photo, expected_prefix)
    return profile


@app.get("/health/live")
def health_live():
    """Process liveness only; intentionally does not touch external services."""
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    """Require the complete launch schema, private buckets, and configured persistence."""
    mode = _repo_mode()
    try:
        if mode == "supabase":
            if not SUPABASE_SERVICE_ROLE_KEY:
                raise RuntimeError("Supabase service configuration is incomplete")
            result = _supabase.rpc("launch_schema_ready").execute()
            if result.data is not True:
                raise RuntimeError("Launch schema readiness contract failed")
        else:
            if not _env_flag("ALLOW_MONGO_FALLBACK", False):
                raise RuntimeError("Mongo fallback is disabled for launch")
            _mongo_client.admin.command("ping")
    except Exception:
        logger.warning("Readiness database probe failed for backend=%s", mode)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unavailable"},
        )
    return {"status": "ready", "database": "ok"}


@api_router.get("/")
def root():
    return {"message": "BuildGuru API"}


@api_router.post("/portfolio", response_model=Portfolio)
def create_portfolio(payload: PortfolioCreate, user: dict = Depends(_require_user)):
    portfolio = Portfolio(
        craft=payload.craft,
        owner_user_id=user["id"],
        profile_strength=25,
        step=1,
    )
    _save_portfolio(portfolio.model_dump())
    return portfolio


@api_router.get("/portfolio/{portfolio_id}", response_model=Portfolio)
def get_portfolio(portfolio_id: str, user: dict = Depends(_require_user)):
    doc = _load_portfolio(portfolio_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if doc.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this portfolio")
    return Portfolio(**doc)


@api_router.patch("/portfolio/{portfolio_id}", response_model=Portfolio)
def update_portfolio(
    portfolio_id: str,
    payload: PortfolioUpdate,
    user: dict = Depends(_require_user),
):
    doc = _load_portfolio(portfolio_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if doc.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this portfolio")

    update_fields = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    doc.update(update_fields)
    _save_portfolio(doc)
    return Portfolio(**doc)


@api_router.post("/portfolio/{portfolio_id}/publish", response_model=Portfolio)
def publish_portfolio(portfolio_id: str, user: dict = Depends(_require_user)):
    doc = _load_portfolio(portfolio_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if doc.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this portfolio")
    if not doc.get("full_name") or not doc.get("craft"):
        raise HTTPException(status_code=400, detail="Profile incomplete")

    base = _slugify(doc.get("full_name"))
    slug = base
    # Ensure slug uniqueness across all portfolios
    if _slug_exists(slug, portfolio_id):
        slug = f"{base}-{doc['id'][:6]}"

    doc.update({
        "slug": slug,
        "published": True,
        "moderation_status": "approved",
        "profile_strength": 100,
        "step": 5,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    _save_portfolio(doc)
    return Portfolio(**doc)


@api_router.post("/portfolio/{portfolio_id}/unpublish", response_model=Portfolio)
def unpublish_portfolio(portfolio_id: str, user: dict = Depends(_require_user)):
    doc = _load_portfolio(portfolio_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if doc.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You do not own this portfolio")

    doc.update({
        "published": False,
        "moderation_status": "pending",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    _save_portfolio(doc)
    return Portfolio(**doc)


@api_router.get("/profile/{slug}", response_model=PublicPortfolio)
def public_profile(slug: str):
    doc = _find_portfolio_by_slug(slug, published_only=True)
    if not doc:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Pydantic drops every field not explicitly declared by PublicPortfolio.
    # The storage bucket is private, so published media is exposed with short-lived URLs.
    return _public_portfolio(doc)


@api_router.delete("/account")
def delete_account(user: dict = Depends(_require_user)):
    """Permanently remove the signed-in user's BuildGuru data and auth account."""
    if not _supabase or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Account deletion is not configured")
    user_id = user["id"]
    try:
        _remove_user_storage(user_id)
        portfolio_rows = _supabase.table("portfolios").select("id").eq("owner_user_id", user_id).execute().data or []
        portfolio_ids = [row["id"] for row in portfolio_rows if row.get("id")]
        if portfolio_ids:
            _supabase.table("portfolios").delete().in_("id", portfolio_ids).execute()
        _supabase.table("projects").delete().eq("owner_user_id", user_id).execute()
        _supabase.table("user_entitlements").delete().eq("user_id", user_id).execute()
        _supabase.table("billing_orders").delete().eq("user_id", user_id).execute()
        _supabase.table("user_profiles").delete().eq("id", user_id).execute()
        _supabase.auth.admin.delete_user(user_id)
    except Exception as exc:
        logger.exception("Account deletion failed for %s", user_id)
        raise HTTPException(status_code=500, detail="Could not complete account deletion. Contact support.") from exc
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Razorpay — shared order creation + signature verification
# ---------------------------------------------------------------------------
def _razorpay_keys_configured() -> bool:
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)


def _require_razorpay_keys() -> None:
    if not _razorpay_keys_configured():
        raise HTTPException(status_code=503, detail="Payments are not configured")
    if RAZORPAY_KEY_ID.startswith("rzp_live_") and not ALLOW_LIVE_BILLING:
        raise HTTPException(status_code=503, detail="Live checkout is disabled")


def _razorpay_client():
    if not _RAZORPAY_SDK_AVAILABLE:
        return None
    return razorpay_sdk.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def _razorpay_verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature.lower())


def _razorpay_create_order(
    amount_paise: int,
    currency: str,
    receipt: str,
    notes: Optional[dict] = None,
) -> dict:
    _require_razorpay_keys()
    if amount_paise < 100:
        raise HTTPException(status_code=400, detail="Amount must be at least 100 paise")
    currency = (currency or "INR").upper()
    payload = {
        "amount": int(amount_paise),
        "currency": currency,
        "receipt": receipt[:40],
    }
    if notes:
        payload["notes"] = notes
    try:
        client = _razorpay_client()
        if client:
            gateway_order = client.order.create(data=payload)
        else:
            response = requests.post(
                "https://api.razorpay.com/v1/orders",
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                json=payload,
                timeout=20,
            )
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Razorpay authentication failed")
            response.raise_for_status()
            gateway_order = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Razorpay order creation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not create payment order") from exc

    try:
        gateway_amount = int(gateway_order.get("amount") or 0)
    except (AttributeError, TypeError, ValueError):
        gateway_amount = -1
    if (
        not isinstance(gateway_order, dict)
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(gateway_order.get("id") or ""))
        or gateway_amount != int(amount_paise)
        or str(gateway_order.get("currency") or "").upper() != currency
        or gateway_order.get("status") != "created"
    ):
        logger.error("Razorpay returned an invalid order response")
        raise HTTPException(status_code=500, detail="Could not create payment order")
    return gateway_order


class CreateOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: int = Field(..., ge=100, le=50_000_000)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    receipt: str = Field(..., min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_#-]+$")


class VerifyPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    razorpay_order_id: str = Field(
        ..., min_length=6, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"
    )
    razorpay_payment_id: str = Field(
        ..., min_length=6, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"
    )
    razorpay_signature: str = Field(
        ..., min_length=64, max_length=64, pattern=r"^[0-9A-Fa-f]{64}$"
    )


@api_router.post("/create-order")
def create_order(payload: CreateOrderRequest):
    """Standard Razorpay order creation (amount in paise)."""
    gateway_order = _razorpay_create_order(
        payload.amount,
        payload.currency,
        payload.receipt,
    )
    return {
        "order_id": gateway_order["id"],
        "amount": int(gateway_order["amount"]),
        "currency": gateway_order["currency"],
        "key_id": RAZORPAY_KEY_ID,
    }


@api_router.post("/verify-payment")
def verify_payment(payload: VerifyPaymentRequest):
    """Verify Razorpay Standard Checkout signature (HMAC-SHA256)."""
    _require_razorpay_keys()
    if not _razorpay_verify_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    return {"success": True, "verified": True}


# ---------------------------------------------------------------------------
# Billing — Razorpay Standard Checkout + server-side entitlement records
# ---------------------------------------------------------------------------
class BillingOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: Literal["homeowner_project_pass", "pro_growth_30d"]


class BillingVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    razorpay_order_id: str = Field(
        ..., min_length=6, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"
    )
    razorpay_payment_id: str = Field(
        ..., min_length=6, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"
    )
    razorpay_signature: str = Field(
        ..., min_length=64, max_length=64, pattern=r"^[0-9A-Fa-f]{64}$"
    )


def _billing_rows(table: str, **equals) -> list[dict]:
    query = _supabase.table(table).select("*")
    for key, value in equals.items():
        query = query.eq(key, value)
    result = query.execute()
    return result.data or []


def _user_role(user: dict) -> str:
    rows = _billing_rows("user_profiles", id=user["id"])
    role = rows[0].get("role") if rows else None
    if role not in ("homeowner", "pro"):
        role = (user.get("user_metadata") or {}).get("role")
    return role if role in ("homeowner", "pro") else "homeowner"


def _entitlement_is_active(row: dict) -> bool:
    if row.get("status") != "active":
        return False
    raw_until = row.get("active_until")
    if not raw_until:
        return True
    try:
        active_until = datetime.fromisoformat(str(raw_until).replace("Z", "+00:00"))
        if active_until.tzinfo is None:
            active_until = active_until.replace(tzinfo=timezone.utc)
        return active_until > datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


def _billing_checkout_payload(plan: dict, gateway_order_id: str) -> dict:
    return {
        "key_id": RAZORPAY_KEY_ID,
        "order_id": gateway_order_id,
        "amount": plan["amount_paise"],
        "currency": "INR",
        "name": plan["name"],
        "description": plan["description"],
    }


def _activate_paid_order(order: dict, payment: dict) -> dict:
    """Atomically mark an order paid and grant its account entitlement."""
    result = _supabase.rpc(
        "activate_billing_order",
        {
            "p_order_id": order["id"],
            "p_payment_id": payment.get("id"),
            "p_payment_status": payment.get("status") or "captured",
        },
    ).execute()
    row = result.data
    if isinstance(row, list):
        row = row[0] if row else None
    if not row:
        raise HTTPException(status_code=500, detail="Payment was verified but plan activation failed")
    return row


@api_router.get("/billing/me")
def billing_me(user: dict = Depends(_require_user)):
    _require_billing_config()
    entitlements = _billing_rows("user_entitlements", user_id=user["id"])
    orders = (
        _supabase.table("billing_orders")
        .select("id, plan_id, amount_paise, currency, status, gateway_payment_status, paid_at, created_at")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    return {
        "role": _user_role(user),
        "plans": [
            {"id": key, **value}
            for key, value in PAID_PLANS.items()
            if value["role"] == _user_role(user)
        ],
        "entitlements": entitlements,
        "orders": orders.data or [],
    }


@api_router.post("/billing/order")
def create_billing_order(payload: BillingOrderRequest, user: dict = Depends(_require_user)):
    _require_billing_config()
    plan = PAID_PLANS[payload.plan_id]
    if _user_role(user) != plan["role"]:
        raise HTTPException(status_code=403, detail="This plan is not available for your account type")

    entitlements = _billing_rows(
        "user_entitlements", user_id=user["id"], plan_id=payload.plan_id
    )
    if any(_entitlement_is_active(row) for row in entitlements):
        raise HTTPException(status_code=409, detail="This plan is already active on your account")

    pending = (
        _supabase.table("billing_orders")
        .select("gateway_order_id")
        .eq("user_id", user["id"])
        .eq("plan_id", payload.plan_id)
        .eq("status", "created")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if pending and pending[0].get("gateway_order_id"):
        return _billing_checkout_payload(plan, pending[0]["gateway_order_id"])

    local_id = str(uuid.uuid4())
    receipt = f"hm_{local_id.replace('-', '')[:28]}"
    try:
        gateway_order = _razorpay_create_order(
            plan["amount_paise"],
            "INR",
            receipt,
            notes={"user_id": user["id"], "plan_id": payload.plan_id},
        )
    except HTTPException as exc:
        if exc.status_code == 400:
            raise
        raise HTTPException(status_code=502, detail="Could not start checkout. Please try again.") from exc

    row = {
        "id": local_id,
        "user_id": user["id"],
        "plan_id": payload.plan_id,
        "amount_paise": plan["amount_paise"],
        "currency": "INR",
        "gateway": "razorpay",
        "gateway_order_id": gateway_order["id"],
        "gateway_order_status": gateway_order.get("status"),
        "receipt": receipt,
        "status": "created",
    }
    _supabase.table("billing_orders").insert(row).execute()
    return _billing_checkout_payload(plan, gateway_order["id"])


@api_router.post("/billing/verify")
def verify_billing_payment(payload: BillingVerifyRequest, user: dict = Depends(_require_user)):
    _require_billing_config()
    rows = _billing_rows(
        "billing_orders",
        gateway_order_id=payload.razorpay_order_id,
        user_id=user["id"],
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Checkout order was not found")
    order = rows[0]
    if not _razorpay_verify_signature(
        order["gateway_order_id"],
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment verification failed")

    try:
        response = requests.get(
            f"https://api.razorpay.com/v1/payments/{payload.razorpay_payment_id}",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            timeout=20,
        )
        response.raise_for_status()
        payment = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not confirm payment status") from exc

    if not isinstance(payment, dict):
        raise HTTPException(status_code=502, detail="Could not confirm payment status")
    try:
        payment_amount = int(payment.get("amount") or 0)
        order_amount = int(order["amount_paise"])
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=502, detail="Could not confirm payment status") from exc

    if (
        payment.get("order_id") != order["gateway_order_id"]
        or payment_amount != order_amount
        or str(payment.get("currency") or "").upper()
        != str(order.get("currency") or "").upper()
    ):
        raise HTTPException(status_code=400, detail="Payment details do not match this order")
    if payment.get("status") != "captured":
        _supabase.table("billing_orders").update(
            {
                "gateway_payment_id": payment.get("id"),
                "gateway_payment_status": payment.get("status"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", order["id"]).execute()
        raise HTTPException(
            status_code=409,
            detail="Payment is authorised but not captured yet. Your plan will activate after capture.",
        )
    activated = _activate_paid_order(order, payment)
    return {"verified": True, "order": activated}


async def _read_webhook_body(request: Request) -> bytes:
    """Stream and cap the raw body before allocating the complete webhook payload."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_length = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length") from exc
        if declared_length < 0:
            raise HTTPException(status_code=400, detail="Invalid Content-Length")
        if declared_length > RAZORPAY_WEBHOOK_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Webhook payload is too large")

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > RAZORPAY_WEBHOOK_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Webhook payload is too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _validate_paid_webhook_event(
    event_type: str,
    order: dict,
    payment: dict,
    order_entity: dict,
) -> dict:
    """Bind every paid event to the exact local order amount, currency and final status."""
    expected_order_id = str(order.get("gateway_order_id") or "")
    expected_amount = int(order.get("amount_paise") or 0)
    expected_currency = str(order.get("currency") or "").upper()
    errors: list[str] = []

    def amount_matches(value) -> bool:
        try:
            return int(value) == expected_amount
        except (TypeError, ValueError):
            return False

    if not payment:
        errors.append("missing payment entity")
    else:
        if payment.get("order_id") != expected_order_id:
            errors.append("payment order id")
        if payment.get("status") != "captured":
            errors.append("payment status")
        if not amount_matches(payment.get("amount")):
            errors.append("payment amount")
        if str(payment.get("currency") or "").upper() != expected_currency:
            errors.append("payment currency")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(payment.get("id") or "")):
            errors.append("payment id")

    if event_type == "order.paid":
        if not order_entity:
            errors.append("missing order entity")
        else:
            if order_entity.get("id") != expected_order_id:
                errors.append("order id")
            if order_entity.get("status") != "paid":
                errors.append("order status")
            if not amount_matches(order_entity.get("amount")):
                errors.append("order amount")
            if not amount_matches(order_entity.get("amount_paid")):
                errors.append("order paid amount")
            if str(order_entity.get("currency") or "").upper() != expected_currency:
                errors.append("order currency")

    if errors:
        logger.warning(
            "Rejected mismatched Razorpay %s event for local order %s: %s",
            event_type,
            order.get("id"),
            ", ".join(errors),
        )
        raise HTTPException(status_code=400, detail="Payment event does not match the checkout order")
    return payment


def _process_razorpay_webhook(raw: bytes, signature: str, supplied_event_id: str) -> dict:
    """Verify and persist a webhook in a worker thread after bounded async ingestion."""
    if not re.fullmatch(r"[0-9A-Fa-f]{64}", signature or ""):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        raw,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook JSON") from exc
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Malformed webhook JSON")

    event_type = event.get("event")
    if not isinstance(event_type, str) or not 1 <= len(event_type) <= 128:
        raise HTTPException(status_code=400, detail="Malformed webhook event")

    if supplied_event_id:
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", supplied_event_id):
            raise HTTPException(status_code=400, detail="Malformed webhook event id")
        event_id = supplied_event_id
    else:
        event_id = hashlib.sha256(raw).hexdigest()

    if _billing_rows("billing_webhook_events", event_id=event_id):
        return {"ok": True, "duplicate": True}

    payload = event.get("payload") or {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Malformed webhook event")
    payment_wrapper = payload.get("payment") or {}
    order_wrapper = payload.get("order") or {}
    if not isinstance(payment_wrapper, dict) or not isinstance(order_wrapper, dict):
        raise HTTPException(status_code=400, detail="Malformed webhook event")
    payment = payment_wrapper.get("entity") or {}
    order_entity = order_wrapper.get("entity") or {}
    if not isinstance(payment, dict) or not isinstance(order_entity, dict):
        raise HTTPException(status_code=400, detail="Malformed webhook event")

    rows: list[dict] = []
    gateway_order_id = payment.get("order_id") or order_entity.get("id")
    if gateway_order_id:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(gateway_order_id)):
            raise HTTPException(status_code=400, detail="Malformed payment order id")
        rows = _billing_rows("billing_orders", gateway_order_id=gateway_order_id)
        if rows and event_type in ("payment.captured", "order.paid"):
            paid_payment = _validate_paid_webhook_event(
                event_type, rows[0], payment, order_entity
            )
            _activate_paid_order(rows[0], paid_payment)
        elif rows and event_type == "payment.failed":
            # Webhook delivery can be out of order; failure must never revoke a paid order.
            if rows[0].get("status") != "paid" and not rows[0].get("paid_at"):
                _supabase.table("billing_orders").update(
                    {
                        "status": "failed",
                        "gateway_payment_id": payment.get("id"),
                        "gateway_payment_status": payment.get("status"),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", rows[0]["id"]).neq("status", "paid").execute()

    # Keep the idempotency/fraud audit without retaining Razorpay's full payload,
    # which can contain payer contact details and arbitrary notes.
    audit_payload = {
        "gateway_order_id": str(gateway_order_id or "") or None,
        "gateway_payment_id": str(payment.get("id") or "") or None,
        "payment_status": str(payment.get("status") or "") or None,
        "amount": payment.get("amount"),
        "currency": str(payment.get("currency") or "").upper() or None,
    }
    _supabase.table("billing_webhook_events").upsert(
        {
            "event_id": event_id,
            "event_type": event_type,
            "billing_order_id": rows[0].get("id") if rows else None,
            "payload": audit_payload,
        },
        on_conflict="event_id",
    ).execute()
    return {"ok": True}


@api_router.post("/billing/webhook")
async def razorpay_webhook(request: Request):
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook is not configured")
    if not _supabase or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Billing storage is not configured")
    raw = await _read_webhook_body(request)
    # Supabase and Razorpay helpers are synchronous; keep them off the event loop.
    return await run_in_threadpool(
        _process_razorpay_webhook,
        raw,
        request.headers.get("x-razorpay-signature", ""),
        request.headers.get("x-razorpay-event-id", ""),
    )



# ---------------------------------------------------------------------------
# AI — two separate concerns (different API keys at the edge)
#   HM_AI_IMAGE_API_KEY   → image / v0 visual generation
#   HM_AI_PLAN_API_KEY    → estimate + project structure (LLM or second provider)
# ---------------------------------------------------------------------------
FlowKind = Literal["new_home", "remodel"]


class AIV0ImagesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flow: FlowKind
    brief: dict
    mode: Literal["full", "concept", "floor_plans", "revision"] = "concept"
    reference_images: Optional[List[str]] = None
    revision_prompt: Optional[str] = Field(default=None, max_length=1200)
    revision_kind: Literal["exterior", "floor_plan"] = "exterior"

    @field_validator("brief")
    @classmethod
    def validate_brief_size(cls, value: dict) -> dict:
        return _bounded_json_object(value, AI_BRIEF_MAX_BYTES, "brief")

    @field_validator("reference_images")
    @classmethod
    def validate_reference_images(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        refs = [str(item).strip() for item in value if str(item).strip()]
        if len(refs) > 3 or any(len(item) > 4_000_000 for item in refs):
            raise ValueError("Use up to three reference images")
        return refs


class AIV0ImagesResponse(BaseModel):
    images: List[dict]
    floor_plans: Optional[List[dict]] = None
    mock: bool = True
    provider_note: Optional[str] = None


class AIEstimatePlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flow: FlowKind
    brief: dict
    image_bundle: Optional[dict] = None

    @field_validator("brief")
    @classmethod
    def validate_brief_size(cls, value: dict) -> dict:
        return _bounded_json_object(value, AI_BRIEF_MAX_BYTES, "brief")

    @field_validator("image_bundle")
    @classmethod
    def validate_image_bundle_size(cls, value: Optional[dict]) -> Optional[dict]:
        if value is None:
            return None
        return _bounded_json_object(value, AI_IMAGE_BUNDLE_MAX_BYTES, "image_bundle")


class AIEstimatePlanResponse(BaseModel):
    estimate_lines: List[dict]
    milestones: List[dict]
    project_summary: Optional[str] = None
    total_indicative_inr: Optional[int] = None
    estimate_basis: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
    exclusions: List[str] = Field(default_factory=list)
    confidence: Literal["low", "medium", "high"] = "low"
    mock: bool = True
    provider_note: Optional[str] = None


WorkPackageType = Literal[
    "design", "structural", "construction", "interiors", "carpentry",
    "electrical", "plumbing", "painting", "materials", "other",
]


class AIWorkPackageScopeRequest(BaseModel):
    """Homeowner asks for a trade-scoped RFQ draft from their saved brief."""

    model_config = ConfigDict(extra="forbid")

    package_type: WorkPackageType
    flow: FlowKind
    brief: dict
    title: Optional[str] = Field(default=None, max_length=140)

    @field_validator("brief")
    @classmethod
    def validate_brief_size(cls, value: dict) -> dict:
        return _bounded_json_object(value, AI_BRIEF_MAX_BYTES, "brief")


class AIWorkPackageScopeItem(BaseModel):
    label: str = Field(min_length=1, max_length=240)
    quantity: Optional[str] = Field(default=None, max_length=30)
    unit: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = Field(default=None, max_length=400)


class AIWorkPackageScopeResponse(BaseModel):
    title: str
    summary: str
    scope_items: List[AIWorkPackageScopeItem]
    inclusions: str = ""
    exclusions: str = ""
    site_visit_required: bool = True
    mock: bool = False
    provider_note: Optional[str] = None


def _allow_ai_mocks() -> bool:
    """Mocks are opt-in so production provider outages surface as real failures."""
    return _env_flag("ALLOW_AI_MOCKS", False)


def _xai_api_key(purpose: Literal["image", "plan"] = "plan") -> str:
    """xAI key: XAI_API_KEY first, then purpose-specific HM_* keys."""
    names = (
        ["XAI_API_KEY", "HM_AI_IMAGE_API_KEY", "HM_AI_PLAN_API_KEY"]
        if purpose == "image"
        else ["XAI_API_KEY", "HM_AI_PLAN_API_KEY", "HM_AI_IMAGE_API_KEY"]
    )
    for name in names:
        val = os.getenv(name, "").strip()
        if val:
            return val
    return ""


def _parse_estimate_plan_json(parsed: dict) -> Optional[AIEstimatePlanResponse]:
    estimate_lines = parsed.get("estimate_lines") or []
    milestones = parsed.get("milestones") or []
    summary = str(parsed.get("project_summary") or "").strip()
    if not estimate_lines or not milestones or not summary:
        return None

    total = 0
    normalized_lines = []
    for line in estimate_lines:
        quantity = max(float(line.get("quantity", 0) or 0), 0)
        unit_rate = max(int(float(line.get("unit_rate_inr", 0) or 0)), 0)
        amount = int(float(line.get("amount_inr", 0) or 0))
        if amount <= 0 and quantity > 0 and unit_rate > 0:
            amount = int(round(quantity * unit_rate))
        amount = max(amount, 0)
        low = max(int(float(line.get("low_inr", 0) or 0)), 0) or int(round(amount * 0.9))
        high = max(int(float(line.get("high_inr", 0) or 0)), 0) or int(round(amount * 1.1))
        if high < low:
            low, high = high, low
        total += max(amount, 0)
        normalized_lines.append(
            {
                "label": str(line.get("label") or "Line item"),
                "quantity": quantity or None,
                "unit": str(line.get("unit") or "allowance")[:40],
                "unit_rate_inr": unit_rate or None,
                "amount_inr": amount,
                "low_inr": low,
                "high_inr": high,
                "note": str(line.get("note") or ""),
            }
        )

    normalized_milestones = [
        {
            "title": str(m.get("title") or "Milestone"),
            "timeframe": str(m.get("timeframe") or ""),
        }
        for m in milestones
    ]

    return AIEstimatePlanResponse(
        estimate_lines=normalized_lines,
        milestones=normalized_milestones,
        project_summary=summary,
        total_indicative_inr=total,
        estimate_basis=str(parsed.get("estimate_basis") or "Structured homeowner brief and regional market allowances."),
        assumptions=[str(item)[:240] for item in (parsed.get("assumptions") or [])[:8]],
        exclusions=[str(item)[:240] for item in (parsed.get("exclusions") or [])[:8]],
        confidence=str(parsed.get("confidence") or "low").lower() if str(parsed.get("confidence") or "").lower() in {"low", "medium", "high"} else "low",
        mock=False,
        provider_note="",
    )


def _brief_budget_inr(brief: dict) -> Optional[int]:
    """Parse homeowner budget cap from wizard brief (lakhs or crores)."""
    raw = brief.get("budgetInr")
    if raw is not None:
        try:
            n = int(float(raw))
            return max(n, 0) if n > 0 else None
        except (TypeError, ValueError):
            pass
    try:
        amount = int(float(brief.get("budgetAmount") or 0))
    except (TypeError, ValueError):
        amount = 0
    if amount <= 0:
        return None
    unit = str(brief.get("budgetUnit") or "Lakhs").lower()
    if unit.startswith("cr"):
        return amount * 10_000_000
    return amount * 100_000


def _estimate_system_prompt(flow: FlowKind) -> str:
    if flow == "remodel":
        return (
            "You are an interior remodel cost estimator for Indian homes (single room or zone only). "
            "Return strict JSON only with keys: estimate_lines, milestones, project_summary, estimate_basis, assumptions, exclusions, confidence. "
            "estimate_lines: array of {label, quantity, unit, unit_rate_inr, amount_inr, low_inr, high_inr, note} — 6-10 measurable lines for ROOM-SCALE work only "
            "(demolition/prep, civil/carpentry, electrical/lighting, finishes/fixtures, soft furnishings, contingency). "
            "NEVER include whole-house items: no RCC frame, no structure & shell, no G+1/3BHK, no foundation, "
            "no external works, no boundary wall, no facade package. "
            "milestones: array of {title, timeframe} for a remodel (design lock, procurement, execution, handover). "
            "The sum of amount_inr MUST stay within the homeowner budgetInr in the brief (use 90-100% of cap; "
            "contingency is one line inside the cap, not on top). "
            "confidence must be low, medium, or high and must reflect the completeness of dimensions and specifications. "
            "assumptions and exclusions must be explicit arrays. project_summary: 2-3 sentences referencing room, budget band, and timeline only. No markdown."
        )
    return (
        "You are a construction planning assistant for Indian residential new-build projects. "
        "Return strict JSON only with keys: estimate_lines, milestones, project_summary, estimate_basis, assumptions, exclusions, confidence. "
        "estimate_lines: array of {label, quantity, unit, unit_rate_inr, amount_inr, low_inr, high_inr, note}. "
        "Use 8-14 measurable BOQ-style lines. Use quantity x unit rate when the brief supports it; otherwise use unit=allowance and explain why. "
        "low_inr and high_inr must express a defensible market range around amount_inr. assumptions and exclusions must be explicit arrays. "
        "confidence must be low, medium, or high based on brief completeness. "
        "milestones: array of {title, timeframe}. "
        "Use realistic INR ranges for the city/region in the brief. No markdown."
    )


_REMODEL_WRONG_ESTIMATE = re.compile(
    r"structure\s*&\s*shell|\brcc\b|g\+[0-9]?|3\s*bhk|facade\s*package|"
    r"foundation\s*&\s*plinth|external\s*works|boundary\s*wall",
    re.IGNORECASE,
)


def _estimate_looks_like_new_build(lines: List[dict]) -> bool:
    for line in lines or []:
        blob = f"{line.get('label', '')} {line.get('note', '')}"
        if _REMODEL_WRONG_ESTIMATE.search(blob):
            return True
    return False


def _remodel_estimate_from_brief(brief: dict) -> AIEstimatePlanResponse:
    """Deterministic remodel estimate anchored to homeowner budget cap."""
    cap = _brief_budget_inr(brief) or 700_000
    room = str(brief.get("room") or "room")
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    finish = str(brief.get("finishTier") or "mid-range")
    timeline = str(brief.get("completionTime") or brief.get("startTimeline") or "per brief")

    weights = [
        ("Demolition & site prep (indicative)", 0.08, f"{room} — dust control, protection, strip-out"),
        ("Civil & carpentry (indicative)", 0.34, "Layout tweaks, storage, false ceiling allowance"),
        ("Electrical & lighting (indicative)", 0.16, "Points, fixtures, dimming — per dealbreakers"),
        ("Finishes & fixtures (indicative)", 0.34, f"{finish} tier — paint, flooring, loose furniture"),
        ("Contingency (within cap)", 0.08, "Buffer for site surprises — stays inside your budget band"),
    ]
    estimate_lines = []
    running = 0
    for label, pct, note in weights[:-1]:
        amt = int(round(cap * pct))
        running += amt
        estimate_lines.append({
            "label": label, "quantity": 1, "unit": "allowance", "unit_rate_inr": amt,
            "amount_inr": amt, "low_inr": int(round(amt * 0.9)), "high_inr": int(round(amt * 1.1)), "note": note,
        })
    last_amt = max(cap - running, 0)
    estimate_lines.append(
        {"label": weights[-1][0], "quantity": 1, "unit": "allowance", "unit_rate_inr": last_amt,
         "amount_inr": last_amt, "low_inr": last_amt, "high_inr": last_amt, "note": weights[-1][2]}
    )
    total = sum(int(x["amount_inr"]) for x in estimate_lines)

    return AIEstimatePlanResponse(
        estimate_lines=estimate_lines,
        milestones=[
            {"title": "Concept lock & material samples", "timeframe": "Weeks 1–2"},
            {"title": "Working drawings & vendor BOQ", "timeframe": "Weeks 3–5"},
            {"title": "Execution on site", "timeframe": timeline},
            {"title": "Snag, handover & styling", "timeframe": "Final week"},
        ],
        project_summary=(
            f"Indicative {room.lower()} remodel in {loc} scoped to your stated budget band "
            f"(≈ {total // 100_000} L all-in, ex-GST). Room-size allowances only — not a full-home build."
        ),
        total_indicative_inr=total,
        estimate_basis=f"Homeowner budget cap, {room} scope, {finish} finish tier, and location-level allowances for {loc}.",
        assumptions=[
            "Existing structure and concealed services are serviceable unless noted otherwise.",
            "Quantities remain allowances until site measurement and working drawings are complete.",
            "Rates assume normal site access and standard working hours.",
        ],
        exclusions=["GST and statutory fees", "Structural remediation", "Temporary accommodation and owner-supplied appliances"],
        confidence="low",
        mock=False,
        provider_note="Remodel estimate aligned to your wizard budget (room scope).",
    )


def _grok_estimate_plan(
    flow: FlowKind, brief: dict, image_bundle: Optional[dict]
) -> Optional[AIEstimatePlanResponse]:
    key = _xai_api_key("plan")
    if not key:
        return None

    model = os.getenv("GROK_CHAT_MODEL", "grok-3-mini").strip() or "grok-3-mini"
    flow_label = "remodel" if flow == "remodel" else "new home build"
    brief_json = json.dumps(brief or {}, ensure_ascii=False)
    image_json = json.dumps(image_bundle or {}, ensure_ascii=False)
    constraints = _brief_constraints_summary(flow, brief)
    budget_inr = _brief_budget_inr(brief)
    budget_line = (
        f"Budget cap (INR, hard limit): {budget_inr}\n" if budget_inr else ""
    )
    user_prompt = (
        f"Flow: {flow_label}\n"
        f"{budget_line}"
        f"Structured constraints:\n{constraints}\n\n"
        f"Full brief JSON: {brief_json}\n"
        f"Image bundle JSON: {image_json}\n"
        "Return a BOQ-style estimate with 8-14 measurable lines for a new build or 6-10 for a remodel, plus 4-6 milestones, assumptions, exclusions, basis, and confidence."
    )

    try:
        resp = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.25 if flow == "remodel" else 0.3,
                "messages": [
                    {"role": "system", "content": _estimate_system_prompt(flow)},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=60,
        )
        resp.raise_for_status()
        payload = resp.json()
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        parsed = json.loads(content)
        result = _parse_estimate_plan_json(parsed)
        if result is None:
            return None
        if flow == "remodel":
            cap = budget_inr
            if _estimate_looks_like_new_build(result.estimate_lines):
                logger.warning("Grok returned new-build-style lines for remodel; using budget-anchored estimate")
                return _remodel_estimate_from_brief(brief)
            if cap and result.total_indicative_inr and result.total_indicative_inr > int(cap * 1.15):
                logger.warning(
                    "Grok remodel total %s exceeds budget cap %s; using budget-anchored estimate",
                    result.total_indicative_inr,
                    cap,
                )
                return _remodel_estimate_from_brief(brief)
        result.provider_note = f"Generated by xAI {model} (Grok)."
        return result
    except Exception as exc:
        logger.exception("Grok estimate-plan generation failed: %s", exc)
        return None


def _grok_image_timeout_sec() -> int:
    try:
        return max(12, min(90, int(os.getenv("GROK_IMAGE_TIMEOUT", "24"))))
    except ValueError:
        return 24


def _should_inline_grok_images() -> bool:
    """Return durable image data so the browser can mirror it into private Supabase storage."""
    return os.getenv("GROK_INLINE_IMAGES", "1").strip().lower() in ("1", "true", "yes")


def _inline_image_url(url: str) -> str:
    """Fetch remote Grok CDN URLs server-side so the client gets durable data URLs."""
    if not _should_inline_grok_images():
        return url
    if not url or str(url).startswith("data:"):
        return url
    try:
        resp = requests.get(url, timeout=25)
        resp.raise_for_status()
        content_type = (resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"
        b64 = base64.b64encode(resp.content).decode("ascii")
        return f"data:{content_type};base64,{b64}"
    except Exception as exc:
        logger.warning("Could not inline Grok image URL: %s", exc)
        return url


def _grok_image_model() -> str:
    return os.getenv("GROK_IMAGE_MODEL", "grok-imagine-image").strip() or "grok-imagine-image"


def _grok_image_from_response(resp: requests.Response) -> Optional[str]:
    data = resp.json().get("data") or []
    if not data:
        return None
    item = data[0]
    url = item.get("url")
    if url:
        return _inline_image_url(str(url))
    b64 = item.get("b64_json")
    if b64:
        return f"data:image/jpeg;base64,{b64}"
    return None


def _grok_generate_image(
    prompt: str, aspect_ratio: str = "16:9", timeout_sec: Optional[int] = None
) -> Optional[str]:
    key = _xai_api_key("image")
    if not key:
        return None

    model = _grok_image_model()
    timeout = timeout_sec if timeout_sec is not None else _grok_image_timeout_sec()
    try:
        resp = requests.post(
            "https://api.x.ai/v1/images/generations",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "n": 1,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        return _grok_image_from_response(resp)
    except Exception as exc:
        logger.exception("Grok image generation failed: %s", exc)
        return None


def _grok_edit_image(
    prompt: str,
    reference_urls: List[str],
    aspect_ratio: Optional[str] = None,
    timeout_sec: Optional[int] = None,
) -> Optional[str]:
    """Edit / extend from reference image(s). Uses xAI /v1/images/edits."""
    key = _xai_api_key("image")
    refs = [u for u in reference_urls if u]
    if not key or not refs:
        return None

    model = _grok_image_model()
    timeout = timeout_sec if timeout_sec is not None else _grok_image_timeout_sec()
    payload: dict = {"model": model, "prompt": prompt, "n": 1}
    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio

    def _img_obj(url: str) -> dict:
        return {"url": url, "type": "image_url"}

    if len(refs) == 1:
        payload["image"] = _img_obj(refs[0])
    else:
        payload["images"] = [_img_obj(u) for u in refs[:3]]

    try:
        resp = requests.post(
            "https://api.x.ai/v1/images/edits",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        return _grok_image_from_response(resp)
    except Exception as exc:
        logger.exception("Grok image edit failed: %s", exc)
        return None


def _v0_design_seed(brief: dict) -> str:
    """Stable id so every image in one v0 pack targets the same design session."""
    try:
        raw = json.dumps(brief, sort_keys=True, default=str)
    except TypeError:
        raw = str(brief)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:10]


def _v0_floor_plans_enabled(flow: FlowKind) -> bool:
    """New build: Grok floor plans. Remodel: off by default (design images only)."""
    if flow == "remodel":
        return os.getenv("GROK_V0_REMODEL_FLOOR_PLANS", "0").strip().lower() in ("1", "true", "yes")
    return os.getenv("GROK_V0_FLOOR_PLANS", "1").strip().lower() in ("1", "true", "yes")


def _v0_concept_image_count(flow: FlowKind, brief: dict) -> int:
    """New home: 1 holistic front elevation. Remodel: 1–2 sequential interior views."""
    if flow == "new_home":
        try:
            return max(1, min(1, int(os.getenv("GROK_V0_NEW_HOME_IMAGES", "1"))))
        except ValueError:
            return 1
    try:
        cap = max(1, min(2, int(os.getenv("GROK_V0_REMODEL_IMAGES", "2"))))
    except ValueError:
        cap = 2
    return cap


def _brief_inspiration_urls(brief: dict, max_refs: int = 3) -> List[str]:
    """Homeowner-uploaded or linked images (skip stock Unsplash placeholders)."""
    urls: List[str] = []
    seen: set = set()

    def add(raw) -> None:
        s = str(raw or "").strip()
        if not s or s in seen or len(urls) >= max_refs:
            return
        low = s.lower()
        if low.startswith("data:image"):
            seen.add(s)
            urls.append(s)
            return
        if s.startswith("http") and "unsplash.com" not in low:
            seen.add(s)
            urls.append(s)

    for key in ("inspirationImages", "inspirationImgs"):
        val = brief.get(key)
        if isinstance(val, list):
            for item in val:
                if isinstance(item, str):
                    add(item)
                elif isinstance(item, dict):
                    if item.get("type") == "image":
                        add(item.get("value") or item.get("url"))

    for item in brief.get("inspirationItems") or []:
        if isinstance(item, dict) and item.get("type") == "image":
            add(item.get("value"))

    return urls[:max_refs]


def _brief_list(val) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(str(x) for x in val if x)
    return str(val).strip()


def _brief_style_hint(brief: dict) -> str:
    parts = []
    for key in (
        "resolvedArchStyle",
        "archPrimary",
        "archTraditionalVariant",
        "styles",
        "style",
        "designStyle",
        "aesthetic",
        "theme",
        "vibe",
    ):
        val = brief.get(key)
        if val:
            parts.append(_brief_list(val) if key == "styles" else str(val))
    return ", ".join(dict.fromkeys(p for p in parts if p)) or "modern Indian residential"


def _brief_add(lines: List[str], label: str, brief: dict, key: str) -> None:
    v = brief.get(key)
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return
    lines.append(f"{label}: {_brief_list(v) if isinstance(v, list) else v}")


def _new_home_program_block(brief: dict) -> str:
    """Room program + plot/services from build-new wizard — all selections for coherent plans."""
    lines: List[str] = []
    for label, key in (
        ("Plot facing", "facing"),
        ("Road access", "roadAccess"),
        ("Location type", "locationType"),
        ("Built-up target (% of plot)", "builtupPct"),
        ("Staircase", "staircase"),
        ("Lift", "lift"),
        ("Vastu preference", "vastu"),
        ("Overhead water tank", "overheadTank"),
        ("Family members", "familyMembers"),
        ("Master bedrooms", "masterBedrooms"),
        ("Other bedrooms", "otherBedrooms"),
        ("Living rooms", "living"),
        ("Dining rooms", "dining"),
        ("Kitchens", "kitchenCount"),
        ("Kitchen layout", "kitchen"),
        ("Common bathrooms", "commonBathrooms"),
        ("Attached bathrooms", "attachedBathrooms"),
        ("Utility rooms", "utility"),
        ("Storage rooms", "storageRooms"),
        ("Gym", "gym"),
        ("Maid room", "maidRoom"),
        ("Home theater", "homeTheater"),
        ("Mini bar", "miniBar"),
        ("Pooja / prayer", "poojaRoom"),
        ("Balconies", "balconyCount"),
        ("Garden / lawn", "gardenLawn"),
        ("Two-wheeler parking", "twoWheeler"),
        ("Four-wheeler parking", "fourWheeler"),
        ("Visitor parking", "visitorParking"),
        ("Colour base", "colourBase"),
        ("Colour secondary", "colourSecondary"),
        ("Start timeline", "startTimeline"),
        ("Completion target", "completionTime"),
        ("Payment mode", "paymentMode"),
    ):
        _brief_add(lines, label, brief, key)
    notes = str(brief.get("budgetNotes") or "").strip()
    if notes:
        lines.append(f"Budget notes: {notes[:300]}")
    hear = str(brief.get("hearAboutUs") or "").strip()
    if hear:
        lines.append(f"Referral: {hear[:120]}")
    return "\n".join(lines)


def _brief_constraints_summary(flow: FlowKind, brief: dict) -> str:
    """Turn wizard JSON into a short constraint block for Grok prompts."""
    loc = str(brief.get("location") or "India").strip()
    style = _brief_style_hint(brief)
    seed = _v0_design_seed(brief)
    lines = [
        f"Location: {loc}",
        f"Style: {style}",
        f"Design session (keep identical across every image in this pack): HM-{seed}",
    ]

    if flow == "remodel":
        room = str(brief.get("room") or "room")
        lines.append(f"Room / space: {room}")
        lines.append("Project type: interior remodel (single room/zone — NOT a new house build)")
        size = brief.get("roomSizeLabel") or ""
        if size:
            lines.append(f"Room size: {size}")
        ptype = brief.get("propertyType") or brief.get("ptype")
        if ptype:
            lines.append(f"Property: {ptype}")
        for label, key in (
            ("Goals", "mainGoal"),
            ("Pain points", "painPoints"),
            ("Change level", "changeLevel"),
            ("Layout", "layoutOk"),
            ("Must keep", "mustKeep"),
            ("Dealbreakers", "dealbreakers3"),
            ("Finish tier", "finishTier"),
            ("Timeline", "startTimeline"),
            ("Space notes", "spaceNotes"),
            ("Inspiration", "inspirationSummary"),
        ):
            _brief_add(lines, label, brief, key)
        cap = _brief_budget_inr(brief)
        if cap:
            lines.append(f"Budget cap (INR): {cap} — total estimate must not exceed this")
    else:
        floors = str(brief.get("floors") or "G+1")
        dim_w = brief.get("dimW")
        dim_l = brief.get("dimL")
        if dim_w and dim_l:
            lines.append(f"Plot: {dim_w} ft × {dim_l} ft")
        lines.append(f"Floors: {floors}")
        for label, key in (
            ("Lifestyle", "lifestyle"),
            ("Exterior prefs", "exteriorPrefs"),
            ("Finish tier", "finishTier"),
        ):
            _brief_add(lines, label, brief, key)
        program = _new_home_program_block(brief)
        if program:
            lines.append("Room program & services (must appear on floor plans):")
            lines.append(program)

    budget = (
        brief.get("budgetLabel")
        or brief.get("budget")
        or brief.get("budgetTier")
    )
    if not budget and brief.get("budgetAmount"):
        unit = brief.get("budgetUnit") or "Lakhs"
        budget = f"₹{brief['budgetAmount']} {unit}"
    if budget:
        lines.append(f"Budget band: {budget}")

    vision = str(brief.get("dreamVision") or brief.get("homeVision") or "").strip()
    if vision:
        lines.append(f"Homeowner vision: {vision[:500]}")

    return "\n".join(lines)


def _v0_pair_instruction(flow: FlowKind, *, second_image: bool = False) -> str:
    """Shared instruction: exactly two complementary Grok images for one coherent design."""
    if flow == "remodel":
        if second_image:
            return (
                "IMAGE 2 OF 2 — SAME room remodel as <IMAGE_1>: identical palette, furniture style, "
                "materials, and layout logic. Only change camera angle / emphasis (materials & lighting detail). "
                "Do NOT show a different room or unrelated interior. No text, no watermark.\n"
            )
        return (
            "IMAGE 1 OF 2 — Establish the definitive interior concept for this remodel brief. "
            "This reference will anchor image 2. No text, no watermark.\n"
        )
    if second_image:
        return (
            "IMAGE 2 OF 2 — SAME house as <IMAGE_1>: identical massing, roofline, façade materials, "
            "colour palette, and architectural character. Only change camera angle (e.g. rear/garden view). "
            "Do NOT generate a different building. No text, no watermark.\n"
        )
    return (
        "IMAGE 1 OF 2 — Establish the definitive exterior concept for this new-home brief. "
        "This reference will anchor image 2. No text, no watermark.\n"
    )


def _grok_v0_image_prompts(flow: FlowKind, brief: dict) -> List[tuple]:
    """Concept image prompts — new home: 1 front holistic; remodel: up to 2 angles (sequential)."""
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    style = _brief_style_hint(brief)
    room = str(brief.get("room") or "living space")
    floors = str(brief.get("floors") or "G+1")
    constraints = _brief_constraints_summary(flow, brief)
    has_inspo = bool(_brief_inspiration_urls(brief))

    if flow == "remodel":
        indoor_only = (
            "STRICT: indoor photograph ONLY — no building exterior, no facade, no roofline, "
            "no street view, no cars, no aerial. Show the furnished room interior.\n"
        )
        inspo_note = (
            "Honor homeowner reference photo(s) for palette, furniture style, and materials.\n"
            if has_inspo
            else ""
        )
        base = (
            f"Photorealistic interior design visualization for a {room} remodel in {loc}, India.\n"
            f"{indoor_only}{inspo_note}"
            f"Constraints from homeowner brief:\n{constraints}\n"
        )
        specs = [
            (
                "Interior concept — main view",
                f"{room} — layout, palette & key furniture",
                base
                + _v0_pair_instruction(flow, second_image=False)
                + "Wide hero view — seating layout, circulation, main palette and joinery. "
                "Warm natural window light.",
                "4:3",
            ),
            (
                "Interior concept — complementary angle",
                f"{room} — materials, lighting & detail",
                base + _v0_pair_instruction(flow, second_image=True),
                "4:3",
            ),
        ]
        return specs

    base = (
        f"Photorealistic residential architecture in {loc}, India. {floors} home.\n"
        f"Constraints from homeowner brief:\n{constraints}\n"
    )
    inspo_note = (
        "Blend massing and materials from homeowner reference photo(s) where provided.\n"
        if has_inspo
        else ""
    )
    return [
        (
            "Exterior concept — front view (holistic)",
            "Single street-facing elevation — massing, roof, materials, entry",
            base
            + inspo_note
            + "ONE holistic front elevation: full building in frame, clear daylight, "
            "roofline, façade materials, landscape context, entry hierarchy. No text, no watermark.",
            "16:9",
        ),
    ]


def _grok_remodel_floor_plan_prompts(brief: dict) -> List[tuple]:
    """Layout sketches for remodel — interior plan, not building exterior."""
    constraints = _brief_constraints_summary("remodel", brief)
    room = str(brief.get("room") or "living room")
    base = (
        f"Architectural interior layout plan drawing, top-down orthographic plan, {room}, India.\n"
        f"Constraints:\n{constraints}\n"
        "Black ink lines on white paper, furniture placement, doors/windows as symbols. "
        "NO exterior elevation, NO house facade, NO 3D render. No text labels, no watermark.\n"
    )
    return [
        (
            f"{room} — layout v0 (plan sketch)",
            "Furniture + circulation overlay on room footprint (indicative)",
            base
            + "FLOOR PLAN 1: Match palette and spatial intent of <IMAGE_1> concept. "
            "Focus: sofa, TV unit, circulation paths.",
            "4:3",
        ),
        (
            "Services & ceiling v0",
            "Lighting grid + services assumptions for discussion",
            base
            + "FLOOR PLAN 2: Same room footprint as <IMAGE_1> and prior plan <IMAGE_2>. "
            "Ceiling plan — light positions, AC diffuser symbols.",
            "4:3",
        ),
    ]


def _grok_new_home_floor_plan_prompts(brief: dict) -> List[tuple]:
    """Architectural floor plans aligned to exterior concept and brief room program."""
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    floors = str(brief.get("floors") or "G+1")
    constraints = _brief_constraints_summary("new_home", brief)
    base = (
        f"Architectural floor plan drawing, top-down orthographic, {floors} Indian home in {loc}.\n"
        f"Constraints (every labeled room count must appear):\n{constraints}\n"
        "Clean black ink on white paper, walls as thick lines, door swings, room labels as simple "
        "rectangles only (no paragraph text). Match massing implied by <IMAGE_1> exterior concept. "
        "Indicative v0 — not GFC. No watermark.\n"
    )
    slots: List[tuple] = []
    if floors == "G":
        slots = [
            (
                "Ground floor plan v0",
                "Zoning + room grid from your brief (indicative)",
                base
                + "GROUND FLOOR ONLY: Reflect room program and vastu preference. "
                "Staircase position if future floors implied.",
                "4:3",
            ),
            (
                "Alternate ground layout v0",
                "Second zoning option — same brief, same building envelope",
                base
                + "GROUND FLOOR variant 2: Same footprint as <IMAGE_2> plan — alternate furniture/zoning only.",
                "4:3",
            ),
        ]
    elif floors == "G+1":
        slots = [
            (
                "Ground floor plan v0",
                "Zoning + room grid for ground level",
                base + "GROUND FLOOR: All ground-level rooms from brief. Show staircase to first floor.",
                "4:3",
            ),
            (
                "First floor plan v0",
                "Upper level bedrooms + baths",
                base
                + "FIRST FLOOR: Bedrooms/baths per brief. Stair must align with <IMAGE_2> ground plan.",
                "4:3",
            ),
        ]
    elif floors == "G+2":
        slots = [
            (
                "Ground floor plan v0",
                "Ground level program",
                base + "GROUND FLOOR per brief.",
                "4:3",
            ),
            (
                "First floor plan v0",
                "Mid level bedrooms / living",
                base + "FIRST FLOOR per brief; stairs aligned with ground plan in <IMAGE_2>.",
                "4:3",
            ),
            (
                "Second floor plan v0",
                "Top floor / terrace level (indicative)",
                base
                + "SECOND FLOOR (top) per brief; stack above <IMAGE_2> ground and <IMAGE_3> first floor — "
                "same outline and stair core.",
                "4:3",
            ),
        ]
    else:
        slots = [
            ("Ground floor plan v0", "Ground level", base + "GROUND FLOOR.", "4:3"),
            ("First floor plan v0", "First floor", base + "FIRST FLOOR; align with <IMAGE_2>.", "4:3"),
            (
                "Second floor plan v0",
                "Second floor",
                base + "SECOND FLOOR; align with lower plans.",
                "4:3",
            ),
            (
                "Third floor plan v0",
                "Top / terrace",
                base
                + "TOP FLOOR / terrace; align with <IMAGE_2> and <IMAGE_3> (floors below); "
                "same building footprint.",
                "4:3",
            ),
        ]
    try:
        cap = max(1, min(4, int(os.getenv("GROK_V0_MAX_FLOOR_PLANS", "1"))))
    except ValueError:
        cap = 4
    return slots[:cap]


def _generate_concept_images_sequential(
    specs: List[Tuple[str, str, str, str]], flow: FlowKind, brief: dict
) -> List[dict]:
    """Image 1 from text or homeowner refs; image 2+ from edits anchored to image 1."""
    if not specs:
        return []

    timeout = _grok_image_timeout_sec()
    out: List[dict] = []
    anchor_url: Optional[str] = None
    inspiration = _brief_inspiration_urls(brief)

    for idx, spec in enumerate(specs):
        label, hint, prompt, aspect = spec
        if idx == 0:
            if inspiration:
                ref_prompt = (
                    prompt
                    + "\nSynthesize the design direction from the homeowner reference image(s) "
                    "(<IMAGE_1>"
                    + (", <IMAGE_2>" if len(inspiration) > 1 else "")
                    + (", <IMAGE_3>" if len(inspiration) > 2 else "")
                    + ") together with the written brief above.\n"
                )
                url = _grok_edit_image(
                    ref_prompt, inspiration, aspect_ratio=aspect, timeout_sec=timeout
                )
                if not url:
                    logger.warning("Inspiration-anchored concept failed; falling back to text-only")
                    url = _grok_generate_image(prompt, aspect_ratio=aspect, timeout_sec=timeout)
            else:
                url = _grok_generate_image(prompt, aspect_ratio=aspect, timeout_sec=timeout)
        else:
            edit_prompt = (
                f"Using <IMAGE_1> as the exact same {'room' if flow == 'remodel' else 'house'} "
                f"(design session HM-{_v0_design_seed(brief)}):\n{prompt}"
            )
            url = _grok_edit_image(edit_prompt, [anchor_url], aspect_ratio=aspect, timeout_sec=timeout)
            if not url:
                logger.warning("Concept edit %s failed; retrying text with anchor description", idx + 1)
                url = _grok_generate_image(
                    prompt
                    + "\nCRITICAL: Must match the same design as the prior concept image in this pack — "
                    "same massing/materials/palette. Do not invent a different building or room.",
                    aspect_ratio=aspect,
                    timeout_sec=timeout,
                )
        if not url:
            break
        anchor_url = url
        out.append({"url": url, "label": label, "hint": hint})

    return out


def _floor_plan_reference_urls(concept_ref: str, prior_stack: List[str], idx: int, total: int) -> List[str]:
    """
    Up to 3 xAI edit refs. Sequential only — not parallel.
    - Level 0: concept elevation
    - Level 1: concept + ground
    - Level 2+: concept + ground + floor directly below (3rd floor sees ground + 2nd)
    - Top level (4+ story): concept + two floors immediately below (keeps 1st+2nd context)
    """
    if idx == 0:
        return [concept_ref]
    if idx == 1:
        return [concept_ref, prior_stack[0]]
    if idx == total - 1 and len(prior_stack) >= 3:
        return [concept_ref, prior_stack[-2], prior_stack[-1]]
    below = prior_stack[idx - 1]
    return [concept_ref, prior_stack[0], below]


def _floor_plan_edit_prompt(prompt: str, idx: int, total: int) -> str:
    """Clarify IMAGE roles when 3 references are sent."""
    if idx == 0:
        return (
            prompt
            + "\n<IMAGE_1> is the exterior/interior concept — match building footprint and massing.\n"
        )
    if idx == 1:
        return (
            prompt
            + "\n<IMAGE_1> concept, <IMAGE_2> ground floor plan — align stairs/core with ground.\n"
        )
    if idx == total - 1 and total >= 4:
        return (
            prompt
            + "\n<IMAGE_1> concept, <IMAGE_2> floor below this level, <IMAGE_3> floor below that — "
            "same footprint and stair core through full height.\n"
        )
    return (
        prompt
        + "\n<IMAGE_1> concept, <IMAGE_2> ground floor, <IMAGE_3> floor directly below — "
        "vertical circulation must stack; do not shift the building outline.\n"
    )


def _generate_floor_plans_sequential(
    specs: List[Tuple[str, str, str, str]], flow: FlowKind, brief: dict, concept_urls: List[str]
) -> List[dict]:
    """Floor plans one-by-one; each step uses up to 3 refs (concept + lower floors). Never parallel."""
    if not specs or not concept_urls:
        return []

    timeout = _grok_image_timeout_sec()
    out: List[dict] = []
    prior_stack: List[str] = []
    concept_ref = concept_urls[0]
    total = len(specs)

    for idx, spec in enumerate(specs):
        label, hint, prompt, aspect = spec
        refs = _floor_plan_reference_urls(concept_ref, prior_stack, idx, total)
        edit_prompt = _floor_plan_edit_prompt(prompt, idx, total)

        url = _grok_edit_image(edit_prompt, refs, aspect_ratio=aspect, timeout_sec=timeout)
        if not url and idx > 0:
            url = _grok_edit_image(
                edit_prompt + "\nCRITICAL: Identical footprint and stair position as <IMAGE_2> and <IMAGE_3>.",
                refs,
                aspect_ratio=aspect,
                timeout_sec=timeout,
            )
        if not url:
            logger.warning("Floor plan generation failed at slot %s", label)
            break
        prior_stack.append(url)
        out.append({"url": url, "label": label, "hint": hint})

    return out


def _generate_specs_parallel(
    specs: List[Tuple[str, str, str, str]], max_workers: int = 3
) -> List[dict]:
    """Run Grok image calls in parallel so Render's ~30s HTTP limit is not exceeded."""
    if not specs:
        return []

    timeout = _grok_image_timeout_sec()

    def _one(spec: Tuple[str, str, str, str]) -> Optional[dict]:
        label, hint, prompt, aspect = spec
        url = _grok_generate_image(prompt, aspect_ratio=aspect, timeout_sec=timeout)
        if not url:
            return None
        return {"url": url, "label": label, "hint": hint}

    workers = max(1, min(max_workers, len(specs)))
    out: List[dict] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_one, s) for s in specs]
        for fut in as_completed(futures):
            try:
                item = fut.result()
                if item:
                    out.append(item)
            except Exception as exc:
                logger.warning("Parallel Grok image task failed: %s", exc)
    return out


def _remodel_static_floor_plans(brief: dict) -> List[dict]:
    """Indicative layout cards — interior-scoped stock (not building exteriors)."""
    room = str(brief.get("room") or "Room")
    return [
        {
            "url": "https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=1000&q=80",
            "label": f"{room} — layout v0 (indicative)",
            "hint": "Furniture + circulation overlay for discussion (not GFC)",
        },
        {
            "url": "https://images.unsplash.com/photo-1615874694520-474822394e73?w=1000&q=80",
            "label": "Services & ceiling v0 (indicative)",
            "hint": "Lighting + services assumptions — confirm with your pro",
        },
    ]


def _default_floor_plans(flow: FlowKind, brief: dict) -> List[dict]:
    """Indicative plan cards — avoid calling full mock builder from inside Grok path."""
    if flow == "remodel":
        return _remodel_static_floor_plans(brief)
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    floors = str(brief.get("floors") or "G+1")
    return [
        {
            "url": "/floorplan_ground.png",
            "label": "Ground floor plan v0",
            "hint": f"Zoning + room grid for {loc} (indicative, not GFC)",
        },
        {
            "url": "/floorplan_first.png",
            "label": "First floor plan v0" if floors != "G" else "Alternate ground plan v0",
            "hint": "Upper level blocking + baths" if floors != "G" else "Second layout option from same brief",
        },
    ]


def _grok_v0_images(
    flow: FlowKind,
    brief: dict,
    mode: str = "full",
    reference_images: Optional[List[str]] = None,
    revision_prompt: Optional[str] = None,
    revision_kind: str = "exterior",
) -> Optional[AIV0ImagesResponse]:
    if not _xai_api_key("image"):
        logger.warning("Grok images skipped: no XAI_API_KEY / HM_AI_IMAGE_API_KEY")
        return None

    try:
        refs = [url for url in (reference_images or []) if url]
        images: List[dict] = []
        floor_plans: List[dict] = []

        if mode == "revision":
            if not refs or not str(revision_prompt or "").strip():
                return None
            if revision_kind == "floor_plan":
                prompt = (
                    "Revise the architectural floor plan shown in <IMAGE_1>. Keep the same plot, "
                    "structural footprint, stair/core alignment and all unaffected rooms. Produce a "
                    "clean, legible top-down architectural plan with room labels and dimensions. "
                    f"Requested changes: {str(revision_prompt).strip()}"
                )
                aspect_ratio = "4:3"
            else:
                prompt = (
                    "Revise the same home design shown in <IMAGE_1>. Preserve its identity, massing, "
                    "roofline and site context unless the homeowner explicitly asks otherwise. "
                    f"Requested changes: {str(revision_prompt).strip()}"
                )
                aspect_ratio = "16:9"
            revised_url = _grok_edit_image(prompt, refs[:1], aspect_ratio=aspect_ratio)
            if revised_url:
                revised_item = {
                    "url": revised_url,
                    "label": "Revised floor plan" if revision_kind == "floor_plan" else "Revised exterior concept",
                    "hint": str(revision_prompt).strip(),
                }
                if revision_kind == "floor_plan":
                    floor_plans = [revised_item]
                else:
                    images = [revised_item]
        elif mode == "floor_plans":
            if not refs:
                return None
            fp_specs = _grok_new_home_floor_plan_prompts(brief)
            floor_plans = _generate_floor_plans_sequential(fp_specs, flow, brief, refs)
        else:
            concept_count = _v0_concept_image_count(flow, brief)
            mood_specs = _grok_v0_image_prompts(flow, brief)[:concept_count]
            images = _generate_concept_images_sequential(mood_specs, flow, brief)
            concept_urls = [img["url"] for img in images if img.get("url")]
            if mode == "full" and _v0_floor_plans_enabled(flow):
                fp_specs = _grok_new_home_floor_plan_prompts(brief)
                floor_plans = _generate_floor_plans_sequential(fp_specs, flow, brief, concept_urls)
            elif mode == "full" and flow == "new_home":
                floor_plans = _default_floor_plans(flow, brief)

        if not images and not floor_plans:
            logger.warning("Grok returned zero images for flow=%s mode=%s", flow, mode)
            return None

        model = _grok_image_model()
        fp_src = "Grok" if _v0_floor_plans_enabled(flow) and any(
            p.get("url", "").find("x.ai") >= 0 for p in floor_plans
        ) else "reference"
        fp_part = (
            f" + {len(floor_plans)} floor plan(s) ({fp_src})"
            if floor_plans
            else (" (no floor plans — remodel design-only)" if flow == "remodel" else "")
        )
        return AIV0ImagesResponse(
            images=images,
            floor_plans=floor_plans,
            mock=False,
            provider_note=(
                f"Coherent v0 via xAI {model}: {len(images)} concept image(s), sequential"
                + fp_part
                + "."
            ),
        )
    except Exception as exc:
        logger.exception("Grok v0 image pack failed: %s", exc)
        return None


def _mock_v0_images(flow: FlowKind, brief: dict) -> AIV0ImagesResponse:
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    room = str(brief.get("room") or "Room")
    floors = str(brief.get("floors") or "G+1")
    if flow == "remodel":
        return AIV0ImagesResponse(
            floor_plans=[
                {
                    "url": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1000&q=80",
                    "label": f"{room} — layout v0 (plan sketch)",
                    "hint": "Furniture + circulation overlay (indicative)",
                },
                {
                    "url": "https://images.unsplash.com/photo-1582268611958-ebfd161ef9ce?w=1000&q=80",
                    "label": "Services & ceiling v0",
                    "hint": "Lighting grid + services assumptions",
                },
            ],
            images=[
                {
                    "url": "https://images.unsplash.com/photo-1616594039964-3b6b8f9fbe16?w=640&q=75",
                    "label": "Interior mood A",
                    "hint": "Palette + joinery direction",
                },
                {
                    "url": "https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=640&q=75",
                    "label": "Interior mood B",
                    "hint": "Alternate materials / lighting",
                },
                {
                    "url": "https://images.unsplash.com/photo-1615874694520-474822394e73?w=640&q=75",
                    "label": "Interior mood C",
                    "hint": "Premium finish variant",
                },
            ],
            mock=True,
            provider_note=None,
        )

    return AIV0ImagesResponse(
        floor_plans=[
            {
                "url": "/floorplan_ground.png",
                "label": "Ground floor plan v0",
                "hint": f"Zoning + room grid for {loc} (indicative, not GFC)",
            },
            {
                "url": "/floorplan_first.png",
                "label": "First floor plan v0" if floors != "G" else "Alternate ground plan v0",
                "hint": "Upper level blocking + baths" if floors != "G" else "Second layout option from same brief",
            },
        ],
        images=[
            {
                "url": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=75",
                "label": "Front elevation v0",
                "hint": "Street-facing façade concept",
            },
            {
                "url": "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?w=800&q=75",
                "label": "Rear / garden elevation",
                "hint": "Opening pattern + outdoor connection",
            },
            {
                "url": "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=75",
                "label": "Massing & roof study",
                "hint": "Materials + roofline option",
            },
        ],
        mock=True,
        provider_note=None,
    )


def _mock_estimate_plan(flow: FlowKind, brief: dict, image_bundle: Optional[dict]) -> AIEstimatePlanResponse:
    loc = str(brief.get("location") or "India").split(",")[0].strip() or "India"
    if flow == "remodel":
        mock = _remodel_estimate_from_brief(brief)
        mock.mock = True
        mock.provider_note = None
        return mock

    seed_lines = [
        ("Structure & shell (indicative)", 2650000, f"{loc} floor plan + exterior v0"),
        ("Exterior facade package", 620000, "Elevation style + materials allowance"),
        ("Core interiors (indicative)", 980000, "Kitchen, wardrobes, baths baseline"),
        ("Services (MEP rough-in)", 540000, "Electrical, plumbing, basic HVAC points"),
    ]
    estimate_lines = [
        {
            "label": label, "quantity": 1, "unit": "allowance", "unit_rate_inr": amount,
            "amount_inr": amount, "low_inr": int(round(amount * 0.85)),
            "high_inr": int(round(amount * 1.15)), "note": note,
        }
        for label, amount, note in seed_lines
    ]
    summary = f"Indicative new-home estimate and milestones for {loc}."
    total = sum(int(x["amount_inr"]) for x in estimate_lines if isinstance(x.get("amount_inr"), (int, float)))

    return AIEstimatePlanResponse(
        estimate_lines=estimate_lines,
        milestones=[
            {"title": "Design lock & consensus", "timeframe": "Weeks 1–4"},
            {"title": "Working drawings / GFC", "timeframe": "Weeks 5–10"},
            {"title": "Site execution start", "timeframe": "Per your schedule"},
        ],
        project_summary=summary,
        total_indicative_inr=total,
        estimate_basis=f"Early new-home brief and broad construction allowances for {loc}.",
        assumptions=["Built-up area and specification schedule require professional confirmation."],
        exclusions=["Land", "GST and statutory fees", "Loose furniture and finance costs"],
        confidence="low",
        mock=True,
        provider_note=None,
    )


def _openai_estimate_plan(flow: FlowKind, brief: dict, image_bundle: Optional[dict]) -> Optional[AIEstimatePlanResponse]:
    key = (
        os.getenv("HM_AI_PLAN_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
    )
    if not key:
        return None

    flow_label = "remodel" if flow == "remodel" else "new home build"
    brief_json = json.dumps(brief or {}, ensure_ascii=False)
    image_json = json.dumps(image_bundle or {}, ensure_ascii=False)
    constraints = _brief_constraints_summary(flow, brief)
    budget_inr = _brief_budget_inr(brief)
    budget_line = (
        f"Budget cap (INR, hard limit): {budget_inr}\n" if budget_inr else ""
    )

    user_prompt = (
        f"Flow: {flow_label}\n"
        f"{budget_line}"
        f"Structured constraints:\n{constraints}\n\n"
        f"Brief JSON: {brief_json}\n"
        f"Image bundle JSON: {image_json}\n"
        "Return a BOQ-style estimate with 8-14 measurable lines for a new build or 6-10 for a remodel, plus 4-6 milestones, assumptions, exclusions, basis, and confidence."
    )

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "temperature": 0.25 if flow == "remodel" else 0.3,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _estimate_system_prompt(flow)},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        payload = resp.json()
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        parsed = json.loads(content)
        result = _parse_estimate_plan_json(parsed)
        if result is None:
            return None
        if flow == "remodel" and (
            _estimate_looks_like_new_build(result.estimate_lines)
            or (
                budget_inr
                and result.total_indicative_inr
                and result.total_indicative_inr > int(budget_inr * 1.15)
            )
        ):
            return _remodel_estimate_from_brief(brief)
        result.provider_note = "Generated by OpenAI gpt-4o-mini via HM_AI_PLAN_API_KEY."
        return result
    except Exception as exc:
        logger.exception("OpenAI estimate-plan generation failed: %s", exc)
        return None


def _gemini_client():
    if not _GENAI_AVAILABLE:
        return None
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return None
    return google_genai.Client(api_key=key)


class HubAssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message: str = Field(..., min_length=1, max_length=1200)
    context: dict = Field(default_factory=dict)

    @field_validator("context")
    @classmethod
    def validate_context_size(cls, value: dict) -> dict:
        return _bounded_json_object(value, HUB_CONTEXT_MAX_BYTES, "context")


def _hub_assistant_local(message: str, ctx: dict) -> dict:
    """Rule-based fallback aligned with frontend hubAssistantCommands."""
    t = (message or "").lower().strip()
    nav_map = {
        "tasks": "nav",
        "timeline": "nav",
        "budget": "nav",
        "overview": "nav",
    }
    for key, kind in nav_map.items():
        if t == key or f"open {key}" in t or f"show {key}" in t:
            label = key.capitalize() if key != "overview" else "Overview"
            if key == "tasks":
                label = "Tasks"
            elif key == "timeline":
                label = "Timeline"
            return {
                "reply": f"Opening {label} for you.",
                "action": {"type": "nav", "nav": label},
                "source": "local",
            }
    tasks = ctx.get("tasks") or ctx.get("pendingTasks") or []
    messages = ctx.get("recentMessages") or ctx.get("messages") or []
    materials = ctx.get("materials") or []
    documents = ctx.get("documents") or []
    payments = ctx.get("payments") or []
    artifacts = ctx.get("artifactRefs") or []
    source_note = f" Sources: {', '.join(artifacts[:5])}." if artifacts else ""
    if any(word in t for word in ("cement", "steel", "material", "takeoff", "brand", "boq")):
        if materials:
            lines = [
                f"- {x.get('item')}: {x.get('quantity', 0)} {x.get('unit') or 'unit'}"
                + (f" · {x.get('brand')}" if x.get("brand") else " · brand not selected")
                for x in materials[:10]
            ]
            return {"reply": "Editable material plan:\n" + "\n".join(lines) + source_note, "action": None, "source": "local"}
        return {"reply": "No material takeoff is saved for this project yet." + source_note, "action": None, "source": "local"}
    if "document" in t or "drawing" in t or "artifact" in t:
        if documents:
            lines = [f"- {x.get('name')}" for x in documents[:10]]
            return {"reply": "Project document register:\n" + "\n".join(lines) + source_note, "action": None, "source": "local"}
        return {"reply": "No uploaded document metadata is saved yet." + source_note, "action": None, "source": "local"}
    if any(word in t for word in ("payment", "paid", "ledger", "spent")):
        if payments:
            lines = [f"- {x.get('title')}: INR {x.get('amountInr', 0)} ({x.get('status')})" for x in payments[:8]]
            return {"reply": "Project payment ledger:\n" + "\n".join(lines) + source_note, "action": None, "source": "local"}
        return {"reply": "No payment records are saved yet." + source_note, "action": None, "source": "local"}
    if "task" in t or "todo" in t:
        open_tasks = [x for x in tasks if not x.get("done")]
        if open_tasks:
            lines = [f"- {x.get('title') or x.get('name')}" for x in open_tasks[:8]]
            return {
                "reply": "Open tasks:\n" + "\n".join(lines),
                "action": None,
                "source": "local",
            }
        return {"reply": "No open tasks on this project right now.", "action": None, "source": "local"}
    if "message" in t or "feed" in t:
        if messages:
            lines = [
                f"{m.get('name') or m.get('role')}: {m.get('text', '')[:120]}"
                for m in messages[-5:]
            ]
            return {"reply": "Recent site feed:\n" + "\n".join(lines), "action": None, "source": "local"}
        return {"reply": "No site-feed messages saved yet.", "action": None, "source": "local"}
    if "latest" in t or "status" in t or "update" in t:
        title = ctx.get("projectTitle") or "your project"
        pending = ctx.get("pendingTaskCount") or 0
        phase = ctx.get("activePhase") or "planning"
        reply = f"Latest on {title}: focus stage {phase}."
        if pending:
            reply += f" {pending} open task(s)."
        if ctx.get("hasV0"):
            reply += " AI v0 pack is saved."
        if messages:
            last = messages[-1]
            reply += f" Last feed note from {last.get('name') or 'team'}."
        return {"reply": reply + source_note, "action": None, "source": "local"}
    return {
        "reply": (
            "I'm Homi — try latest, tasks, timeline, budget, or design journey. "
            "I can also route you to new build or remodel flows."
        ),
        "action": None,
        "source": "local",
    }


def _grok_hub_assistant(message: str, ctx: dict) -> Optional[dict]:
    key = _xai_api_key("plan")
    if not key:
        return None
    model = os.getenv("GROK_CHAT_MODEL", "grok-3-mini").strip() or "grok-3-mini"
    ctx_json = json.dumps(ctx or {}, ensure_ascii=False)[:12000]
    role = (ctx.get("role") or "homeowner").strip()
    surface = (ctx.get("surface") or "project-hub").strip()
    system = (
        "You are Homi, a warm concise agentic assistant inside BuildGuru project management. "
        "Answer using ONLY the active Project context JSON as ground truth. It may include a structured brief, AI v0 estimate summary, "
        "task board, site messages, document register metadata, payment ledger, editable material plan, approval log, and professional bids. "
        "Do not invent tasks, document contents, messages, quantities, payments, progress, brands, bids, or approvals that are not in context. "
        "Document metadata is not document body text; never imply you read file contents unless extracted content is explicitly present. "
        "If data is missing, say what is missing and suggest the next step. "
        f"User role: {role}. Surface: {surface}. "
        "For homeowners, help manage scope, takeoff, shopping choices, professional matching, bid comparison, tasks, timeline, budget, approvals, and handoff. "
        "When comparing bids, quote only the amounts, timelines, and scope notes present in context.bids, and note what a bid excludes rather than assuming parity. "
        "For professionals, brief them on only the leads and project artifacts explicitly shared in context. "
        "Suggestions are drafts: never claim a message was sent, a bid was accepted, a professional was hired, or materials were ordered without an executed approval record. "
        "For a daily briefing, summarize what changed, blockers or risks, today's next actions, and decisions awaiting approval. "
        "Reply in 2-4 short sentences unless the user asks for a list (then use short bullet lines). "
        "End factual project answers with a short 'Sources:' line using only names in context.artifactRefs. Use plain text (no markdown headers). "
        "If the user wants navigation, include JSON action on its own line as: "
        'ACTION:{"type":"nav","nav":"Tasks"} OR ACTION:{"type":"path","path":"/build/new-home"} '
        'OR ACTION:{"type":"addTask","title":"..."}. Valid nav: Overview, Bids, Timeline, Tasks, Budget, Materials, Site Feed, Settings.'
    )
    user_prompt = f"Project context JSON:\n{ctx_json}\n\nUser message:\n{message}"
    try:
        resp = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "temperature": 0.35,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=45,
        )
        resp.raise_for_status()
        content = (
            resp.json()
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        action = None
        reply = content.strip()
        if "ACTION:" in reply:
            head, _, tail = reply.partition("ACTION:")
            reply = head.strip()
            action_raw = tail.strip().split("\n")[0].strip()
            try:
                action = json.loads(action_raw)
            except json.JSONDecodeError:
                action = None
        if not reply:
            return None
        return {"reply": reply, "action": action, "source": "grok"}
    except Exception as exc:
        logger.warning("hub-assistant grok failed: %s", exc)
        return None


@api_router.post("/ai/hub-assistant")
def ai_hub_assistant(payload: HubAssistantRequest, _user: dict = Depends(_ai_request_slot)):
    grok = _grok_hub_assistant(payload.message, payload.context)
    if grok is not None:
        return grok
    if _allow_ai_mocks():
        logger.warning("ai/hub-assistant using local fallback because ALLOW_AI_MOCKS is enabled")
        return _hub_assistant_local(payload.message, payload.context)
    raise HTTPException(
        status_code=502,
        detail="AI assistant is temporarily unavailable. Please try again.",
    )


@api_router.get("/ai/status")
def ai_status():
    return {
        "grok_configured": bool(_xai_api_key("plan") or _xai_api_key("image")),
        "payments_configured": bool(
            BILLING_ENABLED
            and RAZORPAY_KEY_ID
            and RAZORPAY_KEY_SECRET
            and RAZORPAY_WEBHOOK_SECRET
            and (not RAZORPAY_KEY_ID.startswith("rzp_live_") or ALLOW_LIVE_BILLING)
            and SUPABASE_URL
            and SUPABASE_SERVICE_ROLE_KEY
            and _supabase is not None
        ),
        "ai_mocks_enabled": _allow_ai_mocks(),
        "image_model": os.getenv("GROK_IMAGE_MODEL", "grok-imagine-image"),
        "chat_model": os.getenv("GROK_CHAT_MODEL", "grok-3-mini"),
        "hub_assistant": True,
        "repo_mode": _repo_mode(),
        "render_service": os.getenv("RENDER_SERVICE_NAME") or None,
        "render_git_commit": os.getenv("RENDER_GIT_COMMIT") or None,
    }


def _v0_images_json(resp: AIV0ImagesResponse) -> dict:
    data = resp.model_dump()
    data["provider_note"] = None
    return data


@api_router.post("/ai/v0-images")
def ai_v0_images(payload: AIV0ImagesRequest, _user: dict = Depends(_ai_request_slot)):
    brief = payload.brief if isinstance(payload.brief, dict) else {}
    user_id = str(_user.get("id") or "")
    paid_mode = payload.mode in ("full", "floor_plans", "revision")
    entitlements = _billing_rows(
        "user_entitlements", user_id=user_id, plan_id="homeowner_project_pass"
    ) if _supabase else []
    has_project_pass = any(_entitlement_is_active(row) for row in entitlements)
    if not _allow_ai_mocks():
        if paid_mode and not has_project_pass:
            raise HTTPException(
                status_code=402,
                detail="Project Pass is required for floor plans, regeneration, and design revisions.",
            )
        if payload.mode in ("concept", "full") and not has_project_pass and _supabase:
            owned = (
                _supabase.table("projects")
                .select("id")
                .eq("owner_user_id", user_id)
                .execute()
            ).data or []
            project_ids = [row.get("id") for row in owned if row.get("id")]
            prior = []
            if project_ids:
                prior = (
                    _supabase.table("project_ai_runs")
                    .select("id")
                    .in_("project_id", project_ids)
                    .eq("run_type", "v0_images")
                    .eq("status", "completed")
                    .limit(1)
                    .execute()
                ).data or []
            if prior:
                raise HTTPException(
                    status_code=402,
                    detail="Your free exterior concept has already been used. Project Pass unlocks regeneration, floor plans, and revisions.",
                )
    if _allow_ai_mocks():
        mock = _mock_v0_images(payload.flow, brief)
        logger.warning("ai/v0-images using mock because ALLOW_AI_MOCKS is enabled; flow=%s", payload.flow)
        if payload.mode == "concept":
            mock.floor_plans = []
            mock.images = mock.images[:1]
        elif payload.mode == "floor_plans":
            mock.images = []
        elif payload.mode == "revision":
            if payload.revision_kind == "floor_plan":
                mock.images = []
                mock.floor_plans = mock.floor_plans[:1]
                if mock.floor_plans:
                    mock.floor_plans[0]["label"] = "Revised floor plan"
                    mock.floor_plans[0]["hint"] = payload.revision_prompt or "Revised from the saved floor plan"
            else:
                mock.floor_plans = []
                mock.images = mock.images[:1]
                if mock.images:
                    mock.images[0]["label"] = "Revised exterior concept"
                    mock.images[0]["hint"] = payload.revision_prompt or "Revised from the saved concept"
        return _v0_images_json(mock)
    if not _xai_api_key("image"):
        raise HTTPException(
            status_code=502,
            detail="AI image generation is temporarily unavailable. Please try again.",
        )
    _consume_ai_daily_quota(user_id, AI_DAILY_IMAGE_PACKS if has_project_pass else 1)
    grok = _grok_v0_images(
        payload.flow,
        brief,
        mode=payload.mode,
        reference_images=payload.reference_images,
        revision_prompt=payload.revision_prompt,
        revision_kind=payload.revision_kind,
    )
    if grok is not None:
        grok.provider_note = None
        return _v0_images_json(grok)
    raise HTTPException(
        status_code=502,
        detail="AI image generation is temporarily unavailable. Please try again.",
    )


@api_router.post("/ai/estimate-plan", response_model=AIEstimatePlanResponse)
def ai_estimate_plan(payload: AIEstimatePlanRequest, _user: dict = Depends(_ai_request_slot)):
    grok = _grok_estimate_plan(payload.flow, payload.brief, payload.image_bundle)
    if grok is not None:
        return grok
    llm = _openai_estimate_plan(payload.flow, payload.brief, payload.image_bundle)
    if llm is not None:
        if payload.flow == "remodel" and (
            _estimate_looks_like_new_build(llm.estimate_lines)
            or (
                _brief_budget_inr(payload.brief)
                and llm.total_indicative_inr
                and llm.total_indicative_inr
                > int(_brief_budget_inr(payload.brief) * 1.15)
            )
        ):
            return _remodel_estimate_from_brief(payload.brief)
        return llm
    if _allow_ai_mocks():
        logger.warning("ai/estimate-plan using mock because ALLOW_AI_MOCKS is enabled; flow=%s", payload.flow)
        return _mock_estimate_plan(payload.flow, payload.brief, payload.image_bundle)
    raise HTTPException(
        status_code=502,
        detail="AI estimate generation is temporarily unavailable. Please try again.",
    )


# ---------------------------------------------------------------------------
# Work-package (trade RFQ) scope drafting
# ---------------------------------------------------------------------------

_WORK_PACKAGE_LABELS: dict[str, str] = {
    "design": "Architecture & interior design",
    "structural": "Structural engineering",
    "construction": "Civil construction (shell & core)",
    "interiors": "Interior fit-out",
    "carpentry": "Carpentry & modular",
    "electrical": "Electrical",
    "plumbing": "Plumbing & sanitary",
    "painting": "Painting & finishes",
    "materials": "Materials supply",
    "other": "Specialist work",
}

# Curated, trade-specific checklists. Used verbatim when no LLM provider is
# configured, and as a floor for the LLM output (the model must cover at least
# the essentials a bidding pro needs to price the work).
_WORK_PACKAGE_CHECKLISTS: dict[str, dict] = {
    "design": {
        "scope": [
            ("Site measurement and as-built drawings", "1", "set", "Verify plot / room dimensions on site"),
            ("Concept options with 3D views", "2", "options", "Exterior + key interior views"),
            ("Detailed floor plans and elevations", "1", "set", "Furniture layout, openings, levels"),
            ("Working drawings (GFC) for civil, electrical, plumbing", "1", "set", "Sufficient for contractor pricing"),
            ("Material and finish schedule", "1", "set", "Brand / grade / rate band per item"),
            ("Site visits during execution", "6", "visits", "Design supervision at key stages"),
        ],
        "inclusions": "Revisions: up to 2 rounds per stage. Soft copies of all drawings in PDF and CAD. Coordination with structural consultant.",
        "exclusions": "Statutory approvals and liaison fees. Structural design (separate package). 3D walkthrough beyond the agreed views.",
    },
    "structural": {
        "scope": [
            ("Soil report review and foundation recommendation", "1", "report", "Coordinate with geotech"),
            ("Structural design with column, beam and slab layout", "1", "set", "Per architectural GFC"),
            ("Reinforcement detailing and bar bending schedule", "1", "set", "All RCC members"),
            ("Structural stability certificate", "1", "certificate", "Signed by licensed engineer"),
            ("Site inspections at critical pours", "4", "visits", "Footing, plinth, slab checks"),
        ],
        "inclusions": "Design as per IS 456 / IS 1893 with seismic zone applicable to the site. Two revision rounds.",
        "exclusions": "Soil testing charges. Architectural drawings. Third-party proof checking fees.",
    },
    "construction": {
        "scope": [
            ("Excavation, PCC and foundation", "1", "lot", "Per structural drawings"),
            ("RCC frame: columns, beams, slabs", "1", "lot", "M25 grade unless specified"),
            ("Brickwork / block masonry", "1", "lot", "External 200 mm, internal 100 mm"),
            ("Internal and external plastering", "1", "lot", "Including grooves and bands"),
            ("Waterproofing: terrace, bathrooms, sunken areas", "1", "lot", "Brand and warranty to be quoted"),
            ("Flooring base preparation and levelling", "1", "lot", "Ready for finish flooring"),
            ("Doors and windows frames fixing", "1", "lot", "Frames supplied under carpentry package"),
            ("Site cleaning and debris removal", "1", "lot", "Weekly and at handover"),
        ],
        "inclusions": "All labour, scaffolding, shuttering and consumables. Curing and quality tests (cube tests every pour). Site safety measures.",
        "exclusions": "Electrical and plumbing (separate packages). Finish flooring, painting and carpentry. Government approvals and electricity/water connection deposits.",
    },
    "interiors": {
        "scope": [
            ("False ceiling with cove and light cutouts", "1", "lot", "Gypsum on GI frame, per drawing"),
            ("Wall panelling and feature walls", "1", "lot", "Per finish schedule"),
            ("Floor finish laying: tile / wood / stone", "1", "lot", "Material supplied by owner or vendor as specified"),
            ("Loose furniture procurement and placement", "1", "lot", "Per approved mood board"),
            ("Soft furnishings: curtains, blinds, rugs", "1", "lot", "Fabric selections from approved range"),
            ("Decorative lighting supply and fixing", "1", "lot", "Fixtures per lighting plan"),
        ],
        "inclusions": "Deep cleaning at handover. Coordination with electrical and carpentry teams.",
        "exclusions": "Civil alterations. Modular kitchen and wardrobes (carpentry package). Appliances.",
    },
    "carpentry": {
        "scope": [
            ("Modular kitchen: base and wall units", "1", "set", "Per kitchen layout; specify ply grade + laminate"),
            ("Wardrobes with internal fittings", "1", "lot", "Count per bedroom; sliding or hinged"),
            ("TV unit and living storage", "1", "lot", "Per drawings"),
            ("Main door and internal doors with hardware", "1", "lot", "Flush / panel per schedule"),
            ("Vanity units for bathrooms", "1", "lot", "Moisture-resistant board"),
            ("Study / crockery / shoe units", "1", "lot", "As per layout"),
        ],
        "inclusions": "Hardware brand (hinges, channels, handles) to be quoted. Edge banding, installation and site polishing. 1-year workmanship warranty minimum.",
        "exclusions": "Countertops and sink (materials package). Appliances. Civil pockets for sliding doors.",
    },
    "electrical": {
        "scope": [
            ("Concealed conduiting and wiring", "1", "lot", "FRLS copper wire, brand to be quoted"),
            ("Distribution board with MCB / RCCB", "1", "set", "Per load calculation"),
            ("Light, fan and 5A / 15A points", "1", "lot", "Count per electrical layout"),
            ("AC points with dedicated MCB", "1", "lot", "Count per room"),
            ("Data, TV and intercom points", "1", "lot", "CAT6 / coaxial"),
            ("Earthing and lightning protection", "1", "set", "Per IS 3043"),
            ("Modular switches and plates", "1", "lot", "Brand and series to be quoted"),
        ],
        "inclusions": "Testing, insulation resistance report and single-line diagram at handover. Chasing and making good.",
        "exclusions": "Light fixtures and fans (interiors package). Meter, connection and utility deposits. Inverter / solar.",
    },
    "plumbing": {
        "scope": [
            ("Concealed water supply lines (hot and cold)", "1", "lot", "CPVC / PPR, brand to be quoted"),
            ("Soil, waste and vent piping", "1", "lot", "uPVC SWR per layout"),
            ("Bathroom fixture installation", "1", "lot", "WC, basin, shower, faucets — count per bathroom"),
            ("Kitchen and utility plumbing points", "1", "lot", "Sink, dishwasher, washing machine, RO"),
            ("Overhead and underground tank connections", "1", "set", "With float valves and pump wiring coordination"),
            ("Rainwater and terrace drainage", "1", "lot", "Per site drawing"),
            ("Pressure testing and leak checks", "1", "lot", "Report at handover"),
        ],
        "inclusions": "All fittings, clamps and consumables. Chasing and making good. Coordination with civil for sunken slabs.",
        "exclusions": "Sanitaryware and CP fittings supply unless specified. Water heater and pump supply. Municipal connection charges.",
    },
    "painting": {
        "scope": [
            ("Internal walls: putty, primer and 2 coats emulsion", "1", "sq ft", "Enter measured area; brand and grade to be quoted"),
            ("Ceiling painting", "1", "sq ft", "Matching or white emulsion"),
            ("External walls: weatherproof paint", "1", "sq ft", "Include texture if specified"),
            ("Wood and metal polish / enamel", "1", "lot", "Doors, grills, railings"),
            ("Protection, masking and cleanup", "1", "lot", "Floors, fixtures, furniture"),
        ],
        "inclusions": "Scaffolding for external work. Minor crack filling. Touch-up after other trades finish.",
        "exclusions": "Structural crack repair. Waterproofing of terrace or walls. Wallpaper.",
    },
    "materials": {
        "scope": [
            ("Vitrified / ceramic tiles", "1", "sq ft", "Size, brand and grade per finish schedule"),
            ("Kitchen and vanity countertops", "1", "sq ft", "Granite / quartz; edge profile"),
            ("Sanitaryware and CP fittings", "1", "lot", "Brand and series per bathroom"),
            ("Electrical fixtures and fans", "1", "lot", "Count per lighting plan"),
            ("Paint and putty", "1", "lot", "Brand and grade"),
            ("Hardware and fittings", "1", "lot", "Per carpentry spec"),
        ],
        "inclusions": "Delivery to site, unloading and stacking. Breakage replacement up to 3%. GST-inclusive rates.",
        "exclusions": "Installation labour. Storage beyond agreed delivery window.",
    },
    "other": {
        "scope": [
            ("Describe the work item and expected outcome", "1", "lot", "Be specific about location and finish"),
            ("Materials to be supplied by the contractor", "1", "lot", "Brand / grade"),
            ("Testing, certification or handover documents", "1", "lot", "If applicable"),
        ],
        "inclusions": "Labour, tools and consumables. Site cleanup.",
        "exclusions": "Work outside the described area. Statutory approvals.",
    },
}


def _work_package_system_prompt(package_type: str, flow: FlowKind) -> str:
    label = _WORK_PACKAGE_LABELS.get(package_type, "Specialist work")
    flow_label = "room remodel" if flow == "remodel" else "new home build"
    return (
        "You are a senior quantity surveyor in India writing a Request for Quotation (RFQ) for a homeowner. "
        f"The trade package is: {label}. The overall project is a {flow_label}. "
        "Write scope lines that a contractor can price line by line without a phone call: each line names the "
        "work item, a quantity with unit where measurable (sq ft, running ft, nos, points, sets, lot), and a short "
        "note on the expected material grade or method. Do not include items that belong to another trade. "
        "Do not include prices. Use plain Indian construction terminology (RCC, putty, CPVC, MCB, etc.). "
        "Respond ONLY with a JSON object of the form: "
        '{"title": string (<=100 chars), "summary": string (2-3 sentences describing the package to a bidder), '
        '"scope_items": [{"label": string, "quantity": string|null, "unit": string|null, "notes": string|null}] '
        '(8-16 items), "inclusions": string (what the contractor must cover), '
        '"exclusions": string (what is out of this package), "site_visit_required": boolean}'
    )


def _work_package_user_prompt(payload: AIWorkPackageScopeRequest) -> str:
    constraints = _brief_constraints_summary(payload.flow, payload.brief)
    brief_json = json.dumps(payload.brief or {}, ensure_ascii=False)
    title_line = f"Homeowner's working title: {payload.title}\n" if payload.title else ""
    return (
        f"Package type: {payload.package_type}\n"
        f"{title_line}"
        f"Structured constraints:\n{constraints}\n\n"
        f"Full brief JSON: {brief_json}\n"
        "Tailor quantities and notes to the rooms, area, floors, style and budget band in the brief."
    )


def _parse_work_package_scope_json(parsed: dict, package_type: str) -> Optional[AIWorkPackageScopeResponse]:
    if not isinstance(parsed, dict):
        return None
    raw_items = parsed.get("scope_items") or []
    items: List[AIWorkPackageScopeItem] = []
    for row in raw_items:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label") or "").strip()
        if not label:
            continue
        quantity = row.get("quantity")
        unit = row.get("unit")
        notes = row.get("notes")
        items.append(
            AIWorkPackageScopeItem(
                label=label[:240],
                quantity=None if quantity in (None, "") else str(quantity)[:30],
                unit=None if unit in (None, "") else str(unit)[:30],
                notes=None if notes in (None, "") else str(notes)[:400],
            )
        )
        if len(items) >= 30:
            break
    if len(items) < 3:
        return None
    title = str(parsed.get("title") or "").strip()[:140] or _WORK_PACKAGE_LABELS.get(package_type, "Work package")
    summary = str(parsed.get("summary") or "").strip()[:4000]
    if not summary:
        return None
    site_visit = parsed.get("site_visit_required")
    return AIWorkPackageScopeResponse(
        title=title,
        summary=summary,
        scope_items=items,
        inclusions=str(parsed.get("inclusions") or "").strip()[:3000],
        exclusions=str(parsed.get("exclusions") or "").strip()[:3000],
        site_visit_required=bool(site_visit) if isinstance(site_visit, bool) else True,
        mock=False,
    )


def _extract_json_object(content: str) -> Optional[dict]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(text[start : end + 1])
        except Exception:
            return None
    return parsed if isinstance(parsed, dict) else None


def _grok_work_package_scope(payload: AIWorkPackageScopeRequest) -> Optional[AIWorkPackageScopeResponse]:
    key = _xai_api_key("plan")
    if not key:
        return None
    model = os.getenv("GROK_CHAT_MODEL", "grok-3-mini").strip() or "grok-3-mini"
    try:
        resp = requests.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": _work_package_system_prompt(payload.package_type, payload.flow)},
                    {"role": "user", "content": _work_package_user_prompt(payload)},
                ],
            },
            timeout=45,
        )
        resp.raise_for_status()
        content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = _extract_json_object(content)
        result = _parse_work_package_scope_json(parsed, payload.package_type) if parsed else None
        if result is None:
            return None
        result.provider_note = f"Drafted by xAI {model} (Grok)."
        return result
    except Exception as exc:
        logger.exception("Grok work-package scope drafting failed: %s", exc)
        return None


def _openai_work_package_scope(payload: AIWorkPackageScopeRequest) -> Optional[AIWorkPackageScopeResponse]:
    key = os.getenv("HM_AI_PLAN_API_KEY", "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return None
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _work_package_system_prompt(payload.package_type, payload.flow)},
                    {"role": "user", "content": _work_package_user_prompt(payload)},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "{}")
        parsed = _extract_json_object(content)
        result = _parse_work_package_scope_json(parsed, payload.package_type) if parsed else None
        if result is None:
            return None
        result.provider_note = "Drafted by OpenAI gpt-4o-mini."
        return result
    except Exception as exc:
        logger.exception("OpenAI work-package scope drafting failed: %s", exc)
        return None


def _checklist_work_package_scope(payload: AIWorkPackageScopeRequest) -> AIWorkPackageScopeResponse:
    """Deterministic, trade-curated draft used when no LLM provider answers."""
    spec = _WORK_PACKAGE_CHECKLISTS.get(payload.package_type) or _WORK_PACKAGE_CHECKLISTS["other"]
    brief = payload.brief or {}
    loc = str(brief.get("location") or "").split(",")[0].strip()
    room = str(brief.get("room") or "").strip()
    label = _WORK_PACKAGE_LABELS.get(payload.package_type, "Work package")
    where = f" for the {room} remodel" if payload.flow == "remodel" and room else (" for the new home" if payload.flow != "remodel" else "")
    place = f" in {loc}" if loc else ""
    title = (payload.title or "").strip() or f"{label}{where}"
    summary = (
        f"{label}{where}{place}. Price each scope line separately so the homeowner can compare bids line by line. "
        "Quantities are indicative from the homeowner's brief; confirm on a site visit before final pricing."
    )
    return AIWorkPackageScopeResponse(
        title=title[:140],
        summary=summary,
        scope_items=[
            AIWorkPackageScopeItem(label=lbl, quantity=qty, unit=unit, notes=note)
            for lbl, qty, unit, note in spec["scope"]
        ],
        inclusions=spec["inclusions"],
        exclusions=spec["exclusions"],
        site_visit_required=payload.package_type not in ("materials", "design"),
        mock=True,
        provider_note="AI drafting was unavailable — this is the curated trade checklist. Edit quantities to match your home.",
    )


@api_router.post("/ai/work-package-scope", response_model=AIWorkPackageScopeResponse)
def ai_work_package_scope(payload: AIWorkPackageScopeRequest, _user: dict = Depends(_ai_request_slot)):
    result = _grok_work_package_scope(payload) or _openai_work_package_scope(payload)
    if result is not None:
        return result
    logger.warning(
        "ai/work-package-scope falling back to curated checklist; package_type=%s flow=%s",
        payload.package_type,
        payload.flow,
    )
    return _checklist_work_package_scope(payload)


app.include_router(api_router)

app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_csv_env(
        "CORS_ORIGINS",
        "https://www.buildguru.ai,https://buildguru.ai,https://www.buildguru.online,https://buildguru.online,http://localhost:3000,http://127.0.0.1:3000",
    ),
    allow_origin_regex=os.getenv(
        "CORS_ORIGIN_REGEX",
        r"https://(buildguru(-1|final)?|frontend)(-[a-z0-9-]+)?\.vercel\.app",
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
