import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { useLocale } from "../context/LocaleContext";
import heroBanner from "../assets/WhatsApp Image 2026-03-20 at 2.51.26 PM (1).jpeg";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const getErr = (e) => {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return "Error submitting request";
};

const COUNTRIES = [
  { code: "+1",    flag: "🇺🇸", name: "United States", iso: "US" },
  { code: "+1",    flag: "🇨🇦", name: "Canada",         iso: "CA" },
  { code: "+52",   flag: "🇲🇽", name: "México",         iso: "MX" },
  { code: "+44",   flag: "🇬🇧", name: "United Kingdom", iso: "GB" },
  { code: "+34",   flag: "🇪🇸", name: "España",         iso: "ES" },
  { code: "+54",   flag: "🇦🇷", name: "Argentina",      iso: "AR" },
  { code: "+57",   flag: "🇨🇴", name: "Colombia",       iso: "CO" },
  { code: "+56",   flag: "🇨🇱", name: "Chile",          iso: "CL" },
  { code: "+51",   flag: "🇵🇪", name: "Perú",           iso: "PE" },
  { code: "+58",   flag: "🇻🇪", name: "Venezuela",      iso: "VE" },
  { code: "+593",  flag: "🇪🇨", name: "Ecuador",        iso: "EC" },
  { code: "+506",  flag: "🇨🇷", name: "Costa Rica",     iso: "CR" },
  { code: "+507",  flag: "🇵🇦", name: "Panamá",         iso: "PA" },
  { code: "+1787", flag: "🇵🇷", name: "Puerto Rico",    iso: "PR" },
  { code: "+55",   flag: "🇧🇷", name: "Brasil",         iso: "BR" },
  { code: "+598",  flag: "🇺🇾", name: "Uruguay",        iso: "UY" },
  { code: "+33",   flag: "🇫🇷", name: "France",         iso: "FR" },
  { code: "+49",   flag: "🇩🇪", name: "Germany",        iso: "DE" },
  { code: "+39",   flag: "🇮🇹", name: "Italy",          iso: "IT" },
  { code: "+61",   flag: "🇦🇺", name: "Australia",      iso: "AU" },
];

const STAGES = [
  { icon: "👤", en: "Contact",  es: "Contacto",  subEN: "Who are you?",        subES: "¿Quién eres?" },
  { icon: "📍", en: "Address",  es: "Dirección", subEN: "Where to pick up?",   subES: "¿Dónde recogemos?" },
  { icon: "🧺", en: "Service",  es: "Servicio",  subEN: "What do you need?",   subES: "¿Qué necesitas?" },
  { icon: "📅", en: "Schedule", es: "Horario",   subEN: "When works for you?", subES: "¿Cuándo?" },
  { icon: "✅", en: "Confirm",  es: "Confirmar", subEN: "Review & launch",     subES: "Revisar y enviar" },
];

const WASH_PHASES = ["Pre-wash", "Washing", "Rinse", "Spin", "Done!"];

// ─── Phone input ───────────────────────────────────────────────────────────────
const PhoneInput = ({ value, dialCode, dialIso, onValueChange, onDialCodeChange }) => {
  const [open, setOpen]   = useState(false);
  const [srch, setSrch]   = useState("");
  const [foc,  setFoc]    = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const cur    = COUNTRIES.find((c) => c.code === dialCode && c.iso === dialIso) || COUNTRIES[0];
  const list   = COUNTRIES.filter((c) => c.name.toLowerCase().includes(srch.toLowerCase()) || c.code.includes(srch));
  const fmt    = (raw) => {
    const d = raw.replace(/\D/g, "").slice(0, 10);
    if (d.length >= 7) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length >= 4) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length >= 1) return `(${d}`;
    return "";
  };

  const wrap = {
    display: "flex", borderRadius: 12, overflow: "visible",
    border: `1.5px solid ${foc || open ? "#0ea5e9" : "hsl(var(--border))"}`,
    background: "hsl(var(--background))",
    boxShadow: foc || open ? "0 0 0 3px rgba(14,165,233,.12)" : "none",
    transition: "all .15s",
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <div style={wrap}>
        <button type="button" onClick={() => { setOpen((o) => !o); setSrch(""); }}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 10px 10px 12px",
            background: "rgba(14,165,233,.07)", border: "none", borderRight: "1.5px solid hsl(var(--border))",
            borderRadius: "10px 0 0 10px", cursor: "pointer", color: "#0ea5e9", fontWeight: 700,
            fontSize: 12, fontFamily: "inherit", flexShrink: 0, minWidth: 84 }}>
          <span style={{ fontSize: 17 }}>{cur.flag}</span>
          <span>{cur.code}</span>
          <ChevronDown size={12} style={{ opacity: .6, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
        <input type="tel" value={value}
          onChange={(e) => onValueChange(dialCode === "+1" ? fmt(e.target.value) : e.target.value.replace(/[^\d\s\-()+]/g, ""))}
          placeholder={dialCode === "+1" ? "(___) ___-____" : "Phone number"}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          style={{ flex: 1, padding: "10px 12px", border: "none", outline: "none", background: "transparent",
            color: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }} />
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, width: 260,
          background: "hsl(var(--card))", border: "1.5px solid hsl(var(--border))",
          borderRadius: 12, zIndex: 999, boxShadow: "var(--shadow-lg)", overflow: "hidden", maxHeight: 260 }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid hsl(var(--border))" }}>
            <input type="text" value={srch} onChange={(e) => setSrch(e.target.value)} placeholder="Search country…" autoFocus
              style={{ width: "100%", padding: "6px 10px", border: "1px solid hsl(var(--border))", borderRadius: 7,
                background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", maxHeight: 200 }}>
            {list.map((c, i) => (
              <button key={`${c.iso}-${i}`} type="button"
                onClick={() => { onDialCodeChange(c.code, c.iso); onValueChange(""); setOpen(false); setSrch(""); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px 13px",
                  border: "none", background: "none", cursor: "pointer", color: "hsl(var(--foreground))",
                  fontFamily: "inherit", fontSize: 12, textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--secondary))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                <span style={{ fontSize: 16 }}>{c.flag}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ color: "#0ea5e9", fontWeight: 700 }}>{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tiny Washing Machine SVG (rides the track) ────────────────────────────────
const RiderMachine = ({ step }) => {
  const holes = [0, 45, 90, 135, 180, 225, 270, 315];
  const spinDurs = ["2.5s", "2s", "1.2s", "0.7s", "0.5s"];
  const spinDur = spinDurs[step] || "2s";
  const wLevels = [82, 76, 70, 64, 58];
  const wY = wLevels[step] || 82;

  return (
    <svg viewBox="0 0 100 130" width="52" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id="rc"><circle cx="50" cy="65" r="28" /></clipPath>
        <filter id="rg"><feGaussianBlur stdDeviation="1.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="50" cy="127" rx="32" ry="4" fill="#000" opacity=".2" />
      <rect x="4" y="16" width="92" height="100" rx="10" fill="#1a3558" stroke="#2a4568" strokeWidth="1" />
      <rect x="4" y="104" width="92" height="12" fill="#0f1e2e" />
      <rect x="4" y="110" width="92" height="6" rx="6" fill="#0f1e2e" />
      <rect x="4" y="4" width="92" height="14" rx="7" fill="#0c1825" stroke="#1e3355" strokeWidth=".6" />
      {[16, 25, 34, 43, 52].map((x, i) => (
        <circle key={i} cx={x} cy="11" r={i === step ? 2.5 : 1.8}
          fill={i <= step ? "#38bdf8" : "#1a3050"}
          opacity={i === step ? 1 : i < step ? 0.9 : 0.35}>
          {i === step && <animate attributeName="r" values="2.5;3.5;2.5" dur="1s" repeatCount="indefinite" />}
        </circle>
      ))}
      <circle cx="82" cy="11" r="5" fill="#0c2d45" stroke="#38bdf8" strokeWidth=".8" filter="url(#rg)" />
      <circle cx="82" cy="11" r="2" fill="#38bdf8" opacity=".9">
        <animate attributeName="opacity" values=".9;.3;.9" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="65" r="32" fill="#0b1a2a" stroke="#1a3050" strokeWidth=".8" />
      <circle cx="50" cy="65" r="28" fill="#0e1e2e" />
      <g clipPath="url(#rc)">
        <rect x="22" y={wY} width="56" height={130 - wY} fill="#0ea5e9" opacity=".4">
          <animate attributeName="y" values={`${wY};${wY - 3};${wY}`} dur="1.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        </rect>
        {step >= 2 && [{ cx: 36, r: 3 }, { cx: 44, r: 2 }, { cx: 52, r: 3.5 }, { cx: 61, r: 2.5 }].map((b, i) => (
          <circle key={i} cx={b.cx} cy={wY - 1} r={b.r} fill="white" opacity=".5">
            <animate attributeName="cy" values={`${wY-1};${wY-3};${wY-1}`} dur={`${1.6 + i * 0.2}s`} begin={`${i * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {step >= 1 && [{ cx: 36 }, { cx: 50 }, { cx: 64 }].map((b, i) => (
          <circle key={i} cx={b.cx} r={2.5 - i * 0.3} fill="#7dd3fc" opacity=".6">
            <animate attributeName="cy" values={`${wY + 5};${wY - 30};${wY + 5}`} dur={`${2 + i * 0.3}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values=".6;0;.6" dur={`${2 + i * 0.3}s`} begin={`${i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        ))}
        <g style={{ transformOrigin: "50px 65px", animation: `tl_spin ${spinDur} linear infinite` }}>
          {holes.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={50 + 19 * Math.sin(rad)} cy={65 - 19 * Math.cos(rad)} r="3" fill="#071320" stroke="#1e3558" strokeWidth=".5" opacity=".9" />;
          })}
        </g>
        <g transform="translate(50,65)" style={{ transformOrigin: "0 0", animation: `tl_spinr ${spinDur} linear infinite` }}>
          <circle r="8" fill="#050e1a" stroke="#38bdf8" strokeWidth="1" filter="url(#rg)" opacity=".95" />
          <text textAnchor="middle" dy=".35em" fill="#38bdf8" fontSize="4" fontWeight="800" fontFamily="'Manrope',sans-serif" letterSpacing=".8">VFL</text>
        </g>
      </g>
      <circle cx="50" cy="65" r="28" fill="none" stroke="#1e3558" strokeWidth="1.5" />
      <rect x="16" y="115" width="14" height="4" rx="2" fill="#0c1825" />
      <rect x="70" y="115" width="14" height="4" rx="2" fill="#0c1825" />
    </svg>
  );
};

// ─── Wash Cycle Machine (full-size) ───────────────────────────────────────────
const WashMachine = ({ phase, done }) => {
  const holes = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg viewBox="0 0 240 310" width="100%" style={{ maxWidth: 180, display: "block" }}>
      <defs>
        <radialGradient id="wm_b" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1a3558" /><stop offset="50%" stopColor="#243f6a" /><stop offset="100%" stopColor="#1a3558" />
        </radialGradient>
        <clipPath id="wm_c"><circle cx="119" cy="155" r="62" /></clipPath>
        <filter id="wm_g"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="120" cy="304" rx="76" ry="6" fill="#000" opacity=".2" />
      <rect x="10" y="38" width="220" height="240" rx="18" fill="url(#wm_b)" stroke="#2a4568" strokeWidth="1.5" />
      <rect x="10" y="248" width="220" height="30" fill="#0f1e2e" />
      <rect x="10" y="262" width="220" height="16" rx="16" fill="#0f1e2e" />
      <rect x="10" y="12" width="220" height="30" rx="12" fill="#0c1825" stroke="#1e3355" strokeWidth=".8" />
      <circle fill="#38bdf8" cy="27" r="4" opacity=".9">
        <animate attributeName="cx" values="38;54;70;86;102;38" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".9;.4;.9" dur=".5s" repeatCount="indefinite" />
      </circle>
      <rect x="128" y="16" width="52" height="20" rx="5" fill="#040e1a" stroke="#1e3355" strokeWidth=".7" />
      <text x="154" y="29" textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace" opacity=".9">
        {["--", "30°C", "40°C", "60°C", "40°C", "✓"][Math.min(phase + 1, 5)]}
      </text>
      <rect x="47" y="49" width="7" height="11" rx="2" fill="#38bdf8" opacity=".6">
        <animate attributeName="opacity" values=".6;.2;.6" dur="1s" repeatCount="indefinite" />
      </rect>
      <rect x="16" y="46" width="42" height="18" rx="5" fill="#0a1825" stroke="#1e3355" strokeWidth=".7" />
      <rect x="19" y="49" width="12" height="11" rx="2" fill="#091525" />
      <rect x="33" y="49" width="12" height="11" rx="2" fill="#091525" />
      <circle cx="119" cy="155" r="72" fill="#0b1a2a" stroke="#1a3050" strokeWidth="1.2" />
      <circle cx="119" cy="155" r="62" fill="#071e30" />
      <g clipPath="url(#wm_c)">
        <rect x="57" y="110" width="124" height="110" fill="#0ea5e9" opacity=".38" />
        <path fill="#0ea5e9" opacity=".35">
          <animate attributeName="d"
            values="M57,113 Q88,105 119,113 Q150,121 181,113 L181,220 L57,220 Z;M57,108 Q88,118 119,108 Q150,98 181,108 L181,220 L57,220 Z;M57,113 Q88,105 119,113 Q150,121 181,113 L181,220 L57,220 Z"
            dur="1.2s" repeatCount="indefinite" />
        </path>
        {[{ cx: 85, cy: 110, r: 5 }, { cx: 100, cy: 106, r: 4 }, { cx: 119, cy: 108, r: 6.5 },
          { cx: 138, cy: 107, r: 5 }, { cx: 153, cy: 109, r: 4.5 }].map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="white" opacity=".5">
            <animate attributeName="cy" values={`${b.cy};${b.cy - 3};${b.cy}`} dur={`${1.6 + i * 0.18}s`} begin={`${i * 0.15}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {[{ cx: 88 }, { cx: 119 }, { cx: 150 }].map((b, i) => (
          <circle key={i} cx={b.cx} r={3 - i * 0.3} fill="#7dd3fc" opacity=".6">
            <animate attributeName="cy" values="215;100;215" dur={`${1.6 + i * 0.3}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values=".6;0;.6" dur={`${1.6 + i * 0.3}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        ))}
        <g style={{ transformOrigin: "119px 155px", animation: "tl_spin 0.45s linear infinite" }}>
          {holes.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={i} cx={119 + 42 * Math.sin(rad)} cy={155 - 42 * Math.cos(rad)} r="6" fill="#071320" stroke="#1e3558" strokeWidth=".8" opacity=".9" />;
          })}
        </g>
        <g transform="translate(119,155)" style={{ transformOrigin: "0 0", animation: "tl_spinr 0.45s linear infinite" }}>
          <circle r="18" fill="#050e1a" stroke="#38bdf8" strokeWidth="1.5" filter="url(#wm_g)" opacity=".95" />
          <text textAnchor="middle" dy=".35em" fill="#38bdf8" fontSize="8" fontWeight="800" fontFamily="'Manrope',sans-serif" letterSpacing="1.5">
            {done ? "✓" : "VFL"}
          </text>
        </g>
      </g>
      <circle cx="119" cy="155" r="62" fill="none" stroke="#1e3558" strokeWidth="2.5" />
      <rect x="32" y="272" width="24" height="7" rx="3.5" fill="#0c1825" />
      <rect x="184" y="272" width="24" height="7" rx="3.5" fill="#0c1825" />
    </svg>
  );
};

// ─── Reusable form atoms ───────────────────────────────────────────────────────
const inputSt = (foc) => ({
  width: "100%", padding: "9px 11px", boxSizing: "border-box",
  border: `1.5px solid ${foc ? "#0ea5e9" : "hsl(var(--border))"}`,
  borderRadius: 10, background: "hsl(var(--background))", color: "hsl(var(--foreground))",
  fontSize: 12, fontWeight: 500, fontFamily: "inherit", outline: "none",
  boxShadow: foc ? "0 0 0 2px rgba(14,165,233,.12)" : "none", transition: "all .15s",
});
const FInput = (p) => { const [f, setF] = useState(false); return <input {...p} style={{ ...inputSt(f), ...(p.style || {}) }} onFocus={() => setF(true)} onBlur={() => setF(false)} />; };
const FTextarea = ({ rows = 3, ...p }) => { const [f, setF] = useState(false); return <textarea rows={rows} {...p} style={{ ...inputSt(f), resize: "vertical", minHeight: 60 }} onFocus={() => setF(true)} onBlur={() => setF(false)} />; };
const FLabel = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".13em", color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>{children}</div>;
const FF = ({ label, children }) => <div><FLabel>{label}</FLabel>{children}</div>;

const ChipSet = ({ options, value, onChange }) => (
  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
    {options.map((o) => (
      <button key={o.val} type="button" onClick={() => onChange(o.val)}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 16,
          border: `1.5px solid ${value === o.val ? "#0ea5e9" : "hsl(var(--border))"}`,
          background: value === o.val ? "rgba(14,165,233,.1)" : "hsl(var(--secondary))",
          color: value === o.val ? "#0ea5e9" : "hsl(var(--muted-foreground))",
          fontSize: 12, fontWeight: value === o.val ? 700 : 400, cursor: "pointer", transition: "all .15s",
          transform: value === o.val ? "scale(1.03)" : "scale(1)", fontFamily: "inherit" }}>
        <span style={{ fontSize: 14 }}>{o.icon}</span>{o.label}
      </button>
    ))}
  </div>
);

const OptionCards = ({ options, value, onChange }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
    {options.map((o) => {
      const active     = value === o.val;
      const accent     = o.accentColor || "#0ea5e9";
      const accentBg   = o.accentBg    || "rgba(14,165,233,.08)";
      const accentGlow = o.accentGlow  || "rgba(14,165,233,.15)";
      return (
        <button key={o.val} type="button" onClick={() => onChange(o.val)}
          style={{ padding: "14px 8px", borderRadius: 12, textAlign: "center",
            border: `1.5px solid ${active ? accent : "hsl(var(--border))"}`,
            background: active ? accentBg : "hsl(var(--secondary))",
            cursor: "pointer", transition: "all .18s",
            transform: active ? "scale(1.03)" : "scale(1)", fontFamily: "inherit",
            boxShadow: active ? `0 0 0 3px ${accentGlow}` : "none" }}>
          <div style={{ fontSize: 24, marginBottom: 5, lineHeight: 1 }}>{o.icon}</div>
          {o.badge && (
            <div style={{ display: "inline-block", fontSize: 8, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: ".1em", padding: "2px 7px", borderRadius: 8, marginBottom: 5,
              background: o.badgeBg || "rgba(14,165,233,.12)", color: o.badgeColor || accent,
              border: `1px solid ${o.badgeBorder || "rgba(14,165,233,.3)"}` }}>{o.badge}</div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3,
            color: active ? accent : "hsl(var(--foreground))", marginBottom: 3 }}>{o.title}</div>
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", lineHeight: 1.4 }}>{o.desc}</div>
        </button>
      );
    })}
  </div>
);

// ─── Plan Selector (sin precios visibles) ─────────────────────────────────────
const PlanSelector = ({ value, onChange }) => {
  const { t } = useLocale();
  const plans = [
    { val: "standard", icon: "🕒", label: t("Standard (36h)", "Estándar (36h)"), desc: t("Budget-friendly", "Económico") },
    { val: "premium",  icon: "⭐", label: t("Premium (24h)",  "Premium (24h)"),  desc: t("Most popular", "Más popular") },
    { val: "express",  icon: "⚡", label: t("Express (Same Day)", "Express (mismo día)"), desc: t("Fastest service", "Servicio más rápido") },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {plans.map((p) => (
        <button
          key={p.val}
          type="button"
          onClick={() => onChange(p.val)}
          style={{
            flex: 1, padding: "10px 8px", borderRadius: 10, textAlign: "center",
            border: `1.5px solid ${value === p.val ? "#0ea5e9" : "hsl(var(--border))"}`,
            background: value === p.val ? "rgba(14,165,233,.1)" : "hsl(var(--secondary))",
            cursor: "pointer", transition: "all .15s",
            transform: value === p.val ? "scale(1.02)" : "scale(1)",
            fontFamily: "inherit",
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 4 }}>{p.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: value === p.val ? "#0ea5e9" : "hsl(var(--foreground))" }}>{p.label}</div>
          <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{p.desc}</div>
        </button>
      ))}
    </div>
  );
};

// ─── Service Info Panels ──────────────────────────────────────────────────────
const PickupDeliveryInfoPanel = ({ t }) => (
  <div style={{ padding: "13px 15px", borderRadius: 11, marginTop: 8,
    background: "linear-gradient(135deg,rgba(14,165,233,.06),rgba(56,189,248,.04))",
    border: "1px solid rgba(14,165,233,.25)", animation: "tl_panel .25s ease both" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 17 }}>🚚</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#0ea5e9" }}>
        {t("Pickup & Delivery Service", "Servicio de Recogida y Entrega")}
      </span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", marginBottom: 9 }}>
      {[
        { icon: "⚡", en: "Same-day available",     es: "Disponible el mismo día" },
        { icon: "🌿", en: "Eco-friendly detergents", es: "Detergentes ecológicos" },
        { icon: "🩸", en: "Stain treatment",        es: "Tratamiento de manchas" },
        { icon: "📦", en: "Folding & packaging",    es: "Doblado y empaquetado" },
        { icon: "✅", en: "Satisfaction guaranteed", es: "Garantía de satisfacción" },
      ].map((f) => (
        <div key={f.icon} style={{ display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "hsl(var(--foreground))" }}>
          <span style={{ fontSize: 13 }}>{f.icon}</span>
          <span>{t(f.en, f.es)}</span>
        </div>
      ))}
    </div>
    <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(14,165,233,.07)",
      fontSize: 10, color: "#0369a1", lineHeight: 1.55 }}>
      {t(
        "💡 We'll pick up your laundry at your convenience, wash with care, and deliver back fresh & folded.",
        "💡 Recogemos tu ropa cuando prefieras, la lavamos con cuidado y te la devolvemos fresca y doblada."
      )}
    </div>
  </div>
);

const AirbnbInfoPanel = ({ t }) => (
  <div style={{ padding: "13px 15px", borderRadius: 11, marginTop: 8,
    background: "linear-gradient(135deg,rgba(255,92,37,.06),rgba(255,56,92,.04))",
    border: "1px solid rgba(255,92,37,.25)", animation: "tl_panel .25s ease both" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 17 }}>🏠</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#ff5c25" }}>
        {t("Airbnb Host Service", "Servicio para Anfitriones Airbnb")}
      </span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", marginBottom: 9 }}>
      {[
        { icon: "🛏️", en: "Bed linens & towels",   es: "Sábanas y toallas"       },
        { icon: "⚡",  en: "Priority same-day",      es: "Prioridad mismo día"     },
        { icon: "📦",  en: "Folded & bag-ready",     es: "Doblado listo en bolsa"  },
        { icon: "📋",  en: "Inventory checklist",    es: "Lista de inventario"     },
        { icon: "🔄",  en: "Recurring weekly plan",  es: "Plan semanal recurrente" },
        { icon: "💼",  en: "Volume discount",        es: "Descuento por volumen"   },
      ].map((f) => (
        <div key={f.icon} style={{ display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "hsl(var(--foreground))" }}>
          <span style={{ fontSize: 13 }}>{f.icon}</span>
          <span>{t(f.en, f.es)}</span>
        </div>
      ))}
    </div>
    <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(255,92,37,.07)",
      fontSize: 10, color: "#c2440a", lineHeight: 1.55 }}>
      {t(
        "💡 We'll coordinate with your guest checkout schedule and set up recurring pickups.",
        "💡 Coordinamos con tus salidas de huéspedes y configuramos recogidas recurrentes."
      )}
    </div>
  </div>
);

const CommercialInfoPanel = ({ t }) => (
  <div style={{ padding: "13px 15px", borderRadius: 11, marginTop: 8,
    background: "linear-gradient(135deg,rgba(99,102,241,.06),rgba(79,70,229,.04))",
    border: "1px solid rgba(99,102,241,.25)", animation: "tl_panel .25s ease both" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 17 }}>🏢</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5" }}>
        {t("Commercial / B2B Service", "Servicio Comercial / B2B")}
      </span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", marginBottom: 9 }}>
      {[
        { icon: "💰", en: "Bulk pricing",           es: "Precios por volumen" },
        { icon: "📅", en: "Weekly contracts",       es: "Contratos semanales" },
        { icon: "👕", en: "Uniforms & linens",      es: "Uniformes y ropa de cama" },
        { icon: "⚡", en: "Fast turnaround",        es: "Plazo rápido" },
        { icon: "👤", en: "Dedicated account manager", es: "Gestor de cuenta dedicado" },
        { icon: "⚙️", en: "Customizable service",    es: "Servicio personalizable" },
      ].map((f) => (
        <div key={f.icon} style={{ display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "hsl(var(--foreground))" }}>
          <span style={{ fontSize: 13 }}>{f.icon}</span>
          <span>{t(f.en, f.es)}</span>
        </div>
      ))}
    </div>
    <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(99,102,241,.07)",
      fontSize: 10, color: "#3730a3", lineHeight: 1.55 }}>
      {t(
        "💡 Ideal for hotels, restaurants, gyms, and offices. We adapt to your volume and schedule.",
        "💡 Ideal para hoteles, restaurantes, gimnasios y oficinas. Nos adaptamos a tu volumen y horario."
      )}
    </div>
  </div>
);

const TempRow = ({ value, onChange, options }) => (
  <div style={{ display: "flex", gap: 6 }}>
    {options.map((o) => (
      <button key={o.val} type="button" onClick={() => onChange(o.val)}
        style={{ flex: 1, padding: "9px 4px", borderRadius: 9, textAlign: "center",
          border: `1.5px solid ${value === o.val ? "#0ea5e9" : "hsl(var(--border))"}`,
          background: value === o.val ? "rgba(14,165,233,.1)" : "hsl(var(--secondary))",
          cursor: "pointer", transition: "all .15s", minWidth: 0,
          transform: value === o.val ? "scale(1.04)" : "scale(1)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 18, marginBottom: 2 }}>{o.icon}</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: value === o.val ? "#0ea5e9" : "hsl(var(--foreground))" }}>{o.label}</div>
        <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>{o.sub}</div>
      </button>
    ))}
  </div>
);

const WASH_TEMP_OPTIONS = [
  { val: "cold", icon: "❄️",  label: "Cold",  sub: "≤30°C"    },
  { val: "warm", icon: "🌡️", label: "Warm",  sub: "40°C"     },
  { val: "hot",  icon: "🔥",  label: "Hot",   sub: "60°C+"    },
  { val: "any",  icon: "✨",  label: "Any",   sub: "Trust us" },
];

const DRY_TEMP_OPTIONS = [
  { val: "low",    icon: "🌬️", label: "Low",     sub: "Delicates"  },
  { val: "medium", icon: "☀️", label: "Medium",  sub: "Normal"     },
  { val: "high",   icon: "🔆", label: "High",    sub: "Heavy duty" },
  { val: "air",    icon: "🌿", label: "Air dry", sub: "No heat"    },
];

const TimeSlots = ({ value, onChange, locale }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    {[
      { val: "8am-12pm", icon: "🌅", time: "8:00 AM – 12:00 PM", note: locale === "es" ? "Mañana" : "Morning" },
      { val: "2pm-6pm",  icon: "🌆", time: "2:00 PM – 6:00 PM",  note: locale === "es" ? "Tarde"  : "Afternoon" },
    ].map((o) => (
      <button key={o.val} type="button" onClick={() => onChange(o.val)}
        style={{ padding: "12px 8px", borderRadius: 10, textAlign: "center",
          border: `1.5px solid ${value === o.val ? "#0ea5e9" : "hsl(var(--border))"}`,
          background: value === o.val ? "rgba(14,165,233,.08)" : "hsl(var(--secondary))",
          cursor: "pointer", transition: "all .15s",
          transform: value === o.val ? "scale(1.02)" : "scale(1)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 18, marginBottom: 4 }}>{o.icon}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: value === o.val ? "#0ea5e9" : "hsl(var(--foreground))" }}>{o.time}</div>
        <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{o.note}</div>
      </button>
    ))}
  </div>
);

const SumBlock = ({ title, rows }) => (
  <div style={{ padding: "10px 12px", borderRadius: 9, background: "hsl(var(--secondary))", border: "0.5px solid hsl(var(--border))" }}>
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "hsl(var(--muted-foreground))", marginBottom: 6 }}>{title}</div>
    {rows.filter(([, v]) => v).map(([k, v]) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", fontSize: 11 }}>
        <span style={{ color: "hsl(var(--muted-foreground))" }}>{k}</span>
        <span style={{ fontWeight: 600, color: "hsl(var(--foreground))", textAlign: "right" }}>{v}</span>
      </div>
    ))}
  </div>
);

// ─── Conveyor track ─────────────────────────────────────────────────────────────
const ConveyorTrack = ({ cur, locale, onStageClick }) => {
  const stageRefs = useRef([]);
  const trackRef  = useRef(null);
  const [riderLeft, setRiderLeft] = useState(0);

  useEffect(() => {
    if (stageRefs.current[cur] && trackRef.current) {
      const tRect = trackRef.current.getBoundingClientRect();
      const sRect = stageRefs.current[cur].getBoundingClientRect();
      setRiderLeft(sRect.left - tRect.left + sRect.width / 2 - 26);
    }
  }, [cur]);

  return (
    <div style={{
      background: "linear-gradient(150deg,#0b1929 0%,#081320 60%,#040c16 100%)",
      borderRadius: 16, padding: "20px 0 14px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />
      <div style={{ overflowX: "auto", overflowY: "visible", padding: "0 16px", WebkitOverflowScrolling: "touch" }}
        className="scrollbar-hide">
        <div ref={trackRef} style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content", padding: "10px 8px 4px", position: "relative" }}>
          <div style={{ position: "absolute", top: 38, left: 0, right: 0, height: 4,
            background: "repeating-linear-gradient(90deg,#1e3558 0,#1e3558 18px,#0b1929 18px,#0b1929 24px)",
            borderRadius: 2, zIndex: 0 }} />
          <div style={{
            position: "absolute", top: 10, left: riderLeft,
            transition: "left .6s cubic-bezier(.34,1.56,.64,1)", zIndex: 3, pointerEvents: "none",
            animation: "tl_float 4s ease-in-out infinite",
          }}>
            <RiderMachine step={cur} />
          </div>
          {STAGES.map((s, i) => (
            <React.Fragment key={`stage-group-${i}`}>
              {i > 0 && (
                <div key={`conn-${i}`} style={{
                  width: 28, height: 4, marginTop: 26, flexShrink: 0, zIndex: 0, position: "relative",
                  background: i <= cur ? "#0ea5e9" : "#1e3558", transition: "background .3s",
                }}>
                  <div style={{ position: "absolute", top: -3, right: -5, width: 0, height: 0,
                    borderTop: "5px solid transparent", borderBottom: "5px solid transparent",
                    borderLeft: `5px solid ${i <= cur ? "#0ea5e9" : "#1e3558"}`, transition: "border-left-color .3s" }} />
                </div>
              )}
              <div key={`stage-${i}`}
                ref={(el) => (stageRefs.current[i] = el)}
                onClick={() => i < cur && onStageClick(i)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                  cursor: i < cur ? "pointer" : "default", position: "relative", zIndex: 1, width: 112, flexShrink: 0 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20, flexShrink: 0, position: "relative",
                  background: i < cur ? "rgba(14,165,233,.15)" : i === cur ? "#0ea5e9" : "#0b1929",
                  border: `2.5px solid ${i < cur ? "#0ea5e9" : i === cur ? "#38bdf8" : "#1e3558"}`,
                  boxShadow: i === cur ? "0 0 0 6px rgba(14,165,233,.2)" : "none",
                  transform: i === cur ? "scale(1.18)" : "scale(1)",
                  transition: "all .25s cubic-bezier(.34,1.56,.64,1)",
                }}>
                  {s.icon}
                  {i === cur && (
                    <div style={{ position: "absolute", inset: -8, borderRadius: "50%",
                      border: "2px solid rgba(14,165,233,.35)", animation: "tl_pulse 1.6s ease-out infinite" }} />
                  )}
                  {i < cur && (
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16,
                      borderRadius: "50%", background: "#0ea5e9", color: "white", fontSize: 9,
                      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✓</div>
                  )}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em",
                  color: i === cur ? "#38bdf8" : i < cur ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.25)",
                  marginTop: 8, whiteSpace: "nowrap", transition: "color .2s" }}>
                  {locale === "es" ? s.es : s.en}
                </div>
                <div style={{ fontSize: 9, color: i === cur ? "rgba(14,165,233,.7)" : "rgba(255,255,255,.2)",
                  textAlign: "center", maxWidth: 96, lineHeight: 1.4, transition: "color .2s" }}>
                  {locale === "es" ? s.subES : s.subEN}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────────────
const EMPTY = {
  first_name: "", last_name: "", email: "", phone: "", dialCode: "+1", dialIso: "US",
  contact_method: "", sms_consent: false,
  address_line1: "", address_line2: "", city: "", state: "", zip_code: "", addr_notes: "",
  service_type: "", service_plan: "",   // <--- nuevo campo
  wash_temp: "", dry_temp: "", notes: "",
  pickup_date: "", pickup_time: "", terms: false,
};

export default function SchedulePickup() {
  const { t, locale } = useLocale();
  const topRef  = useRef(null);
  const formRef = useRef(null);

  const [cur,        setCur]        = useState(0);
  const [formKey,    setFormKey]    = useState(0);
  const [form,       setForm]       = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [washPhase,  setWashPhase]  = useState(-1);
  const [washDone,   setWashDone]   = useState(false);

  // Pre-fill customer data if logged in
  useEffect(() => {
    try {
      const cd = localStorage.getItem("customer_data");
      if (cd) {
        const c = JSON.parse(cd);
        const nameParts = (c.name || "").split(" ");
        setForm(p => ({
          ...p,
          first_name: p.first_name || nameParts[0] || "",
          last_name: p.last_name || nameParts.slice(1).join(" ") || "",
          email: p.email || c.email || "",
          phone: p.phone || (c.phone || "").replace(/^\+\d+\s?/, "") || "",
        }));
      }
    } catch { /* silent */ }
  }, []);

  const setF = useCallback((k, v) => setForm((p) => ({ ...p, [k]: v })), []);

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const goTo = (n) => { setCur(n); setFormKey((k) => k + 1); scrollToForm(); };

  const validate = () => {
    const err = (msg) => { toast.error(msg); return false; };
    if (cur === 0) {
      if (!form.first_name.trim())      return err(t("Enter your first name",    "Ingresa tu nombre"));
      if (!form.last_name.trim())       return err(t("Enter your last name",     "Ingresa tu apellido"));
      if (!form.email.includes("@"))    return err(t("Enter a valid email",      "Correo inválido"));
      if (!form.phone.trim())           return err(t("Enter your phone",         "Ingresa tu teléfono"));
      if (!form.contact_method)         return err(t("Select a contact method",  "Selecciona método de contacto"));
      if (form.contact_method === "text" && !form.sms_consent)
        return err(t("Accept SMS consent", "Acepta el consentimiento SMS"));
    }
    if (cur === 1) {
      if (!form.address_line1.trim()) return err(t("Enter your address", "Ingresa tu dirección"));
      if (!form.city.trim())          return err(t("Enter your city",    "Ingresa tu ciudad"));
      if (!form.state.trim())         return err(t("Enter your state",   "Ingresa tu estado"));
      if (!form.zip_code.trim())      return err(t("Enter your ZIP",     "Ingresa tu código postal"));
    }
    if (cur === 2) {
      if (!form.service_type) return err(t("Select a service", "Selecciona un servicio"));
      if (form.service_type === "pickup_delivery" && !form.service_plan)
        return err(t("Select a turnaround plan", "Selecciona un plan de tiempo"));
    }
    if (cur === 3 && !form.pickup_time)  return err(t("Select a time window", "Selecciona un horario"));
    if (cur === 4 && !form.terms)        return err(t("Accept terms to continue", "Acepta los términos"));
    return true;
  };

  const handleNext = async () => {
    if (!validate()) return;
    if (cur < 4) { goTo(cur + 1); return; }

    setWashPhase(0); setWashDone(false);
    const phaseDurs = [900, 1100, 1000, 900, 700];
    let cum = 0;
    phaseDurs.forEach((d, i) => { setTimeout(() => setWashPhase(i), cum); cum += d; });

    setSubmitting(true);
    try {
      const fullPhone   = `${form.dialCode} ${form.phone}`.trim();
      const fullAddress = [form.address_line1, form.address_line2, form.city, form.state, form.zip_code].filter(Boolean).join(", ");
      const notes = [
        form.wash_temp ? `Wash temp: ${form.wash_temp}` : "",
        form.dry_temp  ? `Dry temp: ${form.dry_temp}`   : "",
        form.notes?.trim(),
        form.addr_notes ? `Pickup note: ${form.addr_notes}` : "",
        `Contact via: ${form.contact_method}`,
        form.service_plan ? `Service plan: ${form.service_plan}` : "",
      ].filter(Boolean).join("\n");
      await axios.post(`${API}/public/pickup-request`, {
        name: `${form.first_name} ${form.last_name}`.trim(),
        email: form.email.trim(), phone: fullPhone,
        address: fullAddress, pickup_date: form.pickup_date,
        pickup_time: form.pickup_time, service_type: form.service_type,
        service_plan: form.service_plan,
        contact_method: form.contact_method, sms_consent: form.sms_consent, notes,
      });
    } catch (e) { toast.error(getErr(e)); }
    finally { setSubmitting(false); }

    setTimeout(() => { setWashPhase(5); setWashDone(true); }, cum + 400);
  };

  const handleReset = () => {
    setForm({ ...EMPTY }); setCur(0); setFormKey((k) => k + 1);
    setWashPhase(-1); setWashDone(false); scrollToForm();
  };

  const g2   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
  const g3   = { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 };
  const fGap = { display: "flex", flexDirection: "column", gap: 14 };

  const svcMap  = {
    pickup_delivery: t("Pickup & Delivery", "Recogida y Entrega"),
    airbnb_host:     t("Airbnb Host",       "Anfitrión Airbnb"),
    commercial:      t("Commercial / B2B",  "Comercial / B2B"),
  };
  const tempMap = { cold: "Cold ≤30°C", warm: "Warm 40°C", hot: "Hot 60°C+", any: t("Any temperature", "Cualquier temperatura") };
  const dryMap  = {
    low:    t("Low heat",    "Calor bajo"),
    medium: t("Medium heat", "Calor medio"),
    high:   t("High heat",   "Calor alto"),
    air:    t("Air dry",     "Secado al aire"),
  };
  const timeMap = { "8am-12pm": "8:00 AM – 12:00 PM", "2pm-6pm": "2:00 PM – 6:00 PM" };
  const cmMap   = { phone: t("Phone call", "Llamada"), text: "Text/SMS", email: "Email" };
  const planMap = {
    standard: t("Standard (36h)", "Estándar (36h)"),
    premium:  t("Premium (24h)",  "Premium (24h)"),
    express:  t("Express (Same Day)", "Express (mismo día)"),
  };

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <PublicNav />

      <style>{`
        @keyframes tl_spin   { to { transform: rotate(360deg)  } }
        @keyframes tl_spinr  { to { transform: rotate(-360deg) } }
        @keyframes tl_pulse  { 0%{transform:scale(.85);opacity:.8} 100%{transform:scale(1.35);opacity:0} }
        @keyframes tl_float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes tl_panel  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tl_wash   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tl_shimmer{ 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        .scrollbar-hide::-webkit-scrollbar{display:none}
        .scrollbar-hide{scrollbar-width:none}
      `}</style>

      {/* Hero */}
      <section ref={topRef} style={{
        paddingTop: 80, paddingBottom: 0,
        background: "linear-gradient(150deg,#0b1929 0%,#081320 55%,#040c16 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -80, left: -60, width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle,rgba(14,165,233,.14) 0%,transparent 65%)", filter: "blur(40px)", pointerEvents: "none" }} />

        {/* Banner image */}
        <div style={{ width: "100%", maxHeight: 280, overflow: "hidden", position: "relative" }}>
          <img src={heroBanner} alt="Ventura Fresh Laundry"
            style={{ width: "100%", height: 280, objectFit: "cover", objectPosition: "center", display: "block", opacity: 0.75 }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120, background: "linear-gradient(to bottom, transparent, #081320)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, #0b1929, transparent)", pointerEvents: "none" }} />
        </div>

        {/* Text */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 40px", position: "relative", zIndex: 2 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "4px 12px", marginBottom: 14 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,.9)", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".16em", color: "rgba(255,255,255,.5)" }}>
              {t("Premium Laundry Service", "Servicio Premium de Lavandería")}
            </span>
          </div>
          <h1 style={{ fontFamily: "'Manrope',sans-serif", fontSize: "clamp(24px,4vw,42px)", fontWeight: 800, color: "white", lineHeight: 1.15, letterSpacing: "-.02em", margin: "0 0 10px" }}>
            {t("Your Pick-up", "Tu Recogida")}<br />
            <span style={{ color: "#38bdf8" }}>{t("Begins Here.", "Comienza Aquí.")}</span>
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,.45)", lineHeight: 1.7, maxWidth: 380, margin: 0 }}>
            {t("Follow the wash cycle — each stage is a step on the conveyor belt.", "Sigue el ciclo de lavado — cada etapa es un paso en la cinta transportadora.")}
          </p>
        </div>
      </section>

      {/* Main content */}
      <section style={{ padding: "0 0 64px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px" }}>

          <div ref={formRef} id="schedule-pickup-form" style={{ marginTop: "-20px", position: "relative", zIndex: 2 }}>
            <ConveyorTrack cur={washPhase >= 0 ? 4 : cur} locale={locale} onStageClick={(i) => { if (washPhase < 0) goTo(i); }} />
          </div>

          {/* Wash overlay */}
          {washPhase >= 0 && (
            <div style={{ background: "#07111d", borderRadius: 16, marginTop: 16, border: "0.5px solid rgba(14,165,233,.2)", padding: "32px 24px", textAlign: "center", animation: "tl_wash .4s ease both" }}>
              {!washDone ? (
                <>
                  <div style={{ width: 180, margin: "0 auto", animation: "tl_float 3s ease-in-out infinite" }}>
                    <WashMachine phase={washPhase} done={false} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Manrope',sans-serif", color: "white", marginTop: 14 }}>
                    {[t("Pre-rinsing…","Pre-enjuague…"), t("Washing…","Lavando…"), t("Rinsing…","Enjuagando…"), t("Spinning…","Centrifugando…"), t("Done!","¡Listo!")][Math.min(washPhase, 4)]}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                    {["Getting things started", "Cleaning in progress", "Rinsing with care", "Almost there!", "✓ Confirmed"][Math.min(washPhase, 4)]}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
                    {WASH_PHASES.map((p, i) => (
                      <div key={i} style={{ textAlign: "center", width: 52 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", margin: "0 auto 4px", background: i < washPhase ? "#0ea5e9" : i === washPhase ? "#38bdf8" : "rgba(255,255,255,.1)", boxShadow: i === washPhase ? "0 0 0 3px rgba(56,189,248,.25)" : "none", transition: "all .3s" }} />
                        <div style={{ fontSize: 9, fontWeight: 600, color: i <= washPhase ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.2)" }}>{p}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ animation: "tl_panel .5s ease both" }}>
                  <div style={{ width: 180, margin: "0 auto", animation: "tl_float 4s ease-in-out infinite" }}>
                    <WashMachine phase={5} done={true} />
                  </div>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(52,211,153,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "12px auto 10px" }}>🎉</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Manrope',sans-serif", color: "white", marginBottom: 6 }}>
                    {t("Request submitted!", "¡Solicitud enviada!")}
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,.45)", maxWidth: 280, lineHeight: 1.65, margin: "0 auto 20px" }}>
                    {t("Our team will confirm your pickup via", "Nuestro equipo confirmará por")}{" "}
                    <strong style={{ color: "#38bdf8" }}>{cmMap[form.contact_method] || t("your preferred method", "tu método preferido")}</strong>.
                  </p>
                  <button onClick={handleReset} style={{ padding: "11px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow-sky)" }}>
                    🔄 {t("Schedule another", "Programar otra")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form card */}
          {washPhase < 0 && (
            <div key={formKey} style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, boxShadow: "var(--shadow-lg)", overflow: "hidden", marginTop: 16, animation: "tl_panel .3s ease both" }}>
              <div style={{ height: 3, background: "linear-gradient(90deg,#38bdf8,#0ea5e9,#2563eb)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(14,165,233,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {STAGES[cur].icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Manrope',sans-serif", color: "hsl(var(--foreground))" }}>
                    {locale === "es" ? STAGES[cur].subES : STAGES[cur].subEN}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>
                    {t(`Step ${cur + 1} of 5`, `Paso ${cur + 1} de 5`)} — {locale === "es" ? STAGES[cur].es : STAGES[cur].en}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {STAGES.map((_, i) => (
                    <div key={i} style={{ width: i === cur ? 20 : 7, height: 7, borderRadius: 3.5, background: i < cur ? "#0ea5e9" : i === cur ? "#0ea5e9" : "hsl(var(--border))", transition: "all .3s", cursor: i < cur ? "pointer" : "default" }} onClick={() => i < cur && goTo(i)} />
                  ))}
                </div>
              </div>

              <div style={{ padding: "20px 24px" }}>
                <div style={fGap}>

                  {/* Step 0 — Contact */}
                  {cur === 0 && (
                    <>
                      <div style={g2}>
                        <FF label={t("First name *", "Nombre *")}><FInput value={form.first_name} onChange={(e) => setF("first_name", e.target.value)} placeholder="John" autoComplete="given-name" /></FF>
                        <FF label={t("Last name *", "Apellido *")}><FInput value={form.last_name} onChange={(e) => setF("last_name", e.target.value)} placeholder="Smith" autoComplete="family-name" /></FF>
                      </div>
                      <FF label={t("Email *", "Correo *")}><FInput type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="you@example.com" autoComplete="email" /></FF>
                      <FF label={t("Phone *", "Teléfono *")}>
                        <PhoneInput value={form.phone} dialCode={form.dialCode} dialIso={form.dialIso}
                          onValueChange={(v) => setF("phone", v)}
                          onDialCodeChange={(code, iso) => { setF("dialCode", code); setF("dialIso", iso); setF("phone", ""); }} />
                      </FF>
                      <FF label={t("Best way to reach you *", "Cómo contactarte *")}>
                        <ChipSet value={form.contact_method} onChange={(v) => { setF("contact_method", v); if (v !== "text") setF("sms_consent", false); }}
                          options={[
                            { val: "phone", icon: "📞", label: t("Phone call", "Llamada") },
                            { val: "text",  icon: "💬", label: "Text/SMS" },
                            { val: "email", icon: "✉️", label: "Email" },
                          ]} />
                      </FF>
                      {form.contact_method === "text" && (
                        <SmsConsentField checked={form.sms_consent} onChange={(e) => setF("sms_consent", e.target.checked)} idPrefix="pickup-sms" />
                      )}
                    </>
                  )}

                  {/* Step 1 — Address */}
                  {cur === 1 && (
                    <>
                      <FF label={t("Street address *", "Dirección *")}>
                        <AddressAutocomplete
                          value={form.address_line1}
                          onChange={(v) => setF("address_line1", v)}
                          onSelect={(addr) => {
                            setF("address_line1", addr.street);
                            if (addr.city) setF("city", addr.city);
                            if (addr.state) setF("state", addr.state.length > 2 ? addr.state.substring(0, 2).toUpperCase() : addr.state.toUpperCase());
                            if (addr.zip) setF("zip_code", addr.zip);
                          }}
                          placeholder={t("123 Main St", "Calle Principal 123")}
                          renderInput={(props) => <FInput {...props} data-testid="pickup-address-autocomplete" />}
                        />
                      </FF>
                      <FF label={t("Apt / Suite (optional)", "Apto / Suite (opcional)")}><FInput value={form.address_line2} onChange={(e) => setF("address_line2", e.target.value)} placeholder={t("Apt 4B…", "Apto 4B…")} /></FF>
                      <div style={g3}>
                        <FF label={t("City *", "Ciudad *")}><FInput value={form.city} onChange={(e) => setF("city", e.target.value)} placeholder="Los Angeles" autoComplete="address-level2" /></FF>
                        <FF label={t("State *", "Estado *")}><FInput value={form.state} onChange={(e) => setF("state", e.target.value.toUpperCase())} placeholder="CA" maxLength={2} /></FF>
                        <FF label={t("ZIP *", "CP *")}><FInput value={form.zip_code} onChange={(e) => setF("zip_code", e.target.value)} placeholder="90001" maxLength={10} /></FF>
                      </div>
                      <FF label={t("Access notes (optional)", "Notas de acceso (opcional)")}><FTextarea value={form.addr_notes} onChange={(e) => setF("addr_notes", e.target.value)} placeholder={t("Gate code, building entrance…", "Código de puerta, entrada del edificio…")} rows={2} /></FF>
                    </>
                  )}

                  {/* Step 2 — Service */}
                  {cur === 2 && (
                    <>
                      <FF label={t("Service type *", "Tipo de servicio *")}>
                        <OptionCards value={form.service_type} onChange={(v) => setF("service_type", v)}
                          options={[
                            {
                              val: "pickup_delivery", icon: "🚚",
                              title: t("Pickup & Delivery", "Recogida y Entrega"),
                              desc:  t("We wash, fold & return", "Lavamos, doblamos y entregamos"),
                            },
                            {
                              val: "airbnb_host", icon: "🏠",
                              title: t("Airbnb Host", "Anfitrión Airbnb"),
                              desc:  t("Linens, towels & priority", "Sábanas, toallas y prioridad"),
                              badge: t("NEW", "NUEVO"),
                              badgeBg:     "rgba(255,92,37,.12)",
                              badgeColor:  "#ff5c25",
                              badgeBorder: "rgba(255,92,37,.3)",
                              accentColor: "#ff5c25",
                              accentBg:    "rgba(255,92,37,.07)",
                              accentGlow:  "rgba(255,92,37,.18)",
                            },
                            {
                              val: "commercial", icon: "🏢",
                              title: t("Commercial / B2B",  "Comercial / B2B"),
                              desc:  t("Bulk & business laundry", "Lavado masivo y empresas"),
                            },
                          ]} />
                        {/* Mostrar panel y selector de plan solo para pickup_delivery */}
                        {form.service_type === "pickup_delivery" && (
                          <>
                            <FF label={t("Turnaround plan *", "Plan de tiempo *")}>
                              <PlanSelector value={form.service_plan} onChange={(v) => setF("service_plan", v)} />
                            </FF>
                            <PickupDeliveryInfoPanel t={t} />
                          </>
                        )}
                        {form.service_type === "airbnb_host" && <AirbnbInfoPanel t={t} />}
                        {form.service_type === "commercial" && <CommercialInfoPanel t={t} />}
                        <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 8 }}>
                          {t("Need Wash & Fold drop-off?", "¿Necesitas Wash & Fold drop-off?")}{" "}
                          <Link to="/wash-fold" style={{ color: "#0ea5e9", fontWeight: 600 }}>{t("Go to form →", "Ir al formulario →")}</Link>
                        </p>
                      </FF>

                      <FF label={t("Wash temperature", "Temperatura de lavado")}>
                        <TempRow value={form.wash_temp} onChange={(v) => setF("wash_temp", v)} options={WASH_TEMP_OPTIONS} />
                      </FF>

                      <FF label={t("Dry temperature", "Temperatura de secado")}>
                        <TempRow value={form.dry_temp} onChange={(v) => setF("dry_temp", v)} options={DRY_TEMP_OPTIONS} />
                        <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 5, lineHeight: 1.5 }}>
                          {t(
                            "Choose low or air dry for delicates, knits and activewear.",
                            "Elige baja o secado al aire para prendas delicadas, tejidos y ropa deportiva."
                          )}
                        </p>
                      </FF>

                      <FF label={t("Special instructions (optional)", "Instrucciones especiales (opcional)")}>
                        <FTextarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder={t("Detergent type, hang-dry items, folding style…", "Tipo de detergente, prendas a secar, estilo de doblado…")} />
                      </FF>
                    </>
                  )}

                  {/* Step 3 — Schedule */}
                  {cur === 3 && (
                    <>
                      <FF label={t("Preferred pickup date", "Fecha preferida")}><FInput type="date" value={form.pickup_date} onChange={(e) => setF("pickup_date", e.target.value)} min={new Date().toISOString().split("T")[0]} style={{ cursor: "pointer" }} /></FF>
                      <FF label={t("Preferred time window *", "Horario preferido *")}>
                        <TimeSlots value={form.pickup_time} onChange={(v) => setF("pickup_time", v)} locale={locale} />
                        <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 5 }}>
                          {t("Pacific Time · Our team will confirm via your preferred method", "Hora del Pacífico · Confirmamos por tu método preferido")}
                        </p>
                      </FF>
                    </>
                  )}

                  {/* Step 4 — Confirm */}
                  {cur === 4 && (
                    <>
                      <SumBlock title={`👤 ${t("Contact", "Contacto")}`} rows={[
                        [t("Name","Nombre"),     `${form.first_name} ${form.last_name}`.trim()],
                        [t("Email","Correo"),    form.email],
                        [t("Phone","Teléfono"), `${form.dialCode} ${form.phone}`.trim()],
                        [t("Contact via","Via"), cmMap[form.contact_method]],
                      ]} />
                      <SumBlock title={`📍 ${t("Address", "Dirección")}`} rows={[
                        [t("Street","Calle"),               form.address_line1],
                        [t("City / State / ZIP","Ciudad / Estado / CP"), [form.city,form.state,form.zip_code].filter(Boolean).join(", ")],
                      ]} />
                      <SumBlock title={`🧺 ${t("Service", "Servicio")}`} rows={[
                        [t("Type","Tipo"), svcMap[form.service_type]],
                        ...(form.service_type === "pickup_delivery" && form.service_plan ? [[t("Plan","Plan"), planMap[form.service_plan]]] : []),
                        [t("Wash temp","Temp lavado"),  tempMap[form.wash_temp]],
                        [t("Dry temp","Temp secado"),   dryMap[form.dry_temp]],
                        ...(form.notes ? [[t("Notes","Notas"), form.notes.slice(0,70)]] : []),
                      ]} />
                      <SumBlock title={`📅 ${t("Schedule", "Horario")}`} rows={[
                        [t("Date","Fecha"),    form.pickup_date || t("Flexible","Flexible")],
                        [t("Window","Ventana"), timeMap[form.pickup_time]],
                      ]} />
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", background: "hsl(var(--secondary))", borderRadius: 9, border: "0.5px solid hsl(var(--border))" }}>
                        <input type="checkbox" id="sp-terms" checked={form.terms} onChange={(e) => setF("terms", e.target.checked)} style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1, accentColor: "#0ea5e9", cursor: "pointer" }} />
                        <label htmlFor="sp-terms" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, cursor: "pointer" }}>
                          {t("I accept the", "Acepto los")}{" "}
                          <Link to="/terms-and-conditions" style={{ color: "#0ea5e9", fontWeight: 600 }}>{t("Terms", "Términos")}</Link>{" & "}
                          <Link to="/privacy-policy" style={{ color: "#0ea5e9", fontWeight: 600 }}>{t("Privacy Policy", "Privacidad")}</Link>.{" "}
                          {t("By submitting I authorize Ventura Fresh Laundry to contact me.", "Al enviar autorizo a Ventura Fresh Laundry a contactarme.")}
                        </label>
                      </div>
                    </>
                  )}

                </div>

                {/* Nav */}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  {cur > 0 && (
                    <button type="button" onClick={() => goTo(cur - 1)} style={{ padding: "10px 16px", borderRadius: 9, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                      ← {t("Back", "Atrás")}
                    </button>
                  )}
                  <button type="button" onClick={handleNext} disabled={submitting || (cur === 4 && !form.terms)}
                    style={{ flex: 1, padding: "11px 16px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#0ea5e9,#2563eb)", color: "white", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", cursor: (submitting || (cur === 4 && !form.terms)) ? "not-allowed" : "pointer", opacity: (submitting || (cur === 4 && !form.terms)) ? 0.5 : 1, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "var(--shadow-sky)", transition: "all .15s", position: "relative", overflow: "hidden" }}>
                    {submitting ? (
                      <>
                        <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "white", borderRadius: "50%", animation: "tl_spin .7s linear infinite" }} />
                        {t("Sending…", "Enviando…")}
                      </>
                    ) : cur < 4 ? (
                      <>{t("Next", "Siguiente")}: {locale === "es" ? STAGES[cur + 1].es : STAGES[cur + 1].en} →</>
                    ) : (
                      <>🚀 {t("Start the wash cycle!", "¡Iniciar ciclo de lavado!")}</>
                    )}
                    <span style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)", transform: "translateX(-100%)", animation: "tl_shimmer 2s ease infinite", pointerEvents: "none" }} />
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      <PublicFooter />
    </div>
  );
}