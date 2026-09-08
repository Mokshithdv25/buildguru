"""Contract tests for the trade-scoped RFQ (work package) workflow.

These tests keep the database schema, the FastAPI drafting endpoint and the
frontend clients in agreement without needing a live Supabase project.
"""

import ast
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "db/buildguru_work_packages.sql"


def _sql_check_values(sql: str, column: str) -> set:
    """Return the string literals from ``<column> ... check (<column> in (...))``."""
    match = re.search(rf"{column} text[^\n]*check \({column} in \((.*?)\)\)", sql, re.S)
    assert match, f"no check constraint found for {column}"
    return set(re.findall(r"'([a-z_]+)'", match.group(1)))


def _js_string_array(source: str, name: str) -> set:
    match = re.search(rf"export const {name} = \[(.*?)\];", source, re.S)
    assert match, f"{name} not exported"
    return set(re.findall(r'"([a-z_]+)"', match.group(1)))


def _js_object_keys(source: str, name: str) -> set:
    match = re.search(rf"export const {name} = \{{(.*?)\n\}};", source, re.S)
    assert match, f"{name} not exported"
    return set(re.findall(r"^  ([a-z_]+): \{", match.group(1), re.M))


class WorkPackageContractsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = SQL_PATH.read_text()
        cls.server = (ROOT / "backend/server.py").read_text()
        cls.api = (ROOT / "frontend/src/lib/workPackagesApi.js").read_text()
        cls.catalog = (ROOT / "frontend/src/lib/workPackageCatalog.js").read_text()

    # ------------------------------------------------------------------ schema

    def test_migration_is_transactional_and_has_a_readiness_probe(self):
        body = self.sql.split("begin;", 1)[1]
        self.assertIn("\ncommit;", body)
        self.assertIn("create or replace function public.work_packages_ready()", self.sql)
        self.assertIn("grant execute on function public.work_packages_ready() to authenticated, service_role;", self.sql)

    def test_every_work_package_table_has_rls_enabled(self):
        for table in (
            "project_work_packages",
            "project_work_package_invites",
            "project_work_package_bids",
            "project_work_package_questions",
            "project_work_package_events",
        ):
            self.assertIn(f"create table if not exists public.{table} (", self.sql, table)
            self.assertIn(f"alter table public.{table} enable row level security;", self.sql, table)

    def test_package_type_enum_matches_frontend_catalog_and_backend_drafting(self):
        sql_types = _sql_check_values(self.sql, "package_type")
        catalog_types = _js_object_keys(self.catalog, "WORK_PACKAGE_TYPES")
        self.assertEqual(sql_types, catalog_types)

        tree = ast.parse(self.server)
        backend_types = None
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "WorkPackageType" for t in node.targets
            ):
                backend_types = {c.value for c in ast.walk(node.value) if isinstance(c, ast.Constant) and isinstance(c.value, str)}
        self.assertIsNotNone(backend_types, "WorkPackageType Literal missing from backend")
        self.assertEqual(sql_types, backend_types)

        # Every type has a curated checklist so the endpoint can always answer.
        for package_type in sql_types:
            self.assertIn(f'"{package_type}": {{', self.server.split("_WORK_PACKAGE_CHECKLISTS")[1])

    def test_status_pricing_and_decision_enums_match_frontend(self):
        self.assertEqual(_sql_check_values(self.sql, "status"), _js_object_keys(self.catalog, "WORK_PACKAGE_STATUS"))
        self.assertEqual(_sql_check_values(self.sql, "pricing_basis"), _js_string_array(self.api, "WORK_PACKAGE_PRICING"))
        self.assertEqual(
            _sql_check_values(self.sql, "homeowner_decision"),
            _js_string_array(self.api, "WORK_PACKAGE_BID_DECISIONS"),
        )

    # --------------------------------------------------------------- privacy

    def test_homeowners_cannot_write_bids_directly(self):
        # Homeowners read bids on their own project but never insert/update them;
        # the only homeowner write path is the security-definer decision RPC.
        self.assertIn('create policy "work_package_bids_select_project_owner"', self.sql)
        self.assertNotIn("work_package_bids_update_project_owner", self.sql)
        self.assertNotIn("work_package_bids_insert_project_owner", self.sql)
        self.assertIn("create or replace function public.set_work_package_bid_decision(", self.sql)
        self.assertIn("perform set_config('buildguru.allow_decision_write', 'on', true);", self.sql)
        self.assertIn("raise exception 'Bid not found for this project'", self.sql)
        self.assertIn("raise exception 'Another bid is already accepted on this work package. Reconsider it first.'", self.sql)

    def test_bid_rules_are_enforced_in_the_database(self):
        self.assertIn("create or replace function public.enforce_work_package_bid_rules()", self.sql)
        self.assertIn("raise exception 'This work package has reached its bid limit'", self.sql)
        self.assertIn("raise exception 'This work package is no longer accepting bids'", self.sql)
        self.assertIn("raise exception 'An accepted bid cannot be revised.", self.sql)
        self.assertIn("check (max_bids between 1 and 25)", self.sql)

    def test_contact_details_stay_gated_until_shortlist_or_award(self):
        # Pro contact reaches the homeowner only after shortlist/accept.
        self.assertIn(
            "case when b.homeowner_decision in ('shortlisted', 'accepted') then pf.phone else null end as pro_phone",
            self.sql,
        )
        self.assertIn(
            "case when b.homeowner_decision in ('shortlisted', 'accepted') then pf.email else null end as pro_email",
            self.sql,
        )
        # Homeowner contact reaches a pro only through the awarded view.
        awarded = self.sql.split("create view public.pro_awarded_work_packages")[1].split("revoke all")[0]
        self.assertIn("where b.homeowner_decision = 'accepted'", awarded)
        self.assertIn("up.phone as homeowner_phone", awarded)
        # The opportunity feed never exposes owner identity or documents. Only the
        # select list is checked; `mine.owner_user_id = auth.uid()` legitimately
        # matches the professional's own portfolio inside the invited_to_you flag.
        feed = self.sql.split("create view public.pro_work_package_opportunities")[1]
        selected = feed.split("from public.project_work_packages wp")[0]
        for leaked in ("p.owner_user_id", "up.phone", "up.email", "p.location as", "attachments_json,", "brief_json as"):
            self.assertNotIn(leaked, selected, leaked)
        self.assertIn("'Location shared after acceptance'", selected)
        self.assertIn("case when wp.show_budget_to_pros then wp.budget_hint_inr else null end", selected)

    def test_unanswered_questions_stay_private_and_answers_become_addenda(self):
        view = self.sql.split("create view public.work_package_questions_for_pros")[1].split("revoke all")[0]
        self.assertIn("q.answered_at is not null or public.work_package_portfolio_owned(q.portfolio_id)", view)
        self.assertIn("create or replace function public.answer_work_package_question(", self.sql)

    def test_publish_requires_a_priceable_scope(self):
        self.assertIn("create or replace function public.publish_work_package(", self.sql)
        self.assertIn("raise exception 'Give the work package a title'", self.sql)
        self.assertIn("raise exception 'Describe the scope: add scope items or a summary before publishing'", self.sql)
        self.assertIn("raise exception 'The bid due date has already passed. Choose a new due date.'", self.sql)

    # --------------------------------------------------------------- backend

    def test_scope_drafting_endpoint_is_metered_bounded_and_never_prices(self):
        self.assertIn('@api_router.post("/ai/work-package-scope", response_model=AIWorkPackageScopeResponse)', self.server)
        self.assertIn("_user: dict = Depends(_ai_request_slot)", self.server.split('"/ai/work-package-scope"')[1][:400])
        self.assertIn("_bounded_json_object(value, AI_BRIEF_MAX_BYTES, \"brief\")", self.server)
        self.assertIn("Do not include prices.", self.server)
        # Provider chain: Grok, then OpenAI, then a curated checklist (never a hard failure).
        self.assertIn("_grok_work_package_scope(payload) or _openai_work_package_scope(payload)", self.server)
        self.assertIn("return _checklist_work_package_scope(payload)", self.server)

    def test_frontend_client_posts_matching_payload_and_sanitizes_response(self):
        ai_api = (ROOT / "frontend/src/lib/aiApi.js").read_text()
        composer = (ROOT / "frontend/src/components/workPackages/WorkPackageComposer.jsx").read_text()
        self.assertIn('"/ai/work-package-scope"', ai_api)
        self.assertIn("{ package_type: packageType, flow, brief: brief || {}, title: title || null }", ai_api)
        self.assertIn(".slice(0, 30)", ai_api)
        self.assertIn('flow: flowType === "remodel" ? "remodel" : "new_home"', composer)

    # -------------------------------------------------------------- frontend

    def test_frontend_uses_rpcs_for_every_privileged_write(self):
        for rpc in (
            "publish_work_package",
            "set_work_package_status",
            "set_work_package_bid_decision",
            "answer_work_package_question",
            "mark_work_package_events_read",
        ):
            self.assertIn(f'.rpc("{rpc}"', self.api, rpc)
            self.assertIn(f"grant execute on function public.{rpc}(", self.sql, rpc)

    def test_pro_and_owner_surfaces_are_routed_and_reachable(self):
        app = (ROOT / "frontend/src/App.js").read_text()
        mobile = (ROOT / "frontend/src/mobile/MobileAppRoutes.jsx").read_text()
        dashboard = (ROOT / "frontend/src/pages/ProjectDashboard.jsx").read_text()
        mobile_project = (ROOT / "frontend/src/mobile/pages/MobileProjectPage.jsx").read_text()
        pro_dashboard = (ROOT / "frontend/src/pages/ProDashboard.jsx").read_text()
        pro_leads = (ROOT / "frontend/src/pages/ProLeadsPage.jsx").read_text()
        self.assertIn('path="/pro/rfqs"', app)
        self.assertIn('path="/pro/rfqs"', mobile)
        self.assertIn("<WorkPackagesHub", dashboard)
        self.assertIn("<WorkPackagesHub", mobile_project)
        self.assertIn("/pro/rfqs", pro_dashboard)
        self.assertIn('to="/pro/rfqs"', pro_leads)


if __name__ == "__main__":
    unittest.main()
