import "@/App.css";
import "./mobile/mobile.css";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { getSupabase } from "./lib/supabaseClient";
import { fetchUserProfile } from "./lib/userProfileApi";
import { AUTH_UI_ENABLED } from "./lib/authMode";
import { clearHmSessionState, establishHmSession } from "./lib/hmAuth";
import { warmAiBackend } from "./lib/aiApi";
import { getOAuthRootRecoveryPath, readOAuthSignInIntent } from "./lib/authIntent";
import { LOCAL_OPS_UI_ENABLED } from "./lib/opsMode";
import { useMobileNative } from "./hooks/useMobileNative";
import { HmSessionProvider } from "./hooks/useHmSession";
import SignInErrorBoundary from "./components/SignInErrorBoundary";
import AppErrorBoundary from "./components/AppErrorBoundary";
import RouteFallback from "./components/RouteFallback";
import ProOnboardingGuard from "./components/ProOnboardingGuard";
import ProDashboardGuard from "./components/ProDashboardGuard";
import HomeownerFlowGuard from "./components/HomeownerFlowGuard";
import HomePage from "./pages/HomePage";
import SignInPage from "./pages/SignInPage";
import WhatAreYouBuilding from "./pages/WhatAreYouBuilding";
import BuildNewHome from "./pages/BuildNewHome";
import RemodelHome from "./pages/RemodelHome";
import DesignPage from "./pages/DesignPage";
import NotFoundPage from "./pages/NotFoundPage";

const MobileAppRoutes = lazy(() => import("./mobile/MobileAppRoutes"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const CraftSelection = lazy(() => import("./pages/CraftSelection"));
const YourDetails = lazy(() => import("./pages/YourDetails"));
const YourPortfolio = lazy(() => import("./pages/YourPortfolio"));
const GoLive = lazy(() => import("./pages/GoLive"));
const PortfolioThemeStep = lazy(() => import("./pages/PortfolioThemeStep"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
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
const ProWorkPackagesPage = lazy(() => import("./pages/ProWorkPackagesPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const CareersPage = lazy(() => import("./pages/CareersPage"));
const CareerProfilePage = lazy(() => import("./pages/CareerProfilePage"));
const ProfessionalIntakeAdminPage = lazy(() => import("./pages/ProfessionalIntakeAdminPage"));
const GuidesPage = lazy(() => import("./pages/GuidesPage"));

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
      <Route path="/design" element={<DesignPage />} />
      <Route
        path="/sign-in"
        element={AUTH_UI_ENABLED ? <SignInErrorBoundary><SignInPage portalMode="signin" /></SignInErrorBoundary> : <Navigate to="/" replace />}
      />
      <Route path="/join" element={AUTH_UI_ENABLED ? <SignInErrorBoundary><SignInPage portalRole="homeowner" portalMode="signup" /></SignInErrorBoundary> : <Navigate to="/" replace />} />
      <Route path="/pro/sign-in" element={AUTH_UI_ENABLED ? <SignInErrorBoundary><SignInPage portalRole="pro" portalMode="signin" /></SignInErrorBoundary> : <Navigate to="/" replace />} />
      <Route path="/pro/join" element={AUTH_UI_ENABLED ? <SignInErrorBoundary><SignInPage portalRole="pro" portalMode="signup" /></SignInErrorBoundary> : <Navigate to="/" replace />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/settings" element={<AccountPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/careers" element={<CareersPage />} />
      <Route path="/career-profile/:slug" element={<CareerProfilePage />} />
      <Route path="/guides" element={<GuidesPage />} />
      <Route path="/guides/:slug" element={<GuidesPage />} />
      <Route
        path="/ops/onboard-professional"
        element={LOCAL_OPS_UI_ENABLED ? <ProfessionalIntakeAdminPage /> : <Navigate to="/" replace />}
      />
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
      <Route
        path="/pro/rfqs"
        element={
          <ProDashboardGuard>
            <ProWorkPackagesPage />
          </ProDashboardGuard>
        }
      />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function AppRoutes() {
  const mobileNative = useMobileNative();
  return (
    <Suspense fallback={<RouteFallback />}>
      {mobileNative ? <MobileAppRoutes /> : <DesktopRoutes />}
    </Suspense>
  );
}

function AuthSessionSync() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!AUTH_UI_ENABLED) return undefined;
    const sb = getSupabase();
    if (!sb) return undefined;

    const recoverOauthIfNeeded = () => {
      const oauthIntent = readOAuthSignInIntent();
      const recoveryPath = getOAuthRootRecoveryPath(window.location.pathname, oauthIntent);
      if (!recoveryPath) return;
      const hash = window.location.hash || "";
      navigate(hash ? `${recoveryPath}${hash}` : recoveryPath, { replace: true });
    };

    const syncSession = async (session) => {
      if (!session?.user) return;
      const oauthIntent = readOAuthSignInIntent();
      let profile = null;
      try {
        profile = await fetchUserProfile(session.user.id);
      } catch (_) {
        /* table missing or RLS — still keep auth session */
      }
      await establishHmSession(session.user, profile, {
        signInIntent: oauthIntent?.role,
      });
      recoverOauthIfNeeded();
    };

    recoverOauthIfNeeded();

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) syncSession(session);
      // A missing session here is not a sign-out. Clearing the cache on first
      // getSession() races token restore and kicks signed-in homeowners off
      // /build/new-home onto a blank or login screen.
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (session) {
        syncSession(session);
        return;
      }
      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        clearHmSessionState();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}

function App() {
  useEffect(() => {
    warmAiBackend();
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        <HmSessionProvider>
          <AppErrorBoundary>
            <AuthSessionSync />
            <ScrollToTopOnRouteChange />
            <AppRoutes />
          </AppErrorBoundary>
        </HmSessionProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
