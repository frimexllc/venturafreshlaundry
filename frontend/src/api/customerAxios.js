import axios from "axios";
import { getCustomerToken, clearCustomerSession, isTokenError } from "../utils/tokenUtils";

const API = (() => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!isLocal) {
      return `${window.location.origin}/api`;
    }
    const base = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    return `${base}/api`;
  }
  const base = process.env.REACT_APP_BACKEND_URL || "";
  return base ? `${base}/api` : "/api";
})();

const customerAxios = axios.create({ baseURL: API });

customerAxios.interceptors.request.use((config) => {
  const token = getCustomerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

customerAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const detail = error.response?.data?.detail || "";
      const tokenExists = !!getCustomerToken();
      if (tokenExists && isTokenError(detail)) {
        clearCustomerSession();
        if (!window.location.pathname.includes("/account/login")) {
          window.location.href = "/account/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default customerAxios;
