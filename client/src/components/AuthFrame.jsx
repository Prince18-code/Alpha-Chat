import { Link } from "react-router-dom";

export default function AuthFrame({ eyebrow, title, subtitle, children, footer }) {
  return <main className="auth-page">
    <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
    <section className="auth-panel">
      <Link to="/" className="brand-lockup"><img className="brand-mark brand-logo-image" src="/alphachat-logo.jpg" alt="" /><span>alpha<span className="brand-light">Chat</span></span></Link>
      <div className="auth-copy"><div className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>
      {children}
      <div className="auth-footer">{footer}</div>
    </section>
    <div className="auth-aside"><span className="aside-line" /><span>A quieter place to connect.</span><span className="aside-version">01 / PRIVATE MESSAGING</span></div>
  </main>;
}
