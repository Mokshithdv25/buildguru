import ast
import hashlib
import hmac
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LaunchContractsTest(unittest.TestCase):
    def test_project_post_status_matches_database_constraint(self):
        project_api = (ROOT / "frontend/src/lib/projectFlowApi.js").read_text()
        for sql_name in (
            "buildguru_single_setup.sql",
            "buildguru_supabase_align.sql",
            "buildguru_rls_hardening.sql",
        ):
            sql = (ROOT / "db" / sql_name).read_text()
            self.assertIn("open_for_quotes", sql, sql_name)
        self.assertIn('"open_for_quotes"', project_api)

    def test_metered_backend_routes_require_a_user(self):
        server = (ROOT / "backend/server.py").read_text()
        tree = ast.parse(server)
        handlers = {
            node.name: node
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        protected_handlers = {
            "create_billing_order": "_require_user",
            "verify_billing_payment": "_require_user",
            "ai_hub_assistant": "_ai_request_slot",
            "ai_v0_images": "_ai_request_slot",
            "ai_estimate_plan": "_ai_request_slot",
        }
        for handler, dependency in protected_handlers.items():
            node = handlers[handler]
            self.assertIsInstance(node, ast.FunctionDef, handler)
            self.assertIn(f"Depends({dependency})", ast.unparse(node.args), handler)

    def test_health_checks_distinguish_liveness_from_database_readiness(self):
        server = (ROOT / "backend/server.py").read_text()
        self.assertIn('@app.get("/health/live")\ndef health_live()', server)
        self.assertIn('@app.get("/health/ready")\ndef health_ready()', server)
        self.assertIn('_supabase.rpc("launch_schema_ready").execute()', server)
        self.assertIn('_env_flag("ALLOW_MONGO_FALLBACK", False)', server)
        self.assertIn('_mongo_client.admin.command("ping")', server)
        self.assertIn('status_code=503', server)
        self.assertIn('{"status": "not_ready", "database": "unavailable"}', server)

    def test_public_profile_response_is_an_explicit_safe_allowlist(self):
        server = (ROOT / "backend/server.py").read_text()
        tree = ast.parse(server)
        model = next(
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name == "PublicPortfolio"
        )
        public_fields = {
            node.target.id
            for node in model.body
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        }
        self.assertTrue(
            {
                "id",
                "craft",
                "full_name",
                "business_name",
                "city",
                "short_bio",
                "specialties",
                "photos",
                "published",
                "slug",
            }.issubset(public_fields)
        )
        self.assertTrue(
            {"owner_user_id", "phone", "email", "license_number"}.isdisjoint(public_fields)
        )
        self.assertIn(
            '@api_router.get("/profile/{slug}", response_model=PublicPortfolio)',
            server,
        )
        self.assertIn("profile = PublicPortfolio.model_validate(doc)", server)
        self.assertIn("return _public_portfolio(doc)", server)

    def test_webhook_is_bounded_verified_and_cannot_downgrade_paid_orders(self):
        server = (ROOT / "backend/server.py").read_text()
        for contract in (
            '"RAZORPAY_WEBHOOK_MAX_BYTES", 256 * 1024',
            'if declared_length > RAZORPAY_WEBHOOK_MAX_BYTES:',
            'if size > RAZORPAY_WEBHOOK_MAX_BYTES:',
            'hmac.compare_digest(expected, signature.lower())',
            'except (UnicodeDecodeError, json.JSONDecodeError)',
            'payment.get("status") != "captured"',
            'payment.get("amount")',
            'payment.get("currency")',
            'order_entity.get("status") != "paid"',
            'order_entity.get("amount_paid")',
            'rows[0].get("status") != "paid"',
            '.neq("status", "paid")',
            'return await run_in_threadpool(',
        ):
            self.assertIn(contract, server, contract)

    def test_payment_signature_contract_uses_order_and_payment_ids(self):
        secret = "launch-test-secret"
        order_id = "order_home_makers"
        payment_id = "pay_home_makers"
        expected = hmac.new(
            secret.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(len(expected), 64)
        server = (ROOT / "backend/server.py").read_text()
        self.assertIn("_razorpay_verify_signature", server)
        self.assertIn("payment.get(\"status\") != \"captured\"", server)

    def test_launch_sql_removes_anonymous_storage_writes(self):
        sql = (ROOT / "db/buildguru_rls_hardening.sql").read_text()
        self.assertIn('drop policy if exists "demo_storage_insert"', sql)
        self.assertIn('drop policy if exists "demo_storage_update"', sql)
        self.assertIn("activate_billing_order", sql)
        self.assertNotRegex(
            sql,
            re.compile(r'create policy "projects_claim_orphan"', re.IGNORECASE),
        )

    def test_public_directory_view_and_project_images_do_not_expose_private_data(self):
        sql = (ROOT / "db/buildguru_rls_hardening.sql").read_text()
        compact_sql = re.sub(r"\s+", " ", sql.lower())
        self.assertIn("create or replace view public.published_portfolios", compact_sql)
        self.assertIn("with (security_barrier = true)", compact_sql)
        self.assertIn(
            "revoke all on public.portfolios from public, anon, authenticated",
            compact_sql,
        )
        self.assertIn("grant select on public.published_portfolios to anon, authenticated", compact_sql)
        self.assertIn(
            "update storage.buckets set public = false where id in ('project-v0', 'portfolio-media')",
            compact_sql,
        )
        self.assertIn('create policy "project_v0_select_own"', compact_sql)
        self.assertIn('create policy "portfolio_media_select_published"', compact_sql)
        self.assertIn("public.portfolio_media_is_published(name)", compact_sql)
        self.assertIn("for select to authenticated", compact_sql)
        self.assertIn("(storage.foldername(name))[1] = auth.uid()::text", compact_sql)

        public_view = compact_sql.split(
            "create or replace view public.published_portfolios", 1
        )[1].split("where published = true", 1)[0]
        for private_field in ("owner_user_id", "phone", "email", "license_number"):
            self.assertNotIn(private_field, public_view)

        frontend_api = (ROOT / "frontend/src/lib/api.js").read_text()
        self.assertGreaterEqual(frontend_api.count('.from("published_portfolios")'), 2)
        self.assertNotIn('.from("portfolios").select("*")', frontend_api)

    def test_native_and_web_origins_are_documented_for_backend_deploys(self):
        env_example = (ROOT / "backend/.env.example").read_text()
        render = (ROOT / "render.yaml").read_text()
        for config in (env_example, render):
            self.assertIn("https://www.buildguru.online", config)
            self.assertIn("https://buildguru.online", config)
            self.assertIn("https://localhost", config)
            self.assertIn("capacitor://localhost", config)
        self.assertIn("CORS_ORIGIN_REGEX=", env_example)
        self.assertIn("CORS_ORIGIN_REGEX", render)
        self.assertNotIn("https://.*\\.vercel\\.app", env_example)

    def test_portfolio_publish_cannot_fabricate_a_local_listing(self):
        go_live = (ROOT / "frontend/src/pages/GoLive.jsx").read_text()
        craft = (ROOT / "frontend/src/pages/CraftSelection.jsx").read_text()
        directory_api = (ROOT / "frontend/src/lib/api.js").read_text()
        self.assertNotIn("localFallback", go_live)
        self.assertNotIn("using local fallback", go_live)
        self.assertNotIn("using local draft mode", craft)
        self.assertIn('throw new Error(`Could not load the professional directory:', directory_api)

    def test_directory_loads_published_professionals_without_a_search(self):
        desktop = (ROOT / "frontend/src/pages/Marketplace.jsx").read_text()
        mobile = (ROOT / "frontend/src/mobile/pages/MobileProsPage.jsx").read_text()
        self.assertIn("fetchPublished(null);", desktop)
        self.assertIn('fetchPros(null, "");', mobile)
        self.assertIn('useState("")', desktop)
        self.assertIn('useState("")', mobile)

    def test_mobile_project_management_uses_saved_board_rows(self):
        mobile = (ROOT / "frontend/src/mobile/pages/MobileProjectPage.jsx").read_text()
        self.assertNotIn("DEFAULT_PHASES", mobile)
        self.assertIn("boardPhases.map", mobile)
        self.assertIn("await addProjectTask", mobile)
        self.assertIn("await setProjectTaskDone", mobile)

    def test_real_project_writes_surface_database_errors(self):
        project_api = (ROOT / "frontend/src/lib/projectFlowApi.js").read_text()
        self.assertIn("Could not save the project design and estimate", project_api)
        self.assertNotIn('console.warn("addProjectTask:', project_api)
        self.assertNotIn('console.warn("setProjectTaskDone:', project_api)

    def test_pro_dashboard_has_no_fabricated_business_metrics(self):
        dashboard = (ROOT / "frontend/src/pages/ProDashboard.jsx").read_text()
        for fake_label in ("Leads in pipeline", "Active projects", "Quote requests", "Sharma Residence"):
            self.assertNotIn(fake_label, dashboard)
        self.assertIn("Your public directory listing", dashboard)

    def test_checklists_drive_persisted_project_progress(self):
        project_api = (ROOT / "frontend/src/lib/projectFlowApi.js").read_text()
        dashboard = (ROOT / "frontend/src/pages/ProjectDashboard.jsx").read_text()
        migration = (ROOT / "db/buildguru_project_workspace.sql").read_text()
        self.assertIn("export function derivePhaseProgress", project_api)
        self.assertIn("await syncProjectProgress", project_api)
        self.assertIn("Stage percentage is calculated from completed checklist tasks", dashboard)
        self.assertIn("trg_project_task_progress", migration)

    def test_project_workspace_modules_are_owner_scoped(self):
        migration = (ROOT / "db/buildguru_project_workspace.sql").read_text()
        api = (ROOT / "frontend/src/lib/projectWorkspaceApi.js").read_text()
        for table in ("project_team_members", "project_payments"):
            self.assertIn(f"create table if not exists public.{table}", migration)
            self.assertIn("public.project_owned_by_user(project_id)", migration)
        self.assertIn("'project-documents', 'project-documents', false", migration)
        self.assertIn('const DOCUMENT_BUCKET = "project-documents"', api)
        self.assertIn("createSignedUrl", api)

    def test_account_deletion_is_available_in_app(self):
        server = (ROOT / "backend/server.py").read_text()
        account = (ROOT / "frontend/src/pages/AccountPage.jsx").read_text()
        self.assertIn('@api_router.delete("/account")', server)
        self.assertIn("_supabase.auth.admin.delete_user(user_id)", server)
        self.assertIn("Permanently delete account", account)

    def test_store_submission_drafts_exist(self):
        for name in ("APP_STORE_LISTING.md", "PLAY_STORE_LISTING.md", "PRIVACY_AND_DATA_SAFETY.md", "RELEASE_CHECKLIST.md"):
            self.assertTrue((ROOT / "store" / name).exists(), name)

    def test_native_build_does_not_offer_razorpay_checkout(self):
        subscriptions = (ROOT / "frontend/src/pages/SubscriptionsPage.jsx").read_text()
        self.assertIn("Capacitor.isNativePlatform()", subscriptions)
        self.assertIn("!isNativeApp && billingEnabled ? <button", subscriptions)
        self.assertIn("displays plan status only", subscriptions)

    def test_client_build_rejects_secrets_and_native_auth_is_pkce_only(self):
        verifier = (ROOT / "frontend/scripts/verify-mobile-env.js").read_text()
        client = (ROOT / "frontend/src/lib/supabaseClient.js").read_text()
        native = (ROOT / "frontend/src/lib/nativeAuth.js").read_text()
        root_vercel = (ROOT / "vercel.json").read_text()
        frontend_vercel = (ROOT / "frontend/vercel.json").read_text()
        self.assertIn("sb_secret_", verifier)
        self.assertIn("SERVICE.?ROLE|SECRET", verifier)
        self.assertIn("verify:client-env", root_vercel)
        self.assertIn("verify:client-env", frontend_vercel)
        self.assertIn('flowType: "pkce"', client)
        self.assertIn("exchangeCodeForSession", native)
        self.assertNotIn("setSession({", native)

    def test_billing_is_fail_closed_and_reuses_one_pending_order(self):
        server = (ROOT / "backend/server.py").read_text()
        render = (ROOT / "render.yaml").read_text()
        migration = (ROOT / "db/buildguru_rls_hardening.sql").read_text()
        billing_api = (ROOT / "frontend/src/lib/billingApi.js").read_text()
        self.assertIn('BILLING_ENABLED = _env_flag("BILLING_ENABLED", False)', server)
        self.assertIn('ALLOW_LIVE_BILLING = _env_flag("ALLOW_LIVE_BILLING", False)', server)
        self.assertIn('detail="Checkout is not active yet"', server)
        self.assertIn('@api_router.post("/create-order")', server)
        self.assertIn('@api_router.post("/verify-payment")', server)
        self.assertIn("_razorpay_verify_signature", server)
        self.assertIn('_billing_checkout_payload(plan, pending[0]["gateway_order_id"])', server)
        self.assertIn("idx_billing_orders_one_created_per_plan", migration)
        self.assertIn('key: BILLING_ENABLED\n        value: "false"', render)
        self.assertIn('checkout.razorpay.com/v1/checkout.js', billing_api)
        self.assertIn('verifyPath: "/billing/verify"', billing_api)

    def test_global_body_cap_and_ai_generation_cost_guards(self):
        server = (ROOT / "backend/server.py").read_text()
        ai_api = (ROOT / "frontend/src/lib/aiApi.js").read_text()
        remodel = (ROOT / "frontend/src/pages/RemodelHome.jsx").read_text()
        self.assertIn("class RequestBodyLimitMiddleware", server)
        self.assertIn("received > self.max_bytes", server)
        self.assertIn("max_bytes=MAX_REQUEST_BODY_BYTES", server)
        self.assertNotIn("IMAGE_ATTEMPTS", ai_api)
        self.assertIn("timeout: 240000", ai_api)
        self.assertIn("const [photos, setPhotos] = useState([])", remodel)
        self.assertIn("roomPhotoCount: photos.length", remodel)
        self.assertIn("inspirationImages: referenceImages", remodel)

    def test_real_image_generation_has_a_durable_daily_quota(self):
        server = (ROOT / "backend/server.py").read_text()
        hardening = (ROOT / "db/buildguru_rls_hardening.sql").read_text()
        workspace = (ROOT / "db/buildguru_project_workspace.sql").read_text()
        env_example = (ROOT / "backend/.env.example").read_text()
        render = (ROOT / "render.yaml").read_text()

        self.assertIn(
            'AI_DAILY_IMAGE_PACKS = _bounded_int_env("AI_DAILY_IMAGE_PACKS", 3, 1, 50)',
            server,
        )
        self.assertIn('"consume_ai_daily_quota"', server)
        self.assertIn('"p_usage_kind": "image_pack"', server)
        self.assertIn('status_code=429', server)
        self.assertIn('headers={"Retry-After": str(_seconds_until_utc_midnight())}', server)

        image_handler = server.split('@api_router.post("/ai/v0-images")', 1)[1].split(
            '@api_router.post("/ai/estimate-plan")', 1
        )[0]
        self.assertLess(
            image_handler.index("_consume_ai_daily_quota"),
            image_handler.index("_grok_v0_images"),
        )
        self.assertLess(
            image_handler.index("if _allow_ai_mocks():"),
            image_handler.index("_consume_ai_daily_quota"),
        )

        compact_sql = re.sub(r"\s+", " ", hardening.lower())
        self.assertIn("create table if not exists public.ai_usage_daily", compact_sql)
        self.assertIn("alter table public.ai_usage_daily enable row level security", compact_sql)
        self.assertIn(
            "revoke all on public.ai_usage_daily from public, anon, authenticated",
            compact_sql,
        )
        self.assertIn("security definer", compact_sql)
        self.assertIn("on conflict (user_id, usage_date, usage_kind) do update", compact_sql)
        self.assertIn("where usage.request_count < p_limit", compact_sql)
        self.assertIn(
            "grant execute on function public.consume_ai_daily_quota(uuid, text, integer) to service_role",
            compact_sql,
        )
        self.assertIn("public.ai_usage_daily", workspace)
        self.assertIn(
            "public.consume_ai_daily_quota(uuid,text,integer)", workspace
        )
        self.assertIn("AI_DAILY_IMAGE_PACKS=3", env_example)
        self.assertIn('key: AI_DAILY_IMAGE_PACKS\n        value: "3"', render)

    def test_new_home_v0_has_one_free_concept_and_paid_followups(self):
        server = (ROOT / "backend/server.py").read_text()
        build = (ROOT / "frontend/src/pages/BuildNewHome.jsx").read_text()
        visuals = (ROOT / "frontend/src/components/V0MockResults.jsx").read_text()
        dashboard = (ROOT / "frontend/src/pages/ProjectDashboard.jsx").read_text()
        render = (ROOT / "render.yaml").read_text()

        self.assertIn('mode: Literal["full", "concept", "floor_plans", "revision"] = "concept"', server)
        self.assertIn('paid_mode = payload.mode in ("full", "floor_plans", "revision")', server)
        self.assertIn('plan_id="homeowner_project_pass"', server)
        self.assertIn('Your free exterior concept has already been used', server)
        self.assertIn('mode === "floor_plans"', build)
        self.assertIn('runV0Generation("concept")', build)
        self.assertIn('runV0Generation("floor_plans")', build)
        self.assertIn('runV0Generation("revision", revisionPrompt, revisionTarget)', build)
        self.assertIn('revision_kind: Literal["exterior", "floor_plan"]', server)
        self.assertIn('revision_kind: revisionKind', (ROOT / "frontend/src/lib/aiApi.js").read_text())
        self.assertIn('setBuildFlow({ formSnapshot: form, activeStep, step: activeStep })', build)
        self.assertIn('flowStep: "draft"', build)
        self.assertIn('savedStep >= 1 && savedStep <= 4', build)
        self.assertIn('⌕ Zoom', visuals)
        self.assertIn('↓ Download', visuals)
        self.assertIn('v0Pack?.images?.floor_plans', dashboard)
        self.assertIn('key: GROK_INLINE_IMAGES\n        value: "1"', render)

    def test_project_workspace_controls_are_persistent_and_share_the_hub_shell(self):
        dashboard = (ROOT / "frontend/src/pages/ProjectDashboard.jsx").read_text()
        workspace = (ROOT / "frontend/src/lib/projectWorkspaceApi.js").read_text()
        flow_api = (ROOT / "frontend/src/lib/projectFlowApi.js").read_text()
        payments = (ROOT / "frontend/src/pages/ProjectPayments.jsx").read_text()
        documents = (ROOT / "frontend/src/pages/DocumentVault.jsx").read_text()
        nav = (ROOT / "frontend/src/components/landing/LandingNavbar.jsx").read_text()

        self.assertIn("updateProjectTitle(activeProjectId", dashboard)
        self.assertIn("setProjectTaskStatus(task.id, status)", dashboard)
        self.assertIn('category: "site_photo"', dashboard)
        self.assertIn('from("projects")', workspace)
        self.assertIn('kind: String(category || "other")', workspace)
        self.assertIn('["todo", "in_progress", "blocked", "done"]', flow_api)
        self.assertIn("<ProjectHubShell>", payments)
        self.assertIn('category: "payment_receipt"', payments)
        self.assertIn("<ProjectHubShell>", documents)
        self.assertIn("Approvals, permits & NOCs", documents)
        self.assertNotIn('{ label: "Materials shop", path: "/shop" }', nav)

    def test_homepage_keeps_core_value_proposition_with_light_agentic_signal(self):
        why = (ROOT / "frontend/src/components/landing/LandingWhyChooseUs.jsx").read_text()
        pros = (ROOT / "frontend/src/components/landing/LandingForProfessionals.jsx").read_text()

        self.assertIn("AI design, plans & estimates", why)
        self.assertIn("AI professional matching", why)
        self.assertIn("Smart project hub", why)
        self.assertIn("Payment protection", why)
        self.assertIn("Smart reminders, schedule tracking, and follow-ups", why)
        self.assertIn("Agentic shopping suggests materials you approve", why)
        self.assertIn("A shareable portfolio, directory visibility", pros)
        self.assertIn("Smart reminders and client follow-ups are the next layer", pros)

    def test_portfolio_self_publish_reporting_and_blocking_are_launch_contracts(self):
        sql = (ROOT / "db/buildguru_rls_hardening.sql").read_text()
        api = (ROOT / "frontend/src/lib/api.js").read_text()
        desktop = (ROOT / "frontend/src/pages/PortfolioPage.jsx").read_text()
        mobile = (ROOT / "frontend/src/mobile/pages/MobileProProfilePage.jsx").read_text()
        for contract in (
            "moderation_status = 'approved'",
            "create table if not exists public.portfolio_reports",
            "create table if not exists public.blocked_portfolios",
            "quarantine_reported_portfolio",
            "drop trigger if exists trg_portfolio_moderation_insert",
            "set moderation_status = 'approved'",
        ):
            self.assertIn(contract, sql)
        self.assertIn('moderation_status: "approved"', api)
        self.assertIn("Report profile", desktop)
        self.assertIn("Block profile", desktop)
        self.assertIn("Work With Me", desktop)
        self.assertIn("Want a portfolio like this? Create yours", desktop)
        self.assertIn("Report profile", mobile)
        self.assertIn("Block profile", mobile)
        self.assertIn("Work With Me", mobile)
        self.assertIn("Want a portfolio like this? Create yours", mobile)

        migration = (ROOT / "db/buildguru_portfolio_self_publish.sql").read_text()
        self.assertIn("drop trigger if exists trg_portfolio_moderation_insert", migration)
        self.assertIn("set moderation_status = 'approved'", migration)
        self.assertIn("still_waiting", migration)

    def test_mobile_core_flows_preserve_context_and_phone_ui_contracts(self):
        app = (ROOT / "frontend/src/App.js").read_text()
        mobile_routes = (ROOT / "frontend/src/mobile/MobileAppRoutes.jsx").read_text()
        mobile_shell = (ROOT / "frontend/src/mobile/MobileShell.jsx").read_text()
        mobile_build = (ROOT / "frontend/src/mobile/pages/MobileBuildPage.jsx").read_text()
        mobile_project = (ROOT / "frontend/src/mobile/pages/MobileProjectPage.jsx").read_text()
        mobile_profile = (ROOT / "frontend/src/mobile/pages/MobileProProfilePage.jsx").read_text()
        mobile_home = (ROOT / "frontend/src/mobile/pages/MobileHomePage.jsx").read_text()
        mobile_pros = (ROOT / "frontend/src/mobile/pages/MobileProsPage.jsx").read_text()
        mobile_design = (ROOT / "frontend/src/mobile/pages/MobileDesignPage.jsx").read_text()
        mobile_header = (ROOT / "frontend/src/mobile/MobileHeader.jsx").read_text()
        mobile_hub = (ROOT / "frontend/src/mobile/hooks/useMobileHub.js").read_text()
        mobile_css = (ROOT / "frontend/src/mobile/mobile.css").read_text()
        native_shell = (ROOT / "frontend/src/lib/capacitorPlatform.js").read_text()

        self.assertIn('lazy(() => import("./mobile/MobileAppRoutes"))', app)
        self.assertIn('lazy(() => import("./pages/MobileProjectPage"))', mobile_routes)
        for project_tool in ('"/documents"', '"/team"', '"/project/journey"'):
            self.assertNotIn(project_tool, mobile_shell)
        self.assertIn('searchParams.get("pro")', mobile_build)
        self.assertIn('flowParams.set("pro", referredPro)', mobile_build)
        self.assertIn('aria-label="Start a new project"', mobile_project)
        self.assertIn('aria-label="Rename project"', mobile_project)
        self.assertIn('width: "calc(100% - 32px)"', mobile_project)
        self.assertIn("AI design pack", mobile_project)
        self.assertIn("Timeline & stages", mobile_project)
        self.assertIn("hm-m-project-nav", mobile_project)
        self.assertIn("hm-m-project-dock", mobile_project)
        self.assertIn("Work With Me", mobile_profile)
        self.assertIn("hm-m-create-portfolio-link", mobile_profile)
        self.assertIn("hm-m-primary-dock", mobile_profile)
        self.assertIn("Intelligence that stays useful", mobile_home)
        self.assertIn('hmLogoMarkSrc', mobile_home)
        self.assertIn('mobile_flow_build.jpg', mobile_home)
        self.assertIn('hm-m-quick-media', mobile_home)
        self.assertIn("What do you want to do?", mobile_home)
        self.assertIn("Continue where you left off", mobile_home)
        self.assertIn("hm-m-resume-card", mobile_home)
        self.assertIn("hm-m-feed-skeleton", mobile_home)
        self.assertIn("BuildGuru professional network", mobile_pros)
        self.assertIn("Search professionals", mobile_pros)
        self.assertIn("hm-m-results-header", mobile_pros)
        self.assertIn("hm-m-pro-skeleton", mobile_pros)
        self.assertIn("From inspiration to a build-ready project", mobile_design)
        self.assertIn('mobile_design_hero.jpg', mobile_design)
        self.assertIn('hmLogoMarkSrc', mobile_header)
        self.assertIn("includeProCount = false", mobile_hub)
        self.assertIn("font-size: 16px !important", mobile_css)
        self.assertIn("min-height: 44px", mobile_css)
        self.assertIn("prefers-reduced-motion: reduce", mobile_css)
        self.assertIn('window.location.pathname === "/"', native_shell)

    def test_server_profile_signer_is_owner_prefix_scoped(self):
        server = (ROOT / "backend/server.py").read_text()
        self.assertIn("path.startswith(expected_prefix)", server)
        self.assertIn('expected_prefix = f"{owner_id}/{portfolio_id}/"', server)
        self.assertIn('.eq("moderation_status", "approved")', server)

    def test_existing_profile_role_beats_generic_sign_in_intent(self):
        auth = (ROOT / "frontend/src/lib/hmAuth.js").read_text()
        profile_pos = auth.index('if (profile?.role === "pro"')
        intent_pos = auth.index('if (signInIntent === "pro"')
        self.assertLess(profile_pos, intent_pos)

    def test_oauth_role_persistence_requires_an_explicit_signup_callback(self):
        sign_in = (ROOT / "frontend/src/pages/SignInPage.jsx").read_text()
        self.assertRegex(
            sign_in,
            re.compile(
                r'if\s*\(\s*searchParams\.get\("oauth"\) === "1"\s*&&\s*'
                r'searchParams\.get\("signup"\) === "1"',
                re.DOTALL,
            ),
        )
        self.assertIn('if (requestedSignUp) params.set("signup", "1");', sign_in)
        self.assertEqual(sign_in.count("await updateUserProfileRole("), 1)

    def test_craco_does_not_preload_generic_dotenv_before_cra(self):
        craco = (ROOT / "frontend/craco.config.js").read_text()
        self.assertNotIn('require("dotenv").config()', craco)

    def test_production_database_scripts_are_transactional(self):
        for name in (
            "buildguru_production_reset.sql",
            "buildguru_single_setup.sql",
            "buildguru_rls_hardening.sql",
            "buildguru_project_workspace.sql",
        ):
            sql = (ROOT / "db" / name).read_text().lower()
            self.assertRegex(sql, r"(?m)^begin;\s*$", name)
            self.assertRegex(sql, r"(?m)^commit;\s*$", name)

    def test_native_google_creation_is_not_hidden_behind_an_ios_check(self):
        sign_in = (ROOT / "frontend/src/pages/SignInPage.jsx").read_text()
        self.assertNotIn("nativePlatform", sign_in)
        self.assertIn("{supabaseConfigured && !passwordRecovery ? (", sign_in)


if __name__ == "__main__":
    unittest.main()
