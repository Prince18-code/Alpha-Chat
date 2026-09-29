import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AuthFrame from "../components/AuthFrame";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await login({ email, password }); } catch (err) { setError(err.response?.data?.message || "Couldn't connect. Check the server and try again."); }
    finally { setBusy(false); }
  }
  return <AuthFrame eyebrow="Welcome back" title={<>Good to see<br />you again.</>} subtitle="Sign in to pick up where the conversation left off." footer={<>New to alphaChat? <Link to="/register">Create an account <span aria-hidden="true">↗</span></Link></>}>
    <form className="auth-form" onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <motion.button whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.98 }} className="primary-button" type="submit" disabled={busy}>{busy ? <span className="button-spinner" /> : <>Sign in <span aria-hidden="true">→</span></>}</motion.button>
    </form>
  </AuthFrame>;
}
