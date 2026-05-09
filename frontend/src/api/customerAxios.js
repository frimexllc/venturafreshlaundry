import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const customerAxios = axios.create({ baseURL: API });

customerAxios.interceptors.request.use((config) => {
  const token = localStorage.getItem("customer_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default customerAxios;