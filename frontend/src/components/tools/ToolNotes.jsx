import { useState, useEffect } from "react";
import { Plus, Trash2, Save } from "lucide-react";

const COLORS = [
  { bg: "bg-yellow-50",  border: "border-yellow-200", dot: "bg-yellow-400" },
  { bg: "bg-sky-50",     border: "border-sky-200",    dot: "bg-sky-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200",dot: "bg-emerald-400" },
  { bg: "bg-rose-50",    border: "border-rose-200",   dot: "bg-rose-400" },
  { bg: "bg-violet-50",  border: "border-violet-200", dot: "bg-violet-400" },
];

const STORAGE_KEY = "crm_quick_notes";

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function ToolNotes() {
  const [notes,    setNotes]    = useState(loadNotes);
  const [editing,  setEditing]  = useState(null); // id of note being edited

  useEffect(() => saveNotes(notes), [notes]);

  const addNote = () => {
    const newNote = {
      id:      Date.now(),
      text:    "",
      colorIdx: Math.floor(Math.random() * COLORS.length),
      created: new Date().toLocaleString("es-MX", { dateStyle:"short", timeStyle:"short" }),
    };
    setNotes(n => [newNote, ...n]);
    setEditing(newNote.id);
  };

  const updateText = (id, text) =>
    setNotes(n => n.map(note => note.id === id ? { ...note, text } : note));

  const deleteNote = (id) =>
    setNotes(n => n.filter(note => note.id !== id));

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500 font-medium">{notes.length} nota{notes.length !== 1 ? "s" : ""}</span>
        <button
          onClick={addNote}
          className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors active:scale-95"
        >
          <Plus className="h-4 w-4" /> Nueva nota
        </button>
      </div>

      {notes.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-sm">Sin notas. ¡Crea la primera!</p>
        </div>
      )}

      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {notes.map((note) => {
          const color = COLORS[note.colorIdx % COLORS.length];
          const isEdit = editing === note.id;
          return (
            <div
              key={note.id}
              className={`rounded-xl border-2 ${color.bg} ${color.border} p-3 transition-shadow ${isEdit ? "shadow-md" : "shadow-sm"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                  <span className="text-[10px] text-slate-400">{note.created}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isEdit && (
                    <button
                      onClick={() => setEditing(null)}
                      className="h-6 w-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center"
                    >
                      <Save className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="h-6 w-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <textarea
                value={note.text}
                onChange={(e) => updateText(note.id, e.target.value)}
                onFocus={() => setEditing(note.id)}
                placeholder="Escribe tu nota..."
                rows={3}
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 resize-none outline-none"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}