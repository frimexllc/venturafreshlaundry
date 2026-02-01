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
  ExternalLink
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/customers", icon: Users, label: "Clientes" },
  { path: "/admin/orders", icon: ShoppingBag, label: "Órdenes" },
  { path: "/admin/calendar", icon: CalendarDays, label: "Calendario" },
  { path: "/admin/quotes", icon: FileText, label: "Cotizaciones B2B" },
  { path: "/admin/leads", icon: UserPlus, label: "Leads" },
  { path: "/admin/tickets", icon: HeadphonesIcon, label: "Soporte" },
  { path: "/admin/audit-log", icon: ClipboardList, label: "Audit Log" },
  { path: "/admin/settings", icon: Settings, label: "Configuración" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
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
                    end={item.path === "/"}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? "active" : ""}`
                    }
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
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
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
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
    </div>
  );
}
