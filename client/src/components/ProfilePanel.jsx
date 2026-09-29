import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import api from "../services/api";

const timeLabel = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export default function ProfilePanel({ target, currentUser, updateUser, onClose }) {
  const own = (target?.id || target?._id) === (currentUser?.id || currentUser?._id);
  const [profile, setProfile] = useState(target || currentUser);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (own) setProfile(currentUser);
    else api.get(`/users/${target?.id || target?._id}`).then(({ data }) => { if (active) setProfile(data.user); }).catch((err) => { if (active) setError(err.response?.data?.message || "Couldn't load this profile."); });
    return () => { active = false; };
  }, [own, target, currentUser]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const beginEdit = () => { setName(profile?.name || ""); setUsername(profile?.username || ""); setEditing(true); setError(""); };
  const chooseFile = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!/^image\/(jpeg|png|webp)$/.test(selected.type)) { setError("Choose a JPG, PNG, or WebP image."); return; }
    if (selected.size > 2 * 1024 * 1024) { setError("Profile pictures must be 2 MB or smaller."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected); setPreview(URL.createObjectURL(selected)); setError("");
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      let updated = profile;
      const { data } = await api.put("/users/me/profile", { name, username });
      updated = data.user;
      if (file) {
        const body = new FormData(); body.append("image", file);
        const pictureResult = await api.post("/users/me/profile-picture", body);
        updated = pictureResult.data.user;
      }
      setProfile(updated); updateUser(updated); setEditing(false); setFile(null); setPreview("");
    } catch (err) { setError(err.response?.data?.message || "Couldn't save your profile."); }
    finally { setBusy(false); }
  };
  const removePicture = async () => {
    setBusy(true); setError("");
    try { const { data } = await api.delete("/users/me/profile-picture"); setProfile(data.user); updateUser(data.user); setPreview(""); setFile(null); }
    catch (err) { setError(err.response?.data?.message || "Couldn't remove the profile picture."); }
    finally { setBusy(false); }
  };

  return <div className="profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <button className="profile-close icon-button" onClick={onClose} aria-label="Close profile">×</button>
      <div className="profile-panel-heading"><span className="eyebrow">{own ? "YOUR PROFILE" : "PROFILE"}</span><h2 id="profile-title">Profile</h2></div>
      <div className="profile-hero">
        <div className="profile-avatar-wrap">{preview ? <img className="profile-preview" src={preview} alt="Selected profile preview" /> : <Avatar user={profile} size="large" />}</div>
        <div className="profile-heading-copy"><b>{profile?.name || "Loading profile…"}</b><span>@{profile?.username || ""}</span><small>{profile?.isOnline ? "Active now" : profile?.lastSeen ? `Last seen ${timeLabel(profile.lastSeen)}` : "Offline"}</small></div>
      </div>
      {error && <p className="profile-error" role="alert">{error}</p>}
      {own && editing ? <form className="profile-form" onSubmit={save}>
        <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required /></label>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" required /><small>3–24 letters, numbers, or underscores</small></label>
        <label className="picture-picker">Profile picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /><small>JPG, PNG, or WebP · up to 2 MB</small></label>
        <div className="profile-actions"><button type="button" className="profile-secondary" onClick={() => { setEditing(false); setFile(null); setPreview(""); }}>Cancel</button><button type="submit" className="profile-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      </form> : <>
        <div className="profile-details"><span>Display name</span><b>{profile?.name || "—"}</b><span>Username</span><b>@{profile?.username || "—"}</b><span>Status</span><b>{profile?.isOnline ? "Online" : "Offline"}</b></div>
        {own && <div className="profile-actions"><button className="profile-secondary" onClick={removePicture} disabled={busy}>Remove picture</button><button className="profile-primary" onClick={beginEdit}>Edit profile</button></div>}
      </>}
    </section>
  </div>;
}
