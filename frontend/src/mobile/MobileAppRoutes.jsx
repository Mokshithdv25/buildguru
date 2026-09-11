import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MobileShell from "./MobileShell";
import MobileWizardLayout from "./MobileWizardLayout";
import SignInErrorBoundary from "../components/SignInErrorBoundary";
import RouteFallback from "../components/RouteFallback";
import { AUTH_UI_ENABLED } from "../lib/authMode";
import HomeownerFlowGuard from "../components/HomeownerFlowGuard";
import ProOnboardingGuard from "../components/ProOnboardingGuard";
import ProDashboardGuard from "../components/ProDashboardGuard";
import MobileHomePage from "./pages/MobileHomePage";
import MobileBuildPage from "./pages/MobileBuildPage";
import SignInPage from "../pages/SignInPage";
import BuildNewHome from "../pages/BuildNewHome";
import RemodelHome from "../pages/RemodelHome";
import NotFoundPage from "../pages/NotFoundPage";

const MobileDesignPage = lazy(() => import("./pages/MobileDesignPage"));
const MobileProsPage = lazy(() => import("./pages/MobileProsPage"));
const MobileProjectPage = lazy(() => import("./pages/MobileProjectPage"));
const MobileAccountPage = lazy(() => import("./pages/MobileAccountPage"));
const MobilePhotoPage = lazy(() => import("./pages/MobilePhotoPage"));
const MobileDocumentsPage = lazy(() => import("./pages/MobileDocumentsPage"));
const MobileTeamPage = lazy(() => import("./pages/MobileTeamPage"));
const MobilePaymentsPage = lazy(() => import("./pages/MobilePaymentsPage"));
const MobileShopPage = lazy(() => import("./pages/MobileShopPage"));
const MobileDesignJourneyPage = lazy(() => import("./pages/MobileDesignJourneyPage"));
const MobileProProfilePage = lazy(() => import("./pages/MobileProProfilePage"));
const CraftSelection = lazy(() => import("../pages/CraftSelection"));
const YourDetails = lazy(() => import("../pages/YourDetails"));
const YourPortfolio = lazy(() => import("../pages/YourPortfolio"));
const PortfolioThemeStep = lazy(() => import("../pages/PortfolioThemeStep"));
const GoLive = lazy(() => import("../pages/GoLive"));
const ProDashboard = lazy(() => import("../pages/ProDashboard"));
const ProLeadsPage = lazy(() => import("../pages/ProLeadsPage"));
const ProWorkPackagesPage = lazy(() => import("../pages/ProWorkPackagesPage"));
const SubscriptionsPage = lazy(() => import("../pages/SubscriptionsPage"));
const PricingPage = lazy(() => import("../pages/PricingPage"));
const AccountPage = lazy(() => import("../pages/AccountPage"));
const LegalPage = lazy(() => import("../pages/LegalPage"));
const CareersPage = lazy(() => import("../pages/CareersPage"));
const CareerProfilePage = lazy(() => import("../pages/CareerProfilePage"));

function MobileRouteLoading() {
  return <RouteFallback label="Loading…" />;
}

function withShell(Page) {
  return (
    <MobileShell>
      <Suspense fallback={<MobileRouteLoading />}><Page /></Suspense>
    </MobileShell>
  );
}

export default function MobileAppRoutes() {
  return (
    <Suspense fallback={<MobileRouteLoading />}><Routes>
      <Route path="/" element={withShell(MobileHomePage)} />
      <Route path="/design" element={withShell(MobileDesignPage)} />
      <Route path="/ideas" element={<Navigate to="/design" replace />} />
      <Route path="/build" element={withShell(MobileBuildPage)} />
      <Route
        path="/build/new-home"
        element={
          <HomeownerFlowGuard>
            <MobileWizardLayout title="New home" subtitle="Brief → AI designs → your project">
              <BuildNewHome />
            </MobileWizardLayout>
          </HomeownerFlowGuard>
        }
      />
      <Route
        path="/build/remodel"
        element={
          <HomeownerFlowGuard>
            <MobileWizardLayout title="Remodel" subtitle="Room photos → AI concepts & costs">
              <RemodelHome />
            </MobileWizardLayout>
          </HomeownerFlowGuard>
        }
      />
      <Route path="/photo/:id" element={withShell(MobilePhotoPage)} />
      <Route path="/browse" element={withShell(MobileProsPage)} />
      <Route path="/marketplace" element={<Navigate to="/browse" replace />} />
      <Route path="/project/browse" element={withShell(MobileProsPage)} />
      <Route path="/project" element={<HomeownerFlowGuard>{withShell(MobileProjectPage)}</HomeownerFlowGuard>} />
      <Route path="/account" element={withShell(MobileAccountPage)} />
      <Route
        path="/account/settings"
        element={
          <MobileShell hideTabs>
            <AccountPage />
          </MobileShell>
        }
      />
      <Route path="/subscriptions" element={withShell(SubscriptionsPage)} />
      <Route path="/pricing" element={withShell(PricingPage)} />
      <Route
        path="/sign-in"
        element={
          AUTH_UI_ENABLED ? (
            <MobileShell hideTabs>
              <SignInErrorBoundary>
                <SignInPage portalMode="signin" />
              </SignInErrorBoundary>
            </MobileShell>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="/join" element={AUTH_UI_ENABLED ? <MobileShell hideTabs><SignInErrorBoundary><SignInPage portalRole="homeowner" portalMode="signup" /></SignInErrorBoundary></MobileShell> : <Navigate to="/" replace />} />
      <Route path="/pro/sign-in" element={AUTH_UI_ENABLED ? <MobileShell hideTabs><SignInErrorBoundary><SignInPage portalRole="pro" portalMode="signin" /></SignInErrorBoundary></MobileShell> : <Navigate to="/" replace />} />
      <Route path="/pro/join" element={AUTH_UI_ENABLED ? <MobileShell hideTabs><SignInErrorBoundary><SignInPage portalRole="pro" portalMode="signup" /></SignInErrorBoundary></MobileShell> : <Navigate to="/" replace />} />
      <Route path="/shop" element={withShell(MobileShopPage)} />
      <Route path="/project/shop" element={withShell(MobileShopPage)} />
      <Route path="/documents" element={<HomeownerFlowGuard>{withShell(MobileDocumentsPage)}</HomeownerFlowGuard>} />
      <Route path="/team" element={<HomeownerFlowGuard>{withShell(MobileTeamPage)}</HomeownerFlowGuard>} />
      <Route path="/project/payments" element={<HomeownerFlowGuard>{withShell(MobilePaymentsPage)}</HomeownerFlowGuard>} />
      <Route path="/project/journey" element={<HomeownerFlowGuard>{withShell(MobileDesignJourneyPage)}</HomeownerFlowGuard>} />
      <Route path="/profile/:slug" element={withShell(MobileProProfilePage)} />
      <Route path="/craft" element={<ProOnboardingGuard><MobileWizardLayout title="Your craft" subtitle="Pro portfolio onboarding" backTo="/account"><CraftSelection /></MobileWizardLayout></ProOnboardingGuard>} />
      <Route path="/details" element={<ProOnboardingGuard><MobileWizardLayout title="Your details" subtitle="Business & contact" backTo="/craft"><YourDetails /></MobileWizardLayout></ProOnboardingGuard>} />
      <Route path="/portfolio-theme" element={<ProOnboardingGuard><MobileWizardLayout title="Look & feel" subtitle="Theme & layout" backTo="/details"><PortfolioThemeStep /></MobileWizardLayout></ProOnboardingGuard>} />
      <Route path="/portfolio" element={<ProOnboardingGuard><MobileWizardLayout title="Portfolio" subtitle="Photos & specialties" backTo="/portfolio-theme"><YourPortfolio /></MobileWizardLayout></ProOnboardingGuard>} />
      <Route path="/live" element={<ProOnboardingGuard><MobileWizardLayout title="Go live" subtitle="Publish to marketplace" backTo="/portfolio"><GoLive /></MobileWizardLayout></ProOnboardingGuard>} />
      <Route path="/pro" element={<ProDashboardGuard>{withShell(ProDashboard)}</ProDashboardGuard>} />
      <Route path="/pro/dashboard" element={<ProDashboardGuard>{withShell(ProDashboard)}</ProDashboardGuard>} />
      <Route path="/pro/leads" element={<ProDashboardGuard>{withShell(ProLeadsPage)}</ProDashboardGuard>} />
      <Route path="/pro/rfqs" element={<ProDashboardGuard>{withShell(ProWorkPackagesPage)}</ProDashboardGuard>} />
      <Route path="/terms" element={<MobileShell hideTabs><LegalPage kind="terms" /></MobileShell>} />
      <Route path="/privacy" element={<MobileShell hideTabs><LegalPage kind="privacy" /></MobileShell>} />
      <Route path="/careers" element={<MobileShell hideTabs><CareersPage /></MobileShell>} />
      <Route path="/career-profile/:slug" element={<MobileShell hideTabs><CareerProfilePage /></MobileShell>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Suspense>
  );
}
