import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── ADD-ON CATALOG ───────────────────────────────────────────────────────────
const ADDON_CATALOG = [
  // HOME ESSENTIALS
  { id: "bath_mat",            name: "Bath Mat",                                      price: 8.00,  category: "home_essentials" },
  { id: "heavy_rubber_mat",    name: "Heavy Rubber Bath Mat",                         price: 13.00, category: "home_essentials" },
  { id: "oven_mitt",           name: "Oven Mitt",                                     price: 8.00,  category: "home_essentials" },
  { id: "pet_bed_s",           name: "Pet Bed (Small)",                               price: 15.00, category: "home_essentials" },
  { id: "pet_bed_ml",          name: "Pet Bed (M/L)",                                 price: 18.00, category: "home_essentials" },
  // BEDDING
  { id: "pillow_std",          name: "Standard Pillow",                               price: 10.00, category: "bedding" },
  { id: "pillow_lg",           name: "Large Pillow",                                  price: 15.00, category: "bedding" },
  { id: "duvet_cover",         name: "Duvet Cover",                                   price: 15.00, category: "bedding" },
  { id: "blanket_small",       name: "Blanket (Small)",                               price: 15.00, category: "bedding" },
  { id: "blanket_large",       name: "Blanket (Large/Heavy)",                         price: 25.00, category: "bedding" },
  // COMFORTERS
  { id: "comforter_twin_full", name: "Comforter Twin/Full",                           price: 22.00, category: "comforters" },
  { id: "comforter_queen",     name: "Comforter Queen",                               price: 25.00, category: "comforters" },
  { id: "comforter_king",      name: "Comforter King",                                price: 30.00, category: "comforters" },
  { id: "mattress_cover",      name: "Mattress Cover",                                price: 25.00, category: "comforters" },
  { id: "down_comforter",      name: "Down Comforter (Goose Down / Special Material)",price: 40.00, category: "comforters" },
  // ADD-ON SERVICES
  { id: "same_day_service",    name: "Same Day Service",                              price: 10.00, category: "addons" },
  { id: "express_service",     name: "Express Service (Less than 4 Hours)",           price: 20.00, category: "addons" },
  { id: "hypoallergenic_det",  name: "Hypoallergenic Detergent",                      price: 5.00,  category: "addons" },
  { id: "premium_softener",    name: "Premium Softener",                              price: 4.00,  category: "addons" },
  { id: "pet_hair_removal",    name: "Pet Hair Removal",                              price: 10.00, category: "addons" },
  { id: "heavy_soil_treatment",name: "Heavy Soil Treatment",                          price: 15.00, category: "addons" },
  { id: "oversized_item_fee",  name: "Oversized Item Fee",                            price: 10.00, category: "addons" },
];

// ─── Preference Grid ──────────────────────────────────────────────────────────
const PreferenceGrid = ({ title, options, selected, onSelect }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "#64748b", marginBottom: 10 }}>
      {title}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
      {options.map(opt => {
        const active = selected === opt.value;
        return (
          <div key={opt.value} onClick={() => onSelect(opt.value)}
            style={{
              padding: "14px 10px", borderRadius: 12,
              border: `1.5px solid ${active ? "#0ea5e9" : "#e2e8f0"}`,
              background: active ? "rgba(14,165,233,0.08)" : "#f8fafc",
              cursor: "pointer", textAlign: "center", transition: "all .2s",
              transform: active ? "scale(1.03)" : "scale(1)",
              boxShadow: active ? "0 0 0 3px rgba(14,165,233,.12)" : "none",
            }}>
            <div style={{ fontSize: 20 }}>{opt.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, color: active ? "#0369a1" : "#0f172a" }}>{opt.label}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{opt.sub}</div>
          </div>
        );
      })}
    </div>
  </div>
);

const WASH_OPTIONS = [
  { value: "cold", icon: "❄️",  label: "Cold", sub: "≤30°C"    },
  { value: "warm", icon: "🌡️", label: "Warm", sub: "40°C"     },
  { value: "hot",  icon: "🔥",  label: "Hot",  sub: "60°C+"    },
  { value: "any",  icon: "✨",  label: "Any",  sub: "Trust us" },
];
const DRY_OPTIONS = [
  { value: "low",    icon: "🧊", label: "Low",     sub: "Delicates"  },
  { value: "medium", icon: "🌤️",label: "Medium",  sub: "Normal"     },
  { value: "high",   icon: "☀️", label: "High",    sub: "Heavy duty" },
  { value: "air",    icon: "🌿", label: "Air dry", sub: "No heat"    },
];

// ─── Plan Selector ────────────────────────────────────────────────────────────
const PlanSelector = ({ value, onChange }) => {
  const { t } = useLocale();
  const plans = [
    { val: "standard", icon: "🕒", label: t("Standard", "Estándar"), time: "36h",                        price: 2.25 },
    { val: "premium",  icon: "⭐", label: "Premium",                  time: "24h",                        price: 2.50 },
    { val: "express",  icon: "⚡", label: "Express",                  time: t("Same Day", "Mismo día"),   price: 2.75 },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {plans.map((p) => {
        const active = value === p.val;
        return (
          <button key={p.val} type="button" onClick={() => onChange(p.val)} data-testid={`plan-${p.val}`}
            style={{
              flex: 1, padding: "12px 8px", borderRadius: 12, textAlign: "center",
              border: `2px solid ${active ? "#0ea5e9" : "#e2e8f0"}`,
              background: active ? "rgba(14,165,233,.08)" : "#f8fafc",
              cursor: "pointer", transition: "all .15s",
              transform: active ? "scale(1.02)" : "scale(1)", fontFamily: "inherit",
              boxShadow: active ? "0 0 0 3px rgba(14,165,233,.15)" : "none",
            }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: active ? "#0ea5e9" : "#0f172a" }}>{p.label}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 600 }}>{p.time}</div>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#059669" }}>${p.price.toFixed(2)}/lb</div>
          </button>
        );
      })}
    </div>
  );
};

// ─── Add-on Selector (REDESIGNED) ────────────────────────────────────────────
const AddonSelector = ({ selectedAddons, onToggle, t }) => {
  const CATEGORY_META = {
    home_essentials: { label: t("Home Essentials", "Artículos del hogar"),   icon: "🏠" },
    bedding:         { label: t("Bedding", "Ropa de cama"),                   icon: "🛏️" },
    comforters:      { label: t("Comforters", "Edredones"),                   icon: "🌙" },
    addons:          { label: t("Add-on Services", "Servicios adicionales"),  icon: "⚡" },
  };

  const groupedAddons = ADDON_CATALOG.reduce((acc, addon) => {
    const cat = addon.category || "home_essentials";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(addon);
    return acc;
  }, {});

  const getQty = (id) => selectedAddons.find(a => a.id === id)?.quantity || 0;

  const updateQty = (addon, delta) => {
    const current = getQty(addon.id);
    const next = current + delta;
    if (next <= 0) {
      onToggle(selectedAddons.filter(a => a.id !== addon.id));
    } else if (current === 0) {
      onToggle([...selectedAddons, { ...addon, quantity: next }]);
    } else {
      onToggle(selectedAddons.map(a => a.id === addon.id ? { ...a, quantity: next } : a));
    }
  };

  const totalPrice = selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
  const totalItems = selectedAddons.reduce((s, a) => s + (a.quantity || 1), 0);

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 18, paddingBottom: 12, borderBottom: "2px solid #e0f2fe",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, flexShrink: 0,
            boxShadow: "0 3px 10px rgba(14,165,233,.3)",
          }}>📦</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0c4a6e" }}>
              {t("Individual Items / Add-ons", "Artículos individuales / Extras")}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {t("Per piece pricing — add as many as you need", "Precio por pieza — agrega los que necesites")}
            </div>
          </div>
        </div>
        {totalItems > 0 && (
          <div style={{
            padding: "5px 13px", borderRadius: 20, flexShrink: 0,
            background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
            color: "white", fontSize: 11, fontWeight: 800,
            boxShadow: "0 2px 8px rgba(14,165,233,.3)",
            animation: "wf_fadein .2s ease both",
          }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── Groups ── */}
      {Object.entries(groupedAddons).map(([category, items]) => {
        const meta = CATEGORY_META[category] || { label: category, icon: "✨" };
        return (
          <div key={category} style={{ marginBottom: 22 }}>
            {/* Category header */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ fontSize: 15 }}>{meta.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: ".12em", color: "#0369a1",
              }}>{meta.label}</span>
              <div style={{ flex: 1, height: 1, background: "#e0f2fe", marginLeft: 4 }} />
            </div>

            {/* Items — single column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(addon => {
                const qty = getQty(addon.id);
                const active = qty > 0;
                return (
                  <div key={addon.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 14px", borderRadius: 12,
                    border: `2px solid ${active ? "#0ea5e9" : "#e2e8f0"}`,
                    background: active
                      ? "linear-gradient(135deg,rgba(14,165,233,.07),rgba(56,189,248,.03))"
                      : "#fafbfc",
                    transition: "all .18s cubic-bezier(.34,1.56,.64,1)",
                    transform: active ? "scale(1.005)" : "scale(1)",
                    boxShadow: active ? "0 2px 14px rgba(14,165,233,.13)" : "none",
                  }}>
                    {/* Name + price */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, lineHeight: 1.35,
                        color: active ? "#0369a1" : "#0f172a",
                        transition: "color .15s",
                      }}>
                        {addon.name}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginTop: 2 }}>
                        ${addon.price.toFixed(2)}
                        <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8", marginLeft: 3 }}>
                          / piece
                        </span>
                      </div>
                    </div>

                    {/* Counter widget */}
                    <div style={{
                      display: "flex", alignItems: "center", flexShrink: 0,
                      borderRadius: 10, overflow: "hidden",
                      border: `1.5px solid ${active ? "#0ea5e9" : "#e2e8f0"}`,
                      background: "white",
                      boxShadow: active ? "0 0 0 3px rgba(14,165,233,.1)" : "none",
                      transition: "all .2s",
                    }}>
                      {/* Minus */}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => { e.stopPropagation(); updateQty(addon, -1); }}
                        style={{
                          width: 38, height: 38, border: "none",
                          background: qty > 0 ? "rgba(14,165,233,.08)" : "#f8fafc",
                          cursor: qty > 0 ? "pointer" : "default",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20, fontWeight: 700, lineHeight: 1,
                          color: qty > 0 ? "#0ea5e9" : "#d1d5db",
                          transition: "all .15s", flexShrink: 0,
                          userSelect: "none",
                        }}
                      >−</button>

                      {/* Count */}
                      <div style={{
                        width: 36, height: 38,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800,
                        color: active ? "#0ea5e9" : "#94a3b8",
                        borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0",
                        background: "white", transition: "color .15s",
                        userSelect: "none",
                      }}>
                        {qty}
                      </div>

                      {/* Plus */}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => { e.stopPropagation(); updateQty(addon, +1); }}
                        style={{
                          width: 38, height: 38, border: "none",
                          background: active ? "#0ea5e9" : "#f8fafc",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20, fontWeight: 700, lineHeight: 1,
                          color: active ? "white" : "#94a3b8",
                          transition: "all .15s", flexShrink: 0,
                          userSelect: "none",
                        }}
                      >+</button>
                    </div>

                    {/* Subtotal */}
                    {active && (
                      <div style={{
                        fontSize: 13, fontWeight: 800, color: "#0ea5e9",
                        minWidth: 50, textAlign: "right", flexShrink: 0,
                        animation: "wf_fadein .15s ease both",
                      }}>
                        ${(addon.price * qty).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Total bar ── */}
      {totalPrice > 0 && (
        <div style={{
          marginTop: 4, padding: "14px 18px", borderRadius: 12,
          background: "linear-gradient(135deg,rgba(14,165,233,.1),rgba(56,189,248,.06))",
          border: "1.5px solid rgba(14,165,233,.25)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "wf_fadein .2s ease both",
          boxShadow: "0 2px 14px rgba(14,165,233,.1)",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1" }}>
              {t("Add-ons subtotal", "Subtotal extras")}
            </div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
              {totalItems} item{totalItems !== 1 ? "s" : ""} {t("selected", "seleccionados")}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0ea5e9" }}>
            ${totalPrice.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const getErr = (e) => {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return "Error submitting request";
};

const COUNTRIES = [
  { code: "+1",  flag: "🇺🇸", name: "United States", iso: "US" },
  { code: "+1",  flag: "🇨🇦", name: "Canada",        iso: "CA" },
  { code: "+52", flag: "🇲🇽", name: "México",        iso: "MX" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom",iso: "GB" },
  { code: "+34", flag: "🇪🇸", name: "España",        iso: "ES" },
  { code: "+54", flag: "🇦🇷", name: "Argentina",     iso: "AR" },
  { code: "+57", flag: "🇨🇴", name: "Colombia",      iso: "CO" },
  { code: "+56", flag: "🇨🇱", name: "Chile",         iso: "CL" },
  { code: "+51", flag: "🇵🇪", name: "Perú",          iso: "PE" },
  { code: "+55", flag: "🇧🇷", name: "Brasil",        iso: "BR" },
  { code: "+33", flag: "🇫🇷", name: "France",        iso: "FR" },
  { code: "+49", flag: "🇩🇪", name: "Germany",       iso: "DE" },
  { code: "+39", flag: "🇮🇹", name: "Italy",         iso: "IT" },
  { code: "+61", flag: "🇦🇺", name: "Australia",     iso: "AU" },
];

const STAGES = [
  { icon: "👤", en: "Contact",  es: "Contacto",   subEN: "Who are you?",     subES: "¿Quién eres?"      },
  { icon: "📍", en: "Drop-Off", es: "Entrega",    subEN: "Where & when?",    subES: "¿Dónde y cuándo?"  },
  { icon: "🧺", en: "Laundry",  es: "Lavandería", subEN: "Your preferences", subES: "Tus preferencias"  },
  { icon: "✅", en: "Confirm",  es: "Confirmar",  subEN: "Review & submit",  subES: "Revisar y enviar"  },
];

const FOLD_EN = ["Dropping off…","Soaking…","Washing…","Rinsing…","Folding…","Ready! 🎉"];
const FOLD_ES = ["Entregando…","Remojando…","Lavando…","Enjuagando…","Doblando…","¡Listo! 🎉"];

// ─── Laundry Basket SVG ───────────────────────────────────────────────────────
const BasketSVG = ({ phase = 0, done = false, size = 120 }) => {
  const bubbles = [
    { cx:32,cy:56,r:4,dur:"2.1s",delay:"0s"  },
    { cx:50,cy:43,r:6,dur:"1.8s",delay:".3s" },
    { cx:68,cy:51,r:3,dur:"2.4s",delay:".6s" },
    { cx:84,cy:41,r:5,dur:"2s",  delay:".1s" },
    { cx:57,cy:36,r:7,dur:"1.6s",delay:".8s" },
  ];
  const clothColors = ["#7dd3fc","#bae6fd","#e0f2fe","#f0f9ff","#38bdf8"];
  return (
    <svg viewBox="0 0 120 140" width={size} style={{ display:"block", overflow:"visible" }}>
      <defs>
        <clipPath id="bk_cl"><ellipse cx="60" cy="85" rx="44" ry="36"/></clipPath>
        <radialGradient id="bk_w" cx="50%" cy="80%" r="60%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity=".5"/>
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity=".2"/>
        </radialGradient>
        <filter id="bk_gl"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="60" cy="137" rx="36" ry="5" fill="#000" opacity=".1"/>
      <ellipse cx="60" cy="85" rx="48" ry="38" fill="#f0f9ff" stroke="#bae6fd" strokeWidth="2"/>
      {[70,78,86,94,102,110].map((y,i)=>(
        <line key={i} x1="13" y1={y} x2="107" y2={y} stroke="#e0f2fe" strokeWidth="1.2" opacity=".7"/>
      ))}
      {[24,36,48,60,72,84,96].map((x,i)=>(
        <line key={i} x1={x} y1="50" x2={x} y2="122" stroke="#e0f2fe" strokeWidth="1" opacity=".45"/>
      ))}
      {phase>=1 && phase<=3 && (
        <g clipPath="url(#bk_cl)">
          <rect x="16" y="100" width="88" height="30" fill="url(#bk_w)">
            <animate attributeName="y" values="105;98;105" dur="1.4s" repeatCount="indefinite"/>
          </rect>
          <path fill="#7dd3fc" opacity=".3">
            <animate attributeName="d"
              values="M16,103 Q38,95 60,103 Q82,111 104,103 L104,122 L16,122 Z;M16,98 Q38,108 60,98 Q82,88 104,98 L104,122 L16,122 Z;M16,103 Q38,95 60,103 Q82,111 104,103 L104,122 L16,122 Z"
              dur="1.4s" repeatCount="indefinite"/>
          </path>
        </g>
      )}
      {phase!==4 && (
        <g clipPath="url(#bk_cl)">
          {clothColors.slice(0,done?3:Math.max(2,5-phase)).map((c,i)=>(
            <ellipse key={i} cx={28+i*16} cy={88+(i%2)*8} rx={14-i} ry={9}
              fill={c} opacity={.85-i*.05} stroke="white" strokeWidth=".8"/>
          ))}
        </g>
      )}
      {(phase>=4||done) && (
        <g transform="translate(24,62)">
          {[0,1,2].map(i=>(
            <rect key={i} x={4+i*2} y={i*9} width={64-i*4} height={8}
              rx={3} fill={clothColors[i]} stroke="white" strokeWidth=".8" opacity=".95">
              {done && <animate attributeName="y" values={`${i*9};${i*9-2};${i*9}`} dur={`${1.5+i*.2}s`} repeatCount="indefinite"/>}
            </rect>
          ))}
          {done && <text x="36" y="37" textAnchor="middle" fontSize="10" fill="#0369a1" fontWeight="700" fontFamily="inherit">✓</text>}
        </g>
      )}
      {(phase===1||phase===2) && bubbles.map((b,i)=>(
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="none" stroke="#7dd3fc" strokeWidth="1.2" opacity=".7">
          <animate attributeName="cy" values={`${b.cy};${b.cy-28};${b.cy-28}`} dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".7;0;0" dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
          <animate attributeName="r" values={`${b.r};${b.r*1.6};${b.r*1.6}`} dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
        </circle>
      ))}
      {phase===3 && [
        {d:"M40,18 Q44,10 40,2",delay:"0s",dur:"2s"},
        {d:"M60,14 Q64,6 60,-2",delay:".5s",dur:"1.8s"},
        {d:"M80,18 Q84,10 80,2",delay:".9s",dur:"2.2s"},
      ].map((s,i)=>(
        <path key={i} d={s.d} fill="none" stroke="#bae6fd" strokeWidth="2.5" strokeLinecap="round" opacity="0">
          <animate attributeName="opacity" values="0;.6;0" dur={s.dur} begin={s.delay} repeatCount="indefinite"/>
        </path>
      ))}
      <ellipse cx="60" cy="50" rx="48" ry="14" fill="#e0f2fe" stroke="#bae6fd" strokeWidth="1.8"/>
      <ellipse cx="60" cy="50" rx="40" ry="10" fill="#f8fafc" stroke="#bae6fd" strokeWidth="1"/>
      <path d="M18,55 Q8,40 18,28" fill="none" stroke="#bae6fd" strokeWidth="3" strokeLinecap="round"/>
      <path d="M102,55 Q112,40 102,28" fill="none" stroke="#bae6fd" strokeWidth="3" strokeLinecap="round"/>
      {done && (
        <circle cx="60" cy="50" r="30" fill="none" stroke="#22d3ee" strokeWidth="2" opacity=".5">
          <animate attributeName="opacity" values=".5;.1;.5" dur="2s" repeatCount="indefinite"/>
        </circle>
      )}
    </svg>
  );
};

// ─── Journey Track ────────────────────────────────────────────────────────────
const JourneyTrack = ({ cur, locale, onStageClick }) => {
  const stageRefs = useRef([]);
  const trackRef  = useRef(null);
  const [rLeft, setRLeft] = useState(0);

  useEffect(() => {
    if (stageRefs.current[cur] && trackRef.current) {
      const tr = trackRef.current.getBoundingClientRect();
      const sr = stageRefs.current[cur].getBoundingClientRect();
      setRLeft(sr.left - tr.left + sr.width/2 - 26);
    }
  }, [cur]);

  return (
    <div style={{
      background:"linear-gradient(160deg,#f0f9ff 0%,#e0f2fe 55%,#bae6fd 100%)",
      borderRadius:20, padding:"22px 0 16px",
      border:"1.5px solid #bae6fd", position:"relative", overflow:"hidden",
      boxShadow:"0 4px 28px rgba(14,165,233,.1)",
    }}>
      <div style={{ position:"absolute", inset:0,
        backgroundImage:"radial-gradient(circle,rgba(14,165,233,.1) 1px,transparent 1px)",
        backgroundSize:"18px 18px", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", top:46, left:0, right:0, height:2,
        background:"linear-gradient(90deg,transparent,#7dd3fc 10%,#38bdf8 50%,#7dd3fc 90%,transparent)",
        opacity:.45, zIndex:0 }}/>
      <div style={{ overflowX:"auto", overflowY:"visible", padding:"0 16px" }} className="wf-sh">
        <div ref={trackRef} style={{ display:"flex", alignItems:"flex-start",
          minWidth:"max-content", padding:"8px 12px 4px", position:"relative", gap:0 }}>
          <div style={{ position:"absolute", top:0, left:rLeft,
            transition:"left .7s cubic-bezier(.34,1.56,.64,1)", zIndex:3, pointerEvents:"none",
            animation:"wf_float 3.5s ease-in-out infinite" }}>
            <BasketSVG phase={Math.min(cur,3)} size={52}/>
          </div>
          {STAGES.map((s,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center" }}>
              {i>0 && (
                <div style={{ width:32, height:3, marginTop:30, flexShrink:0, zIndex:0,
                  background:i<=cur?"linear-gradient(90deg,#38bdf8,#0ea5e9)":"#bae6fd",
                  borderRadius:2, transition:"background .3s", position:"relative" }}>
                  {i<=cur && (
                    <div style={{ position:"absolute", top:-3.5, right:-4, width:0, height:0,
                      borderTop:"5px solid transparent", borderBottom:"5px solid transparent",
                      borderLeft:"5px solid #0ea5e9" }}/>
                  )}
                </div>
              )}
              <div ref={el=>stageRefs.current[i]=el}
                onClick={()=>i<cur&&onStageClick(i)}
                style={{ display:"flex", flexDirection:"column", alignItems:"center",
                  cursor:i<cur?"pointer":"default", width:108, flexShrink:0, zIndex:1 }}>
                <div style={{
                  width:60, height:60, borderRadius:"50%",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
                  background:i===cur?"#0ea5e9":i<cur?"rgba(14,165,233,.15)":"white",
                  border:`2.5px solid ${i===cur?"#38bdf8":i<cur?"#0ea5e9":"#bae6fd"}`,
                  boxShadow:i===cur?"0 0 0 6px rgba(14,165,233,.18),0 4px 16px rgba(14,165,233,.25)":"0 2px 8px rgba(14,165,233,.07)",
                  transform:i===cur?"scale(1.18)":"scale(1)",
                  transition:"all .3s cubic-bezier(.34,1.56,.64,1)", position:"relative",
                }}>
                  {s.icon}
                  {i===cur && (
                    <div style={{ position:"absolute", inset:-9, borderRadius:"50%",
                      border:"2px solid rgba(14,165,233,.3)", animation:"wf_pulse 1.8s ease-out infinite" }}/>
                  )}
                  {i<cur && (
                    <div style={{ position:"absolute", bottom:-1, right:-1, width:18, height:18,
                      borderRadius:"50%", background:"#0ea5e9", color:"white", fontSize:9,
                      display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700,
                      border:"2px solid white" }}>✓</div>
                  )}
                </div>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".1em",
                  color:i===cur?"#0369a1":i<cur?"#0ea5e9":"#94a3b8",
                  marginTop:8, whiteSpace:"nowrap", transition:"color .2s" }}>
                  {locale==="es"?s.es:s.en}
                </div>
                <div style={{ fontSize:9, color:i===cur?"#0ea5e9":"#cbd5e1",
                  textAlign:"center", maxWidth:96, lineHeight:1.4 }}>
                  {locale==="es"?s.subES:s.subEN}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Phone Input ──────────────────────────────────────────────────────────────
const PhoneInput = ({ value, dialCode, dialIso, onValueChange, onDialCodeChange }) => {
  const [open,setOpen]=useState(false);
  const [srch,setSrch]=useState("");
  const [foc,setFoc]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    const fn=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[]);
  const cur=COUNTRIES.find(c=>c.code===dialCode&&c.iso===dialIso)||COUNTRIES[0];
  const list=COUNTRIES.filter(c=>c.name.toLowerCase().includes(srch.toLowerCase())||c.code.includes(srch));
  const fmt=raw=>{
    const d=raw.replace(/\D/g,"").slice(0,10);
    if(d.length>=7) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if(d.length>=4) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if(d.length>=1) return `(${d}`;
    return "";
  };
  return (
    <div style={{ position:"relative" }} ref={ref}>
      <div style={{ display:"flex", borderRadius:12, overflow:"visible",
        border:`1.5px solid ${foc||open?"#0ea5e9":"#cbd5e1"}`,
        background:"white", boxShadow:foc||open?"0 0 0 3px rgba(14,165,233,.1)":"none", transition:"all .15s" }}>
        <button type="button" onClick={()=>{setOpen(o=>!o);setSrch("");}}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"10px 10px 10px 12px",
            background:"rgba(14,165,233,.06)", border:"none", borderRight:"1.5px solid #e2e8f0",
            borderRadius:"10px 0 0 10px", cursor:"pointer", color:"#0369a1", fontWeight:700,
            fontSize:12, fontFamily:"inherit", flexShrink:0, minWidth:84 }}>
          <span style={{ fontSize:17 }}>{cur.flag}</span>
          <span>{cur.code}</span>
          <ChevronDown size={12} style={{ opacity:.6, transform:open?"rotate(180deg)":"none", transition:"transform .15s" }}/>
        </button>
        <input type="tel" value={value}
          onChange={e=>onValueChange(dialCode==="+1"?fmt(e.target.value):e.target.value.replace(/[^\d\s\-()+]/g,""))}
          placeholder={dialCode==="+1"?"(___) ___-____":"Phone number"}
          onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{ flex:1, padding:"10px 12px", border:"none", outline:"none",
            background:"transparent", color:"#0f172a", fontSize:13, fontWeight:500, fontFamily:"inherit" }}/>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 5px)", left:0, width:260,
          background:"white", border:"1.5px solid #e2e8f0", borderRadius:12, zIndex:999,
          boxShadow:"0 8px 32px rgba(0,0,0,.12)", overflow:"hidden", maxHeight:260 }}>
          <div style={{ padding:"8px 10px", borderBottom:"1px solid #f1f5f9" }}>
            <input type="text" value={srch} onChange={e=>setSrch(e.target.value)}
              placeholder="Search country…" autoFocus
              style={{ width:"100%", padding:"6px 10px", border:"1px solid #e2e8f0", borderRadius:7,
                background:"#f8fafc", color:"#0f172a", fontSize:12, fontFamily:"inherit", outline:"none" }}/>
          </div>
          <div style={{ overflowY:"auto", maxHeight:200 }}>
            {list.map((c,i)=>(
              <button key={`${c.iso}-${i}`} type="button"
                onClick={()=>{ onDialCodeChange(c.code,c.iso); onValueChange(""); setOpen(false); setSrch(""); }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:9, padding:"8px 13px",
                  border:"none", background:"none", cursor:"pointer", color:"#0f172a",
                  fontFamily:"inherit", fontSize:12, textAlign:"left" }}
                onMouseEnter={e=>e.currentTarget.style.background="#f0f9ff"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                <span style={{ fontSize:16 }}>{c.flag}</span>
                <span style={{ flex:1 }}>{c.name}</span>
                <span style={{ color:"#0ea5e9", fontWeight:700 }}>{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Form Atoms ───────────────────────────────────────────────────────────────
const FInput = (p) => {
  const [f,setF]=useState(false);
  return (
    <input {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{ width:"100%", padding:"9px 12px", boxSizing:"border-box",
        border:`1.5px solid ${f?"#0ea5e9":"#cbd5e1"}`, borderRadius:10,
        background:"white", color:"#0f172a", fontSize:13, fontWeight:500,
        fontFamily:"inherit", outline:"none",
        boxShadow:f?"0 0 0 3px rgba(14,165,233,.1)":"none", transition:"all .15s", ...(p.style||{}) }}/>
  );
};
const FTextarea=({rows=3,...p})=>{
  const [f,setF]=useState(false);
  return (
    <textarea rows={rows} {...p} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{ width:"100%", padding:"9px 12px", boxSizing:"border-box",
        border:`1.5px solid ${f?"#0ea5e9":"#cbd5e1"}`, borderRadius:10,
        background:"white", color:"#0f172a", fontSize:13, fontWeight:500,
        fontFamily:"inherit", outline:"none",
        boxShadow:f?"0 0 0 3px rgba(14,165,233,.1)":"none", transition:"all .15s",
        resize:"vertical", minHeight:72, ...(p.style||{}) }}/>
  );
};
const FLabel=({children})=>(
  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:".12em",
    color:"#64748b", marginBottom:5 }}>{children}</div>
);
const FF=({label,children})=><div><FLabel>{label}</FLabel>{children}</div>;

const ChipSet=({options,value,onChange})=>(
  <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
    {options.map(o=>(
      <button key={o.val} type="button" onClick={()=>onChange(o.val)}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:20,
          border:`1.5px solid ${value===o.val?"#0ea5e9":"#e2e8f0"}`,
          background:value===o.val?"rgba(14,165,233,.08)":"#f8fafc",
          color:value===o.val?"#0369a1":"#64748b",
          fontSize:12, fontWeight:value===o.val?700:400, cursor:"pointer",
          transition:"all .18s cubic-bezier(.34,1.56,.64,1)",
          transform:value===o.val?"scale(1.04)":"scale(1)", fontFamily:"inherit" }}>
        <span style={{ fontSize:14 }}>{o.icon}</span>{o.label}
      </button>
    ))}
  </div>
);

const SumBlock=({title,rows})=>(
  <div style={{ padding:"12px 14px", borderRadius:12, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
    <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:".12em", color:"#0369a1", marginBottom:8 }}>{title}</div>
    {rows.filter(([,v])=>v).map(([k,v])=>(
      <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"3px 0", fontSize:12 }}>
        <span style={{ color:"#64748b" }}>{k}</span>
        <span style={{ fontWeight:600, color:"#0f172a", textAlign:"right", maxWidth:"60%" }}>{v}</span>
      </div>
    ))}
  </div>
);

// ─── Info Panel ───────────────────────────────────────────────────────────────
const WashFoldInfoPanel = ({ t }) => (
  <div style={{ padding: "13px 15px", borderRadius: 11, marginTop: 16,
    background: "linear-gradient(135deg,rgba(14,165,233,.06),rgba(56,189,248,.04))",
    border: "1px solid rgba(14,165,233,.25)", animation: "wf_fadein .25s ease both" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 17 }}>🧺</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#0ea5e9" }}>
        {t("Wash & Fold Service", "Servicio de Lavado y Doblado")}
      </span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", marginBottom: 9 }}>
      {[
        { icon: "💧", en: "Professional washing",    es: "Lavado profesional"      },
        { icon: "🩸", en: "Stain treatment",         es: "Tratamiento de manchas"  },
        { icon: "👕", en: "Expert folding",          es: "Doblado experto"         },
        { icon: "🌿", en: "Eco-friendly detergents", es: "Detergentes ecológicos"  },
        { icon: "⚡", en: "Quick turnaround",        es: "Plazo rápido"            },
        { icon: "✅", en: "Ready for pickup",        es: "Listo para recoger"      },
      ].map((f) => (
        <div key={f.icon} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#0f172a" }}>
          <span style={{ fontSize: 13 }}>{f.icon}</span>
          <span>{t(f.en, f.es)}</span>
        </div>
      ))}
    </div>
    <div style={{ padding: "7px 10px", borderRadius: 8, background: "rgba(14,165,233,.07)",
      fontSize: 10, color: "#0369a1", lineHeight: 1.55 }}>
      {t(
        "💡 Just drop off your laundry at our store. We wash, fold, and have it ready for you.",
        "💡 Solo deja tu ropa en nuestra tienda. Lavamos, doblamos y la dejamos lista para ti."
      )}
    </div>
  </div>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY = {
  first_name:"", last_name:"", email:"", phone:"", dialCode:"+1", dialIso:"US",
  contact_method:"", sms_consent:false,
  address_line1:"", address_line2:"", city:"", state:"", zip_code:"",
  dropoff_date:"", notes:"", terms:false,
  plan:"", addons:[],
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WashFoldRequest() {
  const [washTemp, setWashTemp] = useState("");
  const [dryTemp, setDryTemp]   = useState("");
  const { t, locale } = useLocale();
  const topRef  = useRef(null);
  const formRef = useRef(null);
  const [cur, setCur]           = useState(0);
  const [formKey, setFormKey]   = useState(0);
  const [form, setForm]         = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [foldPhase, setFoldPhase]   = useState(-1);
  const [foldDone, setFoldDone]     = useState(false);
  const setF = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const scrollToForm = () => {
    if (formRef.current) formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goTo = (n) => {
    setCur(n);
    setFormKey(k => k + 1);
    requestAnimationFrame(scrollToForm);
  };

  // ── Pre-fill from localStorage ────────────────────────────────────────────
  useEffect(() => {
    try {
      const cd = localStorage.getItem("customer_data");
      if (!cd) return;
      const c = JSON.parse(cd);

      const nameParts = (c.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName  = nameParts.slice(1).join(" ") || "";
      const rawPhone  = (c.phone || "").replace(/^\+\d{1,3}\s?/, "").trim();

      let street = c.address_line1 || "";
      let city   = c.city          || "";
      let state  = c.state         || "";
      let zip    = c.zip_code      || "";

      if (!street && c.address) {
        const parts = c.address.split(",").map(s => s.trim()).filter(Boolean);
        if (parts.length >= 1) street = parts[0];
        if (parts.length === 3) {
          city = parts[1];
          const lastPart = parts[2].split(/\s+/);
          state = lastPart[0];
          zip   = lastPart.slice(1).join("") || "";
        } else if (parts.length === 4) {
          city  = parts[1];
          state = parts[2];
          zip   = parts[3];
        } else if (parts.length >= 5) {
          street = parts.slice(0, parts.length - 3).join(", ");
          city   = parts[parts.length - 3];
          state  = parts[parts.length - 2];
          zip    = parts[parts.length - 1];
        }
        if (state && !zip) {
          const sv = state.split(/\s+/);
          if (sv.length === 2) { state = sv[0]; zip = sv[1]; }
        }
      }

      setForm(p => ({
        ...p,
        first_name:    p.first_name    || firstName,
        last_name:     p.last_name     || lastName,
        email:         p.email         || c.email || "",
        phone:         p.phone         || rawPhone,
        address_line1: p.address_line1 || street,
        city:          p.city          || city,
        state:         p.state         || state,
        zip_code:      p.zip_code      || zip,
      }));
    } catch {}
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const err = msg => { toast.error(msg); return false; };
    if (cur === 0) {
      if (!form.first_name.trim())   return err(t("Enter your first name",   "Ingresa tu nombre"));
      if (!form.last_name.trim())    return err(t("Enter your last name",    "Ingresa tu apellido"));
      if (!form.email.includes("@")) return err(t("Enter a valid email",     "Correo inválido"));
      if (!form.phone.trim())        return err(t("Enter your phone",        "Ingresa tu teléfono"));
      if (!form.contact_method)      return err(t("Select a contact method", "Selecciona método de contacto"));
      if (form.contact_method === "text" && !form.sms_consent)
        return err(t("Accept SMS consent", "Acepta el consentimiento SMS"));
    }
    if (cur === 1 && !form.dropoff_date)
      return err(t("Select a drop-off date", "Selecciona fecha de entrega"));
    if (cur === 2 && !form.plan)
      return err(t("Select a turnaround plan", "Selecciona un plan de tiempo"));
    if (cur === 3 && !form.terms)
      return err(t("Accept terms to continue", "Acepta los términos"));
    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleNext = async () => {
    if (!validate()) return;
    if (cur < 3) { goTo(cur + 1); return; }

    setFoldPhase(0); setFoldDone(false);
    const durs = [700, 900, 1000, 900, 800, 600];
    let cum = 0;
    durs.forEach((d, i) => { setTimeout(() => setFoldPhase(i), cum); cum += d; });

    setSubmitting(true);
    try {
      const fullPhone = `${form.dialCode} ${form.phone}`.trim();
      const fullAddr  = [form.address_line1, form.address_line2, form.city, form.state, form.zip_code]
        .filter(Boolean).join(", ");
      const addonsWithQuantity = form.addons.map(a => ({
        id: a.id, name: a.name, price: a.price,
        quantity: a.quantity || 1, category: a.category,
      }));
      await axios.post(`${API}/public/wash-fold-request`, {
        name:           `${form.first_name} ${form.last_name}`.trim(),
        email:          form.email.trim(),
        phone:          fullPhone,
        address:        fullAddr || null,
        dropoff_date:   form.dropoff_date,
        dropoff_time:   "",
        contact_method: form.contact_method,
        sms_consent:    form.sms_consent,
        notes:          form.notes?.trim() || "",
        plan:           form.plan,
        wash_temp:      washTemp,
        dry_temp:       dryTemp,
        addon_services: addonsWithQuantity,
      });
      setForm(p => ({ ...p, addons: [] }));
    } catch (e) { toast.error(getErr(e)); }
    finally { setSubmitting(false); }

    setTimeout(() => { setFoldPhase(5); setFoldDone(true); }, cum + 300);
  };

  const handleReset = () => {
    setForm({ ...EMPTY }); setCur(0); setFormKey(k => k + 1);
    setFoldPhase(-1); setFoldDone(false);
    setWashTemp(""); setDryTemp("");
    scrollToForm();
  };

  const cmMap = { phone: t("Phone call","Llamada"), text: "Text/SMS", email: "Email" };
  const planMap = {
    standard: t("Standard (36h)", "Estándar (36h)"),
    premium:  t("Premium (24h)",  "Premium (24h)"),
    express:  t("Express (Same Day)", "Express (mismo día)"),
  };
  const addonTotal = form.addons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc" }}>
      <PublicNav/>

      <style>{`
        @keyframes wf_float   {0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes wf_pulse   {0%{transform:scale(.85);opacity:.8}100%{transform:scale(1.4);opacity:0}}
        @keyframes wf_fadein  {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes wf_pop     {from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        @keyframes wf_spin    {to{transform:rotate(360deg)}}
        @keyframes wf_shimmer {0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes wf_bounce  {0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
        .wf-sh::-webkit-scrollbar{display:none}
        .wf-sh{scrollbar-width:none}
        .wf-basket-hero svg{width:clamp(100px,22vw,160px);height:auto}
        @media(max-width:640px){
          .wf-hero-inner{padding:0 16px !important}
          .wf-hero-badge{font-size:9px !important;padding:4px 10px !important;flex-wrap:wrap;text-align:center}
          .wf-hero-sub{font-size:14px !important}
          .wf-form-grid2{grid-template-columns:1fr !important}
          .wf-form-grid3{grid-template-columns:1fr !important}
        }
        @media(max-width:480px){
          .wf-basket-hero svg{width:88px !important}
        }
      `}</style>

      {/* ── Hero ── */}
      <section ref={topRef} style={{
        paddingTop:140, paddingBottom:64,
        background:"linear-gradient(160deg,#f0f9ff 0%,#e0f2fe 55%,#bae6fd 100%)",
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", top:-60, right:-60, width:320, height:320, borderRadius:"50%",
          background:"radial-gradient(circle,rgba(14,165,233,.18) 0%,transparent 60%)",
          filter:"blur(32px)", pointerEvents:"none" }}/>
        <div style={{ position:"absolute", bottom:-40, left:-40, width:220, height:220, borderRadius:"50%",
          background:"radial-gradient(circle,rgba(56,189,248,.12) 0%,transparent 60%)",
          filter:"blur(20px)", pointerEvents:"none" }}/>
        <div className="wf-hero-inner" style={{ maxWidth:720, margin:"0 auto", padding:"0 24px",
          position:"relative", zIndex:1, textAlign:"center" }}>
          <div className="wf-hero-badge" style={{ display:"inline-flex", alignItems:"center", gap:8,
            background:"rgba(14,165,233,.1)", border:"1px solid rgba(14,165,233,.22)",
            borderRadius:20, padding:"5px 14px", marginBottom:18 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#22d3ee",
              boxShadow:"0 0 6px rgba(34,211,238,.9)", display:"inline-block" }}/>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".16em", color:"#0369a1" }}>
              {t("Drop-off · Wash · Fold · Pickup","Entrega · Lavado · Doblado · Recogida")}
            </span>
          </div>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:18,
            animation:"wf_float 3s ease-in-out infinite" }}>
            <div className="wf-basket-hero"><BasketSVG phase={0} size={160}/></div>
          </div>
          <h1 style={{ fontFamily:"'Manrope','Bricolage Grotesque',sans-serif",
            fontSize:"clamp(28px,5vw,48px)", fontWeight:800, letterSpacing:"-.03em",
            lineHeight:1.1, color:"#0c4a6e", margin:"0 0 12px" }}>
            {t("Wash & Fold","Wash & Fold")}{" "}
            <span style={{ color:"#0ea5e9" }}>{t("Drop-Off","Drop-Off")}</span>
          </h1>
          <p className="wf-hero-sub" style={{ fontSize:16, fontWeight:300, color:"#64748b",
            maxWidth:420, margin:"0 auto", lineHeight:1.65 }}>
            {t(
              "Bring your clothes — we'll wash, fold, and have them ready for you.",
              "Trae tu ropa — lavamos, doblamos y la tendremos lista para ti."
            )}
          </p>
        </div>
      </section>

      {/* ── Main ── */}
      <section style={{ padding:"0 0 72px" }}>
        <div style={{ maxWidth:700, margin:"0 auto", padding:"0 16px" }}>

          <div ref={formRef} id="wash-fold-form"
            style={{ marginTop:"-26px", position:"relative", zIndex:2, marginBottom:16 }}>
            <JourneyTrack cur={foldPhase>=0?3:cur} locale={locale}
              onStageClick={i=>{ if(foldPhase<0) goTo(i); }}/>
          </div>

          {/* ── Fold animation ── */}
          {foldPhase >= 0 && (
            <div style={{ background:"white", borderRadius:20, border:"1.5px solid #bae6fd",
              padding:"36px 24px", textAlign:"center", animation:"wf_fadein .4s ease both",
              boxShadow:"0 8px 40px rgba(14,165,233,.12)" }}>
              {!foldDone ? (
                <>
                  <div style={{ width:160, margin:"0 auto", animation:"wf_float 2.8s ease-in-out infinite" }}>
                    <BasketSVG phase={Math.min(foldPhase,4)} size={160}/>
                  </div>
                  <div style={{ fontSize:18, fontWeight:700, fontFamily:"'Manrope',sans-serif",
                    color:"#0c4a6e", marginTop:14 }}>
                    {locale==="es"?FOLD_ES[Math.min(foldPhase,4)]:FOLD_EN[Math.min(foldPhase,4)]}
                  </div>
                  <div style={{ display:"flex", justifyContent:"center", gap:10, marginTop:16 }}>
                    {FOLD_EN.slice(0,-1).map((_,i)=>(
                      <div key={i} style={{ width:8, height:8, borderRadius:"50%",
                        background:i<foldPhase?"#0ea5e9":i===foldPhase?"#38bdf8":"#e2e8f0",
                        boxShadow:i===foldPhase?"0 0 0 3px rgba(56,189,248,.25)":"none",
                        transition:"all .3s",
                        animation:i===foldPhase?"wf_bounce 1s ease-in-out infinite":"none" }}/>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ animation:"wf_pop .5s cubic-bezier(.34,1.56,.64,1) both" }}>
                  <div style={{ width:160, margin:"0 auto", animation:"wf_float 3s ease-in-out infinite" }}>
                    <BasketSVG phase={5} done={true} size={160}/>
                  </div>
                  <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(34,211,238,.12)",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:30,
                    margin:"14px auto 8px" }}>🎉</div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:"'Manrope',sans-serif",
                    color:"#0c4a6e", marginBottom:6 }}>
                    {t("Request submitted!","¡Solicitud enviada!")}
                  </div>
                  <p style={{ fontSize:14, color:"#64748b", maxWidth:300, lineHeight:1.65, margin:"0 auto 20px" }}>
                    {t("Our team will confirm via","Nuestro equipo confirmará por")}{" "}
                    <strong style={{ color:"#0ea5e9" }}>
                      {cmMap[form.contact_method]||t("your preferred method","tu método preferido")}
                    </strong>.
                  </p>
                  <button onClick={handleReset} style={{ padding:"11px 26px", borderRadius:12,
                    border:"none", background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"white",
                    fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                    boxShadow:"0 4px 16px rgba(14,165,233,.35)" }}>
                    🧺 {t("Submit another request","Enviar otra solicitud")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Form card ── */}
          {foldPhase < 0 && (
            <div key={formKey} style={{ background:"white", border:"1.5px solid #e2e8f0",
              borderRadius:20, boxShadow:"0 4px 32px rgba(14,165,233,.08)", overflow:"hidden",
              animation:"wf_fadein .3s ease both" }}>

              <div style={{ height:3, background:"linear-gradient(90deg,#38bdf8,#0ea5e9,#0284c7)" }}/>

              {/* Step header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 22px",
                borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
                <div style={{ width:38, height:38, borderRadius:10, background:"rgba(14,165,233,.1)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {STAGES[cur].icon}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Manrope',sans-serif", color:"#0c4a6e" }}>
                    {locale==="es"?STAGES[cur].subES:STAGES[cur].subEN}
                  </div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>
                    {t(`Step ${cur+1} of 4`,`Paso ${cur+1} de 4`)} — {locale==="es"?STAGES[cur].es:STAGES[cur].en}
                  </div>
                </div>
                <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                  {STAGES.map((_,i)=>(
                    <div key={i} onClick={()=>i<cur&&goTo(i)}
                      style={{ width:i===cur?20:7, height:7, borderRadius:3.5,
                        background:i<=cur?"#0ea5e9":"#e2e8f0",
                        transition:"all .3s", cursor:i<cur?"pointer":"default" }}/>
                  ))}
                </div>
              </div>

              <div style={{ padding:"22px 24px" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                  {/* ── Step 0 — Contact ── */}
                  {cur === 0 && (
                    <>
                      <div className="wf-form-grid2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <FF label={t("First name *","Nombre *")}>
                          <FInput value={form.first_name} onChange={e=>setF("first_name",e.target.value)}
                            placeholder="Jane" autoComplete="given-name" data-testid="washfold-first-name"/>
                        </FF>
                        <FF label={t("Last name *","Apellido *")}>
                          <FInput value={form.last_name} onChange={e=>setF("last_name",e.target.value)}
                            placeholder="Smith" autoComplete="family-name" data-testid="washfold-last-name"/>
                        </FF>
                      </div>
                      <FF label={t("Email *","Correo *")}>
                        <FInput type="email" value={form.email} onChange={e=>setF("email",e.target.value)}
                          placeholder={t("you@email.com","tu@correo.com")} data-testid="washfold-email"/>
                      </FF>
                      <FF label={t("Phone *","Teléfono *")}>
                        <PhoneInput value={form.phone} dialCode={form.dialCode} dialIso={form.dialIso}
                          onValueChange={v=>setF("phone",v)}
                          onDialCodeChange={(code,iso)=>{setF("dialCode",code);setF("dialIso",iso);setF("phone","");}}/>
                      </FF>
                      <FF label={t("Best way to contact you *","Cómo contactarte *")}>
                        <ChipSet value={form.contact_method}
                          onChange={v=>{setF("contact_method",v);if(v!=="text")setF("sms_consent",false);}}
                          options={[
                            {val:"phone",icon:"📞",label:t("Phone call","Llamada")},
                            {val:"text", icon:"💬",label:"Text/SMS"},
                            {val:"email",icon:"✉️",label:"Email"},
                          ]}/>
                      </FF>
                      {form.contact_method==="text" && (
                        <SmsConsentField checked={form.sms_consent}
                          onChange={e=>setF("sms_consent",e.target.checked)}
                          idPrefix="washfold-sms-consent"/>
                      )}
                    </>
                  )}

                  {/* ── Step 1 — Drop-Off ── */}
                  {cur === 1 && (
                    <>
                      <FF label={t("Address (optional)","Dirección (opcional)")}>
                        <p style={{ fontSize:11, color:"#94a3b8", marginBottom:8, fontStyle:"italic" }}
                          data-testid="washfold-address-help">
                          {t("Only for contact reference — drop-off is at the store.",
                             "Solo como referencia de contacto — la entrega es en tienda.")}
                        </p>
                        <AddressAutocomplete value={form.address_line1}
                          onChange={v=>setF("address_line1",v)}
                          onSelect={addr=>setForm(p=>({
                            ...p, address_line1:addr.street,
                            ...(addr.city &&{city:addr.city}),
                            ...(addr.state&&{state:addr.state}),
                            ...(addr.zip  &&{zip_code:addr.zip}),
                          }))}
                          placeholder={t("Street address","Dirección")}
                          renderInput={props=><FInput {...props} data-testid="washfold-address1"/>}/>
                      </FF>
                      <FInput value={form.address_line2} onChange={e=>setF("address_line2",e.target.value)}
                        placeholder={t("Apt, Suite (optional)","Apto, Suite (opcional)")}/>
                      <div className="wf-form-grid3" style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10 }}>
                        <FF label={t("City","Ciudad")}>
                          <FInput value={form.city} onChange={e=>setF("city",e.target.value)} data-testid="washfold-city"/>
                        </FF>
                        <FF label={t("State","Estado")}>
                          <FInput value={form.state} onChange={e=>setF("state",e.target.value.toUpperCase())}
                            placeholder="CA" maxLength={2} data-testid="washfold-state"/>
                        </FF>
                        <FF label="ZIP">
                          <FInput value={form.zip_code} onChange={e=>setF("zip_code",e.target.value)} data-testid="washfold-zip"/>
                        </FF>
                      </div>
                      <FF label={t("Preferred drop-off date *","Fecha preferida de entrega *")}>
                        <FInput type="date" value={form.dropoff_date}
                          onChange={e=>setF("dropoff_date",e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          style={{ cursor:"pointer" }} data-testid="washfold-date"/>
                      </FF>
                    </>
                  )}

                  {/* ── Step 2 — Laundry prefs ── */}
                  {cur === 2 && (
                    <>
                      <FF label={t("Turnaround plan *","Plan de tiempo *")}>
                        <PlanSelector value={form.plan} onChange={v=>setF("plan",v)}/>
                      </FF>
                      <PreferenceGrid title="WASH TEMPERATURE" options={WASH_OPTIONS}
                        selected={washTemp} onSelect={setWashTemp}/>
                      <PreferenceGrid title="DRY TEMPERATURE" options={DRY_OPTIONS}
                        selected={dryTemp} onSelect={setDryTemp}/>
                      <div style={{ fontSize:12, color:"#94a3b8", marginTop:-8 }}>
                        Choose low or air dry for delicates, knits and activewear.
                      </div>
                      <FF label={t("Special instructions (optional)","Instrucciones especiales (opcional)")}>
                        <FTextarea value={form.notes} onChange={e=>setF("notes",e.target.value)} rows={4}/>
                      </FF>
                      <AddonSelector
                        selectedAddons={form.addons}
                        onToggle={addons=>setF("addons",addons)}
                        t={t}
                        locale={locale}
                      />
                      <WashFoldInfoPanel t={t}/>
                    </>
                  )}

                  {/* ── Step 3 — Confirm ── */}
                  {cur === 3 && (
                    <>
                      <SumBlock title={`👤 ${t("Contact","Contacto")}`} rows={[
                        [t("Name","Nombre"),    `${form.first_name} ${form.last_name}`.trim()],
                        [t("Email","Correo"),   form.email],
                        [t("Phone","Teléfono"),`${form.dialCode} ${form.phone}`.trim()],
                        [t("Via","Via"),         cmMap[form.contact_method]],
                      ]}/>
                      <SumBlock title={`📍 ${t("Drop-Off","Entrega")}`} rows={[
                        [t("Address","Dirección"),
                          [form.address_line1,form.city,form.state].filter(Boolean).join(", ")||t("In-store","En tienda")],
                        [t("Date","Fecha"), form.dropoff_date||t("Flexible","Flexible")],
                      ]}/>
                      <SumBlock title={`🧺 ${t("Service Details","Detalles del servicio")}`} rows={[
                        [t("Plan","Plan"), planMap[form.plan]||form.plan],
                        [t("Wash temp","Temp lavado"), washTemp?{cold:"Cold",warm:"Warm",hot:"Hot",any:"Any"}[washTemp]:"-"],
                        [t("Dry temp","Temp secado"),  dryTemp?{low:"Low",medium:"Medium",high:"High",air:"Air dry"}[dryTemp]:"-"],
                        ...(form.notes?[[t("Notes","Notas"),form.notes.slice(0,100)+(form.notes.length>100?"…":"")]]:[] ),
                      ]}/>

                      {/* Add-ons summary */}
                      {form.addons.length > 0 && (
                        <div style={{ padding:"10px 12px", borderRadius:9,
                          background:"rgba(14,165,233,.05)", border:"1px solid rgba(14,165,233,.2)" }}>
                          <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase",
                            letterSpacing:".12em", color:"#0ea5e9", marginBottom:8 }}>
                            ✨ {t("Add-on Items","Artículos adicionales")}
                          </div>
                          {form.addons.map(a=>(
                            <div key={a.id} style={{ display:"flex", justifyContent:"space-between",
                              gap:8, padding:"3px 0", fontSize:11 }}>
                              <span style={{ color:"#0f172a" }}>
                                {a.name}
                                {a.quantity > 1 && (
                                  <span style={{ fontSize:10, color:"#64748b", marginLeft:4 }}>x{a.quantity}</span>
                                )}
                              </span>
                              <span style={{ fontWeight:700, color:"#0ea5e9", flexShrink:0 }}>
                                ${(a.price*(a.quantity||1)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          <div style={{ display:"flex", justifyContent:"space-between", gap:8,
                            padding:"6px 0 2px", borderTop:"1px solid rgba(14,165,233,.15)", marginTop:4 }}>
                            <span style={{ fontSize:10, fontWeight:600, color:"#0369a1" }}>
                              {t("Add-ons total","Total extras")}
                            </span>
                            <span style={{ fontWeight:800, color:"#0ea5e9" }}>${addonTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {/* Terms */}
                      <div style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"11px 13px",
                        background:"#f0f9ff", borderRadius:10, border:"1px solid #bae6fd" }}>
                        <input type="checkbox" id="wf-terms" checked={form.terms}
                          onChange={e=>setF("terms",e.target.checked)}
                          style={{ width:15, height:15, flexShrink:0, marginTop:1,
                            accentColor:"#0ea5e9", cursor:"pointer" }}/>
                        <label htmlFor="wf-terms" style={{ fontSize:11, color:"#64748b", lineHeight:1.55, cursor:"pointer" }}>
                          {t("I accept the","Acepto los")}{" "}
                          <Link to="/terms-and-conditions" style={{ color:"#0ea5e9", fontWeight:600 }}>{t("Terms","Términos")}</Link>{" & "}
                          <Link to="/privacy-policy" style={{ color:"#0ea5e9", fontWeight:600 }}>{t("Privacy Policy","Privacidad")}</Link>.{" "}
                          {t("By submitting I authorize Ventura Fresh Laundry to contact me.",
                             "Al enviar autorizo a Ventura Fresh Laundry a contactarme.")}
                        </label>
                      </div>
                    </>
                  )}
                </div>

                {/* Navigation */}
                <div style={{ display:"flex", gap:8, marginTop:18 }}>
                  {cur > 0 && (
                    <button type="button" onClick={()=>goTo(cur-1)}
                      style={{ padding:"11px 16px", borderRadius:10, border:"1.5px solid #e2e8f0",
                        background:"#f8fafc", color:"#64748b", fontSize:12, fontWeight:600,
                        cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
                      ← {t("Back","Atrás")}
                    </button>
                  )}
                  <button type="button" onClick={handleNext}
                    disabled={submitting||(cur===3&&!form.terms)}
                    style={{ flex:1, padding:"12px 16px", borderRadius:10, border:"none",
                      background:(submitting||(cur===3&&!form.terms))
                        ?"#94a3b8":"linear-gradient(135deg,#38bdf8,#0ea5e9,#0284c7)",
                      color:"white", fontSize:12, fontWeight:700, textTransform:"uppercase",
                      letterSpacing:".1em",
                      cursor:(submitting||(cur===3&&!form.terms))?"not-allowed":"pointer",
                      fontFamily:"inherit", display:"flex", alignItems:"center",
                      justifyContent:"center", gap:7,
                      boxShadow:submitting?"none":"0 4px 18px rgba(14,165,233,.35)",
                      transition:"all .2s", position:"relative", overflow:"hidden" }}>
                    {submitting ? (
                      <>
                        <div style={{ width:13, height:13, border:"2px solid rgba(255,255,255,.4)",
                          borderTopColor:"white", borderRadius:"50%", animation:"wf_spin .7s linear infinite" }}/>
                        {t("Sending…","Enviando…")}
                      </>
                    ) : cur < 3 ? (
                      <>{t("Next","Siguiente")}: {locale==="es"?STAGES[cur+1].es:STAGES[cur+1].en} →</>
                    ) : (
                      <>🧺 {t("Submit & Start the Wash!","¡Enviar y empezar el lavado!")}</>
                    )}
                    {!submitting && (
                      <span style={{ position:"absolute", inset:0,
                        background:"linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent)",
                        transform:"translateX(-100%)", animation:"wf_shimmer 2.5s ease infinite",
                        pointerEvents:"none" }}/>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <PublicFooter/>
    </div>
  );
}