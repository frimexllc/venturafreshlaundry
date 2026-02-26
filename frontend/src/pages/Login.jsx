import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Droplets, Eye, EyeOff } from "lucide-react";
import { useLocale } from "../context/LocaleContext";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedPolicies) {
      toast.error("Debes aceptar los términos y la política de privacidad");
      return;
    }
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        toast.success("¡Bienvenido de vuelta!");
      } else {
        await register(name, email, password);
        toast.success("¡Cuenta creada exitosamente!");
      }
      navigate("/admin");
    } catch (error) {
      const message = error.response?.data?.detail || "Ocurrió un error";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl bg-sky-100 flex items-center justify-center">
              <Droplets className="h-7 w-7 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Ventura Fresh</h1>
              <p className="text-sm text-slate-500">Laundry CRM</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {isLogin ? "Iniciar sesión" : "Crear cuenta"}
            </h2>
            <p className="text-slate-500">
              {isLogin
                ? "Ingresa tus credenciales para acceder al panel"
                : "Completa el formulario para registrarte"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div>
                <Label htmlFor="name" className="text-slate-700">Nombre completo</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="mt-1.5 input-default"
                  required={!isLogin}
                  data-testid="register-name-input"
                />
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-slate-700">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="mt-1.5 input-default"
                required
                data-testid="login-email-input"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-700">Contraseña</Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-default pr-10"
                  required
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  data-testid="toggle-password-visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3" data-testid="login-acceptance">
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(e) => setAcceptedPolicies(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                data-testid="login-accept-checkbox"
              />
              <p className="text-sm text-slate-600">
                Acepto los <Link to="/terms-and-conditions" className="text-sky-600 hover:underline" data-testid="login-terms-link">Términos y condiciones</Link> y la
                <Link to="/privacy-policy" className="text-sky-600 hover:underline ml-1" data-testid="login-privacy-link">Política de privacidad</Link>.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full btn-primary h-11"
              disabled={loading || !acceptedPolicies}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  {isLogin ? "Iniciando..." : "Creando..."}
                </span>
              ) : (
                isLogin ? "Iniciar sesión" : "Crear cuenta"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-sky-600 hover:text-sky-700 font-medium"
              data-testid="toggle-auth-mode"
            >
              {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </div>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1632923565835-6582b54f2105?w=1200')"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-sky-900/80 to-sky-600/70"></div>
        </div>
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <h2 className="text-3xl font-bold mb-3">
            Gestiona tu lavandería de forma eficiente
          </h2>
          <p className="text-sky-100 text-lg max-w-md">
            Control total de clientes, órdenes, cotizaciones B2B y soporte en una sola plataforma.
          </p>
          <div className="mt-8 flex gap-8">
            <div>
              <p className="text-3xl font-bold">100%</p>
              <p className="text-sky-200 text-sm">Digitalizado</p>
            </div>
            <div>
              <p className="text-3xl font-bold">24/7</p>
              <p className="text-sky-200 text-sm">Disponible</p>
            </div>
            <div>
              <p className="text-3xl font-bold">Real-time</p>
              <p className="text-sky-200 text-sm">Tracking</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
