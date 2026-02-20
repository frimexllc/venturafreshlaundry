import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
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
import Layout from "./components/Layout";
// Public pages
import LandingPage from "./pages/LandingPage";
import ServicesPage from "./pages/ServicesPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import StorePage from "./pages/StorePage";
import BlogPage from "./pages/BlogPage";
import SchedulePickup from "./pages/SchedulePickup";
import MembershipPage from "./pages/MembershipPage";
import CustomerAccount from "./pages/CustomerAccount";
import CustomerLogin from "./pages/CustomerLogin";

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
  const token = localStorage.getItem('customer_token');
  if (!token) {
    return <Navigate to="/account/login" replace />;
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
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/store" element={<StorePage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:slug" element={<BlogPage />} />
      <Route path="/schedule-pickup" element={<SchedulePickup />} />
      <Route path="/membership" element={<MembershipPage />} />
      
      {/* Customer portal */}
      <Route path="/account/login" element={<CustomerLogin />} />
      <Route path="/account" element={<CustomerProtectedRoute><CustomerAccount /></CustomerProtectedRoute>} />
      
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
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="finances" element={<Finances />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
