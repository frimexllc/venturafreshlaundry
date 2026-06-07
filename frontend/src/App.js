import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LocaleProvider } from "./context/LocaleContext";
import { Toaster } from "./components/ui/sonner";
import ScrollToTop from "./components/ScrollToTop";

// Admin pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import Quotes from "./pages/Quotes";
import Leads from "./pages/Leads";
import Tickets from "./pages/Tickets";
import AuditLog from "./pages/AuditLog";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import AdminStore from "./pages/AdminStore";
import AdminBlog from "./pages/AdminBlog";
import AdminServices from "./pages/AdminServices";
import AdminMemberships from "./pages/AdminMemberships";
import AdminAi from "./pages/AdminAi";
import OperatorDashboard from "./pages/OperatorDashboard";
import UserManagement from "./pages/UserManagement";
import Finances from "./pages/Finances";
import AiMetrics from "./pages/AiMetrics";
import QuickApproval from "./pages/QuickApproval";
import Layout from "./components/Layout";

// Public pages
import LandingPage from "./pages/LandingPage";
import ServicesPage from "./pages/ServicesPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import StorePage from "./pages/StorePage";
import BlogPage from "./pages/BlogPage";
import SchedulePickup from "./pages/SchedulePickup";
import WashFoldRequest from "./pages/WashFoldRequest";
import MembershipPage from "./pages/MembershipPage";
import RequestQuotePage from "./pages/RequestQuotePage";
import CustomerAccount from "./pages/CustomerAccount";
import CustomerLogin from "./pages/CustomerLogin";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import SmsPolicyConsent from "./pages/SmsPolicyConsent";
import PwaSplashScreen from "./components/PwaSplashScreen";
import PublicVoiceAssistant from "./components/PublicVoiceAssistant";
import OperatorAgentPage from "./pages/OperatorAgentPage";
import LogisticsMapPage from "./pages/LogisticsMapPage";
import SuppliersPage from "./pages/SuppliersPage";
import CatalogPage from "./pages/CatalogPage";
import InventoryPage from "./pages/InventoryPage";
import FinancesFullPage from "./pages/FinancesFullPage";
import FAQPage from "./pages/FAQPage";
import KpiDashboardPage from "./pages/KpiDashboardPage";
import OcrAnalyticsPage from "./pages/OcrAnalyticsPage";
import StripeSyncPage from "./pages/StripeSyncPage";
import NotificationMetricsPage from "./pages/NotificationMetricsPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import CustomerPaymentPage from "./pages/CustomerPaymentPage";
import RefundForm from "./pages/RefundForm";
import SuggestionForm from "./pages/SuggestionForm";
// 🔥 NUEVA IMPORTACIÓN
import Survey from "./pages/Survey";

import axios from "axios";

// Pre-carga de rutas críticas
const preloadCriticalRoutes = () => {
  // Usar requestIdleCallback para no bloquear el render inicial
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      import("./pages/LandingPage");
      import("./pages/ServicesPage");
    });
  } else {
    setTimeout(() => {
      import("./pages/LandingPage");
      import("./pages/ServicesPage");
    }, 100);
  }
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Admin-only route protection
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/admin/operator" replace />;
  }

  return children;
};

const CustomerProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("customer_token");
  if (!token) {
    const currentPath = window.location.pathname;
    return <Navigate to={`/account/login?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public pages */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/home" element={<LandingPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/SuggestionForm" element={<SuggestionForm />} />
      <Route path="/RefundForm" element={<RefundForm />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/store" element={<StorePage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPage />} />
      <Route path="/schedule-pickup" element={<CustomerProtectedRoute><SchedulePickup /></CustomerProtectedRoute>} />
      <Route path="/wash-fold" element={<WashFoldRequest />} />
      <Route path="/membership" element={<CustomerProtectedRoute><MembershipPage /> </CustomerProtectedRoute>} />
      <Route path="/request-quote" element={<RequestQuotePage />} />
      <Route path="/commercial" element={<CustomerProtectedRoute><RequestQuotePage /></CustomerProtectedRoute>} />
      <Route path="/b2b" element={<CustomerProtectedRoute><RequestQuotePage /></CustomerProtectedRoute>} />
      <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/sms-policy-consent" element={<SmsPolicyConsent />} />
      <Route path="/faq" element={<FAQPage />} />
      <Route path="/payment-success" element={<PaymentSuccessPage />} />
      <Route path="/customer/pay/:orderId" element={<CustomerPaymentPage />} />
      {/* 🔥 NUEVA RUTA DE ENCUESTA (pública) */}
      <Route path="/survey" element={<Survey />} />

      {/* Customer portal */}
      <Route path="/account/login" element={<CustomerLogin />} />
      <Route
        path="/account"
        element={
          <CustomerProtectedRoute>
            <CustomerAccount />
          </CustomerProtectedRoute>
        }
      />

      {/* Admin */}
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="leads" element={<Leads />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="memberships" element={<AdminMemberships />} />
        <Route path="ai" element={<AdminAi />} />
        <Route path="store" element={<AdminStore />} />
        <Route path="blog" element={<AdminBlog />} />
        <Route path="operator" element={<OperatorDashboard />} />
        <Route path="operator/agent" element={<OperatorAgentPage />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="finances" element={<FinancesFullPage />} />
        <Route path="financesreport" element={<Finances />} />
        <Route path="ai-metrics" element={<AiMetrics />} />
        <Route path="quick-approval" element={<QuickApproval />} />
        <Route path="logistics/map" element={<LogisticsMapPage />} />
        <Route path="logistics-map" element={<LogisticsMapPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="kpis" element={<KpiDashboardPage />} />
        <Route path="ocr-analytics" element={<OcrAnalyticsPage />} />
        <Route path="stripe-sync" element={<StripeSyncPage />} />
        <Route path="notification-metrics" element={<NotificationMetricsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const [showPwaSplash, setShowPwaSplash] = useState(false);
  const [splashVariant, setSplashVariant] = useState(0);
  const splashInitializedRef = useRef(false);

  useEffect(() => {
    if (splashInitializedRef.current) return;

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true;
    const params = new URLSearchParams(window.location.search);
    const isPreviewMode = params.get("pwa_splash") === "1";

    if (!isStandalone && !isPreviewMode) {
      // Si no hay splash, precargar rutas críticas inmediatamente
      preloadCriticalRoutes();
      return;
    }

    splashInitializedRef.current = true;

    const storageKey = "vfl_pwa_splash_variant_index";
    const currentVariant = Number.parseInt(localStorage.getItem(storageKey) || "0", 10);
    const safeVariant = Number.isNaN(currentVariant) ? 0 : ((currentVariant % 3) + 3) % 3;

    setSplashVariant(safeVariant);
    setShowPwaSplash(true);
    localStorage.setItem(storageKey, String((safeVariant + 1) % 3));

    // ✅ REDUCIDO DE 3500ms A 1500ms - MÁS RÁPIDO
    const timer = window.setTimeout(() => {
      setShowPwaSplash(false);
      // Precargar rutas después del splash
      preloadCriticalRoutes();
    }, 1500);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <LocaleProvider>
      <AuthProvider>
        {showPwaSplash && (
          <PwaSplashScreen 
            variant={splashVariant} 
            duration={1500}
            onComplete={() => setShowPwaSplash(false)}
          />
        )}
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
          <PublicVoiceAssistant />
          <Toaster position="top-right" richColors visibleToasts={3} duration={3000} closeButton />
        </BrowserRouter>
      </AuthProvider>
    </LocaleProvider>
  );
}

export default App;