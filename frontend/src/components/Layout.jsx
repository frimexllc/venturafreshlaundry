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
  DollarSign,
  BarChart3,
  ShieldCheck,
  MapPin,
  Truck,
  Route,
  Package,
  Warehouse,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Fuel,
  Camera,
  Building2,
  CreditCard,
  FolderTree,
  Car,
  PieChart,
  LineChart,
  Users2,
  FileBarChart,
  Clock,
  Bell,
  Key,
  Link,
  // Importar iconos adicionales según necesidad
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "./LanguageToggle";
import { Button } from "./ui/button";
import AdminFloatingChat from "./AdminFloatingChat";
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------- Navigation structure with groups (full tree) ----------
const navigationGroups = [
  {
    title: "MAIN",
    emoji: "🏠",
    items: [
      { path: "/admin", icon: LayoutDashboard, key: "dashboard", adminOnly: true },
      { path: "/admin/ai", icon: Bot, key: "ai_assistant", adminOnly: true },
      { path: "/admin/calendar", icon: CalendarDays, key: "calendar", adminOnly: true }
    ]
  },
  {
    title: "OPERATIONS",
    emoji: "⚙️",
    items: [
      { path: "/admin/orders", icon: ShoppingBag, key: "orders", adminOnly: true },
      { path: "/admin/operator", icon: Zap, key: "operator_panel", highlight: true },
      { path: "/admin/operator/agent", icon: Bot, key: "operator_agent", highlight: true },
      { path: "/admin/customers", icon: Users, key: "customers", adminOnly: true },
      { path: "/admin/memberships", icon: Star, key: "memberships", adminOnly: true }
    ]
  },
  {
    title: "LOGISTICS",
    emoji: "🚚",
    items: [
      // Placeholders for future routes (commented)
      // { path: "/admin/logistics/route", icon: Route, key: "route_optimization", adminOnly: true },
      // { path: "/admin/logistics/pickups", icon: Truck, key: "pickups_deliveries", adminOnly: true },
      // { path: "/admin/logistics/zones", icon: MapPin, key: "delivery_zones", adminOnly: true },
      // { path: "/admin/logistics/drivers", icon: Users, key: "drivers_staff", adminOnly: true },
      // Por ahora solo el mapa logístico
      { path: "/admin/logistics-map", icon: MapPin, key: "logistics_map", adminOnly: true }
    ]
  },
  {
    title: "SALES & GROWTH",
    emoji: "📦",
    items: [
      { path: "/admin/store", icon: Store, key: "store", adminOnly: true },
      { path: "/admin/leads", icon: UserPlus, key: "leads", adminOnly: true },
      { path: "/admin/quotes", icon: FileText, key: "b2b_quotes", adminOnly: true },
      // Membership Plans (CONTROL) - already in OPERATIONS, but can be here too? Avoid duplication.
      { path: "/admin/services", icon: Layers, key: "services", adminOnly: true }
    ]
  },
  {
    title: "INVENTORY & SUPPLIERS",
    emoji: "🏭",
    items: [
      // All placeholder
      // { path: "/admin/inventory/suppliers", icon: Building2, key: "suppliers", adminOnly: true },
      // { path: "/admin/inventory/products", icon: Boxes, key: "products", adminOnly: true },
      // { path: "/admin/inventory/tracking", icon: Package, key: "inventory_tracking", adminOnly: true },
      // { path: "/admin/inventory/purchase-orders", icon: ShoppingCart, key: "purchase_orders", adminOnly: true },
      // { path: "/admin/inventory/stock-movements", icon: Warehouse, key: "stock_movements", adminOnly: true }
    ]
  },
  {
    title: "FINANCES",
    emoji: "💰",
    items: [
      { path: "/admin/finances", icon: DollarSign, key: "finances", adminOnly: true },
      // Submenus would be handled by nested routes inside Finances page, not separate sidebar items
    ]
  },
  {
    title: "ANALYTICS & KPIs",
    emoji: "📊",
    items: [
      { path: "/admin/ai-metrics", icon: BarChart3, key: "ai_metrics", adminOnly: true },
      // Placeholders for other analytics
      // { path: "/admin/analytics/operational", icon: TrendingUp, key: "operational_kpis", adminOnly: true },
      // { path: "/admin/analytics/financial", icon: LineChart, key: "financial_kpis", adminOnly: true },
      // { path: "/admin/analytics/customers", icon: Users2, key: "customer_analytics", adminOnly: true },
      // { path: "/admin/analytics/reports", icon: FileBarChart, key: "reports", adminOnly: true }
    ]
  },
  {
    title: "ACTIONS",
    emoji: "⚡",
    items: [
      { path: "/admin/quick-approval", icon: ShieldCheck, key: "quick_approval", highlight: true },
      { path: "/admin/tickets", icon: HeadphonesIcon, key: "support" },
      // { path: "/admin/notifications", icon: Bell, key: "notifications", adminOnly: true }
    ]
  },
  {
    title: "SYSTEM / ADMIN",
    emoji: "🧩",
    items: [
      { path: "/admin/users", icon: Shield, key: "users", adminOnly: true },
      // { path: "/admin/roles", icon: Key, key: "roles_permissions", adminOnly: true },
      { path: "/admin/audit-log", icon: ClipboardList, key: "audit_log", adminOnly: true },
      { path: "/admin/settings", icon: Settings, key: "settings", adminOnly: true },
      // { path: "/admin/integrations", icon: Link, key: "integrations", adminOnly: true },
      { path: "/admin/blog", icon: BookOpen, key: "blog", adminOnly: true }
    ]
  }
];

// Flatten all items to generate labels map
const allItemsFlat = navigationGroups.flatMap(g => g.items);
const navLabels = allItemsFlat.reduce((acc, item) => {
  acc[item.key] = {
    en: item.key === "dashboard" ? "Dashboard" :
        item.key === "ai_assistant" ? "AI Assistant" :
        item.key === "operator_panel" ? "Operator Panel" :
        item.key === "operator_agent" ? "Operator Agent" :
        item.key === "calendar" ? "Calendar" :
        item.key === "orders" ? "Orders" :
        item.key === "customers" ? "Customers" :
        item.key === "memberships" ? "Memberships" :
        item.key === "b2b_quotes" ? "B2B Quotes" :
        item.key === "leads" ? "Leads" :
        item.key === "services" ? "Services" :
        item.key === "finances" ? "Finances" :
        item.key === "ai_metrics" ? "AI Metrics" :
        item.key === "quick_approval" ? "Quick Approval" :
        item.key === "support" ? "Support" :
        item.key === "store" ? "Store" :
        item.key === "blog" ? "Blog" :
        item.key === "users" ? "Users" :
        item.key === "audit_log" ? "Audit Log" :
        item.key === "settings" ? "Settings" :
        item.key === "logistics_map" ? "Logistics Map" :
        item.key,
    es: item.key === "dashboard" ? "Panel" :
        item.key === "ai_assistant" ? "Asistente IA" :
        item.key === "operator_panel" ? "Panel Operador" :
        item.key === "operator_agent" ? "Agente Operador" :
        item.key === "calendar" ? "Calendario" :
        item.key === "orders" ? "Órdenes" :
        item.key === "customers" ? "Clientes" :
        item.key === "memberships" ? "Membresías" :
        item.key === "b2b_quotes" ? "Cotizaciones B2B" :
        item.key === "leads" ? "Prospectos" :
        item.key === "services" ? "Servicios" :
        item.key === "finances" ? "Finanzas" :
        item.key === "ai_metrics" ? "Métricas IA" :
        item.key === "quick_approval" ? "Aprobación Rápida" :
        item.key === "support" ? "Soporte" :
        item.key === "store" ? "Tienda" :
        item.key === "blog" ? "Blog" :
        item.key === "users" ? "Usuarios" :
        item.key === "audit_log" ? "Bitácora" :
        item.key === "settings" ? "Configuración" :
        item.key === "logistics_map" ? "Mapa Logístico" :
        item.key
  };
  return acc;
}, {});

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useLocale();

  // Estado para controlar qué grupos están abiertos
  const [openGroups, setOpenGroups] = useState(() => {
    // Inicialmente abrir el grupo MAIN y quizás el grupo de la ruta activa
    const defaultOpen = {};
    navigationGroups.forEach((group, idx) => {
      // Por defecto abrir MAIN, OPERATIONS, LOGISTICS (los más comunes)
      if (group.title === "MAIN" || group.title === "OPERATIONS" || group.title === "LOGISTICS") {
        defaultOpen[idx] = true;
      } else {
        defaultOpen[idx] = false;
      }
    });
    return defaultOpen;
  });

  const toggleGroup = (idx) => {
    setOpenGroups(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isAdmin = user?.role === "admin";

  // Filter groups based on role visibility of items
  const visibleGroups = navigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        return true;
      })
    }))
    .filter(group => group.items.length > 0);

  const getLabel = (key) => {
    const labels = navLabels[key];
    if (!labels) return key;
    return t(labels.en, labels.es);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getRoleDisplay = (role) => {
    return role === "admin" ? t("Administrator", "Administrador") : t("Operator", "Operador");
  };

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

          {/* Navigation with collapsible groups */}
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {visibleGroups.map((group, idx) => (
              <div key={idx} className="mb-4">
                {/* Group header (clickable) */}
                <button
                  onClick={() => toggleGroup(idx)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 uppercase tracking-wider">
                    <span className="text-base">{group.emoji}</span>
                    <span>{group.title}</span>
                  </div>
                  {openGroups[idx] ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                {/* Group items (collapsible) */}
                {openGroups[idx] && (
                  <ul className="mt-2 ml-2 space-y-1">
                    {group.items.map((item) => (
                      <li key={item.path}>
                        <NavLink
                          to={item.path}
                          end={item.path === "/admin"}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) =>
                            `sidebar-link ${isActive ? "active" : ""} ${item.highlight ? "highlight" : ""}`
                          }
                          data-testid={`nav-${item.key}`}
                        >
                          <item.icon className="h-5 w-5" />
                          <span>{getLabel(item.key)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
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

          {/* User section (unchanged) */}
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
            <div className="mb-3">
              <LanguageToggle />
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