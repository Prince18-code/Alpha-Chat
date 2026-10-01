import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import { AuthProvider } from "./context/AuthProvider";
import { useAuth } from "./hooks/useAuth";

function RouteView() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="boot-screen"><img className="brand-mark brand-logo-image" src="/alphachat-logo.jpg" alt="alphaChat" /><span className="boot-line" /></div>;
  return <AnimatePresence mode="wait" initial={false}>
    <motion.div key={location.pathname} className="route-view" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
      <Routes location={location}>
        <Route path="/" element={user ? <Navigate to="/chat" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/chat" replace /> : <Register />} />
        <Route path="/chat" element={user ? <Chat /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to={user ? "/chat" : "/"} replace />} />
      </Routes>
    </motion.div>
  </AnimatePresence>;
}

export default function App() {
  return <MotionConfig reducedMotion="user"><AuthProvider><BrowserRouter><RouteView /></BrowserRouter></AuthProvider></MotionConfig>;
}
