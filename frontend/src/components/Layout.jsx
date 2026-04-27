import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, Users, ShoppingBag, FileText, UserPlus,
  HeadphonesIcon, ClipboardList, LogOut, Menu, X, Droplets,
  CalendarDays, Settings, ExternalLink, Store, BookOpen, Zap,
  Layers, Star, Bot, Shield, DollarSign, BarChart3, ShieldCheck,
  MapPin, Package, Warehouse, Boxes, ShoppingCart, Building2,
  ScanLine, Bell, ArrowLeftRight, Search,
  // Tool icons
  Calculator, StickyNote, Timer, CheckSquare,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "./LanguageToggle";
import { Button } from "./ui/button";
import AdminFloatingChat from "./AdminFloatingChat";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Tools integration ────────────────────────────────────────────────
import { ToolsProvider, useTools, TOOLS } from "../context/ToolsContext";
import ToolsHub from "./ToolsHub";

const API = process.env.REACT_APP_BACKEND_URL;
const h = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// ── Navigation structure ─────────────────────────────────────────────
const navigationGroups = [
  {
    title: "TOOLS", emoji: "🛠️",
    items: [
      { key: "tool_calculator", icon: Calculator,    isTool: true, toolId: TOOLS.CALCULATOR },
      { key: "tool_notes",      icon: StickyNote,    isTool: true, toolId: TOOLS.NOTES      },
      { key: "tool_converter",  icon: ArrowLeftRight,isTool: true, toolId: TOOLS.CONVERTER  },
      { key: "tool_timer",      icon: Timer,         isTool: true, toolId: TOOLS.TIMER      },
      { key: "tool_calendar",   icon: CalendarDays,  isTool: true, toolId: TOOLS.CALENDAR   },
      { key: "tool_taskee",     icon: CheckSquare,   isTool: true, toolId: TOOLS.TASKEE     },
    ],
  },
  {
    title: "MAIN", emoji: "🏠",
    items: [
      { path: "/admin",          icon: LayoutDashboard, key: "dashboard",      adminOnly: true },
      { path: "/admin/ai",       icon: Bot,             key: "ai_assistant",   adminOnly: true },
      { path: "/admin/calendar", icon: CalendarDays,    key: "calendar",       adminOnly: true },
    ],
  },
  {
    title: "OPERATIONS", emoji: "⚙️",
    items: [
      { path: "/admin/orders",          icon: ShoppingBag, key: "orders",          adminOnly: true },
      { path: "/admin/operator",        icon: Zap,         key: "operator_panel",  highlight: true },
      { path: "/admin/operator/agent",  icon: Bot,         key: "operator_agent",  highlight: true },
      { path: "/admin/customers",       icon: Users,       key: "customers",        adminOnly: true },
      { path: "/admin/memberships",     icon: Star,        key: "memberships",      adminOnly: true },
    ],
  },
  {
    title: "LOGISTICS", emoji: "🚚",
    items: [
      { path: "/admin/logistics-map", icon: MapPin, key: "logistics_map", adminOnly: true },
    ],
  },
  {
    title: "SALES & GROWTH", emoji: "📦",
    items: [
      { path: "/admin/store",    icon: Store,    key: "store",      adminOnly: true },
      { path: "/admin/leads",    icon: UserPlus, key: "leads",      adminOnly: true },
      { path: "/admin/quotes",   icon: FileText, key: "b2b_quotes", adminOnly: true },
      { path: "/admin/services", icon: Layers,   key: "services",   adminOnly: true },
    ],
  },
  {
    title: "INVENTORY & SUPPLIERS", emoji: "🏭",
    items: [
      { path: "/admin/suppliers", icon: Building2, key: "suppliers", adminOnly: true },
      { path: "/admin/catalog",   icon: Boxes,     key: "catalog",   adminOnly: true },
      { path: "/admin/inventory", icon: Package,   key: "inventory", adminOnly: true },
    ],
  },
  {
    title: "FINANCES", emoji: "💰",
    items: [
      { path: "/admin/finances", icon: DollarSign, key: "finances", adminOnly: true },
    ],
  },
  {
    title: "ANALYTICS & KPIs", emoji: "📊",
    items: [
      { path: "/admin/kpis",                   icon: BarChart3,      key: "operational_kpis",      adminOnly: true },
      { path: "/admin/ai-metrics",             icon: BarChart3,      key: "ai_metrics",             adminOnly: true },
      { path: "/admin/ocr-analytics",          icon: ScanLine,       key: "ocr_analytics",          adminOnly: true },
      { path: "/admin/stripe-sync",            icon: ArrowLeftRight, key: "stripe_sync",            adminOnly: true },
      { path: "/admin/notification-metrics",   icon: Bell,           key: "notification_metrics",   adminOnly: true },
    ],
  },
  {
    title: "ACTIONS", emoji: "⚡",
    items: [
      { path: "/admin/quick-approval", icon: ShieldCheck,     key: "quick_approval", highlight: true },
      { path: "/admin/tickets",        icon: HeadphonesIcon,  key: "support" },
    ],
  },
  {
    title: "SYSTEM / ADMIN", emoji: "🧩",
    items: [
      { path: "/admin/users",     icon: Shield,      key: "users",     adminOnly: true },
      { path: "/admin/audit-log", icon: ClipboardList,key: "audit_log", adminOnly: true },
      { path: "/admin/settings",  icon: Settings,    key: "settings",  adminOnly: true },
      { path: "/admin/blog",      icon: BookOpen,    key: "blog",      adminOnly: true },
    ],
  },
];

// ── Label maps ────────────────────────────────────────────────────────
const navLabels = {};

// Tool labels
const toolLabelMap = {
  tool_calculator: ["Calculator",   "Calculadora"],
  tool_notes:      ["Quick Notes",  "Notas Rápidas"],
  tool_converter:  ["Converter",    "Conversor"],
  tool_timer:      ["Timer",        "Temporizador"],
  tool_calendar:   ["Mini Calendar","Agenda"],
  tool_taskee:     ["Taskee",       "Taskee"],
};

navigationGroups.flatMap(g => g.items).forEach(item => {
  if (item.isTool) {
    const [en, es] = toolLabelMap[item.key] || [item.key, item.key];
    navLabels[item.key] = { en, es };
    return;
  }
  const map = {
    dashboard:           ["Dashboard",        "Panel"],
    ai_assistant:        ["AI Assistant",     "Asistente IA"],
    operator_panel:      ["Operator Panel",   "Panel Operador"],
    operator_agent:      ["Operator Agent",   "Agente Operador"],
    calendar:            ["Calendar",         "Calendario"],
    orders:              ["Orders",           "Órdenes"],
    customers:           ["Customers",        "Clientes"],
    memberships:         ["Memberships",      "Membresías"],
    b2b_quotes:          ["B2B Quotes",       "Cotizaciones B2B"],
    leads:               ["Leads",            "Prospectos"],
    services:            ["Services",         "Servicios"],
    finances:            ["Finances",         "Finanzas"],
    ai_metrics:          ["AI Metrics",       "Métricas IA"],
    operational_kpis:    ["KPIs Dashboard",   "KPIs Operativos"],
    ocr_analytics:       ["OCR Analytics",    "Analytics OCR"],
    stripe_sync:         ["Stripe Sync",      "Sync Stripe"],
    notification_metrics:["Notifications",    "Notificaciones"],
    quick_approval:      ["Quick Approval",   "Aprobación Rápida"],
    support:             ["Support",          "Soporte"],
    store:               ["Store",            "Tienda"],
    blog:                ["Blog",             "Blog"],
    users:               ["Users",            "Usuarios"],
    audit_log:           ["Audit Log",        "Bitácora"],
    settings:            ["Settings",         "Configuración"],
    logistics_map:       ["Logistics Map",    "Mapa Logístico"],
    suppliers:           ["Suppliers",        "Proveedores"],
    catalog:             ["Catalog",          "Catálogo"],
    inventory:           ["Inventory",        "Inventario"],
  };
  const [en, es] = map[item.key] || [item.key, item.key];
  navLabels[item.key] = { en, es };
});

// ── Result type styles ────────────────────────────────────────────────
const RESULT_STYLES = {
  page:     { color: "text-blue-600",   bg: "bg-blue-50",   label: "Página" },
  product:  { color: "text-green-600",  bg: "bg-green-50",  label: "Catálogo" },
  stock:    { color: "text-amber-600",  bg: "bg-amber-50",  label: "Stock" },
  supplier: { color: "text-purple-600", bg: "bg-purple-50", label: "Proveedor" },
  order:    { color: "text-sky-600",    bg: "bg-sky-50",    label: "Orden" },
  customer: { color: "text-rose-600",   bg: "bg-rose-50",   label: "Cliente" },
};

// ── Global Search Bar ────────────────────────────────────────────────
function GlobalSearch({ onNavigate }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus]     = useState(0);
  const ref   = useRef(null);
  const input = useRef(null);

  const pageResults = navigationGroups
    .flatMap(g => g.items)
    .filter(item => !item.isTool)
    .map(item => ({
      type: "page",
      id: item.path,
      title: navLabels[item.key]?.es || item.key,
      subtitle: item.path,
      path: item.path,
      icon: item.icon,
    }));

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const q_lower = q.toLowerCase();
      const pages = pageResults
        .filter(p => p.title.toLowerCase().includes(q_lower) || p.path.toLowerCase().includes(q_lower))
        .slice(0, 3);

      const [catalogRes, stockRes, suppliersRes, ordersRes, customersRes] = await Promise.allSettled([
        fetch(`${API}/api/catalog`, { headers: h() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/api/inventory/stock`, { headers: h() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/api/suppliers?search=${encodeURIComponent(q)}`, { headers: h() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/api/orders?search=${encodeURIComponent(q)}&limit=5`, { headers: h() }).then(r => r.json()).catch(() => []),
        fetch(`${API}/api/customers?search=${encodeURIComponent(q)}&limit=5`, { headers: h() }).then(r => r.json()).catch(() => []),
      ]);

      const catalog   = catalogRes.status   === "fulfilled" ? (catalogRes.value   || []) : [];
      const stock     = stockRes.status     === "fulfilled" ? (stockRes.value     || []) : [];
      const suppliers = suppliersRes.status === "fulfilled" ? (suppliersRes.value || []) : [];
      const orders    = ordersRes.status    === "fulfilled"
        ? (Array.isArray(ordersRes.value) ? ordersRes.value : ordersRes.value?.orders || [])
        : [];
      const customers = customersRes.status === "fulfilled"
        ? (Array.isArray(customersRes.value) ? customersRes.value : customersRes.value?.customers || [])
        : [];

      const catalogHits  = catalog.filter(i => i.name?.toLowerCase().includes(q_lower) || (i.brand||"").toLowerCase().includes(q_lower)).slice(0,4).map(i => ({ type:"product",  id:i.id,           title:i.name,                       subtitle:`${i.brand||""}${i.category?" · "+i.category:""}`, path:"/admin/catalog" }));
      const stockHits    = stock.filter(i => i.name?.toLowerCase().includes(q_lower)).slice(0,3).map(i => ({ type:"stock",    id:i.id||i.name,   title:i.name,                       subtitle:`${i.quantity} unidades en stock`,               path:"/admin/inventory" }));
      const supplierHits = suppliers.slice(0,3).map(s => ({ type:"supplier", id:s.id,           title:s.name,                       subtitle:s.email||s.phone||s.category||"",               path:"/admin/suppliers" }));
      const orderHits    = orders.slice(0,3).map(o => ({ type:"order",    id:o.id,           title:o.order_number||o.id,         subtitle:o.customer_name||o.status||"",                  path:"/admin/orders" }));
      const customerHits = customers.slice(0,3).map(c => ({ type:"customer", id:c.id,           title:c.name||c.full_name||"",      subtitle:c.email||c.phone||"",                           path:"/admin/customers" }));

      setResults([...pages, ...catalogHits, ...stockHits, ...supplierHits, ...orderHits, ...customerHits]);
      setFocus(0);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!query) { setResults([]); setOpen(false); return; }
    setOpen(true);
    const t = setTimeout(() => search(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  const go = (path) => { onNavigate(path); setQuery(""); setResults([]); setOpen(false); };

  const handleKey = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus(f => Math.min(f+1, results.length-1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocus(f => Math.max(f-1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); if (results[focus]) go(results[focus].path); }
  };

  const grouped = results.reduce((acc, r) => { acc[r.type] = acc[r.type] || []; acc[r.type].push(r); return acc; }, {});
  const typeOrder = ["page","product","stock","supplier","order","customer"];
  const groupedEntries = typeOrder.filter(t => grouped[t]?.length > 0).map(t => [t, grouped[t]]);
  const flat = groupedEntries.flatMap(([,items]) => items);

  return (
    <div ref={ref} className="relative px-3 mb-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          ref={input}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Buscar… (Ctrl+K)"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-slate-100 border border-transparent focus:border-slate-300 focus:bg-white focus:outline-none transition-colors placeholder:text-slate-400"
        />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
        {query && !loading && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[100] overflow-hidden max-h-[70vh] overflow-y-auto">
          {results.length === 0 && !loading && query && (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados para "{query}"</div>
          )}
          {groupedEntries.map(([type, items]) => {
            const style = RESULT_STYLES[type] || RESULT_STYLES.page;
            return (
              <div key={type}>
                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${style.color} ${style.bg}`}>{style.label}</div>
                {items.map((result) => {
                  const flatIdx = flat.indexOf(result);
                  const isFocused = flatIdx === focus;
                  return (
                    <button key={result.id} onClick={() => go(result.path)} onMouseEnter={() => setFocus(flatIdx)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${isFocused ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isFocused ? style.color : "text-slate-800"}`}>{result.title}</p>
                        {result.subtitle && <p className="text-xs text-slate-400 truncate mt-0.5">{result.subtitle}</p>}
                      </div>
                      <span className="text-[10px] text-slate-300 flex-shrink-0 mt-0.5">{result.path}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {results.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-3 text-[10px] text-slate-400">
              <span>↑↓ navegar</span><span>↵ abrir</span><span>Esc cerrar</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool button (sidebar item that opens a modal) ─────────────────────
function ToolNavItem({ item, getLabel, onClose }) {
  const { openTool, activeTool } = useTools();
  const isActive = activeTool === item.toolId;
  return (
    <li>
      <button
        onClick={() => { openTool(item.toolId); onClose(); }}
        className={`sidebar-link w-full ${isActive ? "active" : ""}`}
        data-testid={`nav-${item.key}`}
      >
        <item.icon className="h-4 w-4" />
        <span>{getLabel(item.key)}</span>
        {isActive && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
        )}
      </button>
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════
function LayoutInner() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useLocale();

  const [openGroups, setOpenGroups] = useState(() => {
    const defaults = {};
    navigationGroups.forEach((group, idx) => {
      defaults[idx] = ["TOOLS","MAIN","OPERATIONS","LOGISTICS","INVENTORY & SUPPLIERS","FINANCES","ANALYTICS & KPIs"].includes(group.title);
    });
    return defaults;
  });

  const toggleGroup = (idx) => setOpenGroups(prev => ({ ...prev, [idx]: !prev[idx] }));

  const isAdmin = user?.role === "admin";

  const visibleGroups = navigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !(item.adminOnly && !isAdmin)),
    }))
    .filter(group => group.items.length > 0);

  const getLabel = (key) => {
    const labels = navLabels[key];
    if (!labels) return key;
    return t(labels.en, labels.es);
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const getRoleDisplay    = (role) => role === "admin" ? t("Administrator","Administrador") : t("Operator","Operador");
  const getRoleBadgeColor = (role) => role === "admin" ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700";

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-50 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="mobile-menu-btn">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2 ml-3">
          <Droplets className="h-6 w-6 text-sky-600" />
          <span className="font-semibold text-slate-900">VFL CRM</span>
        </div>
      </header>

      {sidebarOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-slate-100">
            <Droplets className="h-7 w-7 text-sky-600" />
            <div className="ml-3">
              <h1 className="font-bold text-slate-900 text-lg leading-tight">Ventura Fresh</h1>
              <p className="text-xs text-slate-500">Laundry CRM</p>
            </div>
          </div>

          {/* Global Search */}
          <div className="pt-3 pb-1">
            <GlobalSearch onNavigate={(path) => { navigate(path); setSidebarOpen(false); }} />
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2 px-3">
            {visibleGroups.map((group, idx) => (
              <div key={idx} className="mb-3">
                <button
                  onClick={() => toggleGroup(idx)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <span>{group.emoji}</span>
                    <span>{group.title}</span>
                  </div>
                  {openGroups[idx]
                    ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                </button>

                {openGroups[idx] && (
                  <ul className="mt-1 ml-2 space-y-0.5">
                    {group.items.map(item =>
                      item.isTool ? (
                        <ToolNavItem
                          key={item.key}
                          item={item}
                          getLabel={getLabel}
                          onClose={() => setSidebarOpen(false)}
                        />
                      ) : (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            end={item.path === "/admin"}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""} ${item.highlight ? "highlight" : ""}`}
                            data-testid={`nav-${item.key}`}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{getLabel(item.key)}</span>
                          </NavLink>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            ))}

            <div className="mt-3 pt-3 border-t border-slate-100">
              <a href="/home" target="_blank" rel="noopener noreferrer" className="sidebar-link text-sky-600">
                <ExternalLink className="h-4 w-4" />
                <span>{t("View Landing Page","Ver página principal")}</span>
              </a>
            </div>
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sky-700 font-semibold text-sm">{user?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full mt-1 ${getRoleBadgeColor(user?.role)}`}>
                  <Shield className="h-3 w-3" />
                  {getRoleDisplay(user?.role)}
                </span>
              </div>
            </div>
            <div className="mb-3"><LanguageToggle /></div>
            <Button
              variant="ghost"
              className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t("Sign Out","Cerrar sesión")}
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

      {/* ✅ All tool modals rendered here, above everything */}
      <ToolsHub />
    </div>
  );
}

// Wrap with ToolsProvider so useTools() works in LayoutInner + ToolsHub
export default function Layout() {
  return (
    <ToolsProvider>
      <LayoutInner />
    </ToolsProvider>
  );
}