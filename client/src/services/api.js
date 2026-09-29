import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://192.168.31.81:5000/api", timeout: 12000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("alphaChat.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default api;
