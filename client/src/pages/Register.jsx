import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AuthFrame from "../components/AuthFrame";
import { useAuth } from "../hooks/useAuth";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) return setError("Those passwords don't match yet.");
    setBusy(true);
    try { await register({ name: form.name, email: form.email, password: form.password }); } catch (err) { setError(err.response?.data?.message || "Couldn't connect. Check the server and try again."); }
    finally { setBusy(false); }
  }
  return <AuthFrame eyebrow="A fresh start" title={<>Make room<br />for good chats.</>} subtitle="Create your account. Your conversations start here." footer={<>Already have an account? <Link to="/">Sign in <span aria-hidden="true">↗</span></Link></>}>
    <form className="auth-form" onSubmit={submit}>
      <label>Your name<input autoComplete="name" placeholder="How should we call you?" value={form.name} onChange={update("name")} required minLength={2} maxLength={80} /></label>
      <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update("email")} required /></label>
      <div className="auth-two-col"><label>Password<input type="password" autoComplete="new-password" placeholder="8+ characters" value={form.password} onChange={update("password")} minLength={8} required /></label><label>Confirm<input type="password" autoComplete="new-password" placeholder="One more time" value={form.confirm} onChange={update("confirm")} required /></label></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <motion.button whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.98 }} className="primary-button" type="submit" disabled={busy}>{busy ? <span className="button-spinner" /> : <>Create account <span aria-hidden="true">→</span></>}</motion.button>
    </form>
  </AuthFrame>;
}
