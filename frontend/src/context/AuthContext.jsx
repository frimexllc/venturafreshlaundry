// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper functions unificadas
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const setToken = (token, remember = true) => {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem("token", token);
};
const removeToken = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Configurar axios interceptor para el token
  useEffect(() => {
    const token = getToken();
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }
  }, []);

  // Verificar usuario al cargar
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        const response = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data);
      } catch (error) {
        console.error("Error fetching user:", error);
        if (error.response?.status === 401) {
          removeToken();
          delete axios.defaults.headers.common["Authorization"];
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const login = async (email, password, remember = true) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      // Usar always "token" como key (consistente)
      setToken(access_token, remember);
      axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, { name, email, password });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token, true);
      axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
      setUser(userData);
      
      return userData;
    } catch (error) {
      console.error("Register error:", error);
      throw error;
    }
  };

  const logout = () => {
    removeToken();
    delete axios.defaults.headers.common["Authorization"];
    setUser(null);
  };

  // Verificar si el usuario tiene un rol específico
  const hasRole = (role) => {
    return user?.role === role;
  };

  const isAdmin = () => hasRole("admin");
  const isOperator = () => hasRole("operator");
  const isDriver = () => hasRole("driver");

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        hasRole,
        isAdmin,
        isOperator,
        isDriver,
        token: getToken(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};