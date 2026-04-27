import { useTools, TOOLS } from "../context/ToolsContext";
import ToolsModal from "./ToolsModal";
import ToolCalculator from "./tools/ToolCalculator";
import ToolNotes      from "./tools/ToolNotes";
import ToolConverter  from "./tools/ToolConverter";
import ToolTimer      from "./tools/ToolTimer";
import ToolCalendar   from "./tools/ToolCalendar";
import ToolTaskee     from "./tools/ToolTaskee";
import {
  Calculator, StickyNote, ArrowLeftRight,
  Timer, CalendarDays, CheckSquare,
} from "lucide-react";

const TOOL_CONFIG = {
  [TOOLS.CALCULATOR]: {
    title:       "Calculadora",
    icon:        Calculator,
    size:        "sm",
    accentColor: "sky",
    component:   ToolCalculator,
  },
  [TOOLS.NOTES]: {
    title:       "Notas Rápidas",
    icon:        StickyNote,
    size:        "md",
    accentColor: "amber",
    component:   ToolNotes,
  },
  [TOOLS.CONVERTER]: {
    title:       "Conversor de Unidades",
    icon:        ArrowLeftRight,
    size:        "md",
    accentColor: "emerald",
    component:   ToolConverter,
  },
  [TOOLS.TIMER]: {
    title:       "Temporizador",
    icon:        Timer,
    size:        "sm",
    accentColor: "amber",
    component:   ToolTimer,
  },
  [TOOLS.CALENDAR]: {
    title:       "Agenda",
    icon:        CalendarDays,
    size:        "md",
    accentColor: "sky",
    component:   ToolCalendar,
  },
  [TOOLS.TASKEE]: {
    title:       "Taskee – Mis Tareas",
    icon:        CheckSquare,
    size:        "md",
    accentColor: "violet",
    component:   ToolTaskee,
  },
};

export default function ToolsHub() {
  const { activeTool, closeTool } = useTools();

  return (
    <>
      {Object.entries(TOOL_CONFIG).map(([toolKey, config]) => {
        const Component = config.component;
        return (
          <ToolsModal
            key={toolKey}
            open={activeTool === toolKey}
            onClose={closeTool}
            title={config.title}
            icon={config.icon}
            size={config.size}
            accentColor={config.accentColor}
          >
            {activeTool === toolKey && <Component />}
          </ToolsModal>
        );
      })}
    </>
  );
}