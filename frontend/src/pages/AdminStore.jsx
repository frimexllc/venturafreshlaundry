import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Package, Plus, Edit2, Trash2, Search, DollarSign, Archive, X } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminStore() {
  const { t } = useLocale();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('products');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'accesorios',
    stock: '',
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/api/store/products?active_only=false`),
        fetch(`${API_URL}/api/store/orders`)
      ]);
      setProducts(await productsRes.json());
      setOrders(await ordersRes.json());
    } catch (error) {
      toast.error(t('Error loading data', 'Error al cargar datos'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingProduct 
        ? `${API_URL}/api/store/products/${editingProduct.id}`
        : `${API_URL}/api/store/products`;
      
      const res = await fetch(url, {
        method: editingProduct ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock)
        })
      });

      if (res.ok) {
        toast.success(editingProduct ? t('Product updated', 'Producto actualizado') : t('Product created', 'Producto creado'));
        setShowModal(false);
        resetForm();
        loadData();
      } else {
        toast.error(t('Error saving product', 'Error al guardar producto'));
      }
    } catch (error) {
      toast.error(t('Connection error', 'Error de conexión'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('Delete this product?', '¿Eliminar este producto?'))) return;
    try {
      const res = await fetch(`${API_URL}/api/store/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('Product deleted', 'Producto eliminado'));
        loadData();
      }
    } catch (error) {
      toast.error(t('Error deleting', 'Error al eliminar'));
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      const res = await fetch(`${API_URL}/api/store/orders/${orderId}/status?status=${status}`, {
        method: 'PUT'
      });
      if (res.ok) {
        toast.success(t('Status updated', 'Estado actualizado'));
        loadData();
      }
    } catch (error) {
      toast.error(t('Error updating', 'Error al actualizar'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      category: 'accesorios',
      stock: '',
      is_active: true
    });
    setEditingProduct(null);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      category: product.category,
      stock: product.stock.toString(),
      is_active: product.is_active
    });
    setShowModal(true);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    processing: 'bg-purple-100 text-purple-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Store Management', 'Gestión de Tienda')}</h1>
          <p className="text-slate-600">{t('Manage products and store orders', 'Administra productos y órdenes de la tienda')}</p>
        </div>
        {activeTab === 'products' && (
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-sky-600 hover:bg-sky-700" data-testid="add-product-btn">
            <Plus className="h-4 w-4 mr-2" /> {t('Add Product', 'Agregar Producto')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'products' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="h-4 w-4 inline mr-2" />
          {t('Products', 'Productos')} ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'orders' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <DollarSign className="h-4 w-4 inline mr-2" />
          {t('Orders', 'Órdenes')} ({orders.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
        </div>
      ) : activeTab === 'products' ? (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('Search products...', 'Buscar productos...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Products Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-xl border border-slate-200 p-4" data-testid={`admin-product-${product.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${product.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                    {product.is_active ? t('Active', 'Activo') : t('Inactive', 'Inactivo')}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(product)} className="p-1 text-slate-400 hover:text-sky-600">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="p-1 text-slate-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{product.name}</h3>
                <p className="text-sm text-slate-600 mb-2 line-clamp-2">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-sky-600">${product.price.toFixed(2)}</span>
                  <span className="text-sm text-slate-500">{t('Stock', 'Stock')}: {product.stock}</span>
                </div>
                <span className="inline-block mt-2 px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                  {product.category}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Orders Table */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Order', 'Orden')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Email', 'Email')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Items', 'Items')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Total', 'Total')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Payment', 'Pago')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Status', 'Estado')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Date', 'Fecha')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('Actions', 'Acciones')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} data-testid={`admin-order-${order.id}`}>
                    <td className="px-4 py-3 font-mono text-sm">{order.order_number}</td>
                    <td className="px-4 py-3 text-sm">{order.customer_email || '-'}</td>
                    <td className="px-4 py-3 text-sm">{order.items?.length || 0}</td>
                    <td className="px-4 py-3 font-medium">${order.total?.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        order.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className="text-sm border border-slate-200 rounded px-2 py-1"
                      >
                        <option value="pending">{t('Pending', 'Pendiente')}</option>
                        <option value="confirmed">{t('Confirmed', 'Confirmado')}</option>
                        <option value="processing">{t('Processing', 'Procesando')}</option>
                        <option value="shipped">{t('Shipped', 'Enviado')}</option>
                        <option value="delivered">{t('Delivered', 'Entregado')}</option>
                        <option value="cancelled">{t('Cancelled', 'Cancelado')}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editingProduct ? t('Edit Product', 'Editar Producto') : t('New Product', 'Nuevo Producto')}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">{t('Name', 'Nombre')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">{t('Description', 'Descripción')}</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">{t('Price ($)', 'Precio ($)')}</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="stock">{t('Stock', 'Stock')}</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="category">{t('Category', 'Categoría')}</Label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="accesorios">{t('Accessories', 'Accesorios')}</option>
                  <option value="detergentes">{t('Detergents', 'Detergentes')}</option>
                  <option value="suavizantes">{t('Fabric Softeners', 'Suavizantes')}</option>
                  <option value="quitamanchas">{t('Stain Removers', 'Quitamanchas')}</option>
                  <option value="packs">{t('Packs', 'Packs')}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <Label htmlFor="is_active" className="cursor-pointer">{t('Active product', 'Producto activo')}</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                  {t('Cancel', 'Cancelar')}
                </Button>
                <Button type="submit" className="flex-1 bg-sky-600 hover:bg-sky-700">
                  {editingProduct ? t('Update', 'Actualizar') : t('Create', 'Crear')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}