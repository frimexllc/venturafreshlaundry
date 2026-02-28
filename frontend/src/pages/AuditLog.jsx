import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { ClipboardList, RefreshCw } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const eventColors = {
  CREATED: "bg-emerald-500",
  UPDATED: "bg-sky-500",
  DELETED: "bg-red-500",
  CONVERTED: "bg-purple-500",
  LOCKED: "bg-amber-500",
  ROUTED: "bg-indigo-500",
  STATUS: "bg-blue-500",
  ERROR: "bg-red-500"
};

const getEventColor = (type) => {
  for (const [key, color] of Object.entries(eventColors)) {
    if (type.includes(key)) return color;
  }
  return "bg-slate-400";
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [entityFilter, setEntityFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [entityFilter]);

  const fetchLogs = async () => {
    try {
      const params = entityFilter !== "all" ? { entity_type: entityFilter } : {};
      const res = await axios.get(`${API}/audit-logs`, { params });
      setLogs(res.data);
    } catch (error) {
      toast.error("Error loading audit log");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const formatEventType = (type) => {
    return type.replace(/_/g, " ");
  };

  return (
    <div data-testid="audit-log-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-slate-500 mt-1">System event history</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[180px]" data-testid="audit-entity-filter">
              <SelectValue placeholder="Filter by entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="order">Orders</SelectItem>
              <SelectItem value="quote">Quotes</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="ticket">Tickets</SelectItem>
              <SelectItem value="ingest">Ingest</SelectItem>
              <SelectItem value="user">Users</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchLogs} data-testid="refresh-audit-btn">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Log List */}
      <div className="table-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <ClipboardList className="h-12 w-12 mb-3 text-slate-300" />
            <p>No events recorded</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-4 hover:bg-slate-50/50" data-testid={`audit-row-${log.id}`}>
                <div className="flex items-start gap-4">
                  <div className={`h-2.5 w-2.5 rounded-full mt-1.5 ${getEventColor(log.event_type)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 uppercase text-sm">
                        {formatEventType(log.event_type)}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                        {log.entity_type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 font-mono mt-1">
                      ID: {log.entity_id}
                    </p>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="mt-2 text-xs text-slate-400 bg-slate-50 p-2 rounded font-mono">
                        {JSON.stringify(log.details)}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-400 font-mono">{formatDate(log.created_at)}</p>
                    {log.user_id && (
                      <p className="text-xs text-slate-400 mt-1">User: {log.user_id.slice(0, 8)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}