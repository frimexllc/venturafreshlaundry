// AdminStore.jsx
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Package, Plus, Edit2, Trash2, Search, DollarSign,
  X, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ── Token helpers ─────────────────────────────────────────────────────────────
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const authJsonHeaders = () => {
  const token = getToken();
  if (!token) {
    console.warn("No auth token found in storage");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// Sin Content-Type para FormData (el browser pone el boundary)
const authFormHeaders = () => {
  const token = getToken();
  if (!token) {
    console.warn("No auth token found in storage");
  }
  return { Authorization: `Bearer ${token}` };
};

// Helper global para manejar respuestas de auth
const handleAuthError = (status) => {
  if (status === 401) {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "/login";
    return true;
  }
  return false;
};

const DEFAULT_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=300&fit=crop";

// ─── Confirmation Modal ───────────────────────────────────────────────────────
const ConfirmationModal = ({
  isOpen, onClose, onConfirm,
  title, message,
  confirmText = "Eliminar", cancelText = "Cancelar",
  variant = "danger",
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${variant === "danger" ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${variant === "danger" ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        </div>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className={`flex-1 ${variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Reset Catalog Modal ──────────────────────────────────────────────────────
const ResetCatalogModal = ({ isOpen, onClose, onConfirm }) => {
  const [step, setStep] = useState(1);
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
    setStep(1);
    setConfirmText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-100">
            <RefreshCw className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Reiniciar Catálogo</h2>
        </div>

        {step === 1 ? (
          <>
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 text-sm">
                ⚠️ <strong>ADVERTENCIA:</strong> Esta acción eliminará TODOS los productos y
                servicios del catálogo. Esta operación NO se puede deshacer.
              </p>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 mb-6">
              <li>• Todos los productos de la tienda serán eliminados</li>
              <li>• Todos los servicios serán eliminados</li>
              <li>• El catálogo quedará completamente vacío</li>
              <li>• Las órdenes existentes no se verán afectadas</li>
            </ul>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="button" onClick={() => setStep(2)} className="flex-1 bg-red-600 hover:bg-red-700">
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-slate-600 mb-3">
              Para confirmar, escribe{" "}
              <strong className="text-red-600">"REINICIAR CATÁLOGO"</strong> en el campo de abajo:
            </p>
            <Input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="REINICIAR CATÁLOGO"
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                Volver
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (confirmText !== "REINICIAR CATÁLOGO") return;
                  onConfirm();
                  handleClose();
                }}
                disabled={confirmText !== "REINICIAR CATÁLOGO"}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300"
              >
                Confirmar Reinicio
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminStore() {
  const { t } = useLocale();

  const [products,  setProducts]  = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [services,  setServices]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery,    setSearchQuery]    = useState("");

  const [deleteConfirm,        setDeleteConfirm]        = useState({ isOpen: false, productId: null, productName: "" });
  const [deleteServiceConfirm, setDeleteServiceConfirm] = useState({ isOpen: false, serviceId: null, serviceName: "" });
  const [resetCatalogConfirm,  setResetCatalogConfirm]  = useState({ isOpen: false });

  const [formData, setFormData] = useState({
    name: "", description: "", price: "",
    category: "accesorios", stock: "", image_url: "", is_active: true,
  });
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => { loadData(); }, []);

  // ── Data loading ──────────────────────────────────────────────────────────────
  const loadData = async () => {
    // Verificar token antes de cualquier llamada
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    try {
      const headers = authJsonHeaders();

      const [productsRes, ordersRes, servicesRes] = await Promise.all([
        // productos: admin necesita ver inactivos también → requiere auth
        fetch(`${API_URL}/api/store/products?active_only=false`, { headers }),
        // órdenes: requiere auth (admin/operator)
        fetch(`${API_URL}/api/store/orders`, { headers }),
        // servicios: endpoint público, no requiere auth
        fetch(`${API_URL}/api/public/services`),
      ]);

      // Manejo centralizado de 401
      if ([productsRes, ordersRes, servicesRes].some(r => r.status === 401)) {
        handleAuthError(401);
        return;
      }

      const [productsData, ordersData, servicesData] = await Promise.all([
        productsRes.ok  ? productsRes.json()  : [],
        ordersRes.ok    ? ordersRes.json()    : [],
        servicesRes.ok  ? servicesRes.json()  : [],
      ]);

      setProducts(Array.isArray(productsData) ? productsData : []);
      setOrders(Array.isArray(ordersData)     ? ordersData   : []);
      setServices(Array.isArray(servicesData) ? servicesData : []);
    } catch (err) {
      console.error("Error loading data:", err);
      toast.error(t("Error loading data", "Error al cargar datos"));
    } finally {
      setLoading(false);
    }
  };

  // ── Image handlers ────────────────────────────────────────────────────────────
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) { setImageFile(null); setImagePreview(null); return; }
    setImageFile(file);
    setFormData(prev => ({ ...prev, image_url: "" }));
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleImageUrlChange = (value) => {
    setFormData(prev => ({ ...prev, image_url: value }));
    setImageFile(null);
    setImagePreview(value.trim() || null);
  };

  // ── Create / Update product ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(t("Product name is required", "El nombre del producto es requerido"));
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast.error(t("Price must be greater than 0", "El precio debe ser mayor a 0"));
      return;
    }

    setSubmitting(true);

    const body = new FormData();
    body.append("name",        formData.name.trim());
    body.append("description", formData.description || "");
    body.append("price",       formData.price);
    body.append("category",    formData.category);
    body.append("stock",       formData.stock || "0");
    body.append("is_active",   formData.is_active ? "true" : "false");
    body.append("image_url",   formData.image_url || "");
    if (imageFile) body.append("image", imageFile);

    try {
      const url    = editingProduct
        ? `${API_URL}/api/store/products/${editingProduct.id}`
        : `${API_URL}/api/store/products`;
      const method = editingProduct ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authFormHeaders(), // sin Content-Type para que el browser ponga el boundary
        body,
      });

      if (handleAuthError(res.status)) return;
      if (res.status === 403) { toast.error(t("Permission denied", "Sin permisos de administrador")); return; }
      if (res.status === 422) {
        const detail = await res.json().catch(() => null);
        console.error("422 detail:", detail);
        toast.error(t("Validation error", "Error de validación: verifica los campos"));
        return;
      }

      if (res.ok) {
        toast.success(editingProduct
          ? t("Product updated", "Producto actualizado")
          : t("Product created",  "Producto creado"));
        setShowModal(false);
        resetForm();
        loadData();
      } else {
        const err = await res.text();
        toast.error(t("Error saving product", "Error al guardar producto") + ": " + err);
      }
    } catch (err) {
      console.error("Error saving product:", err);
      toast.error(t("Connection error", "Error de conexión"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete product ────────────────────────────────────────────────────────────
  const handleDeleteProduct = async () => {
    const { productId, productName } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, productId: null, productName: "" });

    if (!productId) {
      toast.error("ID de producto no válido");
      return;
    }

    // Verificar token antes de la operación
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/store/products/${productId}`, {
        method:  "DELETE",
        headers: authJsonHeaders(),
      });

      console.log(`DELETE product ${productId} → status ${res.status}`);

      if (handleAuthError(res.status)) return;

      if (res.status === 403) {
        toast.error(t("Permission denied", "No tienes permisos de administrador para eliminar productos"));
        return;
      }

      if (res.status === 404) {
        toast.warning(t("Product not found", "El producto ya no existe"));
        loadData();
        return;
      }

      if (res.status === 422) {
        // 422 normalmente indica problema con el parámetro de ruta o validación del token
        const detail = await res.json().catch(() => ({ detail: "Error desconocido" }));
        console.error("422 Unprocessable Entity:", detail);
        toast.error(
          t("Error deleting product", "Error al eliminar") +
          `: ${detail?.detail || "Verifica tu sesión e intenta de nuevo"}`
        );
        return;
      }

      if (res.ok) {
        toast.success(t("Product deleted", `"${productName}" eliminado correctamente`));
        loadData();
      } else {
        const errText = await res.text();
        console.error("Delete error response:", errText);
        toast.error(t("Error deleting", "Error al eliminar el producto"));
      }
    } catch (err) {
      console.error("Error deleting product:", err);
      toast.error(t("Error deleting", "Error de conexión al eliminar"));
    }
  };

  // ── Delete service ────────────────────────────────────────────────────────────
  const handleDeleteService = async () => {
    const { serviceId, serviceName } = deleteServiceConfirm;
    setDeleteServiceConfirm({ isOpen: false, serviceId: null, serviceName: "" });

    if (!getToken()) { window.location.href = "/login"; return; }

    try {
      const res = await fetch(`${API_URL}/api/services/${serviceId}`, {
        method:  "DELETE",
        headers: authJsonHeaders(),
      });

      if (handleAuthError(res.status)) return;
      if (res.status === 403) { toast.error(t("Permission denied", "Sin permisos")); return; }
      if (res.status === 404) { toast.warning("Servicio no encontrado"); loadData(); return; }

      if (res.ok) {
        toast.success(t("Service deleted", `"${serviceName}" eliminado`));
        loadData();
      } else {
        toast.error(t("Error deleting service", "Error al eliminar servicio"));
      }
    } catch (err) {
      console.error("Error deleting service:", err);
      toast.error(t("Error deleting service", "Error de conexión al eliminar servicio"));
    }
  };

  // ── Reset catalog ─────────────────────────────────────────────────────────────
  const handleResetCatalog = async () => {
    if (!getToken()) { window.location.href = "/login"; return; }

    let errors = 0;
    const headers = authJsonHeaders();

    try {
      for (const product of products) {
        const res = await fetch(`${API_URL}/api/store/products/${product.id}`, {
          method: "DELETE",
          headers,
        });
        if (handleAuthError(res.status)) return;
        if (!res.ok) errors++;
      }

      for (const service of services) {
        const res = await fetch(`${API_URL}/api/services/${service.id}`, {
          method: "DELETE",
          headers,
        });
        if (handleAuthError(res.status)) return;
        if (!res.ok) errors++;
      }

      if (errors > 0) {
        toast.error(`${errors} ${t("items could not be deleted", "artículos no se pudieron eliminar")}`);
      } else {
        toast.success(t("Catalog reset successfully", "Catálogo reiniciado exitosamente"));
      }
      loadData();
    } catch (err) {
      console.error("Error resetting catalog:", err);
      toast.error(t("Error resetting catalog", "Error al reiniciar catálogo"));
    }
  };

  // ── Update order status ───────────────────────────────────────────────────────
  const updateOrderStatus = async (orderId, status) => {
    if (!getToken()) { window.location.href = "/login"; return; }

    try {
      const res = await fetch(
        `${API_URL}/api/store/orders/${orderId}/status?status=${status}`,
        { method: "PUT", headers: authJsonHeaders() }
      );

      if (handleAuthError(res.status)) return;
      if (res.status === 403) { toast.error(t("Permission denied", "Sin permisos")); return; }

      if (res.ok) {
        toast.success(t("Status updated", "Estado actualizado"));
        loadData();
      } else {
        toast.error(t("Error updating", "Error al actualizar estado"));
      }
    } catch (err) {
      console.error("Error updating order:", err);
      toast.error(t("Error updating", "Error de conexión"));
    }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({ name: "", description: "", price: "", category: "accesorios", stock: "", image_url: "", is_active: true });
    setImageFile(null);
    setImagePreview(null);
    setEditingProduct(null);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name:        product.name,
      description: product.description || "",
      price:       product.price.toString(),
      category:    product.category,
      stock:       product.stock.toString(),
      image_url:   product.image_url || "",
      is_active:   product.is_active,
    });
    setImagePreview(product.image_url || null);
    setImageFile(null);
    setShowModal(true);
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const filteredProducts = (Array.isArray(products) ? products : []).filter(p =>
    p?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p?.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors = {
    pending:    "bg-yellow-100 text-yellow-800",
    confirmed:  "bg-blue-100 text-blue-800",
    processing: "bg-purple-100 text-purple-800",
    shipped:    "bg-indigo-100 text-indigo-800",
    delivered:  "bg-green-100 text-green-800",
    cancelled:  "bg-red-100 text-red-800",
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Store Management", "Gestión de Tienda")}</h1>
          <p className="text-slate-600">{t("Manage products and store orders", "Administra productos y órdenes de la tienda")}</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "products" && (
            <Button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="bg-sky-600 hover:bg-sky-700"
              data-testid="add-product-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("Add Product", "Agregar Producto")}
            </Button>
          )}
          <Button
            onClick={() => setResetCatalogConfirm({ isOpen: true })}
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            data-testid="reset-catalog-btn"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("Reset Catalog", "Reiniciar Catálogo")}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { key: "products", label: `${t("Products","Productos")} (${products.length})` },
          { key: "services", label: `${t("Services","Servicios")} (${services.length})` },
          { key: "orders",   label: `${t("Orders","Órdenes")} (${orders.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package className="h-4 w-4 inline mr-2" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
        </div>

      ) : activeTab === "products" ? (

        /* ── Products tab ── */
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t("Search products...", "Buscar productos...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
              <Package className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-lg font-medium text-slate-700 mb-1">
                {searchQuery
                  ? t("No products match search", "No hay productos que coincidan")
                  : t("No products yet", "Aún no hay productos")}
              </h3>
              {!searchQuery && (
                <>
                  <p className="text-slate-500 mb-4">
                    {t("Click the button above to add your first product", "Haz clic en el botón de arriba para agregar tu primer producto")}
                  </p>
                  <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-sky-600 hover:bg-sky-700">
                    <Plus className="h-4 w-4 mr-2" />{t("Add Product", "Agregar Producto")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-white rounded-xl border border-slate-200 p-4 group" data-testid={`admin-product-${product.id}`}>
                  <div className="aspect-square w-full bg-slate-100 rounded-lg mb-3 overflow-hidden">
                    <img
                      src={product.image_url || DEFAULT_PRODUCT_IMAGE}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
                    />
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${product.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      {product.is_active ? t("Active", "Activo") : t("Inactive", "Inactivo")}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(product)}
                        className="p-1 text-slate-400 hover:text-sky-600 transition-colors"
                        title={t("Edit", "Editar")}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ isOpen: true, productId: product.id, productName: product.name })}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        title={t("Delete", "Eliminar")}
                        data-testid={`delete-product-${product.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1 line-clamp-1">{product.name}</h3>
                  <p className="text-sm text-slate-600 mb-2 line-clamp-2">{product.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-sky-600">${parseFloat(product.price).toFixed(2)}</span>
                    <span className="text-sm text-slate-500">{t("Stock", "Stock")}: {product.stock}</span>
                  </div>
                  <span className="inline-block mt-2 px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                    {product.category}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>

      ) : activeTab === "services" ? (

        /* ── Services tab ── */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-semibold text-slate-900">{t("Services Catalog", "Catálogo de Servicios")}</h3>
            <p className="text-sm text-slate-500">{t("Manage laundry services offered", "Administra los servicios de lavandería ofrecidos")}</p>
          </div>
          {services.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">{t("No services yet", "Aún no hay servicios")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {[t("Name","Nombre"), t("Description","Descripción"), t("Price","Precio"), t("Duration","Duración"), t("Actions","Acciones")].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.map((service) => (
                    <tr key={service.id} data-testid={`admin-service-${service.id}`}>
                      <td className="px-4 py-3 font-medium">{service.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{service.description}</td>
                      <td className="px-4 py-3 font-medium text-sky-600">${parseFloat(service.price || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">{service.duration || "-"}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeleteServiceConfirm({ isOpen: true, serviceId: service.id, serviceName: service.name })}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          data-testid={`delete-service-${service.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      ) : (

        /* ── Orders tab ── */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">
                {t("Orders will appear here when customers make purchases", "Las órdenes aparecerán aquí cuando los clientes realicen compras")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {[t("Order","Orden"), "Email", t("Items","Items"), t("Total","Total"), t("Payment","Pago"), t("Status","Estado"), t("Date","Fecha"), t("Actions","Acciones")].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id} data-testid={`admin-order-${order.id}`}>
                      <td className="px-4 py-3 font-mono text-sm">{order.order_number}</td>
                      <td className="px-4 py-3 text-sm">{order.customer_email || "-"}</td>
                      <td className="px-4 py-3 text-sm">{order.items?.length || 0}</td>
                      <td className="px-4 py-3 font-medium">${parseFloat(order.total || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          order.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {order.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.status] || "bg-slate-100 text-slate-800"}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status || "pending"}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="text-sm border border-slate-200 rounded px-2 py-1"
                          data-testid={`order-status-${order.id}`}
                        >
                          <option value="pending">{t("Pending","Pendiente")}</option>
                          <option value="confirmed">{t("Confirmed","Confirmado")}</option>
                          <option value="processing">{t("Processing","Procesando")}</option>
                          <option value="shipped">{t("Shipped","Enviado")}</option>
                          <option value="delivered">{t("Delivered","Entregado")}</option>
                          <option value="cancelled">{t("Cancelled","Cancelado")}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Product Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingProduct ? t("Edit Product", "Editar Producto") : t("New Product", "Nuevo Producto")}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Image */}
              <div>
                <Label htmlFor="image">{t("Product Image", "Imagen del producto")}</Label>
                <div className="mt-1 flex items-center gap-4">
                  {imagePreview && (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
                      />
                    </div>
                  )}
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      id="image"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
                        file:text-sm file:font-medium file:bg-sky-50 file:text-sky-700
                        hover:file:bg-sky-100"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <Label htmlFor="image_url">{t("Or image URL", "O URL de imagen")}</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => handleImageUrlChange(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <Label htmlFor="name">{t("Name", "Nombre")} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">{t("Description", "Descripción")}</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm resize-none"
                  rows={3}
                />
              </div>

              {/* Price + Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">{t("Price ($)", "Precio ($)")} *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="stock">{t("Stock", "Stock")} *</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, stock: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="category">{t("Category", "Categoría")}</Label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                >
                  <option value="accesorios">{t("Accessories", "Accesorios")}</option>
                  <option value="detergentes">{t("Detergents", "Detergentes")}</option>
                  <option value="suavizantes">{t("Fabric Softeners", "Suavizantes")}</option>
                  <option value="quitamanchas">{t("Stain Removers", "Quitamanchas")}</option>
                  <option value="packs">{t("Packs", "Packs")}</option>
                </select>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  {t("Active product", "Producto activo")}
                </Label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1"
                >
                  {t("Cancel", "Cancelar")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-sky-600 hover:bg-sky-700"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin mr-1" />}
                  {editingProduct ? t("Update", "Actualizar") : t("Create", "Crear")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modales de confirmación */}
      <ConfirmationModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, productId: null, productName: "" })}
        onConfirm={handleDeleteProduct}
        title={t("Delete Product", "Eliminar Producto")}
        message={t(
          `Are you sure you want to delete "${deleteConfirm.productName}"? This action cannot be undone.`,
          `¿Estás seguro de eliminar "${deleteConfirm.productName}"? Esta acción no se puede deshacer.`
        )}
        confirmText={t("Delete", "Eliminar")}
        cancelText={t("Cancel", "Cancelar")}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={deleteServiceConfirm.isOpen}
        onClose={() => setDeleteServiceConfirm({ isOpen: false, serviceId: null, serviceName: "" })}
        onConfirm={handleDeleteService}
        title={t("Delete Service", "Eliminar Servicio")}
        message={t(
          `Are you sure you want to delete "${deleteServiceConfirm.serviceName}"? This action cannot be undone.`,
          `¿Estás seguro de eliminar "${deleteServiceConfirm.serviceName}"? Esta acción no se puede deshacer.`
        )}
        confirmText={t("Delete", "Eliminar")}
        cancelText={t("Cancel", "Cancelar")}
        variant="danger"
      />

      <ResetCatalogModal
        isOpen={resetCatalogConfirm.isOpen}
        onClose={() => setResetCatalogConfirm({ isOpen: false })}
        onConfirm={handleResetCatalog}
      />
    </div>
  );
}