import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { createNotificationsSocket } from "../utils/notificationsSocket";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const useDashboardData = (t) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const loadData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await axios.get(`${API_URL}/api/automation/operator-dashboard`);
      setDashboard(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
    const socket = createNotificationsSocket();
    if (socket) {
      socket.on("notification", loadData);
      socket.on("dashboard", loadData);
    }
    const interval = setInterval(loadData, 30000);
    return () => {
      if (socket) socket.disconnect();
      clearInterval(interval);
    };
  }, [loadData]);

  return { dashboard, loading, refresh: loadData };
};