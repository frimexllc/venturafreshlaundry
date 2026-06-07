import axios from "axios";
import { getCustomerToken, clearCustomerSession, isTokenError } from "../utils/tokenUtils";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

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