import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { User, Mail, Lock, ArrowRight } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CustomerLogin() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // login or register
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error(t("You must accept the terms and privacy policy", "Debes aceptar los términos y la política de privacidad"));
      return;
    }
    setLoading(true);
    
    try {
      if (mode === "login") {
        const res = await axios.post(`${API}/customer/auth/login`, {
          email: form.email,
          password: form.password
        });
        localStorage.setItem('customer_token', res.data.access_token);
        localStorage.setItem('customer_data', JSON.stringify(res.data.customer));
        toast.success(t("Welcome back!", "¡Bienvenido de nuevo!"));
        navigate("/account");
      } else {
        const res = await axios.post(`${API}/customer/auth/register`, {
          name: form.name,
          email: form.email,
          password: form.password
        });
        localStorage.setItem('customer_token', res.data.access_token);
        localStorage.setItem('customer_data', JSON.stringify(res.data.customer));
        toast.success(t("Account created successfully!", "¡Cuenta creada exitosamente!"));
        navigate("/account");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Authentication failed", "Autenticación fallida"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
              <User className="h-8 w-8 text-sky-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              {mode === "login" ? t("Welcome Back", "Bienvenido de nuevo") : t("Create Account", "Crear cuenta")}
            </h1>
            <p className="text-slate-600">
              {mode === "login" 
                ? t("Sign in to view your orders and manage your account", "Inicia sesión para ver tus órdenes y administrar tu cuenta")
                : t("Join us to track your orders and save your preferences", "Únete para rastrear tus órdenes y guardar tus preferencias")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-slate-100">
            {mode === "register" && (
              <div className="mb-4">
                <Label className="text-slate-700">{t("Full Name", "Nombre completo")}</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    required={mode === "register"}
                    className="pl-10"
                    placeholder={t("Your full name", "Tu nombre completo")}
                    data-testid="customer-name-input"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <Label className="text-slate-700">{t("Email", "Correo")}</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  required
                  className="pl-10"
                  placeholder={t("your@email.com", "tu@correo.com")}
                  data-testid="customer-email-input"
                />
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-slate-700">{t("Password", "Contraseña")}</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({...form, password: e.target.value})}
                  required
                  className="pl-10"
                  placeholder="••••••••"
                  data-testid="customer-password-input"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 mb-6" data-testid="customer-acceptance">
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(e) => setAcceptedPolicies(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                data-testid="customer-accept-checkbox"
              />
              <p className="text-sm text-slate-600">
                {t("I accept the", "Acepto los")}{" "}
                <Link to="/terms-and-conditions" className="text-sky-600 hover:underline" data-testid="customer-terms-link">
                  {t("Terms and Conditions", "Términos y condiciones")}
                </Link>{" "}
                {t("and the", "y la")}{" "}
                <Link to="/privacy-policy" className="text-sky-600 hover:underline ml-1" data-testid="customer-privacy-link">
                  {t("Privacy Policy", "Política de privacidad")}
                </Link>.
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" 
              disabled={loading || !acceptedPolicies}
              data-testid="customer-submit-btn"
            >
              {loading ? t("Please wait...", "Espere por favor...") : (
                <>
                  {mode === "login" ? t("Sign In", "Iniciar sesión") : t("Create Account", "Crear cuenta")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <div className="mt-6 text-center">
              {mode === "login" ? (
                <p className="text-slate-600 text-sm">
                  {t("Don't have an account?", "¿No tienes una cuenta?")}{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-sky-600 font-medium hover:underline"
                  >
                    {t("Create one", "Crea una")}
                  </button>
                </p>
              ) : (
                <p className="text-slate-600 text-sm">
                  {t("Already have an account?", "¿Ya tienes una cuenta?")}{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-sky-600 font-medium hover:underline"
                  >
                    {t("Sign in", "Inicia sesión")}
                  </button>
                </p>
              )}
            </div>
          </form>

          <div className="mt-8 text-center">
            <Link to="/schedule-pickup" className="text-sky-600 hover:underline text-sm">
              {t("Don't have an account? Schedule a pickup to get started →", "¿No tienes una cuenta? Programa una recogida para comenzar →")}
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}