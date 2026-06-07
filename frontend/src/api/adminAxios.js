// src/api/adminAxios.js
import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL + "/api";

const adminAxios = axios.create({ baseURL: API_URL });

// Interceptor para agregar token automáticamente
adminAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (token && !config.url?.includes("/public/")) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar 401
adminAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default adminAxios;