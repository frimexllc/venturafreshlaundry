import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  DollarSign, ShoppingBag, Users, TrendingUp, Receipt,
  Download, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown,
  GripVertical, Search, ChevronLeft, ChevronRight,
  Eye, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── helpers ───────────────────────────────────────────────────────────────
const fmt = (v) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(v || 0);

const fmtDate = (dateStr, locale) => {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "es" ? "es-MX" : "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );
};

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];
const lastMonthRange = () => {
  const t = new Date();
  const s = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const e = new Date(t.getFullYear(), t.getMonth(), 0);
  return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
};

// ─── constants ─────────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: "created_at",     label: "Fecha",      sortable: true  },
  { key: "payment_type",   label: "Tipo",       sortable: true  },
  { key: "order_number",   label: "Referencia", sortable: false },
  { key: "customer",       label: "Cliente",    sortable: true  },
  { key: "payment_method", label: "Método",     sortable: true  },
  { key: "amount",         label: "Monto",      sortable: true  },
  { key: "payment_status", label: "Estado",     sortable: true  },
];

const PAGE_SIZES = [10, 25, 50, 100];

const STATUS_STYLE = {
  paid:      "bg-green-100 text-green-800",
  pending:   "bg-amber-100 text-amber-800",
  unpaid:    "bg-amber-100 text-amber-800",
  refunded:  "bg-blue-100 text-blue-800",
  failed:    "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};
const STATUS_LABEL = {
  paid: "Pagado", pending: "Pendiente", unpaid: "Pendiente",
  refunded: "Reembolsado", failed: "Fallido", cancelled: "Cancelado",
};
const METHOD_ICON = {
  card: "💳", cash: "💵", zelle: "⚡", transfer: "🏦",
  stripe: "💳", venmo: "📱",
};
const TYPE_STYLE = {
  service:    "bg-gray-100 text-gray-700",
  store:      "bg-amber-100 text-amber-800",
  membership: "bg-blue-100 text-blue-800",
};

const defaultSummary = {
  total_revenue: 0, order_revenue: 0, membership_revenue: 0, store_revenue: 0,
  total_orders: 0, paid_orders: 0, pending_orders: 0,
  store_orders: 0, store_paid_orders: 0, store_pending_orders: 0,
  avg_order_value: 0, total_memberships: 0, payment_methods: {},
};

// ─── sub-components ────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }) {
  if (!col.sortable) return null;
  if (sortKey !== col.key) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3" />
    : <ArrowDown className="w-3 h-3" />;
}

// Draggable metric section card
function SectionCard({
  children, index, onDragStart, onDragEnter, onDragEnd,
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-grab active:cursor-grabbing active:opacity-70 transition-opacity select-none"
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, iconBg, iconColor, label, badge, badgeColor }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-gray-300" />
        <div className={`w-6 h-6 rounded-full ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-3 h-3 ${iconColor}`} />
        </div>
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      {badge && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionBody({ value, sub, subIcon: SubIcon, subColor = "text-gray-400" }) {
  return (
    <div className="px-4 py-3">
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 flex items-center gap-1 ${subColor}`}>
          {SubIcon && <SubIcon className="w-3 h-3" />}
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────
export default function Finances() {
  const { t, locale } = useLocale();

  // data
  const [summary, setSummary]         = useState(defaultSummary);
  const [allTx, setAllTx]             = useState([]);
  const [loadingSum, setLoadingSum]   = useState(true);
  const [loadingTx, setLoadingTx]     = useState(true);

  // filters
  const [dateRange, setDateRange] = useState({ start: monthStart(), end: today() });
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [search, setSearch]             = useState("");

  // table
  const [columns, setColumns]         = useState(ALL_COLUMNS);
  const [visibleCols, setVisibleCols] = useState(new Set(ALL_COLUMNS.map((c) => c.key)));
  const [sortKey, setSortKey]         = useState("created_at");
  const [sortDir, setSortDir]         = useState("desc");
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(25);
  const [selected, setSelected]       = useState(new Set());
  const [showColPicker, setShowColPicker] = useState(false);

  // section order (indices into SECTION_DEFS)
  const [secOrder, setSecOrder] = useState([0, 1, 2, 3]);

  // drag refs
  const dragCol    = useRef(null);
  const dragColOv  = useRef(null);
  const dragRow    = useRef(null);
  const dragRowOv  = useRef(null);
  const dragSec    = useRef(null);
  const dragSecOv  = useRef(null);

  // ── fetch ──────────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoadingSum(true);
    try {
      const res = await axios.get(`${API}/finances/summary`, {
        params: { start_date: dateRange.start, end_date: dateRange.end },
      });
      setSummary({ ...defaultSummary, ...res.data });
    } catch {
      setSummary(defaultSummary);
    } finally {
      setLoadingSum(false);
    }
  }, [dateRange]);

  const fetchTx = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await axios.get(`${API}/store/transactions`);
      setAllTx(Array.isArray(res.data) ? res.data : []);
    } catch {
      setAllTx([]);
    } finally {
      setLoadingTx(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTx(); }, [fetchTx]);

  const refreshAll = () => { fetchSummary(); fetchTx(); };

  // ── derived data ────────────────────────────────────────────────────────
  const filtered = allTx
    .filter((tx) => {
      if (!tx.created_at) return false;
      const d = tx.created_at.split("T")[0];
      return d >= dateRange.start && d <= dateRange.end;
    })
    .filter((tx) => {
      const s = (tx.payment_status || "").toLowerCase();
      if (statusFilter === "paid")    return s === "paid";
      if (statusFilter === "pending") return s === "pending" || s === "unpaid" || s === "";
      return true;
    })
    .filter((tx) => typeFilter === "all" || (tx.payment_type || "service") === typeFilter)
    .filter((tx) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (tx.order_number   || "").toLowerCase().includes(q) ||
        (tx.customer_name  || "").toLowerCase().includes(q) ||
        (tx.customer_email || "").toLowerCase().includes(q)
      );
    });

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey] ?? "";
    let vb = b[sortKey] ?? "";
    if (sortKey === "amount")    { va = Number(va); vb = Number(vb); }
    if (sortKey === "customer")  { va = a.customer_name || a.customer_email || ""; vb = b.customer_name || b.customer_email || ""; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ?  1 : -1;
    return 0;
  });

  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart   = (page - 1) * pageSize;
  const paginated   = sorted.slice(pageStart, pageStart + pageSize);
  const displayCols = columns.filter((c) => visibleCols.has(c.key));

  const typeOptions = ["all", ...new Set(allTx.map((tx) => tx.payment_type || "service").filter(Boolean))];

  // ── sort ────────────────────────────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };

  // ── column drag ─────────────────────────────────────────────────────────
  const onColDragStart = (e, idx) => { dragCol.current = idx; e.dataTransfer.effectAllowed = "move"; };
  const onColDragEnter = (idx)    => { dragColOv.current = idx; };
  const onColDragEnd   = ()       => {
    if (dragCol.current !== null && dragColOv.current !== null && dragCol.current !== dragColOv.current) {
      const next = [...columns];
      const [moved] = next.splice(dragCol.current, 1);
      next.splice(dragColOv.current, 0, moved);
      setColumns(next);
    }
    dragCol.current = dragColOv.current = null;
  };

  // ── row drag ────────────────────────────────────────────────────────────
  const onRowDragStart = (e, idx) => { dragRow.current = idx; e.dataTransfer.effectAllowed = "move"; };
  const onRowDragEnter = (idx)    => { dragRowOv.current = idx; };
  const onRowDragEnd   = ()       => {
    if (dragRow.current !== null && dragRowOv.current !== null && dragRow.current !== dragRowOv.current) {
      const next = [...allTx];
      const srcIdx  = pageStart + dragRow.current;
      const destIdx = pageStart + dragRowOv.current;
      const [moved] = next.splice(srcIdx, 1);
      next.splice(destIdx, 0, moved);
      setAllTx(next);
    }
    dragRow.current = dragRowOv.current = null;
  };

  // ── section drag ────────────────────────────────────────────────────────
  const onSecDragStart = (idx) => { dragSec.current = idx; };
  const onSecDragEnter = (idx) => { dragSecOv.current = idx; };
  const onSecDragEnd   = ()    => {
    if (dragSec.current !== null && dragSecOv.current !== null && dragSec.current !== dragSecOv.current) {
      const next = [...secOrder];
      const [moved] = next.splice(dragSec.current, 1);
      next.splice(dragSecOv.current, 0, moved);
      setSecOrder(next);
    }
    dragSec.current = dragSecOv.current = null;
  };

  // ── row selection ───────────────────────────────────────────────────────
  const toggleRow = (id) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected((s) =>
      s.size === paginated.length ? new Set() : new Set(paginated.map((tx) => tx.id))
    );
  const allSelected = paginated.length > 0 && selected.size === paginated.length;

  // ── export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = selected.size > 0 ? sorted.filter((tx) => selected.has(tx.id)) : sorted;
    if (!rows.length) { toast.error("Sin transacciones para exportar"); return; }
    const esc  = (v) => `"${`${v ?? ""}`.replace(/"/g, '""')}"`;
    const hdr  = displayCols.map((c) => c.label);
    const body = rows.map((tx) =>
      displayCols.map((c) => {
        if (c.key === "created_at")     return fmtDate(tx.created_at, locale);
        if (c.key === "customer")       return tx.customer_name || tx.customer_email || "—";
        if (c.key === "order_number")   return tx.order_number || tx.order_id || tx.session_id || "—";
        if (c.key === "amount")         return tx.amount || 0;
        return tx[c.key] || "—";
      })
    );
    const csv  = [[...hdr].map(esc).join(","), ...body.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `finanzas-${dateRange.start}-${dateRange.end}.csv`,
    }).click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} transacciones exportadas`);
  };

  // ── section definitions (rendered in secOrder) ──────────────────────────
  const SECTION_DEFS = [
    {
      icon: DollarSign, iconBg: "bg-green-100", iconColor: "text-green-600",
      label: "Ingresos totales",
      badge: "Total del periodo", badgeColor: "bg-green-100 text-green-700",
      value: fmt(summary.total_revenue),
      sub: "Periodo seleccionado",
      subIcon: TrendingUp, subColor: "text-green-600",
    },
    {
      icon: ShoppingBag, iconBg: "bg-sky-100", iconColor: "text-sky-600",
      label: "Servicios",
      badge: `${summary.paid_orders} pagadas`, badgeColor: "bg-sky-100 text-sky-700",
      value: fmt(summary.order_revenue),
      sub: `${summary.pending_orders} pendientes`,
      subIcon: ArrowDownRight, subColor: "text-amber-500",
    },
    {
      icon: ShoppingBag, iconBg: "bg-amber-100", iconColor: "text-amber-600",
      label: "Tienda",
      badge: `${summary.store_paid_orders} órdenes`, badgeColor: "bg-amber-100 text-amber-700",
      value: fmt(summary.store_revenue),
      sub: `${summary.store_pending_orders} pendientes`,
      subIcon: ArrowDownRight, subColor: "text-amber-500",
    },
    {
      icon: TrendingUp, iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
      label: "Ticket promedio",
      badge: `${summary.total_orders} órdenes`, badgeColor: "bg-emerald-100 text-emerald-700",
      value: fmt(summary.avg_order_value),
      sub: `Membresías: ${fmt(summary.membership_revenue)}`,
      subIcon: Users, subColor: "text-purple-500",
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" data-testid="finances-page">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-600" />
            {t("Finances", "Finanzas")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Resumen financiero y movimientos del periodo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Actualizar
          </Button>
          <Button size="sm" onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white">
            <Download className="w-4 h-4 mr-1.5" />
            {selected.size > 0 ? `Exportar (${selected.size})` : "Exportar CSV"}
          </Button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs text-gray-500">Inicio</Label>
            <Input
              type="date" value={dateRange.start}
              onChange={(e) => { setDateRange((r) => ({ ...r, start: e.target.value })); setPage(1); }}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Fin</Label>
            <Input
              type="date" value={dateRange.end}
              onChange={(e) => { setDateRange((r) => ({ ...r, end: e.target.value })); setPage(1); }}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Estado</Label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="mt-1 h-8 border border-gray-200 rounded-lg px-2 text-sm bg-white block"
            >
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Tipo</Label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="mt-1 h-8 border border-gray-200 rounded-lg px-2 text-sm bg-white block"
            >
              {typeOptions.map((tp) => (
                <option key={tp} value={tp}>{tp === "all" ? "Todos" : tp}</option>
              ))}
            </select>
          </div>
          <Button
            variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => { setDateRange({ start: monthStart(), end: today() }); setPage(1); }}
          >
            Este mes
          </Button>
          <Button
            variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => { setDateRange(lastMonthRange()); setPage(1); }}
          >
            Mes pasado
          </Button>
        </div>
      </div>

      {/* ── Draggable section cards ── */}
      {loadingSum ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-7 h-7 rounded-full border-2 border-green-600 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {secOrder.map((defIdx, i) => {
            const def = SECTION_DEFS[defIdx];
            return (
              <SectionCard
                key={defIdx}
                index={i}
                onDragStart={onSecDragStart}
                onDragEnter={onSecDragEnter}
                onDragEnd={onSecDragEnd}
              >
                <SectionHeader
                  icon={def.icon}
                  iconBg={def.iconBg}
                  iconColor={def.iconColor}
                  label={def.label}
                  badge={def.badge}
                  badgeColor={def.badgeColor}
                />
                <SectionBody
                  value={def.value}
                  sub={def.sub}
                  subIcon={def.subIcon}
                  subColor={def.subColor}
                />
              </SectionCard>
            );
          })}
        </div>
      )}

      {/* ── Transaction table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar orden, cliente…"
                className="pl-8 h-8 text-sm w-56"
              />
            </div>
            {selected.size > 0 && (
              <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded-lg">
                {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {sorted.length} resultado{sorted.length !== 1 ? "s" : ""}
            </span>
            {/* Page size */}
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / pág</option>)}
            </select>
            {/* Column picker */}
            <div className="relative">
              <Button
                variant="outline" size="sm" className="h-8 text-xs gap-1"
                onClick={() => setShowColPicker((v) => !v)}
              >
                <Eye className="w-3.5 h-3.5" /> Columnas
              </Button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 p-3 w-48 space-y-1.5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Columnas visibles
                  </p>
                  {columns.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 hover:text-gray-900">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() =>
                          setVisibleCols((s) => {
                            const n = new Set(s);
                            n.has(col.key) ? n.delete(col.key) : n.add(col.key);
                            return n;
                          })
                        }
                        className="rounded"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drag hint */}
        <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] text-gray-400 flex items-center gap-1.5">
          <GripVertical className="w-3 h-3" />
          Arrastra las cabeceras para reordenar columnas · Arrastra filas con el handle para reorganizarlas
        </div>

        {/* Table */}
        {loadingTx ? (
          <div className="flex justify-center py-14">
            <div className="animate-spin w-7 h-7 rounded-full border-2 border-sky-600 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {/* Select all */}
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 cursor-pointer"
                    />
                  </th>
                  {/* Drag handle col */}
                  <th className="px-2 py-3 w-8" />
                  {/* Dynamic columns */}
                  {displayCols.map((col, idx) => (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={(e) => onColDragStart(e, idx)}
                      onDragEnter={() => onColDragEnter(idx)}
                      onDragEnd={onColDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => col.sortable && toggleSort(col.key)}
                      className={`px-3 py-3 text-left select-none ${col.sortable ? "cursor-pointer" : "cursor-grab"} active:cursor-grabbing`}
                    >
                      <span className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${sortKey === col.key ? "text-blue-600" : "text-gray-500 hover:text-gray-800"}`}>
                        {col.label}
                        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayCols.length + 2}
                      className="text-center py-14 text-gray-400 text-sm"
                    >
                      Sin transacciones en este periodo o filtro
                    </td>
                  </tr>
                ) : (
                  paginated.map((tx, idx) => {
                    const status     = (tx.payment_status || "pending").toLowerCase();
                    const type       = (tx.payment_type || "service").toLowerCase();
                    const isSelected = selected.has(tx.id);

                    return (
                      <tr
                        key={tx.id}
                        draggable
                        onDragStart={(e) => onRowDragStart(e, idx)}
                        onDragEnter={() => onRowDragEnter(idx)}
                        onDragEnd={onRowDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`group transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        data-testid={`transaction-row-${tx.id}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(tx.id)}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </td>
                        {/* Drag handle */}
                        <td className="px-2 py-3 w-8">
                          <GripVertical className="w-4 h-4 text-gray-200 group-hover:text-gray-400 cursor-grab active:cursor-grabbing" />
                        </td>

                        {/* Dynamic cells */}
                        {displayCols.map((col) => {
                          if (col.key === "created_at") return (
                            <td key={col.key} className="px-3 py-3 text-gray-500 tabular-nums text-xs whitespace-nowrap">
                              {fmtDate(tx.created_at, locale)}
                            </td>
                          );
                          if (col.key === "payment_type") return (
                            <td key={col.key} className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_STYLE[type] || "bg-gray-100 text-gray-700"}`}>
                                {tx.payment_type || "service"}
                              </span>
                            </td>
                          );
                          if (col.key === "order_number") return (
                            <td key={col.key} className="px-3 py-3 font-mono text-xs text-gray-700">
                              {tx.order_number || tx.order_id || tx.session_id || "—"}
                            </td>
                          );
                          if (col.key === "customer") return (
                            <td key={col.key} className="px-3 py-3">
                              <div className="font-medium text-gray-900 truncate max-w-[160px]">
                                {tx.customer_name || tx.customer_email || "—"}
                              </div>
                              {tx.customer_name && tx.customer_email && (
                                <div className="text-xs text-gray-400 truncate max-w-[160px]">
                                  {tx.customer_email}
                                </div>
                              )}
                            </td>
                          );
                          if (col.key === "payment_method") return (
                            <td key={col.key} className="px-3 py-3 text-xs text-gray-700">
                              <span className="flex items-center gap-1.5">
                                <span className="text-sm">{METHOD_ICON[tx.payment_method?.toLowerCase()] || "·"}</span>
                                <span className="capitalize">{tx.payment_method || "—"}</span>
                              </span>
                            </td>
                          );
                          if (col.key === "amount") return (
                            <td key={col.key} className="px-3 py-3 font-semibold tabular-nums text-gray-900 text-right">
                              {fmt(tx.amount)}
                            </td>
                          );
                          if (col.key === "payment_status") return (
                            <td key={col.key} className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>
                                {STATUS_LABEL[status] || status}
                              </span>
                            </td>
                          );
                          return (
                            <td key={col.key} className="px-3 py-3 text-gray-500">
                              {tx[col.key] || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Footer totals */}
              {paginated.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td
                      colSpan={
                        2 +
                        displayCols.filter((c) => !["amount", "payment_status"].includes(c.key)).length +
                        1
                      }
                      className="px-3 py-2.5 text-xs font-semibold text-gray-500"
                    >
                      {sorted.length} transacciones · página {page}/{totalPages}
                    </td>
                    {displayCols.find((c) => c.key === "amount") && (
                      <td className="px-3 py-2.5 text-sm font-bold text-gray-900 tabular-nums text-right">
                        {fmt(sorted.reduce((s, tx) => s + Number(tx.amount || 0), 0))}
                      </td>
                    )}
                    {displayCols.find((c) => c.key === "payment_status") && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Mostrando {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} de {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm" className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = page <= 3 ? i + 1 : page + i - 2;
                if (pg < 1 || pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`h-7 w-7 text-xs rounded-lg font-medium transition-colors ${
                      pg === page
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {pg}
                  </button>
                );
              })}
              <Button
                variant="outline" size="sm" className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}