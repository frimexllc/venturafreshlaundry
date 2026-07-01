import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Download, Mail, MessageSquare,
  CheckCircle2, XCircle, Send, Users, ShoppingBag, FileText,
  UserPlus, HeadphonesIcon, Upload, AlertTriangle,
  ChevronDown, ChevronUp, Database, X, Pause, Play, RotateCcw,
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Tamaños de página según tipo de colección ──────────────────────────────
// Las colecciones de imágenes usan 1 doc/request para no superar
// el límite de Cloudflare (~10MB por response).
// El backend devuelve recommended_page_size en /count.
const DEFAULT_PAGE_SIZE = 50;
const IMAGE_PAGE_SIZE   = 1;

// Pausa entre requests (ms). Para imágenes es mayor porque cada doc es pesado
// y el servidor necesita liberar RAM antes del siguiente.
const DEFAULT_DELAY = 300;
const IMAGE_DELAY   = 800;

const IMAGE_COLLECTIONS = new Set(["delivery_images","pickup_images","weight_images"]);

const ALL_COLLECTIONS = [
  "ai_command_logs","ai_daily_summaries","ai_operator_sessions","ai_pending_actions",
  "audit_log","audit_logs","blog_categories","blog_posts","carts","catalog",
  "customer_preferences","customer_surveys","customers","delivery_images",
  "delivery_zones","email_verifications","eventos_automation","expenses",
  "feedback_ia","files","finances","geocode_cache","importaciones_legacy",
  "inventory","leads","machine_income","machines","membership_plans",
  "membership_section","membership_signups","memberships","notification_dedupe",
  "notification_logs","notification_openapi","notification_queue",
  "notification_templates","notifications","ocr_logs","orders","password_resets",
  "patrones_detectados","payment_transactions","payment_validations",
  "pending_registrations","pickup_images","preferences","products","propuestas_ia",
  "purchase_orders","quotes","reglas_negocio","services","services_page_config",
  "stock_movements","store_orders","stripe_products","stripe_sync_log","suppliers",
  "survey_responses","tickets","users","vehicles","voice_assistant_sessions",
  "weight_images",
];

// ── helpers ────────────────────────────────────────────────────────────────
const Spinner = ({ cls = "h-4 w-4 mr-2" }) => (
  <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
  </svg>
);

function fmtBytes(b) {
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(2)} MB`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _triggerDownload(content, filename, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function _blobDownload(data, filename, mime = "application/zip") {
  _triggerDownload(new Blob([data], { type: mime }), filename, mime);
}

// ══════════════════════════════════════════════════════════════════════════
//  Hook: descarga paginada adaptativa
//
//  Algoritmo:
//  1. GET /count → obtiene total Y page_size recomendado (1 para imágenes)
//  2. Loop por páginas:
//     a. GET /stream?page=N&size=PAGE_SIZE
//     b. Mide el tamaño real de la respuesta en bytes
//     c. Si la respuesta > 8MB → reduce page_size a la mitad automáticamente
//     d. Si la respuesta < 1MB y page_size < max → intenta aumentar
//     e. Acumula docs en bufferRef
//     f. Espera DELAY_MS (más si es imagen)
//  3. Al terminar: serializa buffer → descarga JSON
// ══════════════════════════════════════════════════════════════════════════
function usePagedDownload() {
  const INIT = {
    status: "idle", collection: "", page: 0, totalPages: 0,
    downloaded: 0, total: 0, pct: 0, bytesEst: 0,
    currentPageSize: DEFAULT_PAGE_SIZE, error: "",
  };
  const [state, setState] = useState(INIT);

  const pauseRef  = useRef(false);
  const cancelRef = useRef(false);
  const bufferRef = useRef([]);

  const set = useCallback((patch) => setState(prev => ({ ...prev, ...patch })), []);

  const reset = useCallback(() => {
    pauseRef.current  = false;
    cancelRef.current = false;
    bufferRef.current = [];
    setState(INIT);
  }, []);

  const pause  = () => { pauseRef.current = true;  set({ status: "paused" }); };
  const resume = () => { pauseRef.current = false; set({ status: "downloading" }); };
  const cancel = () => { cancelRef.current = true; reset(); };

  const start = useCallback(async (colName) => {
    reset();
    set({ status: "counting", collection: colName });

    try {
      // ── 1. Contar y obtener page_size recomendado ──────────────────
      const countRes = await axios.get(`${API}/admin/backup/stream/${colName}/count`);
      const { total, recommended_page_size, has_images } = countRes.data;

      if (total === 0) {
        _triggerDownload("[]", `${colName}.json`);
        set({ status: "done", total: 0, pct: 100 });
        return;
      }

      // Usar page_size recomendado por el backend
      let pageSize  = recommended_page_size ?? (has_images ? IMAGE_PAGE_SIZE : DEFAULT_PAGE_SIZE);
      const delay   = has_images ? IMAGE_DELAY : DEFAULT_DELAY;
      const maxSize = has_images ? IMAGE_PAGE_SIZE : DEFAULT_PAGE_SIZE;

      set({ status: "downloading", total, currentPageSize: pageSize });
      bufferRef.current = [];

      let page     = 0;
      let fetched  = 0;
      let bytesEst = 0;

      // ── 2. Descargar página por página ──────────────────────────────
      while (fetched < total) {
        if (cancelRef.current) return;

        while (pauseRef.current) {
          await sleep(300);
          if (cancelRef.current) return;
        }

        let res;
        try {
          res = await axios.get(`${API}/admin/backup/stream/${colName}`, {
            params: { page, size: pageSize },
          });
        } catch (err) {
          // Si Cloudflare corta la conexión, reducir page_size y reintentar
          if (err.response?.status >= 500 || !err.response) {
            if (pageSize > 1) {
              pageSize = Math.max(1, Math.floor(pageSize / 2));
              set({ currentPageSize: pageSize });
              toast.warning(`Respuesta muy grande — reduciendo a ${pageSize} doc(s)/request`);
              await sleep(1000);
              continue; // reintentar misma página con page_size menor
            }
            throw err;
          }
          throw err;
        }

        const { docs, count } = res.data;
        if (!docs || count === 0) break;

        // Medir tamaño real de la respuesta
        const responseSize = JSON.stringify(res.data).length;
        bytesEst += responseSize;

        // Ajuste dinámico de page_size basado en tamaño real
        if (responseSize > 8_000_000 && pageSize > 1) {
          // Respuesta > 8MB → reducir a la mitad
          pageSize = Math.max(1, Math.floor(pageSize / 2));
          set({ currentPageSize: pageSize });
          toast.warning(`Documentos muy pesados — ajustando a ${pageSize} doc(s)/request`);
        } else if (responseSize < 500_000 && pageSize < maxSize) {
          // Respuesta < 500KB → podemos aumentar un poco
          pageSize = Math.min(maxSize, pageSize + 5);
          set({ currentPageSize: pageSize });
        }

        bufferRef.current.push(...docs);
        fetched += count;
        page++;

        set({
          page,
          downloaded: fetched,
          pct: (fetched / total) * 95,
          bytesEst,
          currentPageSize: pageSize,
        });

        // Pausa — el servidor libera RAM aquí
        await sleep(delay);
      }

      if (cancelRef.current) return;

      // ── 3. Escribir archivo ──────────────────────────────────────────
      set({ status: "writing", pct: 97 });
      await sleep(50);

      const json = JSON.stringify(bufferRef.current, null, 2);
      _triggerDownload(json, `${colName}.json`);

      bufferRef.current = []; // liberar memoria del navegador
      set({ status: "done", pct: 100 });

    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Error desconocido";
      set({ status: "error", error: msg });
      toast.error(`Error descargando ${colName}: ${msg}`);
    }
  }, [reset, set]);

  return { start, pause, resume, cancel, reset, state };
}


// ══════════════════════════════════════════════════════════════════════════
//  Hook: restore en chunks para archivos grandes
//
//  Flujo:
//  1. El usuario selecciona un .json o .jsonl local
//  2. El hook lo lee con FileReader
//  3. Lo parte en trozos de DOCS_PER_CHUNK documentos
//  4. Sube cada trozo al backend con /chunk?chunk_index=N&total_chunks=T
//     - chunk 0: append=false (borra la colección primero)
//     - chunk 1+: append=true (agrega sin borrar)
//  5. Pausa CHUNK_DELAY ms entre cada chunk para no saturar
//
//  Ventaja: nunca se sube más de ~1-2MB por request → Cloudflare no corta
// ══════════════════════════════════════════════════════════════════════════
const DOCS_PER_CHUNK = 25;   // docs por chunk — ajustar si hay imágenes base64
const CHUNK_DELAY    = 600;  // ms entre chunks — el servidor descansa aquí

function useChunkedRestore() {
  const INIT = {
    status: "idle",   // idle | reading | uploading | done | error | paused
    collection: "",
    chunk: 0,
    totalChunks: 0,
    inserted: 0,
    totalDocs: 0,
    pct: 0,
    error: "",
  };
  const [state, setState] = useState(INIT);
  const pauseRef  = useRef(false);
  const cancelRef = useRef(false);
  const set = useCallback((p) => setState(prev => ({ ...prev, ...p })), []);

  const reset = useCallback(() => {
    pauseRef.current  = false;
    cancelRef.current = false;
    setState(INIT);
  }, []);

  const pause  = () => { pauseRef.current = true;  set({ status: "paused" }); };
  const resume = () => { pauseRef.current = false; set({ status: "uploading" }); };
  const cancel = () => { cancelRef.current = true; reset(); };

  const start = useCallback(async (colName, file) => {
    reset();
    set({ status: "reading", collection: colName });

    // 1. Leer el archivo localmente
    let allDocs;
    try {
      const text = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result);
        reader.onerror = () => rej(new Error("Error leyendo el archivo"));
        reader.readAsText(file, "utf-8");
      });

      // Detectar JSON array o JSONL
      const trimmed = text.trim();
      if (trimmed.startsWith("[")) {
        allDocs = JSON.parse(trimmed);
        if (!Array.isArray(allDocs)) allDocs = [allDocs];
      } else {
        allDocs = [];
        for (const line of trimmed.split("\n")) {
          const l = line.trim();
          if (!l) continue;
          try { allDocs.push(JSON.parse(l)); } catch {}
        }
      }
    } catch (err) {
      set({ status: "error", error: `Error al leer el archivo: ${err.message}` });
      toast.error(`No se pudo leer el archivo: ${err.message}`);
      return;
    }

    if (allDocs.length === 0) {
      set({ status: "error", error: "El archivo está vacío o no tiene documentos válidos" });
      toast.error("El archivo no tiene documentos válidos");
      return;
    }

    // 2. Dividir en chunks
    const chunks = [];
    for (let i = 0; i < allDocs.length; i += DOCS_PER_CHUNK) {
      chunks.push(allDocs.slice(i, i + DOCS_PER_CHUNK));
    }
    const totalChunks = chunks.length;
    const totalDocs   = allDocs.length;

    set({ status: "uploading", totalChunks, totalDocs });

    let totalInserted = 0;

    // 3. Subir chunk por chunk
    for (let ci = 0; ci < totalChunks; ci++) {
      if (cancelRef.current) return;

      while (pauseRef.current) {
        await sleep(300);
        if (cancelRef.current) return;
      }

      const chunk   = chunks[ci];
      const isFirst = ci === 0;
      const blob    = new Blob([JSON.stringify(chunk)], { type: "application/json" });
      const fd      = new FormData();
      fd.append("file", blob, `${colName}_chunk_${ci}.json`);

      try {
        const res = await axios.post(
          `${API}/admin/restore/jsonl/${colName}/chunk`,
          fd,
          {
            params: {
              chunk_index:  ci,
              total_chunks: totalChunks,
              append:       !isFirst,
            },
            headers: { "Content-Type": "multipart/form-data" },
          }
        );
        totalInserted += res.data.inserted_count ?? 0;
      } catch (err) {
        const msg = err?.response?.data?.detail || err.message || "Error desconocido";
        set({ status: "error", error: `Chunk ${ci}/${totalChunks}: ${msg}` });
        toast.error(`Error en chunk ${ci}: ${msg}`);
        return;
      }

      set({
        chunk: ci + 1,
        inserted: totalInserted,
        pct: ((ci + 1) / totalChunks) * 100,
      });

      // Pausa entre chunks — el servidor libera RAM aquí
      if (ci < totalChunks - 1) {
        await sleep(CHUNK_DELAY);
      }
    }

    set({ status: "done", pct: 100, inserted: totalInserted });
    toast.success(`✅ ${colName}: ${totalInserted.toLocaleString()} documentos restaurados`);
  }, [reset, set]);

  return { start, pause, resume, cancel, reset, state };
}


// ══════════════════════════════════════════════════════════════════════════
//  Hook: restore documento por documento (máxima seguridad)
//
//  Flujo:
//  1. El usuario selecciona un .json o .jsonl local
//  2. El hook lo lee con FileReader y lo parsea a un array de docs
//  3. DELETE /clear → vacía la colección UNA sola vez
//  4. Loop: POST /single con UN documento por request
//     - Si un doc falla, se cuenta como "failed" y se sigue con el siguiente
//       (no se aborta todo el restore por un solo doc corrupto)
//  5. Pausa SINGLE_DOC_DELAY ms entre cada documento
//
//  Ventaja: el servidor NUNCA tiene más de 1 documento en RAM durante
//  el restore. Es la opción más lenta pero la más segura para
//  colecciones enormes o con documentos muy pesados (imágenes base64).
// ══════════════════════════════════════════════════════════════════════════
const SINGLE_DOC_DELAY = 150; // ms entre cada documento

function useSingleDocRestore() {
  const INIT = {
    status: "idle", // idle | reading | clearing | uploading | done | error | paused
    collection: "",
    index: 0,
    total: 0,
    inserted: 0,
    failed: 0,
    pct: 0,
    error: "",
  };
  const [state, setState] = useState(INIT);
  const pauseRef  = useRef(false);
  const cancelRef = useRef(false);
  const set = useCallback((p) => setState(prev => ({ ...prev, ...p })), []);

  const reset = useCallback(() => {
    pauseRef.current  = false;
    cancelRef.current = false;
    setState(INIT);
  }, []);

  const pause  = () => { pauseRef.current = true;  set({ status: "paused" }); };
  const resume = () => { pauseRef.current = false; set({ status: "uploading" }); };
  const cancel = () => { cancelRef.current = true; reset(); };

  const start = useCallback(async (colName, file) => {
    reset();
    set({ status: "reading", collection: colName });

    // 1. Leer el archivo localmente
    let allDocs;
    try {
      const text = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result);
        reader.onerror = () => rej(new Error("Error leyendo el archivo"));
        reader.readAsText(file, "utf-8");
      });

      // Detectar JSON array o JSONL
      const trimmed = text.trim();
      if (trimmed.startsWith("[")) {
        allDocs = JSON.parse(trimmed);
        if (!Array.isArray(allDocs)) allDocs = [allDocs];
      } else {
        allDocs = [];
        for (const line of trimmed.split("\n")) {
          const l = line.trim();
          if (!l) continue;
          try { allDocs.push(JSON.parse(l)); } catch {}
        }
      }
    } catch (err) {
      set({ status: "error", error: `Error al leer el archivo: ${err.message}` });
      toast.error(`No se pudo leer el archivo: ${err.message}`);
      return;
    }

    if (!allDocs || allDocs.length === 0) {
      set({ status: "error", error: "El archivo está vacío o no tiene documentos válidos" });
      toast.error("El archivo no tiene documentos válidos");
      return;
    }

    const total = allDocs.length;
    set({ status: "clearing", total });

    // 2. Vaciar la colección UNA sola vez antes de empezar
    try {
      await axios.delete(`${API}/admin/restore/jsonl/${colName}/clear`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Error desconocido";
      set({ status: "error", error: `Error al vaciar la colección: ${msg}` });
      toast.error(`Error al vaciar ${colName}: ${msg}`);
      return;
    }

    set({ status: "uploading" });

    let inserted = 0;
    let failed   = 0;

    // 3. Insertar documento por documento
    for (let i = 0; i < total; i++) {
      if (cancelRef.current) return;

      while (pauseRef.current) {
        await sleep(300);
        if (cancelRef.current) return;
      }

      try {
        await axios.post(
          `${API}/admin/restore/jsonl/${colName}/single`,
          allDocs[i],
          { headers: { "Content-Type": "application/json" } }
        );
        inserted++;
      } catch {
        // Un doc corrupto/duplicado no debe abortar todo el restore
        failed++;
      }

      set({
        index: i + 1,
        inserted,
        failed,
        pct: ((i + 1) / total) * 100,
      });

      // Pausa entre documentos — el servidor libera RAM aquí
      if (i < total - 1) {
        await sleep(SINGLE_DOC_DELAY);
      }
    }

    set({ status: "done", pct: 100, inserted, failed });
    toast.success(
      failed > 0
        ? `⚠️ ${colName}: ${inserted.toLocaleString()} insertados, ${failed} fallidos`
        : `✅ ${colName}: ${inserted.toLocaleString()} documentos restaurados`
    );
  }, [reset, set]);

  return { start, pause, resume, cancel, reset, state };
}

// ══════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { t } = useLocale();

  const [notifSettings, setNotifSettings] = useState(null);
  const [loadingNotif, setLoadingNotif]   = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [sending, setSending]     = useState(false);

  const [rulesText, setRulesText]       = useState("");
  const [loadingRules, setLoadingRules] = useState(true);
  const [savingRules, setSavingRules]   = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rulesForm, setRulesForm] = useState({
    sla_pickup_delivery:"", sla_wash_fold:"", sla_self_service:"",
    notify_pickup_delivery:"out_for_delivery", notify_wash_fold:"ready", notify_self_service:"ready",
  });

  const [backupLoading, setBackupLoading] = useState(false);
  const [backupFormat, setBackupFormat]   = useState("json");
  const [showPaged, setShowPaged]         = useState(true);
  const [selectedCol, setSelectedCol]     = useState("customers");
  const dl = usePagedDownload();
  const cr = useChunkedRestore();     // restore en chunks para archivos grandes
  const sd = useSingleDocRestore();   // restore doc por doc — máxima seguridad

  const [restoreLoading, setRestoreLoading]   = useState(false);
  const [restoreZipFile, setRestoreZipFile]   = useState(null);
  const [selCsvCol, setSelCsvCol]             = useState("customers");
  const [restoreCsvFile, setRestoreCsvFile]   = useState(null);
  const [selJsonlCol, setSelJsonlCol]         = useState("customers");
  const [restoreJsonlFile, setRestoreJsonlFile]   = useState(null);
  const [restoreZipJsonl, setRestoreZipJsonl]     = useState(null);
  const [selSingleCol, setSelSingleCol]           = useState("customers");
  const [restoreSingleFile, setRestoreSingleFile] = useState(null);
  const [restoreErrors, setRestoreErrors]         = useState([]);
  const [showRestoreErrors, setShowRestoreErrors] = useState(false);
  const [invalidLines, setInvalidLines]           = useState({});

  useEffect(() => { fetchSettings(); fetchRules(); }, []);

  const fetchSettings = async () => {
    try { const r = await axios.get(`${API}/settings/notifications`); setNotifSettings(r.data); }
    catch {}
    finally { setLoadingNotif(false); }
  };

  const fetchRules = async () => {
    try {
      const r  = await axios.get(`${API}/settings/rules`);
      setRulesText(JSON.stringify(r.data, null, 2));
      const sl = r.data?.sla_hours || {};
      const tr = r.data?.auto_transitions || {};
      setRulesForm({
        sla_pickup_delivery: sl.pickup_delivery ?? "",
        sla_wash_fold:       sl.wash_fold ?? "",
        sla_self_service:    sl.self_service ?? "",
        notify_pickup_delivery: tr.pickup_delivery?.notify_status || "out_for_delivery",
        notify_wash_fold:       tr.wash_fold?.notify_status || "ready",
        notify_self_service:    tr.self_service?.notify_status || "ready",
      });
    } catch { toast.error(t("Error loading business rules","Error cargando reglas de negocio")); }
    finally { setLoadingRules(false); }
  };

  const handleSaveRules = async () => {
    const payload = {
      id:"order_rules_v1", type:"order_rules",
      sla_hours: {
        pickup_delivery: Number(rulesForm.sla_pickup_delivery)||0,
        wash_fold:       Number(rulesForm.sla_wash_fold)||0,
        self_service:    Number(rulesForm.sla_self_service)||0,
      },
      auto_transitions: {
        pickup_delivery: { notify_status: rulesForm.notify_pickup_delivery },
        wash_fold:       { notify_status: rulesForm.notify_wash_fold },
        self_service:    { notify_status: rulesForm.notify_self_service },
      },
    };
    setRulesText(JSON.stringify(payload, null,2));
    setSavingRules(true);
    try {
      await axios.put(`${API}/settings/rules`, { rules: payload });
      toast.success(t("Rules updated","Reglas actualizadas"));
    } catch(err) {
      toast.error(err.response?.data?.detail || t("Error saving rules","Error guardando reglas"));
    } finally { setSavingRules(false); }
  };

  const slaInvalid = ["sla_pickup_delivery","sla_wash_fold","sla_self_service"]
    .some(k => Number(rulesForm[k]) <= 0);

  const handleExport = async (type) => {
    try {
      const res = await axios.get(`${API}/export/${type}`, { responseType:"blob" });
      _blobDownload(res.data, `${type}.csv`, "text/csv");
      toast.success(`${type}.csv descargado`);
    } catch { toast.error(`Error exportando ${type}`); }
  };

  const handleFullBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.get(`${API}/admin/backup`,
        { params:{ format: backupFormat }, responseType:"blob" });
      const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
      _blobDownload(res.data, `vfl_backup_${backupFormat}_${ts}.zip`, "application/zip");
      toast.success("Respaldo descargado");
    } catch(err) {
      toast.error(err.response?.status===403
        ? "Solo administradores"
        : "Error — usa la descarga paginada para colecciones grandes");
    } finally { setBackupLoading(false); }
  };

  const resetRestore = () => { setRestoreErrors([]); setShowRestoreErrors(false); setInvalidLines({}); };

  const doRestore = async (url, body) => {
    setRestoreLoading(true); resetRestore();
    try {
      const res = await axios.post(url, body, { headers:{"Content-Type":"multipart/form-data"} });
      return res.data;
    } catch(err) {
      toast.error(err.response?.data?.detail || "Error al restaurar");
      return null;
    } finally { setRestoreLoading(false); }
  };

  const handleRestoreZip = async () => {
    if (!restoreZipFile) return toast.error("Selecciona un ZIP");
    if (!window.confirm("ADVERTENCIA: Sobrescribirá TODOS los datos. ¿Continuar?")) return;
    const fd = new FormData(); fd.append("file", restoreZipFile);
    const res = await doRestore(`${API}/admin/restore`, fd);
    if (!res) return;
    const inv = Object.values(res.invalid_lines||{}).reduce((a,b)=>a+b,0);
    toast.success(`Restaurados ${res.total_restored} docs (${inv} omitidos)`);
    setInvalidLines(res.invalid_lines||{});
    if (res.errors?.length) { setRestoreErrors(res.errors); setShowRestoreErrors(true); }
    setRestoreZipFile(null);
  };

  const handleRestoreCsv = async () => {
    if (!restoreCsvFile) return toast.error("Selecciona un CSV");
    if (!window.confirm(`Sobrescribirá ${selCsvCol}. ¿Continuar?`)) return;
    const fd = new FormData(); fd.append("file", restoreCsvFile);
    const res = await doRestore(`${API}/admin/restore/csv/${selCsvCol}`, fd);
    if (res) { toast.success(`${res.inserted_count} registros restaurados en ${selCsvCol}`); setRestoreCsvFile(null); }
  };

  const handleRestoreJsonl = async () => {
    if (!restoreJsonlFile) return toast.error("Selecciona un JSONL/JSON");
    if (!window.confirm(`Sobrescribirá ${selJsonlCol}. ¿Continuar?`)) return;
    // Usar restore en chunks para no saturar el servidor con archivos grandes
    cr.reset();
    await cr.start(selJsonlCol, restoreJsonlFile);
    setRestoreJsonlFile(null);
  };

  const handleRestoreZipJsonl = async () => {
    if (!restoreZipJsonl) return toast.error("Selecciona un ZIP");
    if (!window.confirm("Sobrescribirá las colecciones del ZIP. ¿Continuar?")) return;
    const fd = new FormData(); fd.append("file", restoreZipJsonl);
    const res = await doRestore(`${API}/admin/restore/jsonl-zip`, fd);
    if (!res) return;
    const inv = Object.values(res.invalid_lines||{}).reduce((a,b)=>a+b,0);
    toast.success(`Restaurados ${res.total_restored} docs (${inv} omitidos)`);
    setInvalidLines(res.invalid_lines||{}); setRestoreZipJsonl(null);
    if (res.errors?.length) { setRestoreErrors(res.errors); setShowRestoreErrors(true); }
  };

  const handleRestoreSingle = async () => {
    if (!restoreSingleFile) return toast.error("Selecciona un archivo JSON/JSONL");
    if (!window.confirm(`Sobrescribirá ${selSingleCol} documento por documento. ¿Continuar?`)) return;
    sd.reset();
    await sd.start(selSingleCol, restoreSingleFile);
    setRestoreSingleFile(null);
  };

  const handleTestEmail = async () => {
    if (!testEmail) return; setSending(true);
    try {
      const r = await axios.post(`${API}/test/email`, null, { params:{ to_email: testEmail } });
      r.data.status==="success" ? toast.success("Email enviado") : toast.error(r.data.message);
    } catch(err) { toast.error(err.response?.data?.detail||"Error"); }
    finally { setSending(false); }
  };

  const handleTestSMS = async () => {
    if (!testPhone) return; setSending(true);
    try {
      const r = await axios.post(`${API}/test/sms`, null, { params:{ to_phone: testPhone } });
      r.data.status==="success" ? toast.success("SMS enviado") : toast.error(r.data.message);
    } catch(err) { toast.error(err.response?.data?.detail||"Error"); }
    finally { setSending(false); }
  };

  const { status, collection, pct, downloaded, total, bytesEst, currentPageSize, error: dlError } = dl.state;
  const { status: crStatus, chunk: crChunk, totalChunks: crTotal, inserted: crInserted,
          totalDocs: crTotalDocs, pct: crPct, error: crError, collection: crCol } = cr.state;
  const { status: sdStatus, index: sdIndex, total: sdTotal, inserted: sdInserted,
          failed: sdFailed, pct: sdPct, error: sdError, collection: sdCol } = sd.state;
  const crActive = ["reading","uploading","paused"].includes(crStatus);
  const crDone   = crStatus === "done";
  const crErr    = crStatus === "error";
  const sdActive = ["reading","clearing","uploading","paused"].includes(sdStatus);
  const sdDone   = sdStatus === "done";
  const sdErr    = sdStatus === "error";
  const dlActive = ["counting","downloading","writing","paused"].includes(status);
  const dlDone   = status === "done";
  const dlErr    = status === "error";
  const isImgCol = IMAGE_COLLECTIONS.has(selectedCol);

  // ── barra de progreso inline ───────────────────────────────────────────
  const ProgressBar = ({ value, label, sub }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span><span>{Math.round(value)}%</span>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width:`${Math.min(value,100)}%`, background: isImgCol ? "#f59e0b" : "#10b981" }}/>
      </div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <div data-testid="settings-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("Settings","Configuración")}</h1>
        <p className="text-slate-500 mt-1">{t("Notifications and data export","Notificaciones y exportación de datos")}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* ── Notificaciones ──────────────────────────────────────────── */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-sky-600"/>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Notifications","Notificaciones")}</h2>
              <p className="text-sm text-slate-500">{t("Notification services status","Estado de los servicios")}</p>
            </div>
          </div>
          {loadingNotif ? (
            <div className="animate-pulse space-y-4">
              <div className="h-16 bg-slate-100 rounded-lg"/>
              <div className="h-16 bg-slate-100 rounded-lg"/>
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { key:"email_enabled", Icon:Mail,          label:"Email (Resend)", sub:t("Email notifications","Notificaciones por correo") },
                { key:"sms_enabled",   Icon:MessageSquare, label:"SMS (Twilio)",   sub:t("SMS notifications","Notificaciones por SMS") },
              ].map(({ key, Icon, label, sub }) => (
                <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-slate-600"/>
                    <div><p className="font-medium text-slate-900">{label}</p><p className="text-xs text-slate-500">{sub}</p></div>
                  </div>
                  {notifSettings?.[key]
                    ? <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-5 w-5"/><span className="text-sm font-medium">{t("Active","Activo")}</span></div>
                    : <div className="flex items-center gap-2 text-slate-400"><XCircle className="h-5 w-5"/><span className="text-sm font-medium">{t("Not configured","No configurado")}</span></div>
                  }
                </div>
              ))}
              {notifSettings?.email_enabled && (
                <div className="pt-4 border-t">
                  <Label>{t("Test Email","Probar Email")}</Label>
                  <div className="flex gap-2 mt-2">
                    <Input type="email" placeholder="email@example.com" value={testEmail} onChange={e=>setTestEmail(e.target.value)} className="flex-1"/>
                    <Button onClick={handleTestEmail} disabled={!testEmail||sending} className="btn-primary"><Send className="h-4 w-4"/></Button>
                  </div>
                </div>
              )}
              {notifSettings?.sms_enabled && (
                <div className="pt-4 border-t">
                  <Label>{t("Test SMS","Probar SMS")}</Label>
                  <div className="flex gap-2 mt-2">
                    <Input type="tel" placeholder="+1234567890" value={testPhone} onChange={e=>setTestPhone(e.target.value)} className="flex-1"/>
                    <Button onClick={handleTestSMS} disabled={!testPhone||sending} className="btn-primary"><Send className="h-4 w-4"/></Button>
                  </div>
                </div>
              )}
              {!notifSettings?.email_enabled && !notifSettings?.sms_enabled && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-800">
                    <strong>{t("To activate:","Para activar:")}</strong>{" "}
                    {t("Configure RESEND_API_KEY and/or TWILIO_* in .env","Configura RESEND_API_KEY y/o TWILIO_* en el .env del backend.")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Export ──────────────────────────────────────────────────── */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Download className="h-5 w-5 text-emerald-600"/>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Export Data","Exportar Datos")}</h2>
              <p className="text-sm text-slate-500">{t("Download without saturating the server","Descarga sin saturar el servidor")}</p>
            </div>
          </div>

          {/* ── DESCARGA PAGINADA ADAPTATIVA ──────────────────────── */}
          <div className="mb-4 rounded-xl border-2 border-emerald-300 overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              onClick={() => setShowPaged(p=>!p)}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="h-4 w-4 text-white"/>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900 text-sm">
                    ✅ {t("Adaptive Paged Download","Descarga paginada adaptativa")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t(
                      "Auto-adjusts docs/request to avoid Cloudflare limits. 1 doc/req for images.",
                      "Ajusta docs/request automáticamente. 1 doc/req para imágenes base64."
                    )}
                  </div>
                </div>
              </div>
              {showPaged ? <ChevronUp className="h-4 w-4 text-slate-400"/> : <ChevronDown className="h-4 w-4 text-slate-400"/>}
            </button>

            {showPaged && (
              <div className="p-4 space-y-4 border-t border-emerald-200 bg-white">

                {/* Selector de colección */}
                <div>
                  <Label>{t("Collection","Colección")}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm mt-1"
                    value={selectedCol}
                    onChange={e => { setSelectedCol(e.target.value); dl.reset(); }}
                    disabled={dlActive}
                  >
                    {ALL_COLLECTIONS.map(col => (
                      <option key={col} value={col}>
                        {col}{IMAGE_COLLECTIONS.has(col) ? " 📷 (imágenes — 1 doc/req)" : ""}
                      </option>
                    ))}
                  </select>

                  {/* Info según tipo de colección */}
                  {isImgCol ? (
                    <div className="mt-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1">
                      <p>⚠️ <strong>{t("Image collection","Colección de imágenes")}</strong></p>
                      <p>• {t("Each document contains a large base64 image","Cada documento contiene una imagen base64 grande")}</p>
                      <p>• {t("Will download 1 document at a time with 800ms pause","Descarga 1 documento a la vez con pausa de 800ms")}</p>
                      <p>• {t("This may take a long time but won't crash the server","Puede tardar mucho pero no saturará el servidor")}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      {t("Normal collection — starts at 50 docs/request","Colección normal — inicia en 50 docs/request")}
                    </p>
                  )}
                </div>

                {/* Progreso activo */}
                {dlActive && (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <ProgressBar
                      value={pct}
                      label={
                        status==="counting" ? `Contando documentos en ${collection}…` :
                        status==="writing"  ? "Escribiendo archivo…" :
                        status==="paused"   ? `⏸ Pausado — ${downloaded.toLocaleString()} / ${total.toLocaleString()} docs` :
                        `Descargando ${collection}…`
                      }
                      sub={
                        (status==="downloading" || status==="paused")
                          ? `${downloaded.toLocaleString()} / ${total.toLocaleString()} docs · ${fmtBytes(bytesEst)} · ${currentPageSize} doc(s)/request`
                          : undefined
                      }
                    />
                    <div className="flex gap-2">
                      {status==="paused"
                        ? <Button size="sm" variant="outline" onClick={dl.resume}><Play className="h-3 w-3 mr-1"/>Reanudar</Button>
                        : <Button size="sm" variant="outline" onClick={dl.pause}><Pause className="h-3 w-3 mr-1"/>Pausar</Button>
                      }
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={dl.cancel}>
                        <X className="h-3 w-3 mr-1"/>Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Completado */}
                {dlDone && (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3 text-emerald-700 text-sm">
                    <CheckCircle2 className="h-5 w-5 shrink-0"/>
                    <div>
                      <span className="font-semibold">{collection}.json</span> — <span className="font-semibold">{total.toLocaleString()}</span> docs · {fmtBytes(bytesEst)}
                    </div>
                    <button className="ml-auto text-xs underline text-slate-500" onClick={dl.reset}>Limpiar</button>
                  </div>
                )}

                {/* Error */}
                {dlErr && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 shrink-0"/>
                    <div><span className="font-semibold">Error:</span> {dlError}</div>
                    <button className="ml-auto" onClick={dl.reset}><RotateCcw className="h-4 w-4"/></button>
                  </div>
                )}

                {/* Botón iniciar */}
                {!dlActive && !dlDone && !dlErr && (
                  <Button
                    onClick={() => dl.start(selectedCol)}
                    className={`w-full font-semibold text-white ${isImgCol ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  >
                    <Download className="h-4 w-4 mr-2"/>
                    {t("Download","Descargar")} {selectedCol}.json
                    {isImgCol && <span className="ml-2 text-xs opacity-80">({t("slow — images","lento — imágenes")})</span>}
                  </Button>
                )}

                {/* Hint restaurar */}
                <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
                  💡 mongoimport --uri=$MONGO_URL --db=$DB_NAME --collection={selectedCol} --file={selectedCol}.json --jsonArray
                </div>
              </div>
            )}
          </div>

          {/* ZIP clásico */}
          <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <Download className="h-4 w-4 text-white"/>
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{t("Full Backup ZIP","Respaldo completo ZIP")}</div>
                <div className="text-xs text-red-500 font-medium">{t("⚠ Only for small databases","⚠ Solo para BD pequeñas — puede fallar en BD grandes")}</div>
              </div>
            </div>
            <select className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={backupFormat} onChange={e=>setBackupFormat(e.target.value)} disabled={backupLoading}>
              <option value="json">JSON (--jsonArray)</option>
              <option value="jsonl">JSONL</option>
            </select>
            <Button onClick={handleFullBackup} disabled={backupLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
              {backupLoading ? <><Spinner/>Generando…</> : <><Download className="h-4 w-4 mr-2"/>Descargar ZIP completo</>}
            </Button>
          </div>

          {/* CSV exports */}
          <div className="space-y-3">
            {[
              { key:"customers", label:t("Export Customers","Exportar Clientes"), Icon:Users },
              { key:"orders",    label:t("Export Orders","Exportar Órdenes"),     Icon:ShoppingBag },
              { key:"quotes",    label:t("Export Quotes","Exportar Cotizaciones"),Icon:FileText },
              { key:"leads",     label:t("Export Leads","Exportar Leads"),        Icon:UserPlus },
              { key:"tickets",   label:t("Export Tickets","Exportar Tickets"),    Icon:HeadphonesIcon },
            ].map(({ key, label, Icon }) => (
              <Button key={key} variant="outline" className="w-full justify-between h-14" onClick={() => handleExport(key)}>
                <div className="flex items-center gap-3"><Icon className="h-5 w-5 text-slate-500"/><span>{label}</span></div>
                <Download className="h-4 w-4 text-slate-400"/>
              </Button>
            ))}
          </div>
        </div>

        {/* ── Restore ─────────────────────────────────────────────────── */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Upload className="h-5 w-5 text-amber-600"/>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Restore Data","Restaurar Datos")}</h2>
              <p className="text-sm text-slate-500">{t("Restore from backup or CSV","Restaurar desde respaldo o CSV")}</p>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-red-50 to-amber-50 border border-red-200 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center shrink-0"><AlertTriangle className="h-4 w-4 text-white"/></div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{t("Full Database Restore","Restaurar base de datos completa")}</div>
                <div className="text-xs text-red-600 font-medium">{t("WARNING: Overwrites ALL data!","ADVERTENCIA: Sobrescribirá TODOS los datos!")}</div>
              </div>
            </div>
            <Input type="file" accept=".zip" onChange={e=>setRestoreZipFile(e.target.files?.[0]||null)} disabled={restoreLoading}/>
            {restoreZipFile && <p className="text-xs text-slate-500">{restoreZipFile.name}</p>}
            <Button onClick={handleRestoreZip} disabled={!restoreZipFile||restoreLoading} className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold">
              {restoreLoading ? <><Spinner/>Restaurando…</> : <><Upload className="h-4 w-4 mr-2"/>Restaurar base de datos</>}
            </Button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 mb-4 space-y-3">
            <div className="font-semibold text-slate-900 text-sm">{t("Restore Collection (CSV)","Restaurar colección (CSV)")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Collection","Colección")}</Label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm mt-1" value={selCsvCol} onChange={e=>setSelCsvCol(e.target.value)} disabled={restoreLoading}>
                  {["customers","orders","leads","quotes","tickets","products","memberships","expenses"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>{t("CSV File","Archivo CSV")}</Label>
                <Input type="file" accept=".csv" className="mt-1" onChange={e=>setRestoreCsvFile(e.target.files?.[0]||null)} disabled={restoreLoading}/>
              </div>
            </div>
            {restoreCsvFile && <p className="text-xs text-slate-500">{restoreCsvFile.name}</p>}
            <Button onClick={handleRestoreCsv} disabled={!restoreCsvFile||restoreLoading} variant="outline" className="w-full">
              {restoreLoading ? <><Spinner/>Restaurando…</> : <><Upload className="h-4 w-4 mr-2"/>Restaurar colección</>}
            </Button>
          </div>

          <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50 mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <Upload className="h-4 w-4 text-white"/>
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">
                  ✅ {t("Restore Collection (JSONL/JSON) — Chunked","Restaurar colección (JSONL/JSON) — por chunks")}
                </div>
                <div className="text-xs text-slate-500">
                  {t("Reads file locally, sends 25 docs at a time. Never crashes on large files.",
                     "Lee el archivo local, sube 25 docs a la vez. No falla con archivos grandes.")}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Collection","Colección")}</Label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm mt-1"
                  value={selJsonlCol} onChange={e=>setSelJsonlCol(e.target.value)} disabled={crActive}>
                  {ALL_COLLECTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>{t("JSON / JSONL File","Archivo JSON / JSONL")}</Label>
                <Input type="file" accept=".jsonl,.json" className="mt-1"
                  onChange={e=>setRestoreJsonlFile(e.target.files?.[0]||null)} disabled={crActive}/>
              </div>
            </div>
            {restoreJsonlFile && !crActive && !crDone && !crErr && (
              <p className="text-xs text-slate-500">{restoreJsonlFile.name}</p>
            )}

            {/* Progreso chunks */}
            {crActive && (
              <div className="space-y-2 p-3 bg-white rounded-xl border border-blue-200">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{crStatus === "reading" ? `Leyendo ${crCol}…` : `Subiendo ${crCol} — chunk ${crChunk}/${crTotal}`}</span>
                    <span>{Math.round(crPct)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(crPct, 100)}%` }}/>
                  </div>
                  <div className="text-xs text-slate-400">
                    {crInserted.toLocaleString()} / {crTotalDocs.toLocaleString()} docs · {DOCS_PER_CHUNK} docs/chunk · pausa {CHUNK_DELAY}ms
                  </div>
                </div>
                <div className="flex gap-2">
                  {crStatus === "paused"
                    ? <Button size="sm" variant="outline" onClick={cr.resume}><Play className="h-3 w-3 mr-1"/>Reanudar</Button>
                    : <Button size="sm" variant="outline" onClick={cr.pause}><Pause className="h-3 w-3 mr-1"/>Pausar</Button>
                  }
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={cr.cancel}>
                    <X className="h-3 w-3 mr-1"/>Cancelar
                  </Button>
                </div>
              </div>
            )}

            {crDone && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3 text-emerald-700 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0"/>
                <div><span className="font-semibold">{crCol}</span> — {crInserted.toLocaleString()} docs restaurados</div>
                <button className="ml-auto text-xs underline text-slate-500" onClick={cr.reset}>Limpiar</button>
              </div>
            )}

            {crErr && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0"/>
                <div><span className="font-semibold">Error:</span> {crError}</div>
                <button className="ml-auto" onClick={cr.reset}><RotateCcw className="h-4 w-4"/></button>
              </div>
            )}

            {!crActive && !crDone && !crErr && (
              <Button onClick={handleRestoreJsonl} disabled={!restoreJsonlFile} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                <Upload className="h-4 w-4 mr-2"/>
                {t("Restore in Chunks","Restaurar por chunks")} — {selJsonlCol}
              </Button>
            )}
          </div>

          {/* ✅ Restore documento por documento — máxima seguridad */}
          <div className="p-4 rounded-xl border-2 border-rose-200 bg-rose-50 mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-rose-600 flex items-center justify-center shrink-0">
                <Upload className="h-4 w-4 text-white"/>
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">
                  🐢 {t("Restore Doc-by-Doc — Maximum Safety","Restaurar doc por doc — Máxima seguridad")}
                </div>
                <div className="text-xs text-slate-500">
                  {t(
                    "1 document per request. Slowest but never overloads server RAM. Use for huge or very heavy collections.",
                    "1 documento por request. Lo más lento pero nunca satura la RAM del servidor. Úsalo para colecciones enormes o muy pesadas."
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("Collection","Colección")}</Label>
                <select className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm mt-1"
                  value={selSingleCol} onChange={e=>setSelSingleCol(e.target.value)} disabled={sdActive}>
                  {ALL_COLLECTIONS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>{t("JSON / JSONL File","Archivo JSON / JSONL")}</Label>
                <Input type="file" accept=".jsonl,.json" className="mt-1"
                  onChange={e=>setRestoreSingleFile(e.target.files?.[0]||null)} disabled={sdActive}/>
              </div>
            </div>
            {restoreSingleFile && !sdActive && !sdDone && !sdErr && (
              <p className="text-xs text-slate-500">{restoreSingleFile.name}</p>
            )}

            {/* Progreso doc por doc */}
            {sdActive && (
              <div className="space-y-2 p-3 bg-white rounded-xl border border-rose-200">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>
                    {sdStatus === "reading"  ? `Leyendo ${sdCol}…` :
                     sdStatus === "clearing" ? `Vaciando ${sdCol}…` :
                     sdStatus === "paused"   ? `⏸ Pausado — doc ${sdIndex}/${sdTotal}` :
                     `Insertando ${sdCol} — doc ${sdIndex}/${sdTotal}`}
                  </span>
                  <span>{Math.round(sdPct)}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full transition-all duration-150"
                    style={{ width: `${Math.min(sdPct, 100)}%` }}/>
                </div>
                <div className="text-xs text-slate-400">
                  {sdInserted.toLocaleString()} insertados
                  {sdFailed > 0 && ` · ${sdFailed} fallidos`}
                  {" · "}pausa {SINGLE_DOC_DELAY}ms/doc
                </div>
                <div className="flex gap-2">
                  {sdStatus === "paused"
                    ? <Button size="sm" variant="outline" onClick={sd.resume}><Play className="h-3 w-3 mr-1"/>Reanudar</Button>
                    : <Button size="sm" variant="outline" onClick={sd.pause} disabled={sdStatus==="reading"||sdStatus==="clearing"}><Pause className="h-3 w-3 mr-1"/>Pausar</Button>
                  }
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={sd.cancel}>
                    <X className="h-3 w-3 mr-1"/>Cancelar
                  </Button>
                </div>
              </div>
            )}

            {sdDone && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3 text-emerald-700 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0"/>
                <div>
                  <span className="font-semibold">{sdCol}</span> — {sdInserted.toLocaleString()} insertados
                  {sdFailed > 0 && <span className="text-amber-600"> · {sdFailed} fallidos</span>}
                </div>
                <button className="ml-auto text-xs underline text-slate-500" onClick={sd.reset}>Limpiar</button>
              </div>
            )}

            {sdErr && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0"/>
                <div><span className="font-semibold">Error:</span> {sdError}</div>
                <button className="ml-auto" onClick={sd.reset}><RotateCcw className="h-4 w-4"/></button>
              </div>
            )}

            {!sdActive && !sdDone && !sdErr && (
              <Button onClick={handleRestoreSingle} disabled={!restoreSingleFile} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold">
                <Upload className="h-4 w-4 mr-2"/>
                {t("Restore Doc-by-Doc","Restaurar doc por doc")} — {selSingleCol}
              </Button>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="font-semibold text-slate-900 text-sm">{t("Bulk Restore from ZIP","Restauración masiva desde ZIP")}</div>
            <Input type="file" accept=".zip" onChange={e=>setRestoreZipJsonl(e.target.files?.[0]||null)} disabled={restoreLoading}/>
            {restoreZipJsonl && <p className="text-xs text-slate-500">{restoreZipJsonl.name}</p>}
            <Button onClick={handleRestoreZipJsonl} disabled={!restoreZipJsonl||restoreLoading} variant="outline" className="w-full">
              {restoreLoading ? <><Spinner/>Restaurando…</> : <><Upload className="h-4 w-4 mr-2"/>Restaurar todas las colecciones</>}
            </Button>
          </div>

          {(showRestoreErrors || Object.keys(invalidLines).length > 0) && (
            <div className={`mt-4 p-4 rounded-xl border ${showRestoreErrors ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${showRestoreErrors ? "text-red-600" : "text-yellow-600"}`}/>
                <div className="flex-1 text-xs">
                  {Object.keys(invalidLines).length > 0 && (
                    <ul className="list-disc list-inside mb-2">
                      {Object.entries(invalidLines).map(([col,n])=><li key={col}>{col}: {n} líneas omitidas</li>)}
                    </ul>
                  )}
                  {showRestoreErrors && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {restoreErrors.map((e,i)=><div key={i} className="text-red-800">• {e}</div>)}
                    </div>
                  )}
                </div>
                <button onClick={()=>{ setShowRestoreErrors(false); setRestoreErrors([]); setInvalidLines({}); }}>
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-600"/>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── API Config ──────────────────────────────────────────────── */}
      <div className="dashboard-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("API Configuration","Configuración de APIs")}</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-slate-900 mb-2">Email (Resend)</h3>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>{t("Sign up at","Regístrate en")} <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">resend.com</a></li>
              <li>{t("Create an API Key","Crea un API Key")}</li>
              <li>{t("Add RESEND_API_KEY and SENDER_EMAIL to .env","Agrega RESEND_API_KEY y SENDER_EMAIL al .env")}</li>
              <li>{t("Restart the backend","Reinicia el backend")}</li>
            </ol>
          </div>
          <div>
            <h3 className="font-medium text-slate-900 mb-2">SMS (Twilio)</h3>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>{t("Sign up at","Regístrate en")} <a href="https://twilio.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">twilio.com</a></li>
              <li>{t("Get Account SID, Auth Token, Phone Number","Obtén Account SID, Auth Token y Phone Number")}</li>
              <li>{t("Add variables to .env","Agrega las variables al .env")}</li>
              <li>{t("Restart the backend","Reinicia el backend")}</li>
            </ol>
          </div>
        </div>
      </div>

      {/* ── Business Rules ───────────────────────────────────────────── */}
      <div className="dashboard-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("Business Rules","Reglas de negocio")}</h2>
            <p className="text-sm text-slate-500">{t("Edit system operational rules","Editar reglas operativas del sistema")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>setShowAdvanced(p=>!p)}>
              {showAdvanced ? t("Hide JSON","Ocultar JSON") : t("Show JSON","Mostrar JSON")}
            </Button>
            <Button onClick={handleSaveRules} disabled={savingRules||loadingRules||slaInvalid}>
              {savingRules ? t("Saving...","Guardando...") : t("Save","Guardar")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={()=>setRulesForm({sla_pickup_delivery:48,sla_wash_fold:36,sla_self_service:24,notify_pickup_delivery:"out_for_delivery",notify_wash_fold:"ready",notify_self_service:"ready"})}>
            {t("Standard preset","Preset estándar")}
          </Button>
          <Button variant="outline" size="sm" onClick={()=>setRulesForm({sla_pickup_delivery:24,sla_wash_fold:18,sla_self_service:12,notify_pickup_delivery:"ready",notify_wash_fold:"ready",notify_self_service:"ready"})}>
            {t("Fast preset","Preset rápido")}
          </Button>
        </div>
        {slaInvalid && <div className="text-xs text-amber-600">{t("SLA must be greater than 0","SLA debe ser mayor a 0")}</div>}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { key:"sla_pickup_delivery", label:t("SLA Pickup & Delivery (h)","SLA Pickup & Delivery (h)") },
            { key:"sla_wash_fold",       label:t("SLA Wash & Fold (h)","SLA Wash & Fold (h)") },
            { key:"sla_self_service",    label:t("SLA Self Service (h)","SLA Self Service (h)") },
          ].map(({key,label})=>(
            <div key={key}>
              <Label>{label}</Label>
              <Input type="number" value={rulesForm[key]} onChange={e=>setRulesForm({...rulesForm,[key]:e.target.value})}/>
            </div>
          ))}
          {[
            { key:"notify_pickup_delivery", label:t("Notification Pickup & Delivery","Notificación Pickup & Delivery") },
            { key:"notify_wash_fold",       label:t("Notification Wash & Fold","Notificación Wash & Fold") },
            { key:"notify_self_service",    label:t("Notification Self Service","Notificación Self Service") },
          ].map(({key,label})=>(
            <div key={key}>
              <Label>{label}</Label>
              <select className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={rulesForm[key]} onChange={e=>setRulesForm({...rulesForm,[key]:e.target.value})}>
                <option value="out_for_delivery">{t("Out for delivery","En camino")}</option>
                <option value="ready">{t("Ready","Lista")}</option>
                <option value="delivered">{t("Delivered","Entregada")}</option>
              </select>
            </div>
          ))}
        </div>
        {showAdvanced && (
          <Textarea rows={10} value={rulesText} onChange={e=>setRulesText(e.target.value)}
            placeholder={t("Rules JSON","JSON de reglas")} disabled={loadingRules}/>
        )}
      </div>
    </div>
  );
}