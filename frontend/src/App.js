import "@/App.css";
import "./mobile/mobile.css";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { getSupabase } from "./lib/supabaseClient";
import { fetchUserProfile } from "./lib/userProfileApi";
import { AUTH_UI_ENABLED } from "./lib/authMode";
import { clearHmSessionState, establishHmSession } from "./lib/hmAuth";
import { warmAiBackend } from "./lib/aiApi";
import { useMobileNative } from "./hooks/useMobileNative";
import SignInErrorBoundary from "./components/SignInErrorBoundary";
import ProOnboardingGuard from "./components/ProOnboardingGuard";
import ProDashboardGuard from "./components/ProDashboardGuard";
import HomeownerFlowGuard from "./components/HomeownerFlowGuard";

const MobileAppRoutes = lazy(() => import("./mobile/MobileAppRoutes"));
const HomePage = lazy(() => import("./pages/HomePage"));
const SignInPage = lazy(() => import("./pages/SignInPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const CraftSelection = lazy(() => import("./pages/CraftSelection"));
const YourDetails = lazy(() => import("./pages/YourDetails"));
const YourPortfolio = lazy(() => import("./pages/YourPortfolio"));
const GoLive = lazy(() => import("./pages/GoLive"));
const PortfolioThemeStep = lazy(() => import("./pages/PortfolioThemeStep"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const WhatAreYouBuilding = lazy(() => import("./pages/WhatAreYouBuilding"));
const BuildNewHome = lazy(() => import("./pages/BuildNewHome"));
const RemodelHome = lazy(() => import("./pages/RemodelHome"));
const ProjectDashboard = lazy(() => import("./pages/ProjectDashboard"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const DocumentVault = lazy(() => import("./pages/DocumentVault"));
const ProjectDesignJourney = lazy(() => import("./pages/ProjectDesignJourney"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const ProjectPayments = lazy(() => import("./pages/ProjectPayments"));
const StageDashboard = lazy(() => import("./pages/StageDashboard"));
const ProDashboard = lazy(() => import("./pages/ProDashboard"));
const ProLeadsPage = lazy(() => import("./pages/ProLeadsPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const CareersPage = lazy(() => import("./pages/CareersPage"));

function RouteLoading() {
  return <div className="hm-route-loading" role="status" aria-live="polite"><span />Loading HomeMakers…</div>;
}

function ScrollToTopOnRouteChange() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const scrollers = document.querySelectorAll("main, [data-scroll-root], .overflow-y-auto, .overflow-auto");
      scrollers.forEach((el) => {
        if (el && typeof el.scrollTo === "function") {
          el.scrollTo({ top: 0, left: 0, behavior: "auto" });
        } else if (el) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [pathname, search, hash]);

  return null;
}

function DesktopRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/sign-in"
        element={AUTH_UI_ENABLED ? <SignInErrorBoundary><SignInPage /></SignInErrorBoundary> : <Navigate to="/" replace />}
      />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/settings" element={<AccountPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/careers" element={<CareersPage />} />
      <Route
        path="/craft"
        element={
          <ProOnboardingGuard>
            <CraftSelection />
          </ProOnboardingGuard>
        }
      />
      <Route
        path="/details"
        element={
          <ProOnboardingGuard>
            <YourDetails />
          </ProOnboardingGuard>
        }
      />
      <Route
        path="/portfolio-theme"
        element={
          <ProOnboardingGuard>
            <PortfolioThemeStep />
          </ProOnboardingGuard>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProOnboardingGuard>
            <YourPortfolio />
          </ProOnboardingGuard>
        }
      />
      <Route
        path="/live"
        element={
          <ProOnboardingGuard>
            <GoLive />
          </ProOnboardingGuard>
        }
      />
      <Route path="/profile/:slug" element={<PortfolioPage />} />
      <Route path="/build" element={<WhatAreYouBuilding />} />
      <Route
        path="/build/new-home"
        element={
          <HomeownerFlowGuard>
            <BuildNewHome />
          </HomeownerFlowGuard>
        }
      />
      <Route
        path="/build/remodel"
        element={
          <HomeownerFlowGuard>
            <RemodelHome />
          </HomeownerFlowGuard>
        }
      />
      <Route path="/pro" element={<Navigate to="/pro/dashboard" replace />} />
      <Route
        path="/project"
        element={
          <SignInErrorBoundary>
            <HomeownerFlowGuard>
              <ProjectDashboard />
            </HomeownerFlowGuard>
          </SignInErrorBoundary>
        }
      />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/browse" element={<Marketplace />} />
      <Route path="/project/browse" element={<Marketplace />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/project/shop" element={<ShopPage />} />
      <Route
        path="/documents"
        element={
          <HomeownerFlowGuard>
            <DocumentVault />
          </HomeownerFlowGuard>
        }
      />
      <Route
        path="/project/journey"
        element={
          <HomeownerFlowGuard>
            <ProjectDesignJourney />
          </HomeownerFlowGuard>
        }
      />
      <Route path="/team" element={<HomeownerFlowGuard><TeamPage /></HomeownerFlowGuard>} />
      <Route path="/project/payments" element={<HomeownerFlowGuard><ProjectPayments /></HomeownerFlowGuard>} />
      <Route
        path="/stage"
        element={
          <HomeownerFlowGuard>
            <StageDashboard />
          </HomeownerFlowGuard>
        }
      />
      <Route
        path="/pro/dashboard"
        element={
          <ProDashboardGuard>
            <ProDashboard />
          </ProDashboardGuard>
        }
      />
      <Route
        path="/pro/leads"
        element={
          <ProDashboardGuard>
            <ProLeadsPage />
          </ProDashboardGuard>
        }
      />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppRoutes() {
  const mobileNative = useMobileNative();
  return (
    <Suspense fallback={<RouteLoading />}>
      {mobileNative ? <MobileAppRoutes /> : <DesktopRoutes />}
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    warmAiBackend();
  }, []);

  useEffect(() => {
    if (!AUTH_UI_ENABLED) return undefined;
    const sb = getSupabase();
    if (!sb) return undefined;

    const syncSession = async (session) => {
      if (!session?.user) return;
      let profile = null;
      try {
        profile = await fetchUserProfile(session.user.id);
      } catch (_) {
        /* table missing or RLS — still keep auth session */
      }
      await establishHmSession(session.user, profile);
    };

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) syncSession(session);
      else clearHmSessionState();
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (session) syncSession(session);
      else clearHmSessionState();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        <ScrollToTopOnRouteChange />
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}

export default App;
