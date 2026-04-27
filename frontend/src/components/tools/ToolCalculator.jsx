import { useState, useCallback } from "react";
import { Delete } from "lucide-react";

const BTN_BASE = "rounded-xl font-mono font-semibold text-base transition-all active:scale-95 select-none flex items-center justify-center h-12";

const buttons = [
  ["C",   "±",    "%",   "÷"],
  ["7",   "8",    "9",   "×"],
  ["4",   "5",    "6",   "−"],
  ["1",   "2",    "3",   "+"],
  ["0",   ".",   "⌫",   "="],
];

const opMap = { "÷": "/", "×": "*", "−": "-", "+": "+" };

export default function ToolCalculator() {
  const [display, setDisplay]     = useState("0");
  const [expr,    setExpr]        = useState("");
  const [fresh,   setFresh]       = useState(true);   // next digit replaces display
  const [history, setHistory]     = useState([]);

  const pushHistory = (e, r) =>
    setHistory(h => [`${e} = ${r}`, ...h].slice(0, 5));

  const handleBtn = useCallback((btn) => {
    if (btn === "C") {
      setDisplay("0"); setExpr(""); setFresh(true);
    } else if (btn === "⌫") {
      setDisplay(d => d.length > 1 ? d.slice(0, -1) : "0");
    } else if (btn === "±") {
      setDisplay(d => d.startsWith("-") ? d.slice(1) : (d === "0" ? "0" : "-" + d));
    } else if (btn === "%") {
      setDisplay(d => String(parseFloat(d) / 100));
    } else if (btn in opMap) {
      setExpr(display + " " + btn + " ");
      setFresh(true);
    } else if (btn === "=") {
      try {
        const rawExpr = (expr + display).replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-");
        // eslint-disable-next-line no-eval
        const result = String(eval(rawExpr)); // safe: only contains digits & operators
        pushHistory(expr + display, result);
        setDisplay(result);
        setExpr("");
        setFresh(true);
      } catch {
        setDisplay("Error"); setFresh(true);
      }
    } else if (btn === ".") {
      setDisplay(d => fresh ? "0." : d.includes(".") ? d : d + ".");
      setFresh(false);
    } else {
      // digit
      setDisplay(d => fresh || d === "0" ? btn : d + btn);
      setFresh(false);
    }
  }, [display, expr, fresh]);

  const isOp  = (b) => ["÷","×","−","+"].includes(b);
  const isEq  = (b) => b === "=";

  return (
    <div className="p-4 select-none">
      {/* Display */}
      <div className="bg-slate-900 rounded-2xl p-4 mb-4">
        <div className="text-slate-400 text-sm font-mono min-h-[1.2em] text-right">{expr || " "}</div>
        <div className="text-white text-4xl font-mono font-light text-right tracking-tight truncate">{display}</div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mb-3 space-y-0.5">
          {history.map((h, i) => (
            <div key={i} className="text-xs text-slate-400 font-mono text-right opacity-70">{h}</div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 gap-2">
        {buttons.flat().map((btn, i) => {
          let cls = BTN_BASE + " ";
          if (btn === "0") cls += "col-span-1 ";
          if (isOp(btn))  cls += "bg-sky-500 hover:bg-sky-400 text-white ";
          else if (isEq(btn)) cls += "bg-sky-600 hover:bg-sky-500 text-white ";
          else if (["C","±","%"].includes(btn)) cls += "bg-slate-200 hover:bg-slate-300 text-slate-700 ";
          else if (btn === "⌫") cls += "bg-rose-100 hover:bg-rose-200 text-rose-600 ";
          else cls += "bg-slate-100 hover:bg-slate-200 text-slate-800 ";

          return (
            <button key={i} className={cls} onClick={() => handleBtn(btn)}>
              {btn === "⌫" ? <Delete className="h-4 w-4" /> : btn}
            </button>
          );
        })}
      </div>
    </div>
  );
}