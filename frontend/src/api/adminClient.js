import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const adminAxios = axios.create({ baseURL: API });

adminAxios.interceptors.request.use((config) => {
  if (config.url?.includes("/public/")) {
    return config;
  }
  const token = localStorage.getItem("token"); // ← CAMBIO AQUÍ
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default adminAxios;