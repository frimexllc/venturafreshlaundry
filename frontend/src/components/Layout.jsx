import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  FileText,
  UserPlus,
  HeadphonesIcon,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Droplets,
  CalendarDays,
  Settings,
  ExternalLink,
  Store,
  BookOpen,
  Zap,
  Layers,
  Star,
  Bot,
  Shield,
  DollarSign
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "./LanguageToggle";
import { Button } from "./ui/button";
import AdminFloatingChat from "./AdminFloatingChat";

// Navigation items with role restrictions - REORGANIZED
const allNavItems = [
  { path: "/admin", icon: LayoutDashboard, key: "dashboard", adminOnly: true },
  { path: "/admin/ai", icon: Bot, key: "ai_assistant", adminOnly: true },
  { path: "/admin/operator", icon: Zap, key: "operator_panel", highlight: true },
  { path: "/admin/calendar", icon: CalendarDays, key: "calendar", adminOnly: true },
  { path: "/admin/orders", icon: ShoppingBag, key: "orders", adminOnly: true },
  { path: "/admin/customers", icon: Users, key: "customers", adminOnly: true },
  { path: "/admin/memberships", icon: Star, key: "memberships", adminOnly: true },
  { path: "/admin/quotes", icon: FileText, key: "b2b_quotes", adminOnly: true },
  { path: "/admin/leads", icon: UserPlus, key: "leads", adminOnly: true },
  { path: "/admin/services", icon: Layers, key: "services", adminOnly: true },
  { path: "/admin/finances", icon: DollarSign, key: "finances", adminOnly: true },
  { path: "/admin/tickets", icon: HeadphonesIcon, key: "support" },
  { path: "/admin/store", icon: Store, key: "store", adminOnly: true },
  { path: "/admin/blog", icon: BookOpen, key: "blog", adminOnly: true },
  { path: "/admin/users", icon: Shield, key: "users", adminOnly: true },
  { path: "/admin/audit-log", icon: ClipboardList, key: "audit_log", adminOnly: true },
  { path: "/admin/settings", icon: Settings, key: "settings", adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useLocale();

  // Filter nav items based on user role
  const isAdmin = user?.role === "admin";
  const navItems = allNavItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.operatorOnly && isAdmin) return false;
    return true;
  });

  const navLabels = {
    dashboard: t("Dashboard", "Panel"),
    ai_assistant: t("AI Assistant", "Asistente IA"),
    operator_panel: t("Operator Panel", "Panel Operador"),
    calendar: t("Calendar", "Calendario"),
    orders: t("Orders", "Órdenes"),
    customers: t("Customers", "Clientes"),
    memberships: t("Memberships", "Membresías"),
    b2b_quotes: t("B2B Quotes", "Cotizaciones B2B"),
    leads: t("Leads", "Prospectos"),
    services: t("Services", "Servicios"),
    finances: t("Finances", "Finanzas"),
    support: t("Support", "Soporte"),
    store: t("Store", "Tienda"),
    blog: t("Blog", "Blog"),
    users: t("Users", "Usuarios"),
    audit_log: t("Audit Log", "Bitácora"),
    settings: t("Settings", "Configuración")
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Get role display name
  const getRoleDisplay = (role) => {
    return role === "admin" ? t("Administrator", "Administrador") : t("Operator", "Operador");
  };

  // Get role badge color
  const getRoleBadgeColor = (role) => {
    return role === "admin" 
      ? "bg-purple-100 text-purple-700" 
      : "bg-sky-100 text-sky-700";
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          data-testid="mobile-menu-btn"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2 ml-3">
          <Droplets className="h-6 w-6 text-sky-600" />
          <span className="font-semibold text-slate-900">VFL CRM</span>
        </div>
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-slate-100">
            <Droplets className="h-7 w-7 text-sky-600" />
            <div className="ml-3">
              <h1 className="font-bold text-slate-900 text-lg leading-tight">Ventura Fresh</h1>
              <p className="text-xs text-slate-500">Laundry CRM</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/admin"}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? "active" : ""}`
                    }
                    data-testid={`nav-${item.key}`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{navLabels[item.key]}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <a
                href="/home"
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-link text-sky-600"
              >
                <ExternalLink className="h-5 w-5" />
                <span>{t("View Landing Page", "Ver página principal")}</span>
              </a>
            </div>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-sky-100 flex items-center justify-center">
                <span className="text-sky-700 font-semibold text-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full mt-1 ${getRoleBadgeColor(user?.role)}`}>
                  <Shield className="h-3 w-3" />
                  {getRoleDisplay(user?.role)}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("Sign Out", "Cerrar sesión")}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
      {user?.role === "admin" && <AdminFloatingChat />}
    </div>
  );
}
