import { createContext, useContext, useState, useCallback } from "react";

const ToolsContext = createContext(null);

export const TOOLS = {
  CALCULATOR:  "calculator",
  NOTES:       "notes",
  CONVERTER:   "converter",
  TIMER:       "timer",
  CALENDAR:    "calendar",
  TASKEE:      "taskee",
};

export function ToolsProvider({ children }) {
  const [activeTool, setActiveTool] = useState(null);

  const openTool  = useCallback((tool) => setActiveTool(tool), []);
  const closeTool = useCallback(() => setActiveTool(null), []);

  return (
    <ToolsContext.Provider value={{ activeTool, openTool, closeTool }}>
      {children}
    </ToolsContext.Provider>
  );
}

export function useTools() {
  const ctx = useContext(ToolsContext);
  if (!ctx) throw new Error("useTools must be used inside ToolsProvider");
  return ctx;
}