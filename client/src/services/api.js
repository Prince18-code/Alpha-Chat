import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000/api" : "");
if (!apiBaseUrl) console.error("API is not configured. Set VITE_API_URL to the current Render backend API URL.");
const api = axios.create({ baseURL: apiBaseUrl, timeout: 30000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("alphaChat.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default api;
