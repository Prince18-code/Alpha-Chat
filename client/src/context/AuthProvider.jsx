import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(() => !localStorage.getItem("alphaChat.token"));
  const saveSession = useCallback((data) => {
    localStorage.setItem("alphaChat.token", data.token);
    setUser(data.user);
  }, []);
  const updateUser = useCallback((profile) => setUser((current) => current ? { ...current, ...profile, _id: profile.id || current._id } : current), []);
  useEffect(() => {
    if (!localStorage.getItem("alphaChat.token")) return;
    api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => localStorage.removeItem("alphaChat.token")).finally(() => setReady(true));
  }, []);
  const login = useCallback(async (credentials) => { const { data } = await api.post("/auth/login", credentials); saveSession(data); }, [saveSession]);
  const register = useCallback(async (details) => { const { data } = await api.post("/auth/register", details); saveSession(data); }, [saveSession]);
  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* The local session still needs to end if the server is offline. */ }
    localStorage.removeItem("alphaChat.token");
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, ready, login, register, logout, updateUser }), [user, ready, login, register, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
