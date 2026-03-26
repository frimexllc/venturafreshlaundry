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

const getErr = (e) => {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return "Error submitting request";
};

const COUNTRIES = [
  { code: "+1",   flag: "🇺🇸", name: "United States", iso: "US" },
  { code: "+1",   flag: "🇨🇦", name: "Canada",        iso: "CA" },
  { code: "+52",  flag: "🇲🇽", name: "México",        iso: "MX" },
  { code: "+44",  flag: "🇬🇧", name: "United Kingdom",iso: "GB" },
  { code: "+34",  flag: "🇪🇸", name: "España",        iso: "ES" },
  { code: "+54",  flag: "🇦🇷", name: "Argentina",     iso: "AR" },
  { code: "+57",  flag: "🇨🇴", name: "Colombia",      iso: "CO" },
  { code: "+56",  flag: "🇨🇱", name: "Chile",         iso: "CL" },
  { code: "+51",  flag: "🇵🇪", name: "Perú",          iso: "PE" },
  { code: "+55",  flag: "🇧🇷", name: "Brasil",        iso: "BR" },
  { code: "+33",  flag: "🇫🇷", name: "France",        iso: "FR" },
  { code: "+49",  flag: "🇩🇪", name: "Germany",       iso: "DE" },
  { code: "+39",  flag: "🇮🇹", name: "Italy",         iso: "IT" },
  { code: "+61",  flag: "🇦🇺", name: "Australia",     iso: "AU" },
];

const STAGES = [
  { icon: "👤", en: "Contact",   es: "Contacto",   subEN: "Who are you?",     subES: "¿Quién eres?"       },
  { icon: "📍", en: "Drop-Off",  es: "Entrega",    subEN: "Where & when?",    subES: "¿Dónde y cuándo?"   },
  { icon: "🧺", en: "Laundry",   es: "Lavandería", subEN: "Your preferences", subES: "Tus preferencias"   },
  { icon: "✅", en: "Confirm",   es: "Confirmar",  subEN: "Review & submit",  subES: "Revisar y enviar"   },
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

      {/* Shadow */}
      <ellipse cx="60" cy="137" rx="36" ry="5" fill="#000" opacity=".1"/>

      {/* Basket body */}
      <ellipse cx="60" cy="85" rx="48" ry="38" fill="#f0f9ff" stroke="#bae6fd" strokeWidth="2"/>
      {[70,78,86,94,102,110].map((y,i)=>(
        <line key={i} x1="13" y1={y} x2="107" y2={y} stroke="#e0f2fe" strokeWidth="1.2" opacity=".7"/>
      ))}
      {[24,36,48,60,72,84,96].map((x,i)=>(
        <line key={i} x1={x} y1="50" x2={x} y2="122" stroke="#e0f2fe" strokeWidth="1" opacity=".45"/>
      ))}

      {/* Water */}
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

      {/* Clothes */}
      {phase!==4 && (
        <g clipPath="url(#bk_cl)">
          {clothColors.slice(0,done?3:Math.max(2,5-phase)).map((c,i)=>(
            <ellipse key={i} cx={28+i*16} cy={88+(i%2)*8} rx={14-i} ry={9}
              fill={c} opacity={.85-i*.05} stroke="white" strokeWidth=".8"/>
          ))}
        </g>
      )}

      {/* Folded stack */}
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

      {/* Bubbles when washing */}
      {(phase===1||phase===2) && bubbles.map((b,i)=>(
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="none" stroke="#7dd3fc" strokeWidth="1.2" opacity=".7">
          <animate attributeName="cy" values={`${b.cy};${b.cy-28};${b.cy-28}`} dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".7;0;0" dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
          <animate attributeName="r" values={`${b.r};${b.r*1.6};${b.r*1.6}`} dur={b.dur} begin={b.delay} repeatCount="indefinite"/>
        </circle>
      ))}

      {/* Steam when rinsing */}
      {phase===3 && [
        {d:"M40,18 Q44,10 40,2",delay:"0s",dur:"2s"},
        {d:"M60,14 Q64,6 60,-2",delay:".5s",dur:"1.8s"},
        {d:"M80,18 Q84,10 80,2",delay:".9s",dur:"2.2s"},
      ].map((s,i)=>(
        <path key={i} d={s.d} fill="none" stroke="#bae6fd" strokeWidth="2.5" strokeLinecap="round" opacity="0">
          <animate attributeName="opacity" values="0;.6;0" dur={s.dur} begin={s.delay} repeatCount="indefinite"/>
        </path>
      ))}

      {/* Rim */}
      <ellipse cx="60" cy="50" rx="48" ry="14" fill="#e0f2fe" stroke="#bae6fd" strokeWidth="1.8"/>
      <ellipse cx="60" cy="50" rx="40" ry="10" fill="#f8fafc" stroke="#bae6fd" strokeWidth="1"/>

      {/* Handles */}
      <path d="M18,55 Q8,40 18,28" fill="none" stroke="#bae6fd" strokeWidth="3" strokeLinecap="round"/>
      <path d="M102,55 Q112,40 102,28" fill="none" stroke="#bae6fd" strokeWidth="3" strokeLinecap="round"/>

      {/* Done ring */}
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
      {/* Clothesline rope */}
      <div style={{ position:"absolute", top:46, left:0, right:0, height:2,
        background:"linear-gradient(90deg,transparent,#7dd3fc 10%,#38bdf8 50%,#7dd3fc 90%,transparent)",
        opacity:.45, zIndex:0 }}/>

      <div style={{ overflowX:"auto", overflowY:"visible", padding:"0 16px" }} className="wf-sh">
        <div ref={trackRef} style={{ display:"flex", alignItems:"flex-start",
          minWidth:"max-content", padding:"8px 12px 4px", position:"relative", gap:0 }}>

          {/* Rider */}
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

// ─── Phone input ──────────────────────────────────────────────────────────────
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

// ─── Form atoms ───────────────────────────────────────────────────────────────
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

const EMPTY={
  first_name:"",last_name:"",email:"",phone:"",dialCode:"+1",dialIso:"US",
  contact_method:"",sms_consent:false,
  address_line1:"",address_line2:"",city:"",state:"",zip_code:"",
  dropoff_date:"",notes:"",terms:false,
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function WashFoldRequest() {
  const {t,locale}=useLocale();
  const topRef=useRef(null);
  const [cur,setCur]=useState(0);
  const [formKey,setFormKey]=useState(0);
  const [form,setForm]=useState({...EMPTY});
  const [submitting,setSubmitting]=useState(false);
  const [foldPhase,setFoldPhase]=useState(-1);
  const [foldDone,setFoldDone]=useState(false);

  const setF=useCallback((k,v)=>setForm(p=>({...p,[k]:v})),[]);
  const scrollTop=()=>topRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  const goTo=n=>{setCur(n);setFormKey(k=>k+1);scrollTop();};

  const validate=()=>{
    const err=msg=>{toast.error(msg);return false;};
    if(cur===0){
      if(!form.first_name.trim())   return err(t("Enter your first name","Ingresa tu nombre"));
      if(!form.last_name.trim())    return err(t("Enter your last name","Ingresa tu apellido"));
      if(!form.email.includes("@")) return err(t("Enter a valid email","Correo inválido"));
      if(!form.phone.trim())        return err(t("Enter your phone","Ingresa tu teléfono"));
      if(!form.contact_method)      return err(t("Select a contact method","Selecciona método de contacto"));
      if(form.contact_method==="text"&&!form.sms_consent)
        return err(t("Accept SMS consent","Acepta el consentimiento SMS"));
    }
    if(cur===1&&!form.dropoff_date)
      return err(t("Select a drop-off date","Selecciona fecha de entrega"));
    if(cur===3&&!form.terms)
      return err(t("Accept terms to continue","Acepta los términos"));
    return true;
  };

  const handleNext=async()=>{
    if(!validate()) return;
    if(cur<3){goTo(cur+1);return;}

    setFoldPhase(0);setFoldDone(false);
    const durs=[700,900,1000,900,800,600];
    let cum=0;
    durs.forEach((d,i)=>{setTimeout(()=>setFoldPhase(i),cum);cum+=d;});

    setSubmitting(true);
    try{
      const fullPhone=`${form.dialCode} ${form.phone}`.trim();
      const fullAddr=[form.address_line1,form.address_line2,form.city,form.state,form.zip_code].filter(Boolean).join(", ");
      await axios.post(`${API}/public/wash-fold-request`,{
        name:`${form.first_name} ${form.last_name}`.trim(),
        email:form.email.trim(),phone:fullPhone,
        address:fullAddr||null,dropoff_date:form.dropoff_date,dropoff_time:"",
        contact_method:form.contact_method,sms_consent:form.sms_consent,
        notes:form.notes?.trim()||"",
      });
    }catch(e){toast.error(getErr(e));}
    finally{setSubmitting(false);}

    setTimeout(()=>{setFoldPhase(5);setFoldDone(true);},cum+300);
  };

  const handleReset=()=>{
    setForm({...EMPTY});setCur(0);setFormKey(k=>k+1);
    setFoldPhase(-1);setFoldDone(false);scrollTop();
  };

  const cmMap={phone:t("Phone call","Llamada"),text:"Text/SMS",email:"Email"};
  const QUICK_OPTS=[
    {icon:"❄️",label:t("Cold wash","Lavado frío")},
    {icon:"🌡️",label:t("Warm wash","Lavado cálido")},
    {icon:"🌿",label:t("Air dry","Secar al aire")},
    {icon:"🧴",label:t("No softener","Sin suavizante")},
    {icon:"👕",label:t("Fold flat","Doblar plano")},
    {icon:"👔",label:t("Hang items","Colgar prendas")},
    {icon:"🪴",label:t("Eco detergent","Detergente ecológico")},
    {icon:"🚫",label:t("No bleach","Sin blanqueador")},
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc" }}>
      <PublicNav/>

      <style>{`
        @keyframes wf_float  {0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes wf_pulse  {0%{transform:scale(.85);opacity:.8}100%{transform:scale(1.4);opacity:0}}
        @keyframes wf_fadein {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes wf_pop    {from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        @keyframes wf_spin   {to{transform:rotate(360deg)}}
        @keyframes wf_shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes wf_bounce {0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
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

        <div className="wf-hero-inner" style={{ maxWidth:720, margin:"0 auto", padding:"0 24px", position:"relative", zIndex:1, textAlign:"center" }}>
          <div className="wf-hero-badge" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(14,165,233,.1)",
            border:"1px solid rgba(14,165,233,.22)", borderRadius:20, padding:"5px 14px", marginBottom:18 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:"#22d3ee",
              boxShadow:"0 0 6px rgba(34,211,238,.9)", display:"inline-block" }}/>
            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
              letterSpacing:".16em", color:"#0369a1" }}>
              {t("Drop-off · Wash · Fold · Pickup","Entrega · Lavado · Doblado · Recogida")}
            </span>
          </div>

          <div style={{ display:"flex", justifyContent:"center", marginBottom:18,
            animation:"wf_float 3s ease-in-out infinite" }}>
            <div className="wf-basket-hero">
              <BasketSVG phase={0} size={160}/>
            </div>
          </div>

          <h1 style={{ fontFamily:"'Manrope','Bricolage Grotesque',sans-serif",
            fontSize:"clamp(28px,5vw,48px)", fontWeight:800, letterSpacing:"-.03em",
            lineHeight:1.1, color:"#0c4a6e", margin:"0 0 12px" }}>
            {t("Wash & Fold","Wash & Fold")}{" "}
            <span style={{ color:"#0ea5e9" }}>{t("Drop-Off","Drop-Off")}</span>
          </h1>
          <p className="wf-hero-sub" style={{ fontSize:16, fontWeight:300, color:"#64748b", maxWidth:420,
            margin:"0 auto", lineHeight:1.65 }}>
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

          {/* Journey track */}
          <div style={{ marginTop:"-26px", position:"relative", zIndex:2, marginBottom:16 }}>
            <JourneyTrack cur={foldPhase>=0?3:cur} locale={locale}
              onStageClick={i=>{ if(foldPhase<0) goTo(i); }}/>
          </div>

          {/* ── Fold animation ── */}
          {foldPhase>=0 && (
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
          {foldPhase<0 && (
            <div key={formKey} style={{ background:"white", border:"1.5px solid #e2e8f0",
              borderRadius:20, boxShadow:"0 4px 32px rgba(14,165,233,.08)", overflow:"hidden",
              animation:"wf_fadein .3s ease both" }}>

              <div style={{ height:3, background:"linear-gradient(90deg,#38bdf8,#0ea5e9,#0284c7)" }}/>

              {/* Card header */}
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

              {/* Form body */}
              <div style={{ padding:"22px 24px" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                  {/* Step 0 — Contact */}
                  {cur===0 && (
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

                  {/* Step 1 — Drop-Off */}
                  {cur===1 && (
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
                            ...(addr.city&&{city:addr.city}),
                            ...(addr.state&&{state:addr.state}),
                            ...(addr.zip&&{zip_code:addr.zip}),
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

                  {/* Step 2 — Laundry prefs */}
                  {cur===2 && (
                    <>
                      <FF label={t("Quick preferences (tap to add)","Preferencias rápidas (toca para agregar)")}>
                        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                          {QUICK_OPTS.map(o=>(
                            <button key={o.label} type="button"
                              onClick={()=>setF("notes",(form.notes?form.notes+"\n":"")+o.icon+" "+o.label)}
                              style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px",
                                borderRadius:16, border:"1px solid #bae6fd", background:"#f0f9ff",
                                color:"#0369a1", fontSize:11, fontWeight:600, cursor:"pointer",
                                transition:"all .15s", fontFamily:"inherit" }}
                              onMouseEnter={e=>e.currentTarget.style.background="#e0f2fe"}
                              onMouseLeave={e=>e.currentTarget.style.background="#f0f9ff"}>
                              <span style={{ fontSize:14 }}>{o.icon}</span>{o.label}
                            </button>
                          ))}
                        </div>
                      </FF>
                      <FF label={t("Special instructions (optional)","Instrucciones especiales (opcional)")}>
                        <FTextarea value={form.notes} onChange={e=>setF("notes",e.target.value)} rows={5}
                          placeholder={t(
                            "Detergent type, folding style, hang-dry items, fabric softener, delicates…",
                            "Tipo de detergente, estilo de doblado, prendas a secar al aire, suavizante, delicados…"
                          )}
                          data-testid="washfold-notes"/>
                      </FF>
                    </>
                  )}

                  {/* Step 3 — Confirm */}
                  {cur===3 && (
                    <>
                      <SumBlock title={`👤 ${t("Contact","Contacto")}`} rows={[
                        [t("Name","Nombre"),     `${form.first_name} ${form.last_name}`.trim()],
                        [t("Email","Correo"),    form.email],
                        [t("Phone","Teléfono"), `${form.dialCode} ${form.phone}`.trim()],
                        [t("Via","Via"),          cmMap[form.contact_method]],
                      ]}/>
                      <SumBlock title={`📍 ${t("Drop-Off","Entrega")}`} rows={[
                        [t("Address","Dirección"),
                         [form.address_line1,form.city,form.state].filter(Boolean).join(", ")||t("In-store","En tienda")],
                        [t("Date","Fecha"), form.dropoff_date||t("Flexible","Flexible")],
                      ]}/>
                      {form.notes && (
                        <SumBlock title={`🧺 ${t("Preferences","Preferencias")}`} rows={[
                          [t("Notes","Notas"), form.notes.slice(0,100)+(form.notes.length>100?"…":"")],
                        ]}/>
                      )}
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
                  {cur>0 && (
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
                        <div style={{ width:13,height:13,border:"2px solid rgba(255,255,255,.4)",
                          borderTopColor:"white",borderRadius:"50%",animation:"wf_spin .7s linear infinite" }}/>
                        {t("Sending…","Enviando…")}
                      </>
                    ) : cur<3 ? (
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