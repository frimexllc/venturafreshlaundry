import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { 
  Settings as SettingsIcon, 
  Download, 
  Mail, 
  MessageSquare, 
  CheckCircle2, 
  XCircle,
  Send,
  Users,
  ShoppingBag,
  FileText,
  UserPlus,
  HeadphonesIcon,
  Upload,
  AlertTriangle
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Settings() {
  const { t } = useLocale();
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [rulesText, setRulesText] = useState("");
  const [loadingRules, setLoadingRules] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesForm, setRulesForm] = useState({
    sla_pickup_delivery: "",
    sla_wash_fold: "",
    sla_self_service: "",
    notify_pickup_delivery: "out_for_delivery",
    notify_wash_fold: "ready",
    notify_self_service: "ready"
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Restore functionality state
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreZipFile, setRestoreZipFile] = useState(null);
  const [selectedCsvCollection, setSelectedCsvCollection] = useState("customers");
  const [restoreCsvFile, setRestoreCsvFile] = useState(null);
  const [showRestoreWarning, setShowRestoreWarning] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchRules();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/settings/notifications`);
      setNotificationSettings(res.data);
    } catch (error) {
      console.error("Error loading settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await axios.get(`${API}/settings/rules`);
      setRulesText(JSON.stringify(res.data, null, 2));
      const sla = res.data?.sla_hours || {};
      const transitions = res.data?.auto_transitions || {};
      setRulesForm({
        sla_pickup_delivery: sla.pickup_delivery ?? "",
        sla_wash_fold: sla.wash_fold ?? "",
        sla_self_service: sla.self_service ?? "",
        notify_pickup_delivery: transitions.pickup_delivery?.notify_status || "out_for_delivery",
        notify_wash_fold: transitions.wash_fold?.notify_status || "ready",
        notify_self_service: transitions.self_service?.notify_status || "ready"
      });
    } catch (error) {
      toast.error(t("Error loading business rules", "Error cargando reglas de negocio"));
    } finally {
      setLoadingRules(false);
    }
  };

  const handleSaveRules = async () => {
    let payload = {};
    try {
      payload = {
        id: "order_rules_v1",
        type: "order_rules",
        sla_hours: {
          pickup_delivery: Number(rulesForm.sla_pickup_delivery) || 0,
          wash_fold: Number(rulesForm.sla_wash_fold) || 0,
          self_service: Number(rulesForm.sla_self_service) || 0
        },
        auto_transitions: {
          pickup_delivery: { notify_status: rulesForm.notify_pickup_delivery },
          wash_fold: { notify_status: rulesForm.notify_wash_fold },
          self_service: { notify_status: rulesForm.notify_self_service }
        }
      };
      setRulesText(JSON.stringify(payload, null, 2));
    } catch (error) {
      toast.error(t("Invalid JSON", "JSON inválido"));
      return;
    }
    setSavingRules(true);
    try {
      await axios.put(`${API}/settings/rules`, { rules: payload });
      toast.success(t("Rules updated", "Reglas actualizadas"));
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error saving rules", "Error guardando reglas"));
    } finally {
      setSavingRules(false);
    }
  };

  const applyPreset = (preset) => {
    setRulesForm({
      sla_pickup_delivery: preset.sla_pickup_delivery,
      sla_wash_fold: preset.sla_wash_fold,
      sla_self_service: preset.sla_self_service,
      notify_pickup_delivery: preset.notify_pickup_delivery,
      notify_wash_fold: preset.notify_wash_fold,
      notify_self_service: preset.notify_self_service
    });
  };

  const slaInvalid =
    Number(rulesForm.sla_pickup_delivery) <= 0 ||
    Number(rulesForm.sla_wash_fold) <= 0 ||
    Number(rulesForm.sla_self_service) <= 0;

  const handleExport = async (type) => {
    try {
      const res = await axios.get(`${API}/export/${type}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("{type}.csv downloaded", "{type}.csv descargado").replace("{type}", type));
    } catch (error) {
      toast.error(t("Error exporting {type}", "Error exportando {type}").replace("{type}", type));
    }
  };

  const [backupLoading, setBackupLoading] = useState(false);
  const handleFullBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await axios.get(`${API}/admin/backup`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.setAttribute('download', `vfl_backup_${ts}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const total = res.headers?.['x-backup-documents'];
      toast.success(
        total
          ? t(`Backup ready (${total} documents)`, `Respaldo listo (${total} documentos)`)
          : t("Backup downloaded", "Respaldo descargado")
      );
    } catch (error) {
      const msg = error.response?.status === 403
        ? t("Only admins can download backups", "Solo administradores pueden descargar respaldos")
        : t("Error generating backup", "Error generando el respaldo");
      toast.error(msg);
    } finally {
      setBackupLoading(false);
    }
  };

  // Restore handlers
  const handleRestoreZip = async () => {
    if (!restoreZipFile) {
      toast.error(t("Please select a ZIP file", "Por favor selecciona un archivo ZIP"));
      return;
    }

    const confirmed = window.confirm(
      t("WARNING: This will overwrite ALL data. Are you sure?", 
        "ADVERTENCIA: Esto sobrescribirá TODOS los datos. ¿Estás seguro?")
    );
    if (!confirmed) return;

    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreZipFile);
      
      const res = await axios.post(`${API}/admin/restore`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(
        t(`Restored ${res.data.total_restored} documents`, 
          `Restaurados ${res.data.total_restored} documentos`)
      );
      
      if (res.data.errors.length > 0) {
        toast.warning(t("Some collections had errors", "Algunas colecciones tuvieron errores"));
      }
      
      setRestoreZipFile(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error restoring backup", "Error al restaurar respaldo"));
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreCsv = async () => {
    if (!restoreCsvFile) {
      toast.error(t("Please select a CSV file", "Por favor selecciona un archivo CSV"));
      return;
    }

    const confirmed = window.confirm(
      t(`WARNING: This will overwrite ALL data in ${selectedCsvCollection}. Are you sure?`, 
        `ADVERTENCIA: Esto sobrescribirá TODOS los datos en ${selectedCsvCollection}. ¿Estás seguro?`)
    );
    if (!confirmed) return;

    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreCsvFile);
      
      const res = await axios.post(`${API}/admin/restore/csv/${selectedCsvCollection}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(
        t(`Restored ${res.data.inserted_count} records to ${selectedCsvCollection}`, 
          `Restaurados ${res.data.inserted_count} registros en ${selectedCsvCollection}`)
      );
      
      setRestoreCsvFile(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error restoring CSV", "Error al restaurar CSV"));
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setSending(true);
    try {
      const res = await axios.post(`${API}/test/email`, null, {
        params: { to_email: testEmail }
      });
      if (res.data.status === "success") {
        toast.success(t("Test email sent", "Email de prueba enviado"));
      } else {
        toast.error(res.data.message || t("Error sending email", "Error enviando email"));
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error sending email", "Error enviando email"));
    } finally {
      setSending(false);
    }
  };

  const handleTestSMS = async () => {
    if (!testPhone) return;
    setSending(true);
    try {
      const res = await axios.post(`${API}/test/sms`, null, {
        params: { to_phone: testPhone }
      });
      if (res.data.status === "success") {
        toast.success(t("Test SMS sent", "SMS de prueba enviado"));
      } else {
        toast.error(res.data.message || t("Error sending SMS", "Error enviando SMS"));
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error sending SMS", "Error enviando SMS"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="settings-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("Settings", "Configuración")}</h1>
        <p className="text-slate-500 mt-1">{t("Notifications and data export", "Notificaciones y exportación de datos")}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Notifications Section */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Notifications", "Notificaciones")}</h2>
              <p className="text-sm text-slate-500">{t("Notification services status", "Estado de los servicios de notificación")}</p>
            </div>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-16 bg-slate-100 rounded-lg"></div>
              <div className="h-16 bg-slate-100 rounded-lg"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Email Status */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-slate-600" />
                  <div>
                    <p className="font-medium text-slate-900">{t("Email (Resend)", "Email (Resend)")}</p>
                    <p className="text-xs text-slate-500">{t("Email notifications", "Notificaciones por correo electrónico")}</p>
                  </div>
                </div>
                {notificationSettings?.email_enabled ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">{t("Active", "Activo")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <XCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">{t("Not configured", "No configurado")}</span>
                  </div>
                )}
              </div>

              {/* SMS Status */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-slate-600" />
                  <div>
                    <p className="font-medium text-slate-900">{t("SMS (Twilio)", "SMS (Twilio)")}</p>
                    <p className="text-xs text-slate-500">{t("Text message notifications", "Notificaciones por mensaje de texto")}</p>
                  </div>
                </div>
                {notificationSettings?.sms_enabled ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">{t("Active", "Activo")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <XCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">{t("Not configured", "No configurado")}</span>
                  </div>
                )}
              </div>

              {/* Test Email */}
              {notificationSettings?.email_enabled && (
                <div className="pt-4 border-t border-slate-200">
                  <Label className="text-slate-700">{t("Test Email", "Probar Email")}</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="email"
                      placeholder={t("email@example.com", "email@ejemplo.com")}
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1"
                      data-testid="test-email-input"
                    />
                    <Button 
                      onClick={handleTestEmail} 
                      disabled={!testEmail || sending}
                      className="btn-primary"
                      data-testid="test-email-btn"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Test SMS */}
              {notificationSettings?.sms_enabled && (
                <div className="pt-4 border-t border-slate-200">
                  <Label className="text-slate-700">{t("Test SMS", "Probar SMS")}</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="tel"
                      placeholder="+1234567890"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="flex-1"
                      data-testid="test-sms-input"
                    />
                    <Button 
                      onClick={handleTestSMS} 
                      disabled={!testPhone || sending}
                      className="btn-primary"
                      data-testid="test-sms-btn"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Config Instructions */}
              {!notificationSettings?.email_enabled && !notificationSettings?.sms_enabled && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-sm text-amber-800">
                    <strong>{t("To activate notifications:", "Para activar notificaciones:")}</strong>{" "}
                    {t("Configure the environment variables RESEND_API_KEY and/or TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in the backend .env file.", "Configura las variables de entorno RESEND_API_KEY y/o TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER en el archivo .env del backend.")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Download className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Export Data", "Exportar Datos")}</h2>
              <p className="text-sm text-slate-500">{t("Download data in CSV format", "Descargar datos en formato CSV")}</p>
            </div>
          </div>

          {/* Full DB backup — admin only */}
          <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <Download className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 text-sm">
                  {t("Full Database Backup", "Respaldo completo de la base de datos")}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                  {t(
                    "Downloads a ZIP with all collections (orders, customers, finances, etc.) as JSON. Restorable via mongorestore.",
                    "Descarga un ZIP con todas las colecciones (órdenes, clientes, finanzas, etc.) en JSON. Restaurable vía mongorestore."
                  )}
                </div>
              </div>
            </div>
            <Button
              onClick={handleFullBackup}
              disabled={backupLoading}
              data-testid="admin-backup-btn"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {backupLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  {t("Generating backup…", "Generando respaldo…")}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  {t("Download Full Backup (.zip)", "Descargar respaldo completo (.zip)")}
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-between h-14"
              onClick={() => handleExport("customers")}
              data-testid="export-customers-btn"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-slate-500" />
                <span>{t("Export Customers", "Exportar Clientes")}</span>
              </div>
              <Download className="h-4 w-4 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-14"
              onClick={() => handleExport("orders")}
              data-testid="export-orders-btn"
            >
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-5 w-5 text-slate-500" />
                <span>{t("Export Orders", "Exportar Órdenes")}</span>
              </div>
              <Download className="h-4 w-4 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-14"
              onClick={() => handleExport("quotes")}
              data-testid="export-quotes-btn"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-slate-500" />
                <span>{t("Export Quotes", "Exportar Cotizaciones")}</span>
              </div>
              <Download className="h-4 w-4 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-14"
              onClick={() => handleExport("leads")}
              data-testid="export-leads-btn"
            >
              <div className="flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-slate-500" />
                <span>{t("Export Leads", "Exportar Leads")}</span>
              </div>
              <Download className="h-4 w-4 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-14"
              onClick={() => handleExport("tickets")}
              data-testid="export-tickets-btn"
            >
              <div className="flex items-center gap-3">
                <HeadphonesIcon className="h-5 w-5 text-slate-500" />
                <span>{t("Export Tickets", "Exportar Tickets")}</span>
              </div>
              <Download className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        </div>

        {/* Restore Section */}
        <div className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Upload className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t("Restore Data", "Restaurar Datos")}</h2>
              <p className="text-sm text-slate-500">{t("Restore from backup or CSV files", "Restaurar desde respaldo o archivos CSV")}</p>
            </div>
          </div>

          {/* Full DB Restore */}
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-red-50 to-amber-50 border border-red-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 text-sm">
                  {t("Full Database Restore", "Restaurar base de datos completa")}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                  {t(
                    "Restores all collections from a ZIP backup. WARNING: This will overwrite ALL existing data!",
                    "Restaura todas las colecciones desde un respaldo ZIP. ADVERTENCIA: Esto sobrescribirá TODOS los datos existentes!"
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t("Select ZIP backup file", "Seleccionar archivo ZIP de respaldo")}</Label>
                <Input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setRestoreZipFile(e.target.files?.[0] || null)}
                  disabled={restoreLoading}
                />
                {restoreZipFile && (
                  <p className="text-xs text-slate-500">{restoreZipFile.name}</p>
                )}
              </div>
              
              <Button
                onClick={handleRestoreZip}
                disabled={!restoreZipFile || restoreLoading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                {restoreLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    {t("Restoring…", "Restaurando…")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t("Restore Full Database", "Restaurar base de datos completa")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Single Collection CSV Restore */}
          <div className="p-4 rounded-xl border border-slate-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-slate-600 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900 text-sm">
                  {t("Restore Single Collection (CSV)", "Restaurar colección individual (CSV)")}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                  {t(
                    "Restores a single collection from a CSV file. WARNING: This will overwrite all data in that collection!",
                    "Restaura una colección individual desde un archivo CSV. ADVERTENCIA: Esto sobrescribirá todos los datos en esa colección!"
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("Collection", "Colección")}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-slate-200 px-2 text-sm"
                    value={selectedCsvCollection}
                    onChange={(e) => setSelectedCsvCollection(e.target.value)}
                    disabled={restoreLoading}
                  >
                    <option value="customers">Customers</option>
                    <option value="orders">Orders</option>
                    <option value="leads">Leads</option>
                    <option value="quotes">Quotes</option>
                    <option value="tickets">Tickets</option>
                    <option value="products">Products</option>
                    <option value="memberships">Memberships</option>
                    <option value="membership_subscriptions">Membership Subscriptions</option>
                    <option value="addresses">Addresses</option>
                    <option value="payments">Payments</option>
                    <option value="invoices">Invoices</option>
                    <option value="expenses">Expenses</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("CSV File", "Archivo CSV")}</Label>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setRestoreCsvFile(e.target.files?.[0] || null)}
                    disabled={restoreLoading}
                  />
                </div>
              </div>
              
              {restoreCsvFile && (
                <p className="text-xs text-slate-500">{restoreCsvFile.name}</p>
              )}
              
              <Button
                onClick={handleRestoreCsv}
                disabled={!restoreCsvFile || restoreLoading}
                variant="outline"
                className="w-full"
              >
                {restoreLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    {t("Restoring…", "Restaurando…")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t("Restore Collection", "Restaurar colección")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys Info */}
      <div className="dashboard-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("API Configuration", "Configuración de APIs")}</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-slate-900 mb-2">{t("Email (Resend)", "Email (Resend)")}</h3>
            <p className="text-sm text-slate-600 mb-3">
              {t("To enable email notifications, you need a Resend account.", "Para habilitar notificaciones por email, necesitas una cuenta en Resend.")}
            </p>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>{t("Sign up at", "Regístrate en")} <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">resend.com</a></li>
              <li>{t("Create an API Key in the dashboard", "Crea un API Key en el dashboard")}</li>
              <li>{t("Add RESEND_API_KEY and SENDER_EMAIL to the .env file", "Agrega RESEND_API_KEY y SENDER_EMAIL al archivo .env")}</li>
              <li>{t("Restart the backend", "Reinicia el backend")}</li>
            </ol>
          </div>
          
          <div>
            <h3 className="font-medium text-slate-900 mb-2">{t("SMS (Twilio)", "SMS (Twilio)")}</h3>
            <p className="text-sm text-slate-600 mb-3">
              {t("To enable SMS notifications, you need a Twilio account.", "Para habilitar notificaciones por SMS, necesitas una cuenta en Twilio.")}
            </p>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
              <li>{t("Sign up at", "Regístrate en")} <a href="https://twilio.com" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">twilio.com</a></li>
              <li>{t("Get your Account SID, Auth Token and Phone Number", "Obtén tu Account SID, Auth Token y Phone Number")}</li>
              <li>{t("Add the variables to the .env file", "Agrega las variables al archivo .env")}</li>
              <li>{t("Restart the backend", "Reinicia el backend")}</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("Business Rules", "Reglas de negocio")}</h2>
            <p className="text-sm text-slate-500">{t("Edit system operational rules", "Editar reglas operativas del sistema")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? t("Hide JSON", "Ocultar JSON") : t("Show JSON", "Mostrar JSON")}
            </Button>
            <Button onClick={handleSaveRules} disabled={savingRules || loadingRules || slaInvalid}>
              {savingRules ? t("Saving...", "Guardando...") : t("Save", "Guardar")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset({
              sla_pickup_delivery: 48,
              sla_wash_fold: 36,
              sla_self_service: 24,
              notify_pickup_delivery: "out_for_delivery",
              notify_wash_fold: "ready",
              notify_self_service: "ready"
            })}
          >
            {t("Standard preset", "Preset estándar")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset({
              sla_pickup_delivery: 24,
              sla_wash_fold: 18,
              sla_self_service: 12,
              notify_pickup_delivery: "ready",
              notify_wash_fold: "ready",
              notify_self_service: "ready"
            })}
          >
            {t("Fast preset", "Preset rápido")}
          </Button>
        </div>
        {slaInvalid && (
          <div className="text-xs text-amber-600">{t("SLA must be greater than 0", "SLA debe ser mayor a 0")}</div>
        )}
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>{t("SLA Pickup & Delivery (h)", "SLA Pickup & Delivery (h)")}</Label>
            <Input
              type="number"
              value={rulesForm.sla_pickup_delivery}
              onChange={(e) => setRulesForm({ ...rulesForm, sla_pickup_delivery: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("SLA Wash & Fold (h)", "SLA Wash & Fold (h)")}</Label>
            <Input
              type="number"
              value={rulesForm.sla_wash_fold}
              onChange={(e) => setRulesForm({ ...rulesForm, sla_wash_fold: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("SLA Self Service (h)", "SLA Self Service (h)")}</Label>
            <Input
              type="number"
              value={rulesForm.sla_self_service}
              onChange={(e) => setRulesForm({ ...rulesForm, sla_self_service: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("Notification Pickup & Delivery", "Notificación Pickup & Delivery")}</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={rulesForm.notify_pickup_delivery}
              onChange={(e) => setRulesForm({ ...rulesForm, notify_pickup_delivery: e.target.value })}
            >
              <option value="out_for_delivery">{t("Out for delivery", "En camino")}</option>
              <option value="ready">{t("Ready", "Lista")}</option>
              <option value="delivered">{t("Delivered", "Entregada")}</option>
            </select>
          </div>
          <div>
            <Label>{t("Notification Wash & Fold", "Notificación Wash & Fold")}</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={rulesForm.notify_wash_fold}
              onChange={(e) => setRulesForm({ ...rulesForm, notify_wash_fold: e.target.value })}
            >
              <option value="ready">{t("Ready", "Lista")}</option>
              <option value="out_for_delivery">{t("Out for delivery", "En camino")}</option>
              <option value="delivered">{t("Delivered", "Entregada")}</option>
            </select>
          </div>
          <div>
            <Label>{t("Notification Self Service", "Notificación Self Service")}</Label>
            <select
              className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
              value={rulesForm.notify_self_service}
              onChange={(e) => setRulesForm({ ...rulesForm, notify_self_service: e.target.value })}
            >
              <option value="ready">{t("Ready", "Lista")}</option>
              <option value="out_for_delivery">{t("Out for delivery", "En camino")}</option>
              <option value="delivered">{t("Delivered", "Entregada")}</option>
            </select>
          </div>
        </div>
        {showAdvanced && (
          <Textarea
            rows={10}
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            placeholder={t("Rules JSON", "JSON de reglas")}
            disabled={loadingRules}
          />
        )}
      </div>
    </div>
  );
}