import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ShoppingBag, Plus, Minus, Trash2, ShoppingCart, Check, X } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function StorePage() {
  const { t } = useLocale();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingQuote, setShippingQuote] = useState({ distance_km: null, fee: 0 });
  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    apt: "",
    instructions: "",
    notes: "",
    preferred_contact: "sms",
    payment_method: "card"
  });
  const [searchParams] = useSearchParams();

  // Check for payment status on return from Stripe
  useEffect(() => {
    const status = searchParams.get('status');
    const sessionId = searchParams.get('session_id');
    
    if (status === 'success' && sessionId) {
      // Verify payment status
      fetch(`${API_URL}/api/store/checkout/status/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.payment_status === 'paid') {
            toast.success(t('Payment completed successfully!', '¡Pago completado exitosamente!'));
            // Clear local cart
            localStorage.removeItem('cartId');
            setCart(null);
          }
        })
        .catch(console.error);
    } else if (status === 'cancelled') {
      toast.error(t('Payment was cancelled', 'El pago fue cancelado'));
    }
  }, [searchParams, t]);

  // Load products
  useEffect(() => {
    fetch(`${API_URL}/api/store/products`)
      .then(res => res.json())
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load or create cart
  useEffect(() => {
    const cartId = localStorage.getItem('cartId');
    if (cartId) {
      fetch(`${API_URL}/api/store/cart/${cartId}`)
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Cart not found');
        })
        .then(setCart)
        .catch(() => {
          localStorage.removeItem('cartId');
        });
    }
  }, []);

  const createCart = async () => {
    const res = await fetch(`${API_URL}/api/store/cart`, { method: 'POST' });
    const newCart = await res.json();
    localStorage.setItem('cartId', newCart.id);
    setCart(newCart);
    return newCart;
  };

  const addToCart = async (product) => {
    let currentCart = cart;
    if (!currentCart) {
      currentCart = await createCart();
    }

    const res = await fetch(`${API_URL}/api/store/cart/${currentCart.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, quantity: 1 })
    });

    if (res.ok) {
      const updatedCart = await res.json();
      setCart(updatedCart);
      toast.success(t('{name} added to cart', '{name} agregado al carrito').replace('{name}', product.name));
    } else {
      toast.error(t('Error adding to cart', 'Error al agregar al carrito'));
    }
  };

  const updateQuantity = async (productId, newQuantity) => {
    if (!cart) return;

    const res = await fetch(`${API_URL}/api/store/cart/${cart.id}/items/${productId}?quantity=${newQuantity}`, {
      method: 'PUT'
    });

    if (res.ok) {
      const updatedCart = await res.json();
      setCart(updatedCart);
    }
  };

  const removeFromCart = async (productId) => {
    if (!cart) return;

    const res = await fetch(`${API_URL}/api/store/cart/${cart.id}/items/${productId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      const updatedCart = await res.json();
      setCart(updatedCart);
      toast.success(t('Product removed from cart', 'Producto eliminado del carrito'));
    }
  };

  const checkout = async () => {
    if (!cart || cart.items.length === 0) {
      toast.error(t('Cart is empty', 'El carrito está vacío'));
      return;
    }

    setCheckingOut(true);
    try {
      const res = await fetch(`${API_URL}/api/store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart_id: cart.id,
          origin_url: window.location.origin
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Redirect to Stripe checkout
        window.location.href = data.checkout_url;
      } else {
        const error = await res.json();
        toast.error(error.detail || t('Error processing payment', 'Error al procesar el pago'));
      }
    } catch (error) {
      toast.error(t('Connection error', 'Error de conexión'));
    } finally {
      setCheckingOut(false);
    }
  };

  const cartItemCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1
            className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 mt-12"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("Store", "Tienda")}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t("Quality laundry products and accessories", "Productos de lavandería y accesorios de calidad")}
          </p>
        </div>
      </section>

      {/* Cart Button (Fixed) */}
      <button
        onClick={() => setCartOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-sky-600 text-white p-4 rounded-full shadow-lg hover:bg-sky-700 transition-colors"
        data-testid="cart-button"
      >
        <ShoppingCart className="h-6 w-6" />
        {cartItemCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
            {cartItemCount}
          </span>
        )}
      </button>

      {/* Cart Sidebar */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto" data-testid="cart-sidebar">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">{t("Your Cart", "Tu Carrito")}</h2>
                <button onClick={() => setCartOpen(false)} className="text-slate-500 hover:text-slate-700">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {!cart || cart.items.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">{t("Your cart is empty", "Tu carrito está vacío")}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {cart.items.map((item) => (
                      <div key={item.product_id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl" data-testid={`cart-item-${item.product_id}`}>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900">{item.product_name}</h3>
                          <p className="text-sky-600 font-medium">${item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                            className="p-1 rounded-full bg-slate-200 hover:bg-slate-300"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                            className="p-1 rounded-full bg-slate-200 hover:bg-slate-300"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product_id)}
                            className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-lg font-semibold text-slate-900">{t("Total:", "Total:")}</span>
                      <span className="text-2xl font-bold text-sky-600">${cart.total.toFixed(2)}</span>
                    </div>
                    <Button
                      onClick={checkout}
                      disabled={checkingOut}
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 h-auto text-lg font-semibold rounded-full"
                      data-testid="checkout-button"
                    >
                      {checkingOut ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                          {t("Processing...", "Procesando...")}
                        </span>
                      ) : (
                        t("Pay with Stripe", "Pagar con Stripe")
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-24 w-24 text-slate-300 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("No products available", "No hay productos disponibles")}</h2>
              <p className="text-slate-600">{t("We are working on bringing quality products. Check back soon!", "Estamos trabajando en traer productos de calidad. ¡Vuelve pronto!")}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-lg transition-all group"
                  data-testid={`product-${product.id}`}
                >
                  <div className="aspect-square bg-gradient-to-br from-sky-100 to-sky-50 flex items-center justify-center">
                    <ShoppingBag className="h-16 w-16 text-sky-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="p-6">
                    <span className="text-xs font-medium text-sky-600 uppercase tracking-wide">
                      {product.category}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-2 mb-2">{product.name}</h3>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-2">{product.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-sky-600">${product.price.toFixed(2)}</span>
                      <Button
                        onClick={() => addToCart(product)}
                        className="bg-sky-600 hover:bg-sky-700 text-white rounded-full px-4"
                        disabled={product.stock <= 0}
                        data-testid={`add-to-cart-${product.id}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t("Add", "Agregar")}
                      </Button>
                    </div>
                    {product.stock <= 5 && product.stock > 0 && (
                      <p className="text-orange-600 text-xs mt-2">
                        {t("Only {count} left!", "¡Solo quedan {count} unidades!").replace('{count}', product.stock)}
                      </p>
                    )}
                    {product.stock <= 0 && (
                      <p className="text-red-600 text-xs mt-2">{t("Out of stock", "Agotado")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}