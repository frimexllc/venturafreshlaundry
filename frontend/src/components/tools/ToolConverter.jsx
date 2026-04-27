import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";

const CATEGORIES = {
  "Longitud": {
    units: ["Metro (m)", "Kilómetro (km)", "Centímetro (cm)", "Milímetro (mm)", "Pulgada (in)", "Pie (ft)", "Milla (mi)"],
    toBase: { "Metro (m)":1, "Kilómetro (km)":1000, "Centímetro (cm)":0.01, "Milímetro (mm)":0.001, "Pulgada (in)":0.0254, "Pie (ft)":0.3048, "Milla (mi)":1609.344 },
  },
  "Peso": {
    units: ["Kilogramo (kg)", "Gramo (g)", "Miligramo (mg)", "Libra (lb)", "Onza (oz)", "Tonelada (t)"],
    toBase: { "Kilogramo (kg)":1, "Gramo (g)":0.001, "Miligramo (mg)":0.000001, "Libra (lb)":0.453592, "Onza (oz)":0.0283495, "Tonelada (t)":1000 },
  },
  "Temperatura": {
    units: ["Celsius (°C)", "Fahrenheit (°F)", "Kelvin (K)"],
    toBase: null, // custom logic
  },
  "Área": {
    units: ["Metro² (m²)", "Kilómetro² (km²)", "Centímetro² (cm²)", "Pie² (ft²)", "Hectárea (ha)", "Acre"],
    toBase: { "Metro² (m²)":1, "Kilómetro² (km²)":1e6, "Centímetro² (cm²)":0.0001, "Pie² (ft²)":0.092903, "Hectárea (ha)":10000, "Acre":4046.86 },
  },
  "Volumen": {
    units: ["Litro (L)", "Mililitro (mL)", "Galón (gal)", "Taza (cup)", "Cucharada (tbsp)"],
    toBase: { "Litro (L)":1, "Mililitro (mL)":0.001, "Galón (gal)":3.78541, "Taza (cup)":0.236588, "Cucharada (tbsp)":0.0147868 },
  },
  "Velocidad": {
    units: ["m/s", "km/h", "mph", "nudos (kn)"],
    toBase: { "m/s":1, "km/h":0.277778, "mph":0.44704, "nudos (kn)":0.514444 },
  },
};

function convertTemp(val, from, to) {
  let celsius;
  if (from === "Celsius (°C)")    celsius = val;
  else if (from === "Fahrenheit (°F)") celsius = (val - 32) * 5/9;
  else celsius = val - 273.15;

  if (to === "Celsius (°C)")    return celsius;
  if (to === "Fahrenheit (°F)") return celsius * 9/5 + 32;
  return celsius + 273.15;
}

function doConvert(value, fromUnit, toUnit, category) {
  const cat = CATEGORIES[category];
  if (!cat) return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";

  if (category === "Temperatura") {
    return convertTemp(num, fromUnit, toUnit).toFixed(4).replace(/\.?0+$/, "");
  }
  const base = num * cat.toBase[fromUnit];
  return (base / cat.toBase[toUnit]).toFixed(6).replace(/\.?0+$/, "");
}

export default function ToolConverter() {
  const [cat,   setCat]   = useState("Longitud");
  const [from,  setFrom]  = useState(CATEGORIES["Longitud"].units[0]);
  const [to,    setTo]    = useState(CATEGORIES["Longitud"].units[1]);
  const [input, setInput] = useState("");

  const result = input !== "" ? doConvert(input, from, to, cat) : "";

  const swap = () => { setFrom(to); setTo(from); };

  const handleCat = (c) => {
    setCat(c);
    setFrom(CATEGORIES[c].units[0]);
    setTo(CATEGORIES[c].units[1]);
    setInput("");
  };

  return (
    <div className="p-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {Object.keys(CATEGORIES).map(c => (
          <button
            key={c}
            onClick={() => handleCat(c)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              cat === c
                ? "bg-emerald-500 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* From */}
      <div className="mb-3">
        <label className="text-xs font-semibold text-slate-500 mb-1 block">De</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="0"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-mono text-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
          />
          <select
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 transition"
          >
            {CATEGORIES[cat].units.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Swap button */}
      <div className="flex justify-center mb-3">
        <button
          onClick={swap}
          className="h-9 w-9 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center transition-colors active:scale-95"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      </div>

      {/* To */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-500 mb-1 block">A</label>
        <div className="flex gap-2">
          <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-emerald-800 font-mono text-lg min-h-[48px] flex items-center">
            {result || <span className="text-slate-400 text-base">resultado</span>}
          </div>
          <select
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 transition"
          >
            {CATEGORIES[cat].units.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Formula hint */}
      {result && (
        <div className="text-center text-xs text-slate-400 font-mono">
          {input} {from} = {result} {to}
        </div>
      )}
    </div>
  );
}