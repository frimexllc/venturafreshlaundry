import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function parseAddress(item) {
  const a = item.address || {};
  const house = a.house_number || "";
  const road = a.road || a.pedestrian || a.footway || "";
  const street = [house, road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.county || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  return { street, city, state, zip, display: item.display_name };
}

/**
 * AddressAutocomplete — reusable address input with Nominatim suggestions.
 *
 * Props:
 *   value          — current input value (controlled)
 *   onChange        — (newValue: string) => void
 *   onSelect        — ({ street, city, state, zip, display }) => void
 *   placeholder     — input placeholder
 *   inputClassName  — className for the <input>
 *   inputStyle      — inline style for the <input>
 *   inputProps      — extra props spread onto <input>
 *   wrapperClassName — className for the outer div
 *   countryCode     — ISO country code for bias (default "us")
 *   renderInput     — optional (props) => JSX to render a custom input element
 */
export default function AddressAutocomplete({
  value = "",
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  inputClassName = "",
  inputStyle = {},
  inputProps = {},
  wrapperClassName = "",
  countryCode = "us",
  renderInput,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 3) { setSuggestions([]); setOpen(false); return; }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          format: "json",
          addressdetails: "1",
          countrycodes: countryCode,
          limit: "5",
        });
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
          headers: { "Accept-Language": "en" },
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setOpen(data.length > 0);
          setActiveIdx(-1);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350),
    [countryCode]
  );

  const handleChange = (val) => {
    onChange(val);
    fetchSuggestions(val);
  };

  const handleSelect = (item) => {
    const parsed = parseAddress(item);
    onSelect(parsed);
    setOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((p) => (p < suggestions.length - 1 ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((p) => (p > 0 ? p - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const inputPropsResolved = {
    ref: inputRef,
    value,
    onChange: (e) => handleChange(e.target.value),
    onKeyDown: handleKeyDown,
    onFocus: () => { if (suggestions.length > 0) setOpen(true); },
    placeholder,
    autoComplete: "off",
    "data-testid": "address-autocomplete-input",
    ...inputProps,
  };

  return (
    <div ref={wrapRef} className={`relative ${wrapperClassName}`}>
      {renderInput ? (
        renderInput({ ...inputPropsResolved, className: inputClassName, style: inputStyle })
      ) : (
        <div className="relative">
          <input
            {...inputPropsResolved}
            className={inputClassName}
            style={inputStyle}
          />
          {loading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />
            </div>
          )}
        </div>
      )}

      {open && suggestions.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
          data-testid="address-suggestions-dropdown"
          style={{ animation: "fadeInSugg 0.15s ease" }}
        >
          <style>{`@keyframes fadeInSugg{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          {suggestions.map((item, i) => {
            const parsed = parseAddress(item);
            return (
              <button
                key={item.place_id}
                type="button"
                data-testid={`address-suggestion-${i}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors text-sm border-b border-slate-50 last:border-0
                  ${i === activeIdx ? "bg-sky-50" : "hover:bg-slate-50"}`}
              >
                <MapPin className="h-4 w-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {parsed.street || item.display_name.split(",")[0]}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {[parsed.city, parsed.state, parsed.zip].filter(Boolean).join(", ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
