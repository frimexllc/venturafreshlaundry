import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const adminAxios = axios.create({ baseURL: API });

adminAxios.interceptors.request.use((config) => {
  if (config.url?.includes("/public/")) {
    return config;
  }
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-redirect to login on token expired (401)
adminAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const detail = error.response?.data?.detail || "";
      if (detail === "Token expired" || detail === "Not authenticated") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default adminAxios;