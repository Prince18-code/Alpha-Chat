import { useState } from "react";

const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000/api" : "");
const serverBase = apiBase.replace(/\/api\/?$/, "");

export default function Avatar({ user, size = "normal" }) {
  const [failedSource, setFailedSource] = useState("");
  const picture = user?.profilePicture;
  const source = picture?.startsWith("/media/") ? `${serverBase}${picture}` : picture;
  return <div className={`avatar avatar-${size}`}>
    {source && failedSource !== source ? <img src={source} alt="" onError={() => setFailedSource(source)} /> : <span>{(user?.name || "?").trim().slice(0, 1).toUpperCase()}</span>}
    {user?.isOnline && <i className="online-indicator" />}
  </div>;
}
