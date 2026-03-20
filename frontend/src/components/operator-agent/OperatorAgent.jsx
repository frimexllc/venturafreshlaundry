/**
 * OperatorAgent.jsx — Lau con voz bidireccional
 *
 * Necesita en la misma carpeta:
 *   - useHeyLau.js   (wake word + reconocimiento de comandos)
 *   - useLauVoice.js (síntesis de voz — Lau habla)
 *
 * Integración en OperatorDashboard.jsx:
 *   import OperatorAgent from "./OperatorAgent";
 *   <OperatorAgent dashboard={dashboard} storeOrders={storeOrders} onSelectOrder={setSelectedOrder} />
 *
 * Flujo completo:
 *   1. "Hey Lau" → Lau dice "¡Dime!" y escucha el comando.
 *   2. Comando se manda a /api/ai/operations.
 *   3. La respuesta aparece en el chat Y Lau la lee en voz alta.
 *   4. Vuelve a escuchar automáticamente.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useLocale } from "../../context/LocaleContext";
import useHeyLau   from "./useHeyLau";
import useLauVoice from "./useLauVoice";
import {
  X, Send, RefreshCw, Radio, Volume2, VolumeX,
  CheckCircle2, AlertTriangle, ListChecks, MessageSquare, Settings,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ─── Alert builder ────────────────────────────────────────────────────────────
function buildAlerts(dashboard, storeOrders) {
  const alerts = [];
  const urgent = dashboard?.urgent_tickets || [];
  if (urgent.length)
    alerts.push({ id:"urgent", type:"critical", icon:"🚨",
      title:`${urgent.length} urgent ticket${urgent.length>1?"s":""} need attention`,
      detail:urgent.map(t=>t.subject).join(" · ") });

  const stale = (dashboard?.todays_pickups||[]).filter(
    o=>o.status==="NEW" && Date.now()-new Date(o.created_at)>3600000
  );
  if (stale.length)
    alerts.push({ id:"stale", type:"warning", icon:"⏰",
      title:`${stale.length} pickup${stale.length>1?"s":""} stuck NEW >60 min`,
      detail:stale.map(o=>o.customer_name||o.order_id).join(", ") });

  const ready = dashboard?.ready_for_delivery||[];
  if (ready.length)
    alerts.push({ id:"ready", type:"info", icon:"📦",
      title:`${ready.length} order${ready.length>1?"s":""} ready — assign delivery`,
      detail:ready.map(o=>o.customer_name||o.order_id).join(", ") });

  const unpaid = (storeOrders||[]).filter(
    o=>!["paid","refunded"].includes((o.payment_status||"").toLowerCase())
  );
  if (unpaid.length)
    alerts.push({ id:"unpaid", type:"warning", icon:"💳",
      title:`${unpaid.length} unpaid store order${unpaid.length>1?"s":""}`,
      detail:unpaid.map(o=>o.order_number||o.id).join(", ") });

  return alerts;
}

// ─── Checklists ───────────────────────────────────────────────────────────────
const CHECKLISTS = [
  { id:"pickup",  emoji:"🚚", label:"Pickup checklist",
    steps:["Confirm address","Assign driver","Update → CONFIRMED","Scan QR at pickup","Update → PICKED UP","Enter Actual Lbs","Start wash cycle"] },
  { id:"payment", emoji:"💰", label:"Payment checklist",
    steps:["Verify Actual Lbs","Check auto total","Select method","Cash: enter amount","Card: open Stripe","Register payment","Print ticket"] },
  { id:"washfold",emoji:"🧺", label:"Wash & Fold handoff",
    steps:["Receive bag","Enter Est. Lbs","Update → PROCESSING","Wash per prefs","Fold/hang","Enter Actual Lbs","Update → READY","Notify customer"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Dots = () => (
  <div style={{display:"flex",gap:4,padding:"8px 10px"}}>
    {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#0ea5e9",animation:`oa_dot 1s ${i*.18}s ease-in-out infinite`}}/>)}
  </div>
);

const MouthWave = ({ active }) => (
  <div style={{display:"flex",alignItems:"center",gap:2,height:16}}>
    {[0,1,2,3,4,5].map(i=>(
      <div key={i} className={active?"lau-mouth-bar":""} style={{
        width:2.5,borderRadius:2,background:"#34d399",
        height:active?undefined:"2px",opacity:active?1:.35,
        animation:active?`lau_mouth ${.5+(i%3)*.15}s ${i*.06}s ease-in-out infinite alternate`:"none",
      }}/>
    ))}
  </div>
);

// ─── Bubble ───────────────────────────────────────────────────────────────────
const Bubble = ({ msg, onToggle, checkStates, isSpeakingThis }) => {
  const anim = "oa_slide .2s ease both";

  if (msg.role==="voice")
    return <div style={{display:"flex",justifyContent:"flex-end",marginBottom:5}}>
      <div style={{maxWidth:"82%",padding:"8px 11px",fontSize:11,lineHeight:1.6,background:"rgba(14,165,233,.1)",border:"1px solid rgba(14,165,233,.25)",borderRadius:"13px 13px 3px 13px",color:"#0ea5e9",fontWeight:500,display:"flex",gap:5,animation:anim}}>
        <span>🎙️</span>{msg.text}
      </div>
    </div>;

  if (msg.role==="user")
    return <div style={{display:"flex",justifyContent:"flex-end",marginBottom:5}}>
      <div style={{maxWidth:"80%",padding:"8px 11px",fontSize:11,lineHeight:1.6,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",borderRadius:"13px 13px 3px 13px",color:"#fff",fontWeight:500,animation:anim}}>
        {msg.text}
      </div>
    </div>;

  if (msg.role==="alert") {
    const c={critical:{bg:"rgba(239,68,68,.08)",border:"rgba(239,68,68,.25)",t:"#7f1d1d"},warning:{bg:"rgba(245,158,11,.07)",border:"rgba(245,158,11,.25)",t:"#78350f"},info:{bg:"rgba(14,165,233,.07)",border:"rgba(14,165,233,.2)",t:"#0c4a6e"}}[msg.alertType]||{};
    return <div style={{padding:"8px 10px",borderRadius:9,marginBottom:5,background:c.bg,border:`1px solid ${c.border}`,display:"flex",gap:7,animation:anim}}>
      <span style={{fontSize:13}}>{msg.icon}</span>
      <div><div style={{fontSize:11,fontWeight:700,color:c.t}}>{msg.title}</div>{msg.detail&&<div style={{fontSize:10,color:"hsl(var(--muted-foreground))",marginTop:2,lineHeight:1.4}}>{msg.detail}</div>}</div>
    </div>;
  }

  if (msg.role==="action")
    return <div style={{padding:"9px 11px",borderRadius:10,marginBottom:5,background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",animation:anim}}>
      <div style={{fontSize:11,fontWeight:700,color:"#065f46",marginBottom:4}}>✅ {msg.title}</div>
      {(msg.rows||[]).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"1px 0"}}>
        <span style={{color:"hsl(var(--muted-foreground))"}}>{k}</span>
        <span style={{fontWeight:600,color:"hsl(var(--foreground))"}}>{v}</span>
      </div>)}
    </div>;

  if (msg.role==="checklist") {
    const s=checkStates[msg.checklistId]||{};
    const done=msg.steps.filter((_,i)=>s[i]).length;
    const pct=Math.round(done/msg.steps.length*100);
    return <div style={{padding:"10px 12px",borderRadius:10,marginBottom:5,background:"hsl(var(--secondary))",border:"0.5px solid hsl(var(--border))",animation:anim}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <span style={{fontSize:14}}>{msg.emoji}</span>
        <span style={{fontSize:11,fontWeight:700,flex:1}}>{msg.label}</span>
        <span style={{fontSize:10,fontWeight:700,color:"#0ea5e9"}}>{pct}%</span>
      </div>
      <div style={{height:3,borderRadius:2,background:"hsl(var(--border))",marginBottom:7}}>
        <div style={{height:"100%",borderRadius:2,background:"#0ea5e9",width:pct+"%",transition:"width .3s"}}/>
      </div>
      {msg.steps.map((step,i)=><label key={i} style={{display:"flex",gap:7,marginBottom:3,cursor:"pointer",alignItems:"flex-start"}}>
        <input type="checkbox" checked={!!s[i]} onChange={()=>onToggle(msg.checklistId,i)} style={{width:12,height:12,marginTop:1,accentColor:"#0ea5e9",flexShrink:0}}/>
        <span style={{fontSize:11,lineHeight:1.45,textDecoration:s[i]?"line-through":"none",color:s[i]?"hsl(var(--muted-foreground))":"hsl(var(--foreground))"}}>{step}</span>
      </label>)}
      {pct===100&&<div style={{marginTop:5,fontSize:10,fontWeight:700,color:"#10b981"}}>✅ All complete!</div>}
    </div>;
  }

  // Agent message
  return <div style={{display:"flex",gap:6,marginBottom:5,alignItems:"flex-end"}}>
    <div style={{width:22,height:22,borderRadius:"50%",background:"linear-gradient(135deg,#0b1929,#1a3558)",border:`1.5px solid ${isSpeakingThis?"#34d399":"#38bdf8"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0,transition:"border-color .3s"}}>🫧</div>
    <div style={{
      maxWidth:"80%",padding:"8px 11px",fontSize:11,lineHeight:1.6,
      background:isSpeakingThis?"rgba(52,211,153,.07)":"hsl(var(--background))",
      border:`0.5px solid ${isSpeakingThis?"rgba(52,211,153,.45)":"hsl(var(--border))"}`,
      borderRadius:"13px 13px 13px 3px",
      color:"hsl(var(--foreground))",
      boxShadow:"0 1px 4px rgba(0,0,0,.05)",
      animation:anim,transition:"background .3s,border-color .3s",
    }}>
      {msg.text}
      {isSpeakingThis && (
        <div style={{marginTop:5,display:"flex",alignItems:"center",gap:6}}>
          <MouthWave active={true}/>
          <span style={{fontSize:9,color:"#34d399",fontWeight:700}}>Lau está hablando</span>
        </div>
      )}
    </div>
  </div>;
};

// ─── Wake orb status indicator ────────────────────────────────────────────────
const LauOrb = ({ wakeState, lauSpeaking }) => {
  const c = lauSpeaking ? "#34d399" :
    {off:"#1e3558",waiting:"#0ea5e9",triggered:"#34d399",listening:"#ef4444",processing:"#f59e0b"}[wakeState]||"#38bdf8";
  const label = lauSpeaking ? "Lau está hablando…" :
    {off:'Di "Hey Lau" para activar',waiting:'Escuchando "Hey Lau"…',triggered:"¡Detectado! Di tu comando",listening:"Escuchando comando…",processing:"Procesando…"}[wakeState];
  const isActive = lauSpeaking || wakeState !== "off";
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:10,background:"hsl(var(--secondary))",border:`1px solid ${c}40`,transition:"border-color .3s"}}>
      <div style={{position:"relative",flexShrink:0}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:c,transition:"background .3s"}}/>
        {isActive&&<div style={{position:"absolute",inset:-3,borderRadius:"50%",border:`1.5px solid ${c}`,animation:"oa_pulse 1.2s ease-out infinite"}}/>}
      </div>
      <span style={{fontSize:10,fontWeight:600,color:"hsl(var(--foreground))",flex:1}}>{label}</span>
      {lauSpeaking && <MouthWave active={true}/>}
      {!lauSpeaking && wakeState!=="off" && (
        <div style={{display:"flex",alignItems:"center",gap:2,height:16}}>
          {[0,1,2,3,4].map(i=><div key={i} className="lau-wave-bar" style={{width:2.5,borderRadius:2,background:c,height:"4px",animation:`lau_wave ${.6+(i%3)*.2}s ${i*.07}s ease-in-out infinite alternate`}}/>)}
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function OperatorAgent({ dashboard, storeOrders = [], onSelectOrder, apiBaseUrl = API_URL }) {
  const { locale } = useLocale();

  const [open, setOpen]           = useState(()=>{ try{return localStorage.getItem("oa_open")!=="false";}catch{return true;} });
  const [tab, setTab]             = useState("chat");
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [checkStates, setChecks]  = useState({});
  const [unread, setUnread]       = useState(0);
  const [heyLauOn, setHeyLauOn]  = useState(false);
  const [voiceOn, setVoiceOn]    = useState(true);   // toggle to mute Lau's voice
  const [speakingMsgId, setSpeakingMsgId] = useState(null); // which bubble is speaking
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const bodyRef    = useRef(null);
  const inputRef   = useRef(null);
  const prevAlerts = useRef([]);

  // ── Voice synthesis ─────────────────────────────────────────────────────────
  const {
    speak, stop: stopSpeaking, speaking: lauSpeaking,
    supported: voiceSupported,
    voices, selectedVoice, setSelectedVoice,
    rate, setRate, pitch, setPitch,
  } = useLauVoice({ defaultRate: 1.0, defaultPitch: 1.05 });

  const lauSpeak = useCallback((text, msgId) => {
    if (!voiceOn || !voiceSupported || !text) return;
    setSpeakingMsgId(msgId || null);
    speak(text, {
      onEnd:   () => setSpeakingMsgId(null),
      onError: () => setSpeakingMsgId(null),
    });
  }, [voiceOn, voiceSupported, speak]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const addAgent = useCallback((text, opts={}) => {
    const id = Date.now() + Math.random();
    setMessages(m=>[...m,{id, role:"agent", text}]);
    if (opts.speak !== false) lauSpeak(text, id);
    return id;
  }, [lauSpeak]);

  // ── Message processor ────────────────────────────────────────────────────────
  const processMessage = useCallback(async(text, inputType="text") => {
    setMessages(m=>[...m,{id:Date.now()+Math.random(), role:inputType, text}]);
    setInput("");
    setLoading(true);
    if (!open) { setOpen(true); setUnread(0); }
    try {
      const res = await axios.post(`${apiBaseUrl}/api/ai/operations`, {
        message: text, execute: true,
        voice_input: inputType==="voice",
        context: {
          pickups_today: dashboard?.stats?.pickups_remaining_today||0,
          in_processing: dashboard?.stats?.orders_in_processing||0,
          ready:         dashboard?.stats?.orders_ready||0,
          urgent:        dashboard?.stats?.urgent_tickets||0,
          locale,
        },
      });
      const reply = res.data?.reply || (locale==="es" ? "¡Listo!" : "Done!");
      const msgId = Date.now()+Math.random();
      setMessages(m=>[...m,{id:msgId, role:"agent", text:reply}]);
      lauSpeak(reply, msgId);

      (res.data?.results||[]).forEach(r=>{
        if (r.ok && r.type==="update_status")
          setMessages(m=>[...m,{id:Date.now()+Math.random(),role:"action",title:"Status updated",
            rows:[["Order",r.order_id||"—"],["New status",r.new_status||"—"]]}]);
        if (r.ok && r.type==="register_payment")
          setMessages(m=>[...m,{id:Date.now()+Math.random(),role:"action",title:"Payment registered",
            rows:[["Order",r.order_id||"—"],["Method",r.method||"—"],
            ["Amount",r.amount?`$${Number(r.amount).toFixed(2)}`:"—"]]}]);
        if (r.ok && r.type==="print_ticket")
          addAgent(`🎫 Ticket printed for ${r.order_id||"order"}.`);
      });
    } catch {
      addAgent(locale==="es" ? "No pude conectarme. Intenta de nuevo." : "Couldn't reach the server.");
    } finally { setLoading(false); }
  }, [apiBaseUrl, dashboard, locale, open, lauSpeak, addAgent]);

  // ── Hey Lau hook ─────────────────────────────────────────────────────────────
  const {
    wakeState, transcript: wakeTr,
    startWake, stopWake,
    supported: wakeSupported,
  } = useHeyLau({
    lang: locale==="es" ? "es-MX" : "en-US",
    onWake: () => {
      setOpen(true); setUnread(0);
      const ack = locale==="es" ? "¡Dime! 👋" : "Hey! 👋 Go ahead.";
      const id = Date.now()+Math.random();
      setMessages(m=>[...m,{id, role:"agent", text:ack}]);
      lauSpeak(ack, id);
    },
    onCommand: (text) => processMessage(text, "voice"),
  });

  const toggleHeyLau = () => {
    if (!heyLauOn) { setHeyLauOn(true); startWake(); }
    else { setHeyLauOn(false); stopWake(); }
  };

  const toggleVoice = () => {
    if (voiceOn) { stopSpeaking(); setSpeakingMsgId(null); }
    setVoiceOn(v=>!v);
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  useEffect(()=>{ try{localStorage.setItem("oa_open",String(open));}catch{} },[open]);
  useEffect(()=>{ bodyRef.current?.scrollTo({top:bodyRef.current.scrollHeight,behavior:"smooth"}); },[messages]);

  useEffect(()=>{
    const h = new Date().getHours();
    const g = h<12 ? "¡Buenos días" : h<18 ? "¡Buenas tardes" : "¡Buenas noches";
    const greeting = `${g}! Soy Lau, tu agente de turno. Activa "Hey Lau" para hablarme con voz.`;
    addAgent(greeting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if (!dashboard) return;
    const alerts = buildAlerts(dashboard, storeOrders);
    const novel  = alerts.filter(a=>!prevAlerts.current.find(p=>p.id===a.id));
    if (novel.length) {
      setMessages(m=>[...m,...novel.map(a=>({id:Date.now()+Math.random(),role:"alert",alertType:a.type,icon:a.icon,title:a.title,detail:a.detail}))]);
      if (!open) setUnread(u=>u+novel.length);
      // Speak the first critical/warning alert
      const first = novel.find(a=>a.type==="critical")||novel[0];
      if (first) lauSpeak(first.title);
    }
    prevAlerts.current = alerts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dashboard, storeOrders]);

  const handleChecklist = (cl) => {
    setTab("chat");
    setMessages(m=>[...m,{id:Date.now(),role:"checklist",checklistId:cl.id,label:cl.label,emoji:cl.emoji,steps:cl.steps}]);
    addAgent(`Aquí está: ${cl.label}. Marca cada paso. 👍`);
  };
  const toggleCheck = (id,i) => setChecks(p=>({...p,[id]:{...(p[id]||{}),[i]:!p[id]?.[i]}}));

  const currentAlerts = buildAlerts(dashboard, storeOrders);
  const wakeColor = lauSpeaking ? "#34d399" :
    {off:"#38bdf8",waiting:"#0ea5e9",triggered:"#34d399",listening:"#ef4444",processing:"#f59e0b"}[wakeState]||"#38bdf8";

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes oa_slide  { from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)} }
        @keyframes oa_dot    { 0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)} }
        @keyframes oa_in     { from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes oa_pill   { 0%,100%{box-shadow:0 6px 20px rgba(14,165,233,.35)}50%{box-shadow:0 6px 28px rgba(14,165,233,.55)} }
        @keyframes oa_pulse  { 0%{transform:scale(1);opacity:.8}100%{transform:scale(1.6);opacity:0} }
        @keyframes lau_wave  { from{height:3px}to{height:14px} }
        @keyframes lau_mouth { from{height:2px}to{height:13px} }
        .lau-wave-bar { display:block }
        .lau-mouth-bar { display:block }
      `}</style>

      {/* ── Collapsed pill ── */}
      {!open && (
        <button type="button" onClick={()=>{ setOpen(true); setUnread(0); }} data-testid="operator-agent-open-button"
          style={{position:"fixed",bottom:24,right:24,zIndex:9000,display:"flex",alignItems:"center",gap:10,padding:"10px 18px 10px 12px",background:"linear-gradient(135deg,#0b1929,#1a3a5c)",border:`1.5px solid ${wakeColor}`,borderRadius:28,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 8px 28px rgba(14,165,233,.35)",animation:"oa_pill 2.5s ease-in-out infinite",transition:"transform .15s,border-color .3s"}}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.04)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(14,165,233,.18)",border:`1.5px solid ${wakeColor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,position:"relative",transition:"border-color .3s"}}>
            🫧
            {(heyLauOn&&wakeState!=="off")||lauSpeaking ? <div style={{position:"absolute",inset:-3,borderRadius:"50%",border:`1.5px solid ${wakeColor}`,animation:"oa_pulse 1s ease-out infinite"}}/> : null}
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#38bdf8",textTransform:"uppercase",letterSpacing:".1em",lineHeight:1}}>
              Lau
              {lauSpeaking&&<span style={{fontSize:9,background:"rgba(52,211,153,.2)",color:"#34d399",padding:"1px 5px",borderRadius:5,marginLeft:4}}>hablando</span>}
              {heyLauOn&&!lauSpeaking&&<span style={{fontSize:9,background:"rgba(14,165,233,.2)",color:"#38bdf8",padding:"1px 5px",borderRadius:5,marginLeft:4}}>ON</span>}
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginTop:2}}>
              {lauSpeaking?"🔊 Lau está hablando…":currentAlerts.length>0?`${currentAlerts.length} alerta${currentAlerts.length>1?"s":""}`:heyLauOn?'Di "Hey Lau"':"All clear"}
            </div>
          </div>
          {unread>0&&<div style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid white"}}>{unread}</div>}
        </button>
      )}

      {/* ── Full panel ── */}
      {open && (
        <div style={{position:"fixed",bottom:20,right:20,zIndex:9000,width:395,maxWidth:"calc(100vw - 32px)",background:"hsl(var(--card))",border:"1px solid hsl(var(--border))",borderRadius:18,boxShadow:"0 20px 60px rgba(0,0,0,.18),0 4px 16px rgba(14,165,233,.12)",display:"flex",flexDirection:"column",maxHeight:"min(660px,calc(100vh - 40px))",animation:"oa_in .3s cubic-bezier(.34,1.56,.64,1) both",overflow:"hidden"}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:9,padding:"11px 13px",background:"linear-gradient(135deg,#0b1929,#1a3a5c)",borderBottom:"1px solid rgba(14,165,233,.2)",flexShrink:0}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"rgba(14,165,233,.18)",border:`1.5px solid ${wakeColor}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0,position:"relative",transition:"border-color .3s"}}>
              🫧
              {((heyLauOn&&wakeState!=="off")||lauSpeaking)&&<div style={{position:"absolute",inset:-4,borderRadius:"50%",border:`2px solid ${wakeColor}66`,animation:"oa_pulse 1.2s ease-out infinite"}}/>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>
                Lau — Shift Agent
                {lauSpeaking&&<span style={{fontSize:9,background:"rgba(52,211,153,.2)",color:"#34d399",padding:"1px 6px",borderRadius:6,marginLeft:6}}>🔊 hablando</span>}
                {heyLauOn&&!lauSpeaking&&<span style={{fontSize:9,background:"rgba(14,165,233,.2)",color:"#38bdf8",padding:"1px 6px",borderRadius:6,marginLeft:6}}>voz ON</span>}
              </div>
              <div style={{fontSize:10,color:lauSpeaking?"#34d399":wakeState==="triggered"?"#34d399":wakeState==="listening"?"#ef4444":"rgba(255,255,255,.45)",marginTop:2,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:wakeColor,display:"inline-block",transition:"background .3s"}}/>
                {lauSpeaking?"Lau está hablando…":{off:"On duty",waiting:'Esperando "Hey Lau"',triggered:"¡Detectado! Di tu comando",listening:"Escuchando…",processing:"Procesando…"}[wakeState]||"On duty"}
              </div>
            </div>
            {/* Stats */}
            {[{v:dashboard?.stats?.pickups_remaining_today||0,c:"#38bdf8"},{v:dashboard?.stats?.orders_in_processing||0,c:"#fbbf24"},{v:dashboard?.stats?.urgent_tickets||0,c:"#ef4444"}].map(({v,c})=>(
              <div key={c} style={{minWidth:24,height:20,borderRadius:10,background:`${c}22`,border:`1px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:c,padding:"0 5px"}}>{v}</div>
            ))}
            {/* Mute toggle */}
            <button type="button" onClick={toggleVoice} title={voiceOn?"Silenciar voz":"Activar voz"} data-testid="operator-agent-mute-toggle"
              style={{background:"none",border:"none",cursor:"pointer",color:voiceOn?"#34d399":"rgba(255,255,255,.3)",padding:3,flexShrink:0,display:"flex",transition:"color .2s"}}>
              {voiceOn?<Volume2 size={14}/>:<VolumeX size={14}/>}
            </button>
            <button type="button" onClick={()=>setShowVoiceSettings(s=>!s)} title="Configuración de voz" data-testid="operator-agent-voice-settings-button"
              style={{background:"none",border:"none",cursor:"pointer",color:showVoiceSettings?"#0ea5e9":"rgba(255,255,255,.3)",padding:3,flexShrink:0,display:"flex"}}>
              <Settings size={14}/>
            </button>
            <button type="button" onClick={()=>setOpen(false)} data-testid="operator-agent-close-button" style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.4)",padding:2,flexShrink:0,display:"flex"}}><X size={14}/></button>
          </div>

          {/* Voice settings panel (collapsible) */}
          {showVoiceSettings && (
            <div style={{padding:"10px 14px",background:"#050d16",borderBottom:"1px solid rgba(14,165,233,.15)",flexShrink:0}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:1,minWidth:120}}>
                  <span style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em"}}>Voz de Lau</span>
                  <select value={voices.indexOf(selectedVoice)} onChange={e=>setSelectedVoice(voices[parseInt(e.target.value)]||null)}
                    style={{padding:"4px 6px",borderRadius:6,border:"1px solid rgba(14,165,233,.25)",background:"#0b1929",color:"#fff",fontSize:10,fontFamily:"inherit",outline:"none"}}>
                    {voices.filter(v=>v.lang.startsWith("es")).map((v,i)=><option key={i} value={voices.indexOf(v)}>{v.name}</option>)}
                    {voices.filter(v=>!v.lang.startsWith("es")).slice(0,3).map((v,i)=><option key={"en"+i} value={voices.indexOf(v)}>{v.name}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em"}}>Velocidad</span>
                  <select value={rate} onChange={e=>setRate(parseFloat(e.target.value))}
                    style={{padding:"4px 6px",borderRadius:6,border:"1px solid rgba(14,165,233,.25)",background:"#0b1929",color:"#fff",fontSize:10,fontFamily:"inherit",outline:"none"}}>
                    <option value=".85">Lenta</option>
                    <option value="1">Normal</option>
                    <option value="1.2">Rápida</option>
                  </select>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:".1em"}}>Tono</span>
                  <select value={pitch} onChange={e=>setPitch(parseFloat(e.target.value))}
                    style={{padding:"4px 6px",borderRadius:6,border:"1px solid rgba(14,165,233,.25)",background:"#0b1929",color:"#fff",fontSize:10,fontFamily:"inherit",outline:"none"}}>
                    <option value=".85">Grave</option>
                    <option value="1.05">Normal</option>
                    <option value="1.25">Agudo</option>
                  </select>
                </div>
                <button type="button" onClick={stopSpeaking}
                  style={{padding:"5px 10px",borderRadius:7,border:"1px solid rgba(239,68,68,.35)",background:"rgba(239,68,68,.1)",color:"#ef4444",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-end"}}>
                  ⏹ Callar
                </button>
              </div>
              {!voiceSupported&&<p style={{fontSize:10,color:"#f59e0b",marginTop:6}}>SpeechSynthesis no disponible en este navegador.</p>}
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid hsl(var(--border))",background:"hsl(var(--secondary))",flexShrink:0}}>
            {[{id:"chat",icon:<MessageSquare size={11}/>,label:"Chat"},{id:"checklists",icon:<ListChecks size={11}/>,label:"Checklists"},{id:"alerts",icon:<AlertTriangle size={11}/>,label:`Alerts${currentAlerts.length?` (${currentAlerts.length})`:""}`}].map(t=>(
              <button key={t.id} type="button" onClick={()=>setTab(t.id)}
                style={{flex:1,padding:"8px 4px",border:"none",background:"none",cursor:"pointer",fontSize:10,fontWeight:tab===t.id?700:500,color:tab===t.id?"#0ea5e9":"hsl(var(--muted-foreground))",borderBottom:`2px solid ${tab===t.id?"#0ea5e9":"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center",gap:3,transition:"all .15s",fontFamily:"inherit"}}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* ── CHAT ── */}
          {tab==="chat"&&(<>
            {/* Hey Lau strip */}
            <div style={{padding:"10px 12px 8px",borderBottom:"0.5px solid hsl(var(--border))",background:"hsl(var(--secondary))",flexShrink:0}}>
              <LauOrb wakeState={wakeState} lauSpeaking={lauSpeaking}/>
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:7}}>
                <button type="button" onClick={toggleHeyLau} disabled={!wakeSupported} data-testid="operator-agent-hey-lau-toggle"
                  style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:9,border:"none",background:heyLauOn?"linear-gradient(135deg,#34d399,#059669)":"linear-gradient(135deg,#0ea5e9,#2563eb)",color:"#fff",fontSize:11,fontWeight:700,cursor:wakeSupported?"pointer":"not-allowed",opacity:wakeSupported?1:.5,fontFamily:"inherit",boxShadow:heyLauOn?"0 2px 12px rgba(52,211,153,.4)":"0 2px 12px rgba(14,165,233,.3)",transition:"all .2s"}}>
                  <Radio size={13}/>{heyLauOn?'Desactivar "Hey Lau"':'Activar "Hey Lau"'}
                </button>
                <button type="button" onClick={toggleVoice} data-testid="operator-agent-voice-toggle"
                  style={{display:"flex",alignItems:"center",gap:5,padding:"7px 10px",borderRadius:9,border:"1px solid hsl(var(--border))",background:"hsl(var(--background))",color:voiceOn?"#0ea5e9":"hsl(var(--muted-foreground))",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
                  {voiceOn?<Volume2 size={12}/>:<VolumeX size={12}/>}
                  {voiceOn?"Lau habla":"Mute"}
                </button>
                {!wakeSupported&&<span style={{fontSize:10,color:"#f59e0b"}}>Usa Chrome/Edge</span>}
                {wakeTr&&<span style={{flex:1,fontSize:10,color:"hsl(var(--muted-foreground))",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{wakeTr}"</span>}
              </div>
              {heyLauOn&&<p style={{fontSize:10,color:"hsl(var(--muted-foreground))",marginTop:5,lineHeight:1.5}}>Ej: <strong style={{color:"#0ea5e9"}}>"Hey Lau, ¿cuánto le cobro a Ana Torres?"</strong></p>}
            </div>

            {/* Messages */}
            <div ref={bodyRef} style={{flex:1,overflowY:"auto",padding:"10px 12px 4px",minHeight:0,display:"flex",flexDirection:"column"}}>
              {messages.map(m=><Bubble key={m.id} msg={m} onToggle={toggleCheck} checkStates={checkStates} isSpeakingThis={speakingMsgId===m.id}/>)}
              {loading&&<Dots/>}
            </div>

            {/* Quick chips */}
            {messages.length<=2&&(
              <div style={{padding:"4px 12px 6px",display:"flex",flexWrap:"wrap",gap:4,flexShrink:0}}>
                {["Órdenes urgentes","Pagos pendientes","¿Qué sigue?"].map(s=>(
                  <button key={s} type="button" onClick={()=>processMessage(s)}
                    style={{padding:"4px 9px",borderRadius:11,border:"1px solid rgba(14,165,233,.25)",background:"rgba(14,165,233,.06)",color:"#0ea5e9",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,.14)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(14,165,233,.06)"}>{s}</button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{padding:"8px 10px",borderTop:"0.5px solid hsl(var(--border))",display:"flex",gap:6,flexShrink:0}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} data-testid="operator-agent-input"
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(input.trim())processMessage(input.trim());}}}
                placeholder='O escribe aquí… o di "Hey Lau, …"'
                style={{flex:1,padding:"7px 10px",border:"0.5px solid hsl(var(--border))",borderRadius:9,background:"hsl(var(--background))",color:"hsl(var(--foreground))",fontSize:11,fontFamily:"inherit",outline:"none",transition:"border-color .15s"}}
                onFocus={e=>e.target.style.borderColor="#0ea5e9"}
                onBlur={e=>e.target.style.borderColor="hsl(var(--border))"}/>
              <button type="button" onClick={()=>{if(input.trim())processMessage(input.trim());}} disabled={!input.trim()||loading} data-testid="operator-agent-send-button"
                style={{width:30,height:30,borderRadius:8,border:"none",background:input.trim()&&!loading?"#0ea5e9":"hsl(var(--secondary))",color:input.trim()&&!loading?"#fff":"hsl(var(--muted-foreground))",cursor:input.trim()&&!loading?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {loading?<RefreshCw size={13} style={{animation:"oa_dot 1s linear infinite"}}/>:<Send size={13}/>}
              </button>
            </div>
          </>)}

          {/* ── CHECKLISTS ── */}
          {tab==="checklists"&&(
            <div style={{flex:1,overflowY:"auto",padding:13}}>
              <p style={{fontSize:11,color:"hsl(var(--muted-foreground))",marginBottom:10,lineHeight:1.5}}>Toca para abrir en el chat.</p>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {CHECKLISTS.map(cl=>{
                  const s=checkStates[cl.id]||{};
                  const done=cl.steps.filter((_,i)=>s[i]).length;
                  const pct=Math.round(done/cl.steps.length*100);
                  return <button key={cl.id} type="button" onClick={()=>{handleChecklist(cl);setTab("chat");}}
                    style={{display:"flex",alignItems:"center",gap:9,padding:"11px 13px",borderRadius:10,textAlign:"left",border:"0.5px solid hsl(var(--border))",background:"hsl(var(--secondary))",cursor:"pointer",fontFamily:"inherit",transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#0ea5e9"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="hsl(var(--border))"}>
                    <span style={{fontSize:18}}>{cl.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:"hsl(var(--foreground))"}}>{cl.label}</div>
                      <div style={{fontSize:10,color:"hsl(var(--muted-foreground))",marginTop:1}}>{cl.steps.length} steps · {pct>0?`${pct}% done`:"Not started"}</div>
                      {pct>0&&<div style={{height:3,borderRadius:2,background:"hsl(var(--border))",marginTop:5}}><div style={{height:"100%",borderRadius:2,background:"#0ea5e9",width:pct+"%"}}/></div>}
                    </div>
                    {pct===100&&<CheckCircle2 size={15} color="#10b981"/>}
                  </button>;
                })}
              </div>
              <button type="button" onClick={()=>setChecks({})} style={{marginTop:10,width:"100%",padding:"7px",borderRadius:8,border:"0.5px solid hsl(var(--border))",background:"none",color:"hsl(var(--muted-foreground))",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Reset all</button>
            </div>
          )}

          {/* ── ALERTS ── */}
          {tab==="alerts"&&(
            <div style={{flex:1,overflowY:"auto",padding:13}}>
              {currentAlerts.length===0?
                <div style={{textAlign:"center",padding:"28px 16px"}}>
                  <div style={{fontSize:28,marginBottom:8}}>✅</div>
                  <div style={{fontSize:13,fontWeight:600,color:"hsl(var(--foreground))",marginBottom:4}}>All clear!</div>
                  <div style={{fontSize:11,color:"hsl(var(--muted-foreground))",lineHeight:1.5}}>No active alerts.</div>
                </div>
              :<div style={{display:"flex",flexDirection:"column",gap:7}}>
                {currentAlerts.map(a=>{
                  const c={critical:{bg:"rgba(239,68,68,.08)",border:"rgba(239,68,68,.25)",t:"#7f1d1d"},warning:{bg:"rgba(245,158,11,.07)",border:"rgba(245,158,11,.25)",t:"#78350f"},info:{bg:"rgba(14,165,233,.07)",border:"rgba(14,165,233,.2)",t:"#0c4a6e"}}[a.type]||{};
                  return <div key={a.id} style={{padding:"10px 12px",borderRadius:9,background:c.bg,border:`1px solid ${c.border}`,display:"flex",gap:8,cursor:"pointer"}}
                    onClick={()=>lauSpeak(a.title)}>
                    <span style={{fontSize:14,flexShrink:0}}>{a.icon}</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:c.t}}>{a.title}</div>
                      {a.detail&&<div style={{fontSize:10,color:"hsl(var(--muted-foreground))",marginTop:3,lineHeight:1.4}}>{a.detail}</div>}
                    </div>
                    <div style={{marginLeft:"auto",fontSize:9,color:"hsl(var(--muted-foreground))",flexShrink:0}}>🔊</div>
                  </div>;
                })}
                <p style={{fontSize:10,color:"hsl(var(--muted-foreground))",textAlign:"center",marginTop:4}}>Toca una alerta para que Lau la lea.</p>
              </div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
