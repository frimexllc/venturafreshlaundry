/**
 * BecomeAMemberButton — Reusable component
 *
 * Usage:
 *   import BecomeAMemberButton from "./BecomeAMemberButton";
 *
 *   // Default (full styled button):
 *   <BecomeAMemberButton />
 *
 *   // Custom label / className:
 *   <BecomeAMemberButton label="Join Now" className="my-btn" />
 *
 *   // Render-prop (use your own trigger element):
 *   <BecomeAMemberButton asChild>
 *     {({ open }) => <span onClick={open}>Become a member</span>}
 *   </BecomeAMemberButton>
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, X, CheckCircle, Star, LogIn, UserPlus, Sparkles } from "lucide-react";

// ─── tiny hook: detect whether customer is logged-in ────────────────────────
function useCustomerAuth() {
  const token = localStorage.getItem("customer_token");
  const data  = localStorage.getItem("customer_data");
  if (!token) return { loggedIn: false, customer: null };
  try {
    return { loggedIn: true, customer: data ? JSON.parse(data) : null };
  } catch {
    return { loggedIn: true, customer: null };
  }
}

// ─── Step definitions shown in the modal ────────────────────────────────────
const STEPS = [
  {
    icon: <Star className="w-5 h-5" />,
    title: "Choose your plan",
    desc: "Select the membership that best fits your household needs — from 60 lb to 120 lb / month.",
  },
  {
    icon: <UserPlus className="w-5 h-5" />,
    title: "Create your account",
    desc: "Register with your name, email, and address. Verify your email with a quick 6-digit code.",
  },
  {
    icon: <CheckCircle className="w-5 h-5" />,
    title: "Pay securely",
    desc: "Complete payment via Stripe. Your account and membership activate instantly.",
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: "Enjoy hands-free laundry",
    desc: "Schedule pickups, track orders, and manage preferences — all from your customer portal.",
  },
];

// ─── Modal (using React Portal) ─────────────────────────────────────────────
function MemberModal({ onClose, navigate, loggedIn, customer }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", fn);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleContinue = () => {
    onClose();
    if (loggedIn) {
      navigate("/membership");
    } else {
      navigate("/account/login?tab=register&source=membership_button");
    }
  };

  const handleSignIn = () => {
    onClose();
    navigate("/account/login");
  };

  const modalContent = (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(6,18,40,0.72)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Panel principal: flex column, altura máxima, sin overflow oculto externo */}
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ animation: "modalIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Encabezado fijo (no scroll) */}
        <div className="relative bg-gradient-to-br from-sky-600 to-sky-800 px-7 pt-8 pb-10 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.7) 1px,transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/35 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200">
              Ventura Fresh Laundry
            </span>
          </div>
          <h2
            id="modal-title"
            className="text-2xl sm:text-3xl font-bold text-white leading-tight"
          >
            {loggedIn
              ? `Welcome back, ${customer?.name?.split(" ")[0] ?? "member"}! 👋`
              : "Start your membership"}
          </h2>
          <p className="text-sky-200 text-sm mt-2">
            {loggedIn
              ? "You're logged in. Head to the membership page to pick your plan."
              : "It only takes a few minutes. Here's how it works:"}
          </p>
        </div>

        {/* Wave decorativo */}
        <div className="-mt-5 relative z-10 flex-shrink-0">
          <svg viewBox="0 0 500 28" preserveAspectRatio="none" className="w-full h-6">
            <path d="M0,14 C125,0 375,28 500,14 L500,28 L0,28 Z" fill="white" />
          </svg>
        </div>

        {/* Área de contenido SCROLLABLE (solo los pasos y el enlace de "Already have an account") */}
        <div className="flex-1 overflow-y-auto px-7">
          {!loggedIn && (
            <>
              <ol className="space-y-3 -mt-2 mb-5">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-50 border-2 border-sky-200 flex items-center justify-center">
                      <span className="text-xs font-black text-sky-600">{i + 1}</span>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm font-bold text-slate-800 leading-tight">
                        {step.title}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                        {step.desc}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-sky-400 pt-1">{step.icon}</div>
                  </li>
                ))}
              </ol>

              <div className="py-3 border-t border-slate-100 text-center mb-4">
                <p className="text-xs text-slate-500">
                  Already have an account?{" "}
                  <button
                    onClick={handleSignIn}
                    className="text-sky-600 font-bold hover:underline"
                  >
                    Sign in →
                  </button>
                </p>
              </div>
            </>
          )}

          {/* Si el usuario está logueado, mostramos un mensaje simple dentro del área scrollable */}
          {loggedIn && (
            <div className="py-6 text-center text-slate-500 text-sm">
              You're already signed in. Click the button below to view membership plans.
            </div>
          )}
        </div>

        {/* Botones de acción FIJO (siempre visibles al final) */}
        <div className="px-7 pb-7 pt-2 space-y-3 flex-shrink-0 border-t border-slate-100">
          <button
            onClick={handleContinue}
            className="group w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-widest shadow-lg shadow-sky-200 transition-all duration-300 overflow-hidden relative"
            style={{ minHeight: "52px" }}
          >
            <span className="relative z-10 flex items-center gap-2">
              {loggedIn ? (
                <>
                  <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                  View Membership Plans
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Continue — Create Account
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              )}
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>

          {!loggedIn && (
            <button
              onClick={handleSignIn}
              className="group w-full flex items-center justify-center gap-2 border border-slate-200 hover:border-sky-300 bg-white hover:bg-sky-50 active:scale-95 text-slate-700 rounded-2xl px-6 py-3.5 text-sm font-semibold transition-all duration-200"
              style={{ minHeight: "48px" }}
            >
              <LogIn className="w-4 h-4 text-sky-500" />
              I already have an account
            </button>
          )}

          <p className="text-center text-[11px] text-slate-400 leading-relaxed">
            By continuing you agree to our{" "}
            <a href="/terms" className="underline hover:text-sky-600">
              Terms
            </a>{" "}
            &amp;{" "}
            <a href="/privacy" className="underline hover:text-sky-600">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );

  // Renderizar el modal en el body usando portal
  return createPortal(modalContent, document.body);
}

// ─── Public component ────────────────────────────────────────────────────────
export default function BecomeAMemberButton({
  label = "👉 BECOME A MEMBER",
  className = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { loggedIn, customer } = useCustomerAuth();

  const handleOpen  = useCallback(() => setOpen(true),  []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Render-prop / asChild pattern
  if (typeof children === "function") {
    return (
      <>
        {children({ open: handleOpen })}
        {open && (
          <MemberModal
            onClose={handleClose}
            navigate={navigate}
            loggedIn={loggedIn}
            customer={customer}
          />
        )}
      </>
    );
  }

  // Default button
  return (
    <>
      <button
        onClick={handleOpen}
        className={`group inline-flex items-center gap-2 overflow-hidden relative bg-sky-600 hover:bg-sky-700 text-white rounded-full px-8 py-4 text-sm font-bold uppercase tracking-widest shadow-lg shadow-sky-200 cursor-pointer hover:-translate-y-0.5 transition-all duration-300 active:scale-95 ${className}`}
        style={{ minHeight: "52px" }}
      >
        <span className="relative z-10 flex items-center gap-2">
          {label}
          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      </button>

      {open && (
        <MemberModal
          onClose={handleClose}
          navigate={navigate}
          loggedIn={loggedIn}
          customer={customer}
        />
      )}
    </>
  );
}