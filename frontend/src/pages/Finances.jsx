// src/pages/Finances.jsx — Rediseñado CON OCR y attachments (FULL RESPONSIVE)
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, TrendingDown, Zap, Award, Plus, Search, Edit,
  Trash2, Eye, X, AlertTriangle, RefreshCw, Download, GripVertical,
  ChevronLeft, ChevronRight, AlertCircle, Filter, FileSpreadsheet,
  Camera, Paperclip, ArrowUpRight, ArrowDownRight, BarChart3, Settings2,
  ChevronDown, Circle, Layers, Car, Gauge, Image as ImageIcon, Check
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const getAuth = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const token = () => localStorage.getItem("token");

const fmtCurrency = (val) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(val || 0);
const fmtNumber = (n) => new Intl.NumberFormat("es-MX").format(n || 0);
const fmtShortDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" });
};
const getDaysBetweenDates = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
};
const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => {
  const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
};

const defaultSummary = {
  total_revenue: 0, order_revenue: 0, membership_revenue: 0, store_revenue: 0,
  machine_revenue: 0, total_expenses: 0, net_income: 0, avg_order_value: 0,
  total_orders: 0, paid_orders: 0, pending_orders: 0, total_miles: 0,
  by_category: {}, machines: [],
};

// ─── Lightbox Component ─────────────────────────────────────────────────────
const Lightbox = ({ images, initialIndex = 0, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose, images.length]);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "#030712", display: "flex", flexDirection: "column"
      }}
      onClick={onClose}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", background: "rgba(255,255,255,.03)",
        borderBottom: "1px solid rgba(255,255,255,.06)"
      }}>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: 12 }}>
          {idx + 1} / {images.length}
        </span>
        <button onClick={onClose} style={{
          width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.06)", cursor: "pointer", color: "rgba(255,255,255,.7)"
        }}>
          <X size={14} />
        </button>
      </div>
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden"
      }}>
        {images.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }}
            disabled={idx === 0}
            style={{
              position: "absolute", left: 16, width: 40, height: 40, borderRadius: 10,
              border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
              cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.25 : 1,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <img
          key={idx}
          src={images[idx]}
          alt=""
          style={{ maxWidth: "calc(100% - 120px)", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
        />
        {images.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(i => Math.min(images.length - 1, i + 1)); }}
            disabled={idx === images.length - 1}
            style={{
              position: "absolute", right: 16, width: 40, height: 40, borderRadius: 10,
              border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
              cursor: idx === images.length - 1 ? "default" : "pointer", opacity: idx === images.length - 1 ? 0.25 : 1,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {images.length > 1 && (
        <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "14px 20px", flexWrap: "wrap" }}>
          {images.map((src, i) => (
            <button
              key={i} onClick={() => setIdx(i)}
              style={{
                width: 44, height: 44, borderRadius: 8, overflow: "hidden", padding: 0,
                cursor: "pointer", border: i === idx ? "2px solid #fff" : "2px solid rgba(255,255,255,.12)",
                opacity: i === idx ? 1 : 0.45
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};

// ─── Portal Modal ───────────────────────────────────────────────────────────
const PortalModal = ({ open, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-container">
        {children}
      </div>
    </div>,
    document.body
  );
};

const ModalHeader = ({ title, onClose }) => (
  <div className="modal-header">
    <h2>{title}</h2>
    <button onClick={onClose}><X size={15} /></button>
  </div>
);

const Field = ({ label, children }) => (
  <div className="form-field">
    <label>{label}</label>
    {children}
  </div>
);

// ─── KPI Card ───────────────────────────────────────────────────────────────
const KPICard = ({ label, value, sub, icon: Icon, color, delta, index, onDragStart, onDragEnter, onDragEnd }) => {
  const colors = {
    emerald: { bg: "#ecfdf5", icon: "#10b981", text: "#065f46", border: "#a7f3d0" },
    red:     { bg: "#fef2f2", icon: "#ef4444", text: "#991b1b", border: "#fecaca" },
    sky:     { bg: "#f0f9ff", icon: "#0ea5e9", text: "#0c4a6e", border: "#bae6fd" },
    amber:   { bg: "#fffbeb", icon: "#f59e0b", text: "#78350f", border: "#fde68a" },
    violet:  { bg: "#f5f3ff", icon: "#8b5cf6", text: "#4c1d95", border: "#ddd6fe" },
  };
  const c = colors[color] || colors.sky;
  const isPositive = delta >= 0;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="finance-kpi-card"
    >
      <div className="kpi-top-bar" style={{ background: `linear-gradient(90deg, ${c.icon}, ${c.icon}88)` }} />
      <div className="kpi-header">
        <div className="kpi-icon" style={{ background: c.bg, borderColor: c.border }}>
          <Icon size={17} color={c.icon} />
        </div>
        {delta !== undefined && (
          <span className={`kpi-delta ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  );
};

// ─── Badge ───────────────────────────────────────────────────────────────────
const Badge = ({ type }) => {
  const cfg = {
    fixed:        { bg: "#fef2f2", text: "#dc2626", label: "Fijo" },
    variable:     { bg: "#eff6ff", text: "#2563eb", label: "Variable" },
    subscription: { bg: "#f5f3ff", text: "#7c3aed", label: "Suscripción" },
  };
  const c = cfg[type] || cfg.variable;
  return (
    <span className="badge" style={{ background: c.bg, color: c.text }}>{c.label}</span>
  );
};

const StatusBadge = ({ status }) => {
  const isPaid = (status || "").toLowerCase() === "paid";
  return (
    <span className={`status-badge ${isPaid ? 'paid' : 'pending'}`}>
      {isPaid ? "Pagado" : "Pendiente"}
    </span>
  );
};

// ─── Tab Bar ─────────────────────────────────────────────────────────────────
const tabs = [
  { key: "dashboard",    label: "Resumen",       icon: BarChart3 },
  { key: "expenses",     label: "Gastos",        icon: TrendingDown },
  { key: "machines",     label: "Máquinas",      icon: Zap },
  { key: "mileage",      label: "Millaje",       icon: Car },
  { key: "transactions", label: "Transacciones", icon: Layers },
];

// ─── Main component ──────────────────────────────────────────────────────────
export default function Finances() {
  const { t } = useLocale();
  const [activeTab, setActiveTab]   = useState("dashboard");
  const [period, setPeriod]         = useState("month");
  const [dateRange, setDateRange]   = useState({ start: monthStart(), end: today() });
  const [summary, setSummary]       = useState(defaultSummary);
  const [loading, setLoading]       = useState(true);

  const [expenses, setExpenses]             = useState([]);
  const [categories, setCategories]         = useState([]);
  const [expenseFilters, setExpenseFilters] = useState({ search: "", type: "all" });
  const [expenseSort, setExpenseSort]       = useState({ key: "date", dir: "desc" });
  const [expensePage, setExpensePage]       = useState(1);
  const [expensePageSize, setExpensePageSize] = useState(25);
  const [selectedExpenses, setSelectedExpenses] = useState(new Set());

  const [machines, setMachines]                     = useState([]);
  const [machineIncomeRecords, setMachineIncomeRecords] = useState([]);
  const [machineIncomeForm, setMachineIncomeForm]   = useState({ machine_id: "", date: today(), amount: "" });
  const [editingMachine, setEditingMachine]         = useState(null);
  const [maintenanceAlerts, setMaintenanceAlerts]   = useState([]);
  const [machineFilterStart, setMachineFilterStart] = useState(monthStart());
  const [machineFilterEnd, setMachineFilterEnd]     = useState(today());
  const [bulkIncomeForm, setBulkIncomeForm]         = useState({ start_date: monthStart(), end_date: today(), amount: "" });
  const [showBulkModal, setShowBulkModal]           = useState(false);

  const [mileage, setMileage]     = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [mileageForm, setMileageForm] = useState({ date: today(), vehicle_id: "", driver_name: "", start_odometer: "", end_odometer: "", purpose: "" });

  const [transactions, setTransactions] = useState([]);
  const [txFilters, setTxFilters] = useState({ status: "all", type: "all", search: "" });
  const [txPage, setTxPage]       = useState(1);
  const [txPageSize]              = useState(25);

  // ─── Attachment / OCR states ──────────────────────────────────────────────
  const [modal, setModal]             = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailExpense, setDetailExpense] = useState(null);
  const [detailFiles, setDetailFiles] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const cameraRef = useRef(null);
  const fileRef   = useRef(null);
  const attachmentsRef = useRef([]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  const dragStat = useRef(null); const dragStatOv = useRef(null);
  const [statOrder, setStatOrder] = useState([0, 1, 2, 3, 4]);

  // ─── Data fetching ──────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/finances/dashboard`, { params: { period }, headers: getAuth() });
      setSummary({ ...defaultSummary, ...res.data });
    } catch { setSummary(defaultSummary); } finally { setLoading(false); }
  }, [period]);

  const fetchExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (expenseFilters.search) params.append("search", expenseFilters.search);
      if (expenseFilters.type !== "all") params.append("expense_type", expenseFilters.type);
      const res = await axios.get(`${API}/api/finances/expenses?${params}`, { headers: getAuth() });
      setExpenses(res.data);
    } catch { toast.error("Error cargando gastos"); }
  }, [expenseFilters]);

  const fetchCategories = useCallback(async () => {
    try { const r = await axios.get(`${API}/api/finances/categories`, { headers: getAuth() }); setCategories(r.data); } catch {}
  }, []);

  const fetchMachines = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/api/finances/machines`, { headers: getAuth() });
      setMachines(r.data); checkMaintenanceAlerts(r.data);
    } catch {}
  }, []);

  const fetchMachineIncome = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/api/finances/machine-income`, { params: { start_date: dateRange.start, end_date: dateRange.end }, headers: getAuth() });
      setMachineIncomeRecords(r.data);
    } catch {}
  }, [dateRange]);

  const fetchMileage   = useCallback(async () => { try { const r = await axios.get(`${API}/api/finances/mileage`, { headers: getAuth() }); setMileage(r.data); } catch {} }, []);
  const fetchVehicles  = useCallback(async () => { try { const r = await axios.get(`${API}/api/finances/vehicles`, { headers: getAuth() }); setVehicles(r.data); } catch {} }, []);
  
  const fetchTransactions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const response = await fetch(`${API}/api/store/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTransactions(Array.isArray(data) ? data : []);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("Error loading transactions:", err);
      setTransactions([]);
    }
  }, []);

  // ─── File helpers ─────────────────────────────────────────────────────────
  const loadExistingFiles = async (expenseId) => {
    try {
      const r = await fetch(`${API}/api/files/by-context/expense/${expenseId}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setExistingFiles(await r.json());
    } catch { setExistingFiles([]); }
  };

  const linkFiles = async (expenseId) => {
    for (const a of attachmentsRef.current) {
      if (a.uploaded && a.uploadedId) {
        try {
          await fetch(`${API}/api/files/${a.uploadedId}/context?context=expense:${expenseId}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token()}` }
          });
        } catch (err) { console.error("Error linking file:", err); }
      }
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const base = attachmentsRef.current.length;
    
    setAttachments(prev => [...prev, ...files.map(f => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      uploading: true,
      uploaded: false,
      uploadedId: null,
    }))]);
    
    e.target.value = "";
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const idx = base + i;
      const fd = new FormData();
      fd.append("file", file);
      
      try {
        const r = await fetch(`${API}/api/files/upload?context=ocr-temp`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` },
          body: fd,
        });
        
        if (r.ok) {
          const d = await r.json();
          setAttachments(prev => {
            const u = [...prev];
            if (u[idx]) u[idx] = { ...u[idx], uploading: false, uploaded: true, uploadedId: d.id };
            return u;
          });
          
          if (file.type.startsWith("image/") && modal === "expense") {
            setOcrLoading(true);
            try {
              const ocrRes = await fetch(`${API}/api/files/ocr/${d.id}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token()}` }
              });
              if (ocrRes.ok) {
                const ocrData = await ocrRes.json();
                setEditingItem(prev => ({
                  ...prev,
                  ...(ocrData.amount && { amount: String(ocrData.amount) }),
                  ...(ocrData.description && { description: ocrData.description }),
                  ...(ocrData.date && { date: ocrData.date }),
                  ...(ocrData.vendor && { vendor: ocrData.vendor })
                }));
                toast.success("Recibo escaneado correctamente");
              }
            } catch (ocrErr) { console.error("OCR error:", ocrErr); }
            finally { setOcrLoading(false); }
          }
        } else {
          setAttachments(prev => {
            const u = [...prev];
            if (u[idx]) u[idx] = { ...u[idx], uploading: false, error: true };
            return u;
          });
          toast.error(`Error subiendo ${file.name}`);
        }
      } catch (err) {
        setAttachments(prev => {
          const u = [...prev];
          if (u[idx]) u[idx] = { ...u[idx], uploading: false, error: true };
          return u;
        });
        toast.error(`Error de red al subir ${file.name}`);
      }
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const u = [...prev];
      if (u[index]?.preview) URL.revokeObjectURL(u[index].preview);
      u.splice(index, 1);
      return u;
    });
  };

  const removeExistingFile = async (fileId) => {
    try {
      await fetch(`${API}/api/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` }
      });
      setExistingFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success("Archivo eliminado");
    } catch {
      toast.error("Error al eliminar archivo");
    }
  };

  // ─── CRUD Operations with file linking ────────────────────────────────────
  const saveExpense = async () => {
    if (!editingItem?.description || !editingItem?.amount) {
      toast.error("Descripción y monto requeridos");
      return;
    }
    const method = editingItem.id ? "PUT" : "POST";
    const url = editingItem.id ? `${API}/api/finances/expenses/${editingItem.id}` : `${API}/api/finances/expenses`;
    
    try {
      const r = await axios({
        method,
        url,
        data: { ...editingItem, amount: parseFloat(editingItem.amount) },
        headers: getAuth()
      });
      
      if (r.status === 200 || r.status === 201) {
        const savedId = editingItem.id || r.data.id;
        
        if (attachmentsRef.current.some(a => a.uploaded)) {
          await linkFiles(savedId);
        }
        
        toast.success(editingItem.id ? "Gasto actualizado" : "Gasto creado");
        setModal(null);
        setEditingItem(null);
        setAttachments([]);
        setExistingFiles([]);
        fetchExpenses();
        fetchSummary();
      }
    } catch (err) {
      console.error("Save expense error:", err);
      toast.error("Error al guardar");
    }
  };

  const openExpenseForm = (expense = null) => {
    if (expense) {
      setEditingItem(expense);
      loadExistingFiles(expense.id);
    } else {
      setEditingItem({
        date: today(),
        expense_type: "variable",
        description: "",
        amount: "",
        category: "",
        vendor: "",
        payment_method: "card",
        notes: ""
      });
      setAttachments([]);
      setExistingFiles([]);
    }
    setModal("expense");
  };

  const openDetail = async (expense) => {
    setDetailExpense(expense);
    try {
      const r = await fetch(`${API}/api/files/by-context/expense/${expense.id}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (r.ok) setDetailFiles(await r.json());
      else setDetailFiles([]);
    } catch { setDetailFiles([]); }
    setModal("detail");
  };

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchExpenses(); fetchCategories(); }, [fetchExpenses, fetchCategories]);
  useEffect(() => { fetchMachines(); fetchMachineIncome(); }, [fetchMachines, fetchMachineIncome]);
  useEffect(() => { fetchMileage(); fetchVehicles(); }, [fetchMileage, fetchVehicles]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const refreshAll = () => {
    fetchSummary(); fetchExpenses(); fetchMachines(); fetchMachineIncome();
    fetchMileage(); fetchVehicles(); fetchTransactions();
    toast.success("Datos actualizados");
  };

  // ─── Machines logic ───────────────────────────────────────────────────────
  const checkMaintenanceAlerts = (list) => {
    const a = list.filter(m => {
      const rem = (m.maintenance_threshold || 500) - (m.total_cycles || 0);
      return rem <= 50;
    });
    setMaintenanceAlerts(a);
  };

  const computeCycles = (totalIncome, price) => (!price || price <= 0) ? 0 : Math.floor(totalIncome / price);

  const updateMachineCycles = async (id) => {
    const machine = machines.find(m => m.id === id);
    if (!machine) return;
    try {
      const r = await axios.get(`${API}/api/finances/machine-income?machine_id=${id}`, { headers: getAuth() });
      const total = r.data.reduce((sum, inc) => sum + inc.amount, 0);
      const cycles = computeCycles(total, machine.cycle_price || 2);
      await axios.put(`${API}/api/finances/machines/${id}`, {
        name: machine.name,
        cycle_price: machine.cycle_price,
        maintenance_threshold: machine.maintenance_threshold,
        total_cycles: cycles,
        total_income: total
      }, { headers: getAuth() });
      fetchMachines();
    } catch (err) {
      console.error("Error updating machine cycles:", err);
      toast.error("Error al actualizar ciclos");
    }
  };

  const updateAllMachinesCycles = async () => {
    toast.info("Actualizando ciclos de todas las máquinas...");
    for (const machine of machines) {
      await updateMachineCycles(machine.id);
    }
    fetchMachines();
    toast.success("Ciclos actualizados correctamente");
  };

  const addMachineIncome = async () => {
    if (!machineIncomeForm.machine_id || !machineIncomeForm.amount || machineIncomeForm.amount <= 0) {
      toast.error("Selecciona máquina y monto válido");
      return;
    }
    try {
      await axios.post(`${API}/api/finances/machine-income`, {
        machine_id: machineIncomeForm.machine_id,
        date: machineIncomeForm.date || today(),
        amount: parseFloat(machineIncomeForm.amount)
      }, { headers: getAuth() });
      toast.success("Ingreso registrado");
      const machineId = machineIncomeForm.machine_id;
      setMachineIncomeForm({ machine_id: "", date: today(), amount: "" });
      await updateMachineCycles(machineId);
      fetchMachineIncome();
      fetchMachines();
      fetchSummary();
    } catch {
      toast.error("Error al registrar ingreso");
    }
  };

  const addBulkIncome = async () => {
    if (!bulkIncomeForm.amount || bulkIncomeForm.amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!bulkIncomeForm.start_date || !bulkIncomeForm.end_date) {
      toast.error("Selecciona un rango de fechas");
      return;
    }
    try {
      await axios.post(`${API}/api/finances/machine-income/bulk-range`, {
        start_date: bulkIncomeForm.start_date,
        end_date: bulkIncomeForm.end_date,
        amount: parseFloat(bulkIncomeForm.amount)
      }, { headers: getAuth() });
      toast.success(`Ingreso masivo registrado para el período`);
      setBulkIncomeForm({ start_date: monthStart(), end_date: today(), amount: "" });
      setShowBulkModal(false);
      fetchMachineIncome();
      fetchMachines();
      fetchSummary();
      await updateAllMachinesCycles();
    } catch (err) {
      console.error("Bulk income error:", err);
      toast.error("Error en ingreso masivo");
    }
  };

  const createMachine = async (data) => {
    try {
      await axios.post(`${API}/api/finances/machines`, data, { headers: getAuth() });
      toast.success("Máquina creada");
      fetchMachines();
    } catch {
      toast.error("Error al crear máquina");
    }
  };

  const updateMachine = async (id, data) => {
    try {
      await axios.put(`${API}/api/finances/machines/${id}`, data, { headers: getAuth() });
      toast.success("Actualizado");
      fetchMachines();
    } catch {
      toast.error("Error al actualizar máquina");
    }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────
  const kpis = [
    { key: "rev",     label: "Ingresos totales",   icon: DollarSign,   color: "emerald", value: fmtCurrency(summary.total_revenue),    sub: "Suma de todas las fuentes" },
    { key: "exp",     label: "Gastos",              icon: TrendingDown, color: "red",     value: fmtCurrency(summary.total_expenses),   sub: "Operativos + administrativos" },
    { key: "net",     label: "Utilidad neta",       icon: TrendingUp,   color: "sky",     value: fmtCurrency(summary.net_income),       sub: summary.net_income >= 0 ? "Ganancia" : "Pérdida" },
    { key: "mach",    label: "Ingresos máquinas",   icon: Zap,          color: "amber",   value: fmtCurrency(summary.machine_revenue || 0), sub: "Registro manual" },
    { key: "ticket",  label: "Ticket promedio",     icon: Award,        color: "violet",  value: fmtCurrency(summary.avg_order_value),  sub: `${summary.total_orders} órdenes` },
  ];

  const filteredExpenses = expenses.filter(e => {
    if (expenseFilters.search && !e.description?.toLowerCase().includes(expenseFilters.search.toLowerCase()) && !(e.vendor || "").toLowerCase().includes(expenseFilters.search.toLowerCase())) return false;
    if (expenseFilters.type !== "all" && e.expense_type !== expenseFilters.type) return false;
    return true;
  });
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    let va = a[expenseSort.key], vb = b[expenseSort.key];
    if (expenseSort.key === "amount") { va = Number(va); vb = Number(vb); }
    if (va < vb) return expenseSort.dir === "asc" ? -1 : 1;
    if (va > vb) return expenseSort.dir === "asc" ? 1 : -1;
    return 0;
  });
  const expenseTotalPages = Math.ceil(sortedExpenses.length / expensePageSize);
  const paginatedExpenses = sortedExpenses.slice((expensePage - 1) * expensePageSize, expensePage * expensePageSize);

  const filteredTx = transactions.filter(tx => {
    if (txFilters.status !== "all") {
      const s = (tx.payment_status || "").toLowerCase();
      if (txFilters.status === "paid" && s !== "paid") return false;
      if (txFilters.status === "pending" && s === "paid") return false;
    }
    if (txFilters.type !== "all" && (tx.payment_type || "service") !== txFilters.type) return false;
    if (txFilters.search) {
      const q = txFilters.search.toLowerCase();
      return (tx.order_number || "").toLowerCase().includes(q) || (tx.customer_name || "").toLowerCase().includes(q);
    }
    return true;
  });
  const txTotalPages = Math.ceil(filteredTx.length / txPageSize);
  const paginatedTx = filteredTx.slice((txPage - 1) * txPageSize, txPage * txPageSize);

  const onStatDragStart = (i) => { dragStat.current = i; };
  const onStatDragEnter = (i) => { dragStatOv.current = i; };
  const onStatDragEnd = () => {
    if (dragStat.current !== null && dragStatOv.current !== null && dragStat.current !== dragStatOv.current) {
      const n = [...statOrder];
      const [m] = n.splice(dragStat.current, 1);
      n.splice(dragStatOv.current, 0, m);
      setStatOrder(n);
    }
    dragStat.current = dragStatOv.current = null;
  };

  const exportCSV = (rows, cols, filename) => {
    const csv = [cols, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = filename; a.click();
  };

  // ─── Styles (inline base + responsive classes) ─────────────────────────────
  const inputStyle = {
    height: 38, borderRadius: 10, border: "1.5px solid #e2e8f0",
    padding: "0 12px", fontSize: 14, outline: "none", width: "100%",
    background: "#fff", color: "#0f172a"
  };
  const textareaStyle = {
    ...inputStyle, height: "auto", padding: "8px 12px", resize: "vertical"
  };
  const btnPrimary = {
    background: "#0f172a", color: "#fff", borderRadius: 10, border: "none",
    padding: "0 18px", height: 38, fontSize: 14, fontWeight: 600,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6
  };
  const btnOutline = {
    background: "#fff", color: "#475569", borderRadius: 10, border: "1.5px solid #e2e8f0",
    padding: "0 14px", height: 36, fontSize: 13, fontWeight: 500,
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6
  };
  const btnGhost = {
    background: "transparent", color: "#64748b", borderRadius: 8, border: "none",
    padding: "0 8px", height: 30, fontSize: 13, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 4
  };
  const card = {
    background: "#fff", borderRadius: 16, border: "1.5px solid #f1f5f9", overflow: "hidden"
  };
  const thStyle = {
    padding: "10px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#94a3b8", textAlign: "left",
    borderBottom: "1.5px solid #f1f5f9", background: "#fafafa", whiteSpace: "nowrap"
  };
  const tdStyle = { padding: "12px 16px", fontSize: 13, color: "#334155", verticalAlign: "middle" };

  return (
    <div className="finances-page">
      <style>{`
        /* ----- ESTILOS GLOBALES Y RESPONSIVE ----- */
        .finances-page {
          min-height: 100vh;
          background: #f8fafc;
          font-family: system-ui, -apple-system, sans-serif;
        }

        .finances-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 28px 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* KPI Cards */
        .finance-kpi-card {
          background: #fff;
          border-radius: 16px;
          border: 1.5px solid #f1f5f9;
          padding: 20px;
          cursor: grab;
          transition: box-shadow 0.2s, transform 0.2s;
          position: relative;
          overflow: hidden;
        }
        .finance-kpi-card:hover {
          box-shadow: 0 8px 30px rgba(0,0,0,0.08);
          transform: translateY(-2px);
        }
        .kpi-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .kpi-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .kpi-icon { width: 38px; height: 38px; border-radius: 10px; border: 1px solid; display: flex; align-items: center; justify-content: center; }
        .kpi-delta { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 2px; padding: 3px 8px; border-radius: 20px; }
        .kpi-delta.positive { background: #ecfdf5; color: #10b981; }
        .kpi-delta.negative { background: #fef2f2; color: #ef4444; }
        .kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 0 0 4px; }
        .kpi-value { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; }
        .kpi-sub { font-size: 12px; color: #94a3b8; margin: 4px 0 0; }

        /* KPIs grid responsive */
        .kpis-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
        }

        /* Tab bar */
        .finance-tab-btn {
          border: none;
          cursor: pointer;
          transition: all 0.15s;
          flex: 1;
          padding: 9px 12px;
          border-radius: 10px;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .finance-tab-btn:hover { color: #0f172a !important; }

        /* Tables and rows */
        .finance-row:hover td { background: #f8fafc !important; }
        .action-btn { opacity: 0; transition: opacity 0.15s; }
        .finance-row:hover .action-btn { opacity: 1; }
        .sort-btn { cursor: pointer; user-select: none; }
        .sort-btn:hover { color: #0f172a; }

        /* Badges */
        .badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }
        .status-badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; }
        .status-badge.paid { background: #ecfdf5; color: #065f46; }
        .status-badge.pending { background: #fffbeb; color: #78350f; }

        /* Modales responsivos */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(10,12,18,0.6);
          backdrop-filter: blur(6px);
        }
        .modal-container {
          background: var(--modal-bg, #fff);
          border-radius: 20px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 24px 0;
        }
        .modal-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .modal-header button {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-field label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94a3b8;
        }

        /* Layouts responsivos */
        .dashboard-subgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .machine-income-form-grid {
          display: grid;
          grid-template-columns: 2fr 1.2fr 1.2fr auto;
          gap: 12px;
          align-items: flex-end;
        }
        .expense-filters-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          background: #fafafa;
          padding: 14px 16px;
          border-bottom: 1.5px solid #f1f5f9;
        }
        .expense-filters-bar .search-wrapper {
          position: relative;
          flex: 1 1 200px;
        }
        .expense-filters-bar .search-wrapper input {
          padding-left: 32px;
        }
        .tx-filters-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          background: #fafafa;
          padding: 14px 16px;
          border-bottom: 1.5px solid #f1f5f9;
        }

        /* Responsive Media Queries */
        @media (max-width: 768px) {
          .finances-container {
            padding: 20px 16px;
          }
          .kpis-grid {
            grid-template-columns: 1fr;
          }
          .dashboard-subgrid {
            grid-template-columns: 1fr;
          }
          .machine-income-form-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .expense-filters-bar, .tx-filters-bar {
            flex-direction: column;
            align-items: stretch;
          }
          .expense-filters-bar .search-wrapper {
            width: 100%;
          }
          .expense-filters-bar select, .expense-filters-bar button,
          .tx-filters-bar select, .tx-filters-bar button {
            width: 100%;
            justify-content: center;
          }
          .modal-container {
            max-width: 95%;
            margin: 0 auto;
          }
          .modal-header {
            padding: 18px 20px 0;
          }
          /* Ajuste de tablas: scroll horizontal ya está en contenedor, solo reducimos padding de celdas */
          th, td {
            padding: 8px 12px !important;
          }
          .finance-kpi-card {
            padding: 16px;
          }
          .kpi-value {
            font-size: 20px;
          }
        }

        @media (max-width: 480px) {
          .finances-container {
            padding: 16px 12px;
          }
          .hide-mobile {
            display: none !important;
          }
          .btn-primary, .btn-outline {
            width: 100%;
            justify-content: center;
          }
          .btn-outline, .btn-primary {
            height: 42px;
          }
          .kpi-icon {
            width: 32px;
            height: 32px;
          }
          .kpi-label {
            font-size: 10px;
          }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="finances-container">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ecfdf5", border: "1.5px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <DollarSign size={18} color="#10b981" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>Finanzas</h1>
            </div>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Control financiero completo · máquinas, gastos, órdenes</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{ ...inputStyle, width: 140, cursor: "pointer" }}
            >
              <option value="day">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
            </select>
            <button style={btnOutline} onClick={refreshAll}><RefreshCw size={14} />Actualizar</button>
            <button style={btnPrimary} onClick={() => openExpenseForm()}><Plus size={15} />Nuevo gasto</button>
          </div>
        </div>

        {/* ── Maintenance alerts ──────────────────────────────────────── */}
        {maintenanceAlerts.length > 0 && (
          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#92400e" }}>
              <AlertCircle size={18} color="#f59e0b" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{maintenanceAlerts.length} alerta{maintenanceAlerts.length > 1 ? "s" : ""} de mantenimiento</span>
              <span style={{ fontSize: 13, color: "#a16207" }}>{maintenanceAlerts.map(m => m.name).join(", ")}</span>
            </div>
            <button style={{ ...btnOutline, borderColor: "#fde68a", color: "#92400e" }} onClick={() => setActiveTab("machines")}>Ver máquinas →</button>
          </div>
        )}

        {/* ── KPI Grid ──────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTop: "3px solid #0f172a", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <div className="kpis-grid">
            {statOrder.map((idx) => (
              <KPICard
                key={kpis[idx].key}
                index={idx}
                {...kpis[idx]}
                onDragStart={onStatDragStart}
                onDragEnter={onStatDragEnter}
                onDragEnd={onStatDragEnd}
              />
            ))}
          </div>
        )}

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #f1f5f9", padding: 5, display: "flex", gap: 4 }}>
          {tabs.map(tab => {
            const active = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className="finance-tab-btn"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: active ? "#0f172a" : "transparent",
                  color: active ? "#fff" : "#64748b",
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon size={14} />
                <span className="hide-mobile">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ════════════ TAB: DASHBOARD ════════════ */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="dashboard-subgrid">
              {[
                { label: "Órdenes de servicio", val: summary.order_revenue },
                { label: "Membresías", val: summary.membership_revenue },
                { label: "Tienda", val: summary.store_revenue },
                { label: "Máquinas", val: summary.machine_revenue },
              ].map(s => (
                <div key={s.label} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #f1f5f9", padding: "16px 20px" }}>
                  <p style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>{fmtCurrency(s.val)}</p>
                </div>
              ))}
            </div>

            <div className="dashboard-subgrid">
              {Object.keys(summary.by_category).length > 0 && (
                <div style={card}>
                  <div style={{ padding: "18px 20px 14px", borderBottom: "1.5px solid #f1f5f9" }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Gastos por categoría</p>
                  </div>
                  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                    {Object.entries(summary.by_category).slice(0, 6).map(([cat, amt]) => {
                      const pct = summary.total_expenses > 0 ? (amt / summary.total_expenses) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{cat}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{fmtCurrency(amt)}</span>
                          </div>
                          <div style={{ height: 6, background: "#f1f5f9", borderRadius: 99 }}>
                            <div style={{ height: 6, borderRadius: 99, background: "linear-gradient(90deg,#6366f1,#8b5cf6)", width: `${pct}%`, transition: "width 0.6s ease" }} />
                          </div>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 0 0" }}>{pct.toFixed(1)}% del total</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={card}>
                <div style={{ padding: "18px 20px 14px", borderBottom: "1.5px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Últimas transacciones</p>
                  <button style={{ ...btnGhost, fontSize: 12 }} onClick={() => setActiveTab("transactions")}>Ver todas →</button>
                </div>
                <div>
                  {filteredTx.slice(0, 6).map((tx, i) => (
                    <div key={tx.id} style={{ padding: "12px 20px", borderBottom: i < 5 ? "1px solid #f8fafc" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{tx.customer_name || tx.customer_email || "—"}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>{fmtShortDate(tx.created_at)}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{fmtCurrency(tx.amount)}</p>
                        <StatusBadge status={tx.payment_status} />
                      </div>
                    </div>
                  ))}
                  {filteredTx.length === 0 && <p style={{ padding: "24px 20px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Sin transacciones</p>}
                </div>
              </div>
            </div>

            {machines.length > 0 && (
              <div style={card}>
                <div style={{ padding: "18px 20px 14px", borderBottom: "1.5px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Resumen de máquinas</p>
                  <button style={{ ...btnGhost, fontSize: 12 }} onClick={() => setActiveTab("machines")}>Gestionar →</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Máquina", "Ciclos", "Ingreso acum.", "Estado"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {machines.map(m => {
                        const cycles = m.total_cycles || 0, threshold = m.maintenance_threshold || 500;
                        const rem = threshold - cycles;
                        const status = rem <= 0 ? "Urgente" : rem <= 50 ? "Próximo" : "Operativa";
                        const statusColor = rem <= 0 ? "#dc2626" : rem <= 50 ? "#d97706" : "#10b981";
                        return (
                          <tr key={m.id} className="finance-row">
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{m.name}</td>
                            <td style={{ ...tdStyle, minWidth: 140 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99 }}>
                                  <div style={{ height: 6, borderRadius: 99, background: statusColor, width: `${Math.min(100, (cycles / threshold) * 100)}%`, transition: "width 0.6s" }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>{fmtNumber(cycles)} / {fmtNumber(threshold)}</span>
                              </div>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: "#10b981" }}>{fmtCurrency(m.total_income || 0)}</td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: statusColor, background: statusColor + "18", padding: "3px 10px", borderRadius: 20 }}>{status}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {machines.length === 0 && (
                        <tr><td colSpan={4} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Sin máquinas registradas</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB: EXPENSES ════════════ */}
        {activeTab === "expenses" && (
          <div style={card}>
            <div className="expense-filters-bar">
              <div className="search-wrapper">
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  style={inputStyle}
                  placeholder="Buscar gasto o proveedor..."
                  value={expenseFilters.search}
                  onChange={e => setExpenseFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <select value={expenseFilters.type} onChange={e => setExpenseFilters(f => ({ ...f, type: e.target.value }))} style={{ ...inputStyle, width: 140 }}>
                <option value="all">Todos los tipos</option>
                <option value="fixed">Fijo</option>
                <option value="variable">Variable</option>
                <option value="subscription">Suscripción</option>
              </select>
              {selectedExpenses.size > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, background: "#eff6ff", color: "#2563eb" }}>
                  {selectedExpenses.size} seleccionados
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{sortedExpenses.length} resultados</span>
                <select value={String(expensePageSize)} onChange={e => { setExpensePageSize(Number(e.target.value)); setExpensePage(1); }} style={{ ...inputStyle, width: 70 }}>
                  <option value="10">10</option><option value="25">25</option><option value="50">50</option>
                </select>
                <button style={btnOutline} onClick={() => exportCSV(
                  sortedExpenses.map(e => [fmtShortDate(e.date), e.expense_type, e.description, e.category, e.vendor, e.amount]),
                  ["Fecha", "Tipo", "Descripción", "Categoría", "Proveedor", "Monto"],
                  "gastos.csv"
                )}><Download size={14} />Exportar</button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36 }}>
                      <input type="checkbox" checked={selectedExpenses.size === paginatedExpenses.length && paginatedExpenses.length > 0}
                        onChange={() => setSelectedExpenses(selectedExpenses.size === paginatedExpenses.length ? new Set() : new Set(paginatedExpenses.map(e => e.id)))} style={{ cursor: "pointer" }} />
                    </th>
                    {[["date","Fecha"],["type","Tipo"],["description","Descripción"],["category","Categoría"],["payment_method","Método"],["amount","Monto"]].map(([key, label]) => (
                      <th key={key} style={thStyle} className="sort-btn" onClick={() => setExpenseSort(s => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: expenseSort.key === key ? "#0f172a" : undefined }}>
                          {label}
                          {expenseSort.key === key ? (expenseSort.dir === "asc" ? " ↑" : " ↓") : ""}
                        </span>
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedExpenses.map(exp => (
                    <tr key={exp.id} className="finance-row" style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ ...tdStyle, width: 36 }}>
                        <input type="checkbox" checked={selectedExpenses.has(exp.id)}
                          onChange={() => setSelectedExpenses(s => { const n = new Set(s); n.has(exp.id) ? n.delete(exp.id) : n.add(exp.id); return n; })} style={{ cursor: "pointer" }} />
                       </td>
                      <td style={{ ...tdStyle, color: "#64748b", whiteSpace: "nowrap" }}>{fmtShortDate(exp.date)}</td>
                      <td style={tdStyle}><Badge type={exp.expense_type} /></td>
                      <td style={tdStyle}>
                        <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{exp.description}</p>
                        {exp.vendor && <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{exp.vendor}</p>}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{exp.category || "—"}</td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{exp.payment_method || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{fmtCurrency(exp.amount)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div className="action-btn" style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button style={btnGhost} onClick={() => openDetail(exp)}><Eye size={14} /></button>
                          <button style={btnGhost} onClick={() => openExpenseForm(exp)}><Edit size={14} /></button>
                          <button style={{ ...btnGhost, color: "#ef4444" }} onClick={() => setDeleteTarget({ type: "expense", id: exp.id, name: exp.description })}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedExpenses.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No se encontraron gastos</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {expenseTotalPages > 1 && (
              <div style={{ padding: "12px 16px", borderTop: "1.5px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>Página {expensePage} de {expenseTotalPages}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btnOutline} disabled={expensePage === 1} onClick={() => setExpensePage(p => p - 1)}><ChevronLeft size={14} /></button>
                  <button style={btnOutline} disabled={expensePage === expenseTotalPages} onClick={() => setExpensePage(p => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB: MACHINES ════════════ */}
        {activeTab === "machines" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={card}>
              <div style={{ padding: "14px 20px", borderBottom: "1.5px solid #f1f5f9", background: "#fafafa", display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 6 }}>Desde</label>
                  <input type="date" value={machineFilterStart} onChange={e => setMachineFilterStart(e.target.value)} style={{ ...inputStyle, width: 148 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 6 }}>Hasta</label>
                  <input type="date" value={machineFilterEnd} onChange={e => setMachineFilterEnd(e.target.value)} style={{ ...inputStyle, width: 148 }} />
                </div>
                <button style={{ ...btnOutline, alignSelf: "flex-end" }} onClick={fetchMachineIncome}><Filter size={14} />Filtrar</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignSelf: "flex-end", flexWrap: "wrap" }}>
                  <button style={btnOutline} onClick={() => { setEditingMachine({}); setModal("machineForm"); }}><Plus size={14} />Nueva máquina</button>
                  <button style={btnPrimary} onClick={() => setShowBulkModal(true)}><FileSpreadsheet size={14} />Ingreso masivo</button>
                </div>
              </div>

              <div style={{ padding: "16px 20px" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  Registrar ingreso por máquina
                </p>
                <div className="machine-income-form-grid">
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 6 }}>Máquina</label>
                    <select value={machineIncomeForm.machine_id} onChange={e => setMachineIncomeForm(f => ({ ...f, machine_id: e.target.value }))} style={inputStyle}>
                      <option value="">Seleccionar…</option>
                      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 6 }}>Fecha</label>
                    <input type="date" value={machineIncomeForm.date} onChange={e => setMachineIncomeForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", display: "block", marginBottom: 6 }}>Monto</label>
                    <input type="number" step="0.01" placeholder="$0.00" value={machineIncomeForm.amount} onChange={e => setMachineIncomeForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
                  </div>
                  <button style={{ ...btnPrimary, background: "#10b981", whiteSpace: "nowrap", height: 38 }} onClick={addMachineIncome}>
                    <Plus size={15} />Registrar
                  </button>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={{ padding: "16px 20px", borderBottom: "1.5px solid #f1f5f9" }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Máquinas registradas</p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Nombre", "Precio/ciclo", "Ciclos", "Ingreso acum.", "Período", "Umbral mto.", "Estado", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map(m => {
                      const cycles = m.total_cycles || 0, threshold = m.maintenance_threshold || 500;
                      const rem = threshold - cycles;
                      const pct = Math.min(100, (cycles / threshold) * 100);
                      const status = rem <= 0 ? "Urgente" : rem <= 50 ? "Próximo" : "OK";
                      const statusColor = rem <= 0 ? "#dc2626" : rem <= 50 ? "#d97706" : "#10b981";
                      const periodIncome = machineIncomeRecords.filter(r => r.machine_id === m.id).reduce((s, r) => s + r.amount, 0);
                      return (
                        <tr key={m.id} className="finance-row" style={{ borderBottom: "1px solid #f8fafc" }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a" }}>{m.name}</td>
                          <td style={tdStyle}>${m.cycle_price}</td>
                          <td style={{ ...tdStyle, minWidth: 140 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99 }}>
                                <div style={{ height: 6, borderRadius: 99, background: statusColor, width: `${pct}%`, transition: "width 0.6s" }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>{fmtNumber(cycles)} / {fmtNumber(threshold)}</span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 700, color: "#10b981" }}>{fmtCurrency(m.total_income || 0)}</td>
                          <td style={{ ...tdStyle, color: "#0ea5e9", fontWeight: 600 }}>{fmtCurrency(periodIncome)}</td>
                          <td style={tdStyle}>{fmtNumber(threshold)}</td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: statusColor, background: statusColor + "18", padding: "3px 10px", borderRadius: 20 }}>{status}</span>
                          </td>
                          <td style={tdStyle}>
                            <div className="action-btn" style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <button style={btnGhost} onClick={() => { setEditingMachine(m); setModal("machineForm"); }}><Edit size={14} /></button>
                              <button style={{ ...btnGhost, color: "#ef4444" }} onClick={() => setDeleteTarget({ type: "machine", id: m.id, name: m.name })}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {machines.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Sin máquinas registradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {machineIncomeRecords.length > 0 && (
              <div style={card}>
                <div style={{ padding: "16px 20px", borderBottom: "1.5px solid #f1f5f9" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Historial de ingresos</p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Fecha", "Máquina", "Monto", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {machineIncomeRecords.slice(0, 10).map(r => {
                        const machine = machines.find(m => m.id === r.machine_id);
                        return (
                          <tr key={r.id} className="finance-row" style={{ borderBottom: "1px solid #f8fafc" }}>
                            <td style={{ ...tdStyle, color: "#64748b" }}>{fmtShortDate(r.date)}</td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{machine?.name || r.machine_id}</td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: "#10b981" }}>{fmtCurrency(r.amount)}</td>
                            <td style={tdStyle}>
                              <button className="action-btn" style={{ ...btnGhost, color: "#ef4444" }}
                                onClick={() => setDeleteTarget({ type: "machine-income", id: r.id, name: `${fmtShortDate(r.date)} — ${machine?.name}` })}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB: MILEAGE ════════════ */}
        {activeTab === "mileage" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...card, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Registros de millaje</p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#94a3b8" }}>{mileage.length} viajes registrados</p>
              </div>
              <button style={btnPrimary} onClick={() => { setMileageForm({ date: today(), vehicle_id: "", driver_name: "", start_odometer: "", end_odometer: "", purpose: "" }); setModal("mileage"); }}>
                <Plus size={15} />Registrar viaje
              </button>
            </div>
            {mileage.map(m => {
              const miles = ((m.end_odometer || 0) - (m.start_odometer || 0));
              return (
                <div key={m.id} style={{ ...card, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Car size={18} color="#3b82f6" />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: "#0f172a", fontSize: 14 }}>{m.driver_name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{fmtShortDate(m.date)} · {m.purpose}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: "#0f172a", letterSpacing: "-0.02em" }}>{miles.toFixed(1)} mi</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#10b981", fontWeight: 600 }}>Reimb. {fmtCurrency(m.reimbursement)}</p>
                  </div>
                </div>
              );
            })}
            {mileage.length === 0 && (
              <div style={{ ...card, padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
                <Car size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: 14 }}>Sin registros de millaje</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB: TRANSACTIONS ════════════ */}
        {activeTab === "transactions" && (
          <div style={card}>
            <div className="tx-filters-bar">
              <div className="search-wrapper" style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  placeholder="Buscar por cliente o referencia..."
                  value={txFilters.search}
                  onChange={e => setTxFilters(f => ({ ...f, search: e.target.value }))}
                />
              </div>
              <select value={txFilters.status} onChange={e => setTxFilters(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, width: 130 }}>
                <option value="all">Todos</option><option value="paid">Pagados</option><option value="pending">Pendientes</option>
              </select>
              <select value={txFilters.type} onChange={e => setTxFilters(f => ({ ...f, type: e.target.value }))} style={{ ...inputStyle, width: 140 }}>
                <option value="all">Todos los tipos</option><option value="service">Servicio</option><option value="store">Tienda</option><option value="membership">Membresía</option>
              </select>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{filteredTx.length} resultados</span>
                <button style={btnOutline} onClick={() => exportCSV(
                  filteredTx.map(tx => [fmtShortDate(tx.created_at), tx.payment_type, tx.order_number, tx.customer_name, tx.amount, tx.payment_status]),
                  ["Fecha", "Tipo", "Referencia", "Cliente", "Monto", "Estado"],
                  "transacciones.csv"
                )}><Download size={14} />Exportar CSV</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Fecha", "Tipo", "Referencia", "Cliente", "Monto", "Estado"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {paginatedTx.map(tx => (
                    <tr key={tx.id} className="finance-row" style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ ...tdStyle, color: "#64748b", whiteSpace: "nowrap" }}>{fmtShortDate(tx.created_at)}</td>
                      <td style={tdStyle}><span style={{ textTransform: "capitalize", fontSize: 13, fontWeight: 500 }}>{tx.payment_type || "servicio"}</span></td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{tx.order_number || tx.order_id || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{tx.customer_name || tx.customer_email || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{fmtCurrency(tx.amount)}</td>
                      <td style={tdStyle}><StatusBadge status={tx.payment_status} /></td>
                    </tr>
                  ))}
                  {paginatedTx.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Sin transacciones</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {txTotalPages > 1 && (
              <div style={{ padding: "12px 16px", borderTop: "1.5px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>Página {txPage} de {txTotalPages}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btnOutline} disabled={txPage === 1} onClick={() => setTxPage(p => p - 1)}><ChevronLeft size={14} /></button>
                  <button style={btnOutline} disabled={txPage === txTotalPages} onClick={() => setTxPage(p => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════ MODALS ═══════════ */}

      {/* Expense form CON OCR Y ATTACHMENTS */}
      <PortalModal open={modal === "expense"} onClose={() => { setModal(null); setEditingItem(null); setAttachments([]); setExistingFiles([]); }}>
        <ModalHeader title={editingItem?.id ? "Editar gasto" : "Nuevo gasto"} onClose={() => setModal(null)} />
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Descripción">
            <input style={inputStyle} value={editingItem?.description || ""} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} placeholder="Ej: Renta local" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Fecha">
              <input type="date" style={inputStyle} value={editingItem?.date || today()} onChange={e => setEditingItem({ ...editingItem, date: e.target.value })} />
            </Field>
            <Field label="Monto">
              <input type="number" step="0.01" style={inputStyle} placeholder="$0.00" value={editingItem?.amount || ""} onChange={e => setEditingItem({ ...editingItem, amount: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Tipo">
              <select style={inputStyle} value={editingItem?.expense_type || "variable"} onChange={e => setEditingItem({ ...editingItem, expense_type: e.target.value })}>
                <option value="fixed">Fijo</option>
                <option value="variable">Variable</option>
                <option value="subscription">Suscripción</option>
              </select>
            </Field>
            <Field label="Categoría">
              <select style={inputStyle} value={editingItem?.category || ""} onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Proveedor">
              <input style={inputStyle} value={editingItem?.vendor || ""} onChange={e => setEditingItem({ ...editingItem, vendor: e.target.value })} placeholder="Nombre del proveedor" />
            </Field>
            <Field label="Método de pago">
              <select style={inputStyle} value={editingItem?.payment_method || "card"} onChange={e => setEditingItem({ ...editingItem, payment_method: e.target.value })}>
                <option value="card">Tarjeta</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="zelle">Zelle</option>
                <option value="check">Cheque</option>
              </select>
            </Field>
          </div>
          <Field label="Notas">
            <textarea style={textareaStyle} rows={2} value={editingItem?.notes || ""} onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })} placeholder="Notas adicionales..." />
          </Field>
          
          {/* Sección de comprobantes con OCR */}
          <Field label="Comprobantes">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btnOutline} onClick={() => cameraRef.current?.click()}><Camera size={14} />Tomar foto</button>
              <button style={btnOutline} onClick={() => fileRef.current?.click()}><Paperclip size={14} />Adjuntar archivos</button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFileSelect} />
            <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={handleFileSelect} />
            
            {ocrLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fffbeb", borderRadius: 10, marginTop: 8 }}>
                <div style={{ width: 14, height: 14, border: "2px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 12, color: "#92400e" }}>Escaneando recibo con IA...</span>
              </div>
            )}
            
            {/* Nuevos attachments */}
            {attachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {attachments.map((a, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {a.preview ? (
                      <button onClick={() => setLightbox({ images: [a.preview], idx: 0 })}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                        <img src={a.preview} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e2e8f0" }} />
                      </button>
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 10, background: "#f1f5f9", border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FileSpreadsheet size={20} color="#94a3b8" />
                      </div>
                    )}
                    {a.uploading && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.75)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 14, height: 14, border: "2px solid #0f172a", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                      </div>
                    )}
                    {a.uploaded && !a.uploading && (
                      <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={9} color="#fff" />
                      </div>
                    )}
                    {!a.uploading && (
                      <button onClick={() => removeAttachment(i)}
                        style={{ position: "absolute", top: -4, left: -4, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={10} color="#fff" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Archivos existentes */}
            {existingFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Archivos guardados</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {existingFiles.map(f => {
                    const isImg = f.content_type?.startsWith("image/");
                    const url = `${API}${f.url}?auth=${token()}`;
                    const allImgs = existingFiles.filter(x => x.content_type?.startsWith("image/")).map(x => `${API}${x.url}?auth=${token()}`);
                    return isImg ? (
                      <button key={f.id} onClick={() => setLightbox({ images: allImgs, idx: allImgs.indexOf(url) })}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", position: "relative" }}>
                        <img src={url} alt={f.original_filename} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e2e8f0" }} />
                        <button onClick={(e) => { e.stopPropagation(); removeExistingFile(f.id); }}
                          style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <X size={10} color="#fff" />
                        </button>
                      </button>
                    ) : (
                      <a key={f.id} href={url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, fontSize: 11, color: "#1d4ed8", textDecoration: "none" }}>
                        <ImageIcon size={12} /> {f.original_filename || "archivo"}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </Field>
          
          <button style={{ ...btnPrimary, justifyContent: "center", height: 42, marginTop: 4 }} onClick={saveExpense}>
            {editingItem?.id ? "Actualizar gasto" : "Guardar gasto"}
          </button>
        </div>
      </PortalModal>

      {/* Expense detail con archivos */}
      <PortalModal open={modal === "detail"} onClose={() => setModal(null)}>
        <ModalHeader title="Detalle del gasto" onClose={() => setModal(null)} />
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{fmtCurrency(detailExpense?.amount)}</p>
            <p style={{ margin: 0, fontSize: 14, color: "#334155" }}>{detailExpense?.description}</p>
          </div>
          {[
            ["Fecha", fmtShortDate(detailExpense?.date)],
            ["Tipo", detailExpense?.expense_type],
            ["Categoría", detailExpense?.category || "—"],
            ["Proveedor", detailExpense?.vendor || "—"],
            ["Método de pago", detailExpense?.payment_method || "—"],
            ["Notas", detailExpense?.notes || "—"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f1f5f9", paddingBottom: 8, flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>{label}</span>
              <span style={{ color: "#334155", fontWeight: 500 }}>{val}</span>
            </div>
          ))}
          
          {/* Archivos en el detalle */}
          {detailFiles.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>Comprobantes</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {detailFiles.filter(f => f.content_type?.startsWith("image/")).map((f, idx) => {
                  const url = `${API}${f.url}?auth=${token()}`;
                  const allImgs = detailFiles.filter(x => x.content_type?.startsWith("image/")).map(x => `${API}${x.url}?auth=${token()}`);
                  return (
                    <button key={f.id} onClick={() => setLightbox({ images: allImgs, idx: allImgs.indexOf(url) })}
                      style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      <img src={url} alt={f.original_filename} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e2e8f0" }} />
                    </button>
                  );
                })}
                {detailFiles.filter(f => !f.content_type?.startsWith("image/")).map(f => (
                  <a key={f.id} href={`${API}${f.url}?auth=${token()}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, fontSize: 11, color: "#1d4ed8", textDecoration: "none" }}>
                    <Paperclip size={11} /> {f.original_filename || "archivo"}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </PortalModal>

      {/* Mileage form */}
      <PortalModal open={modal === "mileage"} onClose={() => setModal(null)}>
        <ModalHeader title="Registrar millaje" onClose={() => setModal(null)} />
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Fecha"><input type="date" style={inputStyle} value={mileageForm.date} onChange={e => setMileageForm(f => ({ ...f, date: e.target.value }))} /></Field>
            <Field label="Conductor"><input style={inputStyle} value={mileageForm.driver_name} onChange={e => setMileageForm(f => ({ ...f, driver_name: e.target.value }))} /></Field>
          </div>
          <Field label="Vehículo">
            <select style={inputStyle} value={mileageForm.vehicle_id} onChange={e => setMileageForm(f => ({ ...f, vehicle_id: e.target.value }))}>
              <option value="">Seleccionar vehículo</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Odómetro inicial"><input type="number" style={inputStyle} value={mileageForm.start_odometer} onChange={e => setMileageForm(f => ({ ...f, start_odometer: e.target.value }))} /></Field>
            <Field label="Odómetro final"><input type="number" style={inputStyle} value={mileageForm.end_odometer} onChange={e => setMileageForm(f => ({ ...f, end_odometer: e.target.value }))} /></Field>
          </div>
          <Field label="Propósito"><input style={inputStyle} value={mileageForm.purpose} onChange={e => setMileageForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Ej: Entrega a cliente" /></Field>
          <button style={{ ...btnPrimary, justifyContent: "center", height: 42 }} onClick={async () => {
            try { await axios.post(`${API}/api/finances/mileage`, mileageForm, { headers: getAuth() }); toast.success("Millaje registrado"); setModal(null); fetchMileage(); fetchSummary(); } catch { toast.error("Error"); }
          }}>Guardar registro</button>
        </div>
      </PortalModal>

      {/* Machine form */}
      <PortalModal open={modal === "machineForm"} onClose={() => { setModal(null); setEditingMachine(null); }}>
        <ModalHeader title={editingMachine?.id ? "Editar máquina" : "Nueva máquina"} onClose={() => setModal(null)} />
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Nombre de la máquina">
            <input style={inputStyle} value={editingMachine?.name || ""} onChange={e => setEditingMachine({ ...editingMachine, name: e.target.value })} placeholder="Ej: Lavadora #1" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Precio por ciclo ($)">
              <input type="number" step="0.01" style={inputStyle} value={editingMachine?.cycle_price || 2.0} onChange={e => setEditingMachine({ ...editingMachine, cycle_price: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Umbral de mantenimiento (ciclos)">
              <input type="number" style={inputStyle} value={editingMachine?.maintenance_threshold || 500} onChange={e => setEditingMachine({ ...editingMachine, maintenance_threshold: parseInt(e.target.value) })} />
            </Field>
          </div>
          <div style={{ background: "#f0f9ff", border: "1.5px solid #bae6fd", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#0c4a6e" }}>
            💡 Se enviará una alerta cuando la máquina supere el umbral de ciclos configurado.
          </div>
          <button style={{ ...btnPrimary, justifyContent: "center", height: 42 }} onClick={async () => {
            if (!editingMachine?.name) { toast.error("Nombre requerido"); return; }
            if (editingMachine.id) await updateMachine(editingMachine.id, editingMachine);
            else await createMachine({ name: editingMachine.name, cycle_price: editingMachine.cycle_price || 2, maintenance_threshold: editingMachine.maintenance_threshold || 500 });
            setModal(null); setEditingMachine(null);
          }}>Guardar máquina</button>
        </div>
      </PortalModal>

      {/* Bulk income modal CON RANGO DE FECHAS */}
      <PortalModal open={showBulkModal} onClose={() => setShowBulkModal(false)}>
        <ModalHeader title="Ingreso masivo por período" onClose={() => setShowBulkModal(false)} />
        <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Fecha inicio">
            <input type="date" style={inputStyle} value={bulkIncomeForm.start_date}
              onChange={e => setBulkIncomeForm(f => ({ ...f, start_date: e.target.value }))} />
          </Field>
          <Field label="Fecha fin">
            <input type="date" style={inputStyle} value={bulkIncomeForm.end_date}
              onChange={e => setBulkIncomeForm(f => ({ ...f, end_date: e.target.value }))} />
          </Field>
          <Field label="Monto por máquina (por día)">
            <input type="number" step="0.01" style={inputStyle} placeholder="$0.00"
              value={bulkIncomeForm.amount}
              onChange={e => setBulkIncomeForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#78350f" }}>
            ⚠️ Se registrará <strong>{fmtCurrency(bulkIncomeForm.amount || 0)}</strong> por día para <strong>{machines.length}</strong> máquina(s)
            desde <strong>{fmtShortDate(bulkIncomeForm.start_date)}</strong> hasta <strong>{fmtShortDate(bulkIncomeForm.end_date)}</strong>.
            <br /><br />
            📊 Total estimado por máquina: <strong>{fmtCurrency((bulkIncomeForm.amount || 0) * getDaysBetweenDates(bulkIncomeForm.start_date, bulkIncomeForm.end_date))}</strong>
          </div>
          <button style={{ ...btnPrimary, background: "#10b981", justifyContent: "center", height: 42 }} onClick={addBulkIncome}>
            Registrar ingreso masivo
          </button>
        </div>
      </PortalModal>

      {/* Delete confirm */}
      {deleteTarget && (
        <PortalModal open onClose={() => setDeleteTarget(null)}>
          <div style={{ padding: "28px 24px" }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 16, color: "#0f172a" }}>Confirmar eliminación</p>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#991b1b", marginBottom: 20, wordBreak: "break-word" }}>
              "{deleteTarget.name}"
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={{ ...btnOutline, flex: 1, justifyContent: "center" }} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button style={{ ...btnPrimary, flex: 1, justifyContent: "center", background: "#dc2626" }} onClick={async () => {
                try {
                  if (deleteTarget.type === "machine") await axios.delete(`${API}/api/finances/machines/${deleteTarget.id}`, { headers: getAuth() });
                  else if (deleteTarget.type === "machine-income") await axios.delete(`${API}/api/finances/machine-income/${deleteTarget.id}`, { headers: getAuth() });
                  else await axios.delete(`${API}/api/finances/${deleteTarget.type}s/${deleteTarget.id}`, { headers: getAuth() });
                  toast.success("Eliminado correctamente");
                  setDeleteTarget(null);
                  if (deleteTarget.type === "machine") { fetchMachines(); fetchMachineIncome(); }
                  else if (deleteTarget.type === "machine-income") { fetchMachineIncome(); fetchMachines(); }
                  else { fetchExpenses(); fetchSummary(); }
                } catch { toast.error("Error al eliminar"); }
              }}>Eliminar</button>
            </div>
          </div>
        </PortalModal>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Lightbox images={lightbox.images} initialIndex={lightbox.idx} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}