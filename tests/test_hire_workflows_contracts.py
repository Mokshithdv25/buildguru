"""Contract tests for hiring strategy (GC vs trade RFQs vs own team)."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "db/buildguru_hire_workflows.sql"


class HireWorkflowContractsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = SQL_PATH.read_text()
        cls.hire = (ROOT / "frontend/src/lib/hireMode.js").read_text()
        cls.flow_api = (ROOT / "frontend/src/lib/projectFlowApi.js").read_text()
        cls.catalog = (ROOT / "frontend/src/lib/workPackageCatalog.js").read_text()
        cls.wp_api = (ROOT / "frontend/src/lib/workPackagesApi.js").read_text()
        cls.readme = (ROOT / "db/README.md").read_text()
        cls.remodel = (ROOT / "frontend/src/pages/RemodelHome.jsx").read_text()
        cls.build = (ROOT / "frontend/src/pages/BuildNewHome.jsx").read_text()
        cls.dashboard = (ROOT / "frontend/src/pages/ProjectDashboard.jsx").read_text()
        cls.hub = (ROOT / "frontend/src/components/workPackages/WorkPackagesHub.jsx").read_text()
        cls.posting = (ROOT / "frontend/src/lib/projectPostingFlow.js").read_text()

    def test_migration_is_transactional_and_has_a_readiness_probe(self):
        body = self.sql.split("begin;", 1)[1]
        self.assertIn("\ncommit;", body)
        self.assertIn("create or replace function public.hire_workflows_ready()", self.sql)
        self.assertIn("grant execute on function public.hire_workflows_ready() to authenticated, service_role;", self.sql)

    def test_hire_mode_ids_match_sql_and_frontend(self):
        sql_modes = set(re.findall(r"in \('gc', 'trades', 'design_first', 'own_team'\)", self.sql))
        self.assertTrue(sql_modes)
        for mode in ("gc", "trades", "design_first", "own_team"):
            self.assertIn(f"  {mode}: {{", self.hire)
            self.assertIn(f"'{mode}'", self.sql)

    def test_whole_project_leads_require_gc_or_invite(self):
        self.assertIn("public.brief_hire_mode(pb.brief_json) = 'gc'", self.sql)
        self.assertIn("public.portfolio_is_invited(target_project_id, target_portfolio_id)", self.sql)
        # The opportunity feed must still omit owner identity.
        feed = self.sql.split("create or replace view public.pro_lead_opportunities")[1]
        selected = feed.split("from public.projects p")[0]
        for leaked in ("p.owner_user_id", "as location", "dream_vision", "brief_json as"):
            self.assertNotIn(leaked, selected, leaked)

    def test_own_team_does_not_open_the_marketplace(self):
        self.assertIn("marketplacePostsProject(hireMode) ? \"open_for_quotes\" : \"v0_ready\"", self.flow_api)
        self.assertIn("isOwnTeamHire(hireMode)", self.flow_api)
        self.assertIn("updateProjectHireMode", self.flow_api)

    def test_expired_packages_close_through_an_rpc(self):
        self.assertIn("create or replace function public.close_expired_work_packages(", self.sql)
        self.assertIn("set status = 'under_review'", self.sql)
        self.assertIn('.rpc("close_expired_work_packages"', self.wp_api)
        self.assertIn("closeExpiredWorkPackages(projectId)", self.hub)

    def test_wizards_collect_hire_mode_and_land_on_hire_tab(self):
        self.assertIn("<HireStrategyPicker", self.remodel)
        self.assertIn("<HireStrategyPicker", self.build)
        self.assertIn("hireMode", self.remodel)
        self.assertIn("hireMode", self.build)
        self.assertIn('params.set("tab", "Bids")', self.posting)

    def test_dashboard_hire_tab_is_strategy_aware(self):
        self.assertIn('label: "Hire"', self.dashboard)
        self.assertIn("onHireModeChange", self.dashboard)
        self.assertIn("postsWholeProjectLeads(hireMode)", self.dashboard)
        self.assertIn("updateProjectHireMode", self.dashboard)

    def test_suggested_packages_respect_hire_mode(self):
        self.assertIn('if (mode === "own_team") return [];', self.catalog)
        self.assertIn('if (mode === "design_first")', self.catalog)

    def test_readme_rollout_includes_hire_workflows(self):
        self.assertIn("buildguru_hire_workflows.sql", self.readme)
        self.assertIn("select public.hire_workflows_ready();", self.readme)


if __name__ == "__main__":
    unittest.main()
