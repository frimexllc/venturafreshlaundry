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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CustomerLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // login or register
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (mode === "login") {
        const res = await axios.post(`${API}/customer/auth/login`, {
          email: form.email,
          password: form.password
        });
        localStorage.setItem('customer_token', res.data.access_token);
        localStorage.setItem('customer_data', JSON.stringify(res.data.customer));
        toast.success("Welcome back!");
        navigate("/account");
      } else {
        const res = await axios.post(`${API}/customer/auth/register`, {
          name: form.name,
          email: form.email,
          password: form.password
        });
        localStorage.setItem('customer_token', res.data.access_token);
        localStorage.setItem('customer_data', JSON.stringify(res.data.customer));
        toast.success("Account created successfully!");
        navigate("/account");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Authentication failed");
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
              {mode === "login" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-slate-600">
              {mode === "login" 
                ? "Sign in to view your orders and manage your account" 
                : "Join us to track your orders and save your preferences"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-slate-100">
            {mode === "register" && (
              <div className="mb-4">
                <Label className="text-slate-700">Full Name</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    required={mode === "register"}
                    className="pl-10"
                    placeholder="Your full name"
                    data-testid="customer-name-input"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <Label className="text-slate-700">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  required
                  className="pl-10"
                  placeholder="your@email.com"
                  data-testid="customer-email-input"
                />
              </div>
            </div>

            <div className="mb-6">
              <Label className="text-slate-700">Password</Label>
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

            <Button 
              type="submit" 
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full" 
              disabled={loading}
              data-testid="customer-submit-btn"
            >
              {loading ? "Please wait..." : (
                <>
                  {mode === "login" ? "Sign In" : "Create Account"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <div className="mt-6 text-center">
              {mode === "login" ? (
                <p className="text-slate-600 text-sm">
                  Don't have an account?{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-sky-600 font-medium hover:underline"
                  >
                    Create one
                  </button>
                </p>
              ) : (
                <p className="text-slate-600 text-sm">
                  Already have an account?{" "}
                  <button 
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-sky-600 font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </form>

          <div className="mt-8 text-center">
            <Link to="/schedule-pickup" className="text-sky-600 hover:underline text-sm">
              Don't have an account? Schedule a pickup to get started →
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
