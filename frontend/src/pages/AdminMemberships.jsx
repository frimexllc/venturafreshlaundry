/**
 * AdminMemberships.jsx
 * 
 * COMPLETO: 
 * - Ajustar libras por plan (lbs_allowance)
 * - Visualizar consumo con barra de progreso
 * - Filtrar clientes por estado (activo, pausado, cancelado)
 * - Cambiar estado del cliente
 * - AJUSTAR LIBRAS MANUALMENTE
 * - OVERRIDE DE ALLOWANCE
 * - VER HISTORIAL DE AJUSTES
 * - SINCRONIZAR ÓRDENES
 * - RESETEAR CICLO
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import adminAxios from "../api/adminClient"; 
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { 
  Plus, Edit2, Trash2, Search, X, 
  CreditCard, Users, UserX, TrendingUp,
  ChevronLeft, ChevronRight, Filter,
  CheckCircle, Clock, AlertCircle, Phone,
  Mail, Calendar, Tag, LayoutGrid, List,
  Download, RefreshCw, PauseCircle, UserCheck, UserMinus,
  Scale, History, Zap, Settings, AlertTriangle
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import { useAuth } from "../context/AuthContext";

// ── Plan vacío con lbs_allowance ──────────────────────────────────────────
const emptyPlan = {
  name: "",
  price: "",
  image_url: "",
  features: "",
  lbs_allowance: "",
  is_popular: false,
  is_active: true,
  sort_order: 0,
};

// StatusBadge
const StatusBadge = ({ status, type = "signup" }) => {
  const statusConfig = {
    signup: {
      new: { label: "Nuevo", color: "bg-blue-100 text-blue-700", icon: Clock },
      contacted: { label: "Contactado", color: "bg-yellow-100 text-yellow-700", icon: AlertCircle },
      converted: { label: "Convertido", color: "bg-green-100 text-green-700", icon: CheckCircle },
      cancelled: { label: "Cancelado", color: "bg-red-100 text-red-700", icon: X }
    },
    membership: {
      active: { label: "Activo", color: "bg-green-100 text-green-700", icon: UserCheck },
      paused: { label: "Pausado", color: "bg-yellow-100 text-yellow-700", icon: PauseCircle },
      cancelled: { label: "Cancelado", color: "bg-red-100 text-red-700", icon: UserMinus }
    }
  };
  
  const config = statusConfig[type][status] || statusConfig[type].new;
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
};

// Skeleton
const SkeletonRow = ({ cols }) => (
  <tr className="animate-pulse">
    <td colSpan={cols} className="px-4 py-3">
      <div className="flex items-center gap-4">
        {Array(cols).fill().map((_, i) => (
          <div key={i} className="h-4 bg-slate-200 rounded flex-1"></div>
        ))}
      </div>
    </td>
  </tr>
);

const SkeletonSettings = () => (
  <div className="space-y-4">
    <div className="h-10 bg-slate-200 rounded animate-pulse"></div>
    <div className="h-10 bg-slate-200 rounded animate-pulse"></div>
    <div className="h-20 bg-slate-200 rounded animate-pulse"></div>
    <div className="h-10 bg-slate-200 rounded animate-pulse"></div>
    <div className="h-10 bg-slate-200 rounded animate-pulse"></div>
  </div>
);

const MetricCard = ({ title, value, icon: Icon, trend, color }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-full ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
    </div>
  </div>
);

const SearchBar = ({ value, onChange, placeholder, onClear }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
    <Input
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="pl-9 pr-8"
    />
    {value && (
      <button
        onClick={onClear}
        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

const Pagination = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;
  
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
      <div className="text-sm text-slate-500">
        Página {page} de {totalPages}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-slate-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} className="bg-red-500 hover:bg-red-600">
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Barra de progreso
const CycleUsageBar = ({ usage }) => {
  if (!usage) return <span className="text-slate-400 text-xs">—</span>;
  
  const pctUsed = Math.min(usage.pct_used, 100);
  let barColor = "bg-emerald-500";
  if (usage.lbs_remaining === 0) barColor = "bg-red-500";
  else if (pctUsed >= 85) barColor = "bg-amber-500";
  
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" style={{ minWidth: 80 }}>
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pctUsed}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
          {usage.lbs_used}/{usage.lbs_allowance} lbs
        </span>
      </div>
      <span className="text-[10px] text-slate-400">
        {usage.lbs_remaining > 0 
          ? `${usage.lbs_remaining} lbs restantes`
          : "Límite alcanzado"}
      </span>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Modal para ajustar libras manualmente
// ──────────────────────────────────────────────────────────────────────────
function AdjustLbsModal({ isOpen, onClose, customer, onSuccess }) {
  const [lbsToAdd, setLbsToAdd] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customer?.id) return;
    
    const lbs = parseFloat(lbsToAdd);
    if (isNaN(lbs)) {
      toast.error("Ingrese un número válido");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingrese una razón para el ajuste");
      return;
    }

    setLoading(true);
    try {
      await adminAxios.post(`/memberships/customers/${customer.id}/adjust-lbs`, {
        lbs_to_add: lbs,
        reason: reason,
        notes: notes || null,
      });
      toast.success(`Ajuste de ${Math.abs(lbs)} lbs ${lbs >= 0 ? "agregadas" : "removidas"} correctamente`);
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error ajustando libras");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Ajustar libras - {customer?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Libras a ajustar</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                step="0.1"
                placeholder="Ej: 5 (agregar) o -3 (quitar)"
                value={lbsToAdd}
                onChange={(e) => setLbsToAdd(e.target.value)}
                required
                className="flex-1"
              />
              <span className="text-xs text-slate-400">lbs</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Positivo: añade consumo | Negativo: descuenta consumo
            </p>
          </div>
          <div>
            <Label>Razón del ajuste</Label>
            <Input
              placeholder="Ej: Error de pesaje, Crédito, Corrección manual"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Detalles adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Scale className="h-4 w-4 mr-1" />}
              Aplicar ajuste
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal para override de allowance
// ──────────────────────────────────────────────────────────────────────────
function OverrideAllowanceModal({ isOpen, onClose, customer, onSuccess }) {
  const [lbsAllowance, setLbsAllowance] = useState("");
  const [resetCycle, setResetCycle] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer?.cycle_usage?.lbs_allowance) {
      setLbsAllowance(String(customer.cycle_usage.lbs_allowance));
    }
  }, [customer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customer?.id) return;
    
    const allowance = parseInt(lbsAllowance, 10);
    if (isNaN(allowance) || allowance <= 0) {
      toast.error("Ingrese un allowance válido (mayor a 0)");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingrese una razón para el override");
      return;
    }

    setLoading(true);
    try {
      await adminAxios.post(`/memberships/customers/${customer.id}/override-allowance`, {
        lbs_allowance: allowance,
        reset_cycle: resetCycle,
        reason: reason,
      });
      toast.success(`Allowance sobrescrito a ${allowance} lbs/mes`);
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error sobrescribiendo allowance");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sobrescribir allowance - {customer?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Nuevo límite mensual</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Ej: 120"
                value={lbsAllowance}
                onChange={(e) => setLbsAllowance(e.target.value)}
                required
                className="flex-1"
              />
              <span className="text-xs text-slate-400">lbs/mes</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Este valor reemplazará el allowance del plan
            </p>
          </div>
          <div>
            <Label>Razón del override</Label>
            <Input
              placeholder="Ej: Cliente especial, Promoción, Corrección"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="resetCycle"
              checked={resetCycle}
              onChange={(e) => setResetCycle(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300"
            />
            <Label htmlFor="resetCycle" className="text-sm font-normal">
              Reiniciar ciclo actual (resetear libras usadas a 0)
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Settings className="h-4 w-4 mr-1" />}
              Aplicar override
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Modal para ver historial de ajustes
// ──────────────────────────────────────────────────────────────────────────
function AdjustmentLogModal({ isOpen, onClose, customer }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && customer?.id) {
      loadLogs();
    }
  }, [isOpen, customer]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await adminAxios.get(`/memberships/customers/${customer.id}/adjustment-log?limit=100`);
      setLogs(res.data.adjustments || []);
    } catch (error) {
      console.error("Error loading adjustment log:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de ajustes - {customer?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" />
              <p className="text-sm text-slate-400 mt-2">Cargando...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <History className="h-12 w-12 mx-auto opacity-30" />
              <p className="mt-2">No hay ajustes registrados</p>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={log.id || idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.adjustment > 0 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {log.adjustment > 0 ? '+' : ''}{log.adjustment} lbs
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      De {log.previous_lbs} lbs → {log.new_lbs} lbs
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-700 mt-2">
                  <span className="text-slate-400">Razón:</span> {log.reason}
                </p>
                {log.notes && (
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="text-slate-400">Notas:</span> {log.notes}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Operador: {log.operator_name || log.operator_id}
                </p>
                {log.exceeded && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
                    <AlertTriangle className="h-3 w-3" />
                    Excedió límite por {log.excess_lbs} lbs
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────
export default function AdminMemberships() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState("plans");
  const [section, setSection] = useState(null);
  const [plans, setPlans] = useState([]);
  const [signups, setSignups] = useState([]);
  const [membershipCustomers, setMembershipCustomers] = useState([]);
  
  const [loading, setLoading] = useState({ section: true, plans: true, signups: true, customers: true });
  
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const [savingSection, setSavingSection] = useState(false);
  
  // Nuevos estados para modales avanzados
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const [customerSearch, setCustomerSearch] = useState("");
  const [membershipStatusFilter, setMembershipStatusFilter] = useState("all");
  const [signupFilter, setSignupFilter] = useState("all");
  const [customerPage, setCustomerPage] = useState(1);
  const [signupPage, setSignupPage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  
  const itemsPerPage = 10;

  // Filtros
  const filteredSignups = useMemo(() => {
    let filtered = [...signups];
    if (signupFilter !== "all") {
      filtered = filtered.filter(s => s.status === signupFilter);
    }
    return filtered;
  }, [signups, signupFilter]);

  const filteredCustomers = useMemo(() => {
    let filtered = [...membershipCustomers];
    if (membershipStatusFilter !== "all") {
      filtered = filtered.filter(c => c.membership_status === membershipStatusFilter);
    }
    if (customerSearch) {
      const searchLower = customerSearch.toLowerCase();
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(searchLower) || 
        c.email?.toLowerCase().includes(searchLower)
      );
    }
    return filtered;
  }, [membershipCustomers, membershipStatusFilter, customerSearch]);

  const paginatedSignups = useMemo(() => {
    const start = (signupPage - 1) * itemsPerPage;
    return filteredSignups.slice(start, start + itemsPerPage);
  }, [filteredSignups, signupPage]);

  const paginatedPlans = useMemo(() => {
    const start = (planPage - 1) * itemsPerPage;
    return plans.slice(start, start + itemsPerPage);
  }, [plans, planPage]);

  const paginatedCustomers = useMemo(() => {
    const start = (customerPage - 1) * itemsPerPage;
    return filteredCustomers.slice(start, start + itemsPerPage);
  }, [filteredCustomers, customerPage]);

  const totalSignupPages = Math.ceil(filteredSignups.length / itemsPerPage);
  const totalPlanPages = Math.ceil(plans.length / itemsPerPage);
  const totalCustomerPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const metrics = {
    activePlans: plans.filter(p => p.is_active).length,
    pendingSignups: signups.filter(s => s.status === "new").length,
    activeMembers: membershipCustomers.filter(c => c.membership_status === "active").length,
    pausedMembers: membershipCustomers.filter(c => c.membership_status === "paused").length,
    cancelledMembers: membershipCustomers.filter(c => c.membership_status === "cancelled").length
  };

  const loadCustomers = useCallback(async (searchValue = "") => {
    if (!user?.id) {
      setLoading(prev => ({ ...prev, customers: false }));
      return;
    }

    setLoading(prev => ({ ...prev, customers: true }));
    try {
      const customersRes = await adminAxios.get("/memberships/customers", { 
        params: { 
          search: searchValue || undefined,
          status: membershipStatusFilter !== "all" ? membershipStatusFilter : undefined,
          user_id: user.id
        } 
      });
      setMembershipCustomers(customersRes.data);
      setCustomerPage(1);
    } catch (error) {
      console.error("Error en loadCustomers:", error.response?.data || error.message);
      toast.error(error.response?.data?.detail || "Error cargando clientes con membresía");
    } finally {
      setLoading(prev => ({ ...prev, customers: false }));
    }
  }, [user?.id, membershipStatusFilter]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    setLoading({ section: true, plans: true, signups: true, customers: true });
    try {
      const [sectionRes, plansRes, signupsRes] = await Promise.all([
        adminAxios.get("/memberships/section"),
        adminAxios.get("/memberships/plans", { params: { active_only: false } }),
        adminAxios.get("/memberships/signups")
      ]);
      setSection(sectionRes.data);
      setPlans(plansRes.data);
      setSignups(signupsRes.data);
      await loadCustomers(customerSearch);
    } catch (error) {
      toast.error("Error cargando membresías");
    } finally {
      setLoading({ section: false, plans: false, signups: false, customers: false });
    }
  }, [customerSearch, loadCustomers, user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, loadData, membershipStatusFilter]);

  const updateSectionField = (key, value) => {
    setSection((prev) => ({ ...prev, [key]: value }));
  };

  const saveSection = async () => {
    if (!user?.id) return;
    setSavingSection(true);
    try {
      await adminAxios.put("/memberships/section", {
        heading: section.heading,
        subheading: section.subheading || null,
        special_title: section.special_title || null,
        special_text: section.special_text || null,
        cta_title: section.cta_title || null,
        cta_text: section.cta_text || null,
        cta_button_label: section.cta_button_label || null,
        cta_button_url: section.cta_button_url || null,
        contact_phone: section.contact_phone || null,
        is_active: section.is_active
      });
      toast.success("Sección actualizada");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando sección");
    } finally {
      setSavingSection(false);
    }
  };

  const openPlanDialog = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name:          plan.name || "",
        price:         plan.price || "",
        image_url:     plan.image_url || "",
        features:      (plan.features || []).join("\n"),
        lbs_allowance: plan.lbs_allowance != null ? String(plan.lbs_allowance) : "",
        is_popular:    plan.is_popular,
        is_active:     plan.is_active,
        sort_order:    plan.sort_order ?? 0,
      });
    } else {
      setEditingPlan(null);
      setPlanForm(emptyPlan);
    }
    setPlanDialogOpen(true);
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    const lbsVal = parseInt(planForm.lbs_allowance, 10);
    if (!planForm.lbs_allowance || isNaN(lbsVal) || lbsVal <= 0) {
      toast.error("Monthly lbs allowance is required and must be greater than 0");
      return;
    }

    const payload = {
      name:          planForm.name,
      price:         planForm.price,
      image_url:     planForm.image_url || null,
      features:      planForm.features
                       .split("\n")
                       .map((item) => item.trim())
                       .filter(Boolean),
      lbs_allowance: lbsVal,
      is_popular:    planForm.is_popular,
      is_active:     planForm.is_active,
      sort_order:    planForm.sort_order === "" ? 0 : parseInt(planForm.sort_order, 10),
    };

    try {
      if (editingPlan) {
        await adminAxios.put(`/memberships/plans/${editingPlan.id}`, payload);
        toast.success("Plan actualizado");
      } else {
        await adminAxios.post("/memberships/plans", payload);
        toast.success("Plan creado");
      }
      setPlanDialogOpen(false);
      setEditingPlan(null);
      setPlanForm(emptyPlan);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error guardando plan");
    }
  };

  const deletePlan = async (id) => {
    if (!user?.id) return;
    setConfirmDialog({
      open: true,
      title: "Eliminar plan",
      message: "¿Estás seguro de que quieres eliminar este plan?",
      onConfirm: async () => {
        try {
          await adminAxios.delete(`/memberships/plans/${id}`);
          toast.success("Plan eliminado");
          loadData();
          setConfirmDialog({ open: false });
        } catch (error) {
          toast.error("Error eliminando plan");
        }
      }
    });
  };

  const updateSignupStatus = async (signupId, status) => {
    if (!user?.id) return;
    try {
      await adminAxios.put(`/memberships/signups/${signupId}`, { status });
      toast.success("Solicitud actualizada");
      loadData();
    } catch (error) {
      toast.error("Error actualizando solicitud");
    }
  };

  const convertSignup = async (signupId) => {
    if (!user?.id) return;
    setConfirmDialog({
      open: true,
      title: "Convertir solicitud",
      message: "¿Convertir esta solicitud en cliente?",
      onConfirm: async () => {
        try {
          await adminAxios.post(`/memberships/signups/${signupId}/convert`);
          toast.success("Cliente creado/actualizado");
          loadData();
          setConfirmDialog({ open: false });
        } catch (error) {
          toast.error(error.response?.data?.detail || "Error convirtiendo solicitud");
        }
      }
    });
  };

  const updateMembershipCustomer = async (customerId, payload) => {
    if (!user?.id) return;
    try {
      await adminAxios.put(`/memberships/customers/${customerId}`, payload);
      toast.success("Cliente actualizado");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando cliente");
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // NUEVAS FUNCIONES DE CONTROL
  // ──────────────────────────────────────────────────────────────────────────
  
  const handleResetCycle = async (customer) => {
    setConfirmDialog({
      open: true,
      title: "Resetear ciclo de membresía",
      message: `¿Estás seguro de que quieres resetear el ciclo de ${customer.name}? Se pondrán las libras usadas a 0.`,
      onConfirm: async () => {
        try {
          await adminAxios.post(`/memberships/customers/${customer.id}/reset-cycle`);
          toast.success("Ciclo reseteado correctamente");
          loadData();
          setConfirmDialog({ open: false });
        } catch (error) {
          toast.error(error.response?.data?.detail || "Error reseteando ciclo");
        }
      }
    });
  };

  const handleSyncOrders = async (customer) => {
    setConfirmDialog({
      open: true,
      title: "Sincronizar órdenes",
      message: `¿Recalcular consumo de ${customer.name} basado en órdenes entregadas?`,
      onConfirm: async () => {
        try {
          const res = await adminAxios.post(`/memberships/customers/${customer.id}/sync-orders`);
          toast.success(res.data.message || "Órdenes sincronizadas");
          loadData();
          setConfirmDialog({ open: false });
        } catch (error) {
          toast.error(error.response?.data?.detail || "Error sincronizando órdenes");
        }
      }
    });
  };

  const handleCustomerSearch = (e) => {
    const value = e.target.value;
    setCustomerSearch(value);
  };

  const clearCustomerSearch = () => {
    setCustomerSearch("");
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(customerSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [customerSearch, loadCustomers]);

  const tabs = [
    { id: "plans", label: "Planes", icon: LayoutGrid, count: plans.length },
    { id: "signups", label: "Solicitudes", icon: Users, count: signups.filter(s => s.status === "new").length },
    { id: "customers", label: "Clientes", icon: CreditCard, count: metrics.activeMembers },
    { id: "settings", label: "Configuración", icon: Filter, count: null }
  ];

  const statusFilters = [
    { value: "all", label: "Todos", icon: List },
    { value: "new", label: "Nuevos", icon: Clock },
    { value: "contacted", label: "Contactados", icon: Phone },
    { value: "converted", label: "Convertidos", icon: CheckCircle },
    { value: "cancelled", label: "Cancelados", icon: X }
  ];

  const membershipStatusFilters = [
    { value: "all", label: "Todos", icon: List, count: membershipCustomers.length },
    { value: "active", label: "Activos", icon: UserCheck, count: metrics.activeMembers },
    { value: "paused", label: "Pausados", icon: PauseCircle, count: metrics.pausedMembers },
    { value: "cancelled", label: "Cancelados", icon: UserMinus, count: metrics.cancelledMembers }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Membresías</h1>
              <p className="text-slate-600 text-sm mt-1">
                Gestiona planes, solicitudes y clientes con membresía
              </p>
            </div>
            {activeTab === "plans" && (
              <Button onClick={() => openPlanDialog()} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Plan
              </Button>
            )}
            {activeTab === "signups" && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar
                </Button>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Planes Activos" value={metrics.activePlans} icon={LayoutGrid} color="bg-blue-500" />
          <MetricCard title="Solicitudes Nuevas" value={metrics.pendingSignups} icon={Users} color="bg-yellow-500" />
          <MetricCard title="Miembros Activos" value={metrics.activeMembers} icon={UserCheck} color="bg-green-500" />
          <MetricCard title="Pausados" value={metrics.pausedMembers} icon={PauseCircle} color="bg-amber-500" />
          <MetricCard title="Cancelados" value={metrics.cancelledMembers} icon={UserMinus} color="bg-red-500" />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="border-b border-slate-200">
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all
                    ${isActive 
                      ? 'border-b-2 border-blue-500 text-blue-600' 
                      : 'text-slate-500 hover:text-slate-700 hover:border-b-2 hover:border-slate-300'}
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count !== null && tab.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Plans Tab - same as before */}
        {activeTab === "plans" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Libras/mes</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Popular</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Orden</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loading.plans ? (
                      Array(5).fill().map((_, i) => <SkeletonRow key={i} cols={7} />)
                    ) : paginatedPlans.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Tag className="h-12 w-12 text-slate-300" />
                            <p className="text-slate-500">No hay planes creados</p>
                            <Button variant="outline" onClick={() => openPlanDialog()} className="mt-2">
                              <Plus className="h-4 w-4 mr-2" /> Crear primer plan
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedPlans.map((plan) => (
                        <tr key={plan.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{plan.name}</p>
                              {plan.features && (
                                <p className="text-xs text-slate-400 mt-0.5">{plan.features.length} características</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-slate-900">{plan.price}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {plan.lbs_allowance || 0} lbs
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {plan.is_popular && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                ⭐ Popular
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {plan.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-500">{plan.sort_order ?? 0}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openPlanDialog(plan)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => deletePlan(plan.id)} className="hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={planPage} totalPages={totalPlanPages} onPageChange={setPlanPage} />
            </div>
          </div>
        )}

        {/* Signups Tab - same as before */}
        {activeTab === "signups" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map(filter => {
                const Icon = filter.icon;
                const isActive = signupFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    onClick={() => setSignupFilter(filter.value)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isActive ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Frecuencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Contacto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loading.signups ? (
                      Array(5).fill().map((_, i) => <SkeletonRow key={i} cols={6} />)
                    ) : paginatedSignups.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="h-12 w-12 text-slate-300" />
                            <p className="text-slate-500">No hay solicitudes</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedSignups.map((signup) => (
                        <tr key={signup.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{signup.first_name} {signup.last_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-400 flex items-center gap-1"><Mail className="h-3 w-3" />{signup.email}</span>
                                <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" />{signup.phone}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{signup.membership_plan}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-600">{signup.laundry_frequency}</div>
                            <div className="text-xs text-slate-400">{signup.estimated_lbs} lbs estimado</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm text-slate-600">{signup.email}</span>
                              <span className="text-xs text-slate-400">{signup.phone}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="h-8 rounded-md border border-slate-200 px-2 text-sm bg-white"
                              value={signup.status}
                              onChange={(e) => updateSignupStatus(signup.id, e.target.value)}
                            >
                              <option value="new">Nuevo</option>
                              <option value="contacted">Contactado</option>
                              <option value="converted">Convertido</option>
                              <option value="cancelled">Cancelado</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" onClick={() => convertSignup(signup.id)} disabled={signup.status === "converted"}
                              className="bg-green-600 hover:bg-green-700 disabled:opacity-50">
                              <CheckCircle className="h-4 w-4 mr-1" /> Convertir
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={signupPage} totalPages={totalSignupPages} onPageChange={setSignupPage} />
            </div>
          </div>
        )}

        {/* Customers Tab - CON ACCIONES AVANZADAS */}
        {activeTab === "customers" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <SearchBar
                value={customerSearch}
                onChange={handleCustomerSearch}
                onClear={clearCustomerSearch}
                placeholder="Buscar por nombre o email..."
              />
              <div className="flex gap-1 sm:ml-auto">
                {membershipStatusFilters.map(filter => {
                  const Icon = filter.icon;
                  const isActive = membershipStatusFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      onClick={() => {
                        setMembershipStatusFilter(filter.value);
                        setCustomerPage(1);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isActive ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {filter.label}
                      <span className={`text-xs ml-0.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>({filter.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fecha inicio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ciclo Actual</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loading.customers ? (
                      Array(5).fill().map((_, i) => <SkeletonRow key={i} cols={6} />)
                    ) : paginatedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <CreditCard className="h-12 w-12 text-slate-300" />
                            <p className="text-slate-500">No hay clientes con membresía</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((customer) => (
                        <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{customer.name || "—"}</p>
                              <p className="text-xs text-slate-400">{customer.email || "Sin email"}</p>
                              {customer.phone && (
                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />{customer.phone}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
                              value={customer.membership_plan || ""}
                              onChange={(e) => updateMembershipCustomer(customer.id, { membership_plan: e.target.value })}
                            >
                              <option value="">Sin plan</option>
                              {plans.filter(p => p.is_active).map((plan) => (
                                <option key={plan.id} value={plan.name}>{plan.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
                              value={customer.membership_status || ""}
                              onChange={(e) => updateMembershipCustomer(customer.id, { membership_status: e.target.value })}
                            >
                              <option value="">Sin estado</option>
                              <option value="active">Activo</option>
                              <option value="paused">Pausado</option>
                              <option value="cancelled">Cancelado</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {customer.membership_start_date ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(customer.membership_start_date).toLocaleDateString()}
                              </div>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <CycleUsageBar usage={customer.cycle_usage} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setAdjustModalOpen(true);
                                }}
                                title="Ajustar libras manualmente"
                              >
                                <Scale className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setOverrideModalOpen(true);
                                }}
                                title="Sobrescribir allowance"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                onClick={() => {
                                  setSelectedCustomer(customer);
                                  setLogModalOpen(true);
                                }}
                                title="Ver historial de ajustes"
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                onClick={() => handleSyncOrders(customer)}
                                title="Sincronizar órdenes"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700"
                                onClick={() => handleResetCycle(customer)}
                                title="Resetear ciclo"
                              >
                                <Zap className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={customerPage} totalPages={totalCustomerPages} onPageChange={setCustomerPage} />
            </div>
          </div>
        )}

        {/* Settings Tab - same as before */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {loading.section || !section ? (
              <SkeletonSettings />
            ) : (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900">Configuración de la sección de membresías</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Título principal</Label><Input value={section.heading || ""} onChange={(e) => updateSectionField("heading", e.target.value)} /></div>
                  <div><Label>Subtítulo</Label><Input value={section.subheading || ""} onChange={(e) => updateSectionField("subheading", e.target.value)} /></div>
                  <div><Label>Título especial</Label><Input value={section.special_title || ""} onChange={(e) => updateSectionField("special_title", e.target.value)} /></div>
                  <div><Label>Teléfono de contacto</Label><Input value={section.contact_phone || ""} onChange={(e) => updateSectionField("contact_phone", e.target.value)} /></div>
                  <div><Label>Texto botón CTA</Label><Input value={section.cta_button_label || ""} onChange={(e) => updateSectionField("cta_button_label", e.target.value)} /></div>
                  <div><Label>URL botón CTA</Label><Input value={section.cta_button_url || ""} onChange={(e) => updateSectionField("cta_button_url", e.target.value)} /></div>
                  <div><Label>Título de ayuda</Label><Input value={section.cta_title || ""} onChange={(e) => updateSectionField("cta_title", e.target.value)} /></div>
                  <div>
                    <Label>Estado</Label>
                    <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" value={section.is_active ? "active" : "inactive"} onChange={(e) => updateSectionField("is_active", e.target.value === "active")}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div><Label>Texto especial</Label><Textarea value={section.special_text || ""} onChange={(e) => updateSectionField("special_text", e.target.value)} rows={3} /></div>
                <div><Label>Texto de ayuda</Label><Textarea value={section.cta_text || ""} onChange={(e) => updateSectionField("cta_text", e.target.value)} rows={3} /></div>
                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={saveSection} disabled={savingSection} className="bg-blue-600 hover:bg-blue-700">
                    {savingSection ? "Guardando..." : "Guardar configuración"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingPlan ? "Editar plan" : "Nuevo plan"}</DialogTitle></DialogHeader>
          <form onSubmit={handlePlanSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div><Label>Nombre</Label><Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} required /></div>
              <div><Label>Precio</Label><Input value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} required /></div>
              <div>
                <Label>Libras mensuales incluidas <span className="text-red-500">*</span></Label>
                <div className="relative mt-1">
                  <Input type="number" min="1" max="9999" value={planForm.lbs_allowance} onChange={(e) => setPlanForm({ ...planForm, lbs_allowance: e.target.value })} required className="pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">lbs</span>
                </div>
              </div>
              <div><Label>URL de imagen</Label><Input value={planForm.image_url} onChange={(e) => setPlanForm({ ...planForm, image_url: e.target.value })} /></div>
              <div><Label>Orden</Label><Input type="number" value={planForm.sort_order} onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })} /></div>
              <div>
                <Label>Destacado</Label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" value={planForm.is_popular ? "yes" : "no"} onChange={(e) => setPlanForm({ ...planForm, is_popular: e.target.value === "yes" })}>
                  <option value="yes">Sí</option><option value="no">No</option>
                </select>
              </div>
              <div>
                <Label>Activo</Label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" value={planForm.is_active ? "active" : "inactive"} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.value === "active" })}>
                  <option value="active">Activo</option><option value="inactive">Inactivo</option>
                </select>
              </div>
            </div>
            <div><Label>Características (una por línea)</Label><Textarea value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} rows={6} /></div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">{editingPlan ? "Guardar cambios" : "Crear plan"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modales avanzados */}
      <AdjustLbsModal
        isOpen={adjustModalOpen}
        onClose={() => { setAdjustModalOpen(false); setSelectedCustomer(null); }}
        customer={selectedCustomer}
        onSuccess={loadData}
      />
      
      <OverrideAllowanceModal
        isOpen={overrideModalOpen}
        onClose={() => { setOverrideModalOpen(false); setSelectedCustomer(null); }}
        customer={selectedCustomer}
        onSuccess={loadData}
      />
      
      <AdjustmentLogModal
        isOpen={logModalOpen}
        onClose={() => { setLogModalOpen(false); setSelectedCustomer(null); }}
        customer={selectedCustomer}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />
    </div>
  );
}