import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "./Avatar";
import api from "../services/api";

const idOf = (value) => value?.id || value?._id;
const timeLabel = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export default function ProfilePanel({ target, currentUser, updateUser, onClose, onMessage }) {
  const own = idOf(target) === idOf(currentUser);
  const targetId = idOf(target);
  const [profile, setProfile] = useState(target || currentUser);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const displayProfile = own ? currentUser : profile;

  useEffect(() => {
    let active = true;
    if (!own && targetId) api.get(`/users/${targetId}`).then(({ data }) => { if (active) setProfile(data.user); }).catch((err) => { if (active) setError(err.response?.data?.message || "Couldn't load this profile."); });
    return () => { active = false; };
  }, [own, targetId]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const beginEdit = () => { setName(displayProfile?.name || ""); setUsername(displayProfile?.username || ""); setEditing(true); setError(""); setNotice(""); };
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
    let detailsSaved = false;
    try {
      let updated = profile;
      const { data } = await api.put("/users/me/profile", { name, username });
      updated = data.user;
      detailsSaved = true;
      setProfile(updated); updateUser(updated);
      if (file) {
        const body = new FormData(); body.append("image", file);
        const pictureResult = await api.post("/users/me/profile-picture", body, { onUploadProgress: (progress) => setNotice(progress.total ? `Uploading photo · ${Math.round(progress.loaded * 100 / progress.total)}%` : "Uploading photo…") });
        updated = pictureResult.data.user;
      }
      setProfile(updated); updateUser(updated); setEditing(false); setFile(null); setPreview(""); setNotice("Your profile was updated.");
    } catch (err) { setError(detailsSaved ? err.response?.data?.message || "Profile details were saved, but the photo upload failed. Try choosing and saving the photo again." : err.response?.data?.message || "Couldn't save your profile."); setNotice(""); }
    finally { setBusy(false); }
  };
  const removePicture = async () => {
    setBusy(true); setError("");
    try { const { data } = await api.delete("/users/me/profile-picture"); setProfile(data.user); updateUser(data.user); setPreview(""); setFile(null); setNotice("Profile photo removed."); }
    catch (err) { setError(err.response?.data?.message || "Couldn't remove the profile picture."); }
    finally { setBusy(false); }
  };

  if (editing) return <motion.main className="profile-edit-page" role="dialog" aria-modal="true" aria-labelledby="profile-title" initial={{ opacity: 0, x: 14, scale: .995 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: .22 }}>
    <header className="profile-edit-top"><button className="profile-back-button" onClick={() => { setEditing(false); setFile(null); setPreview(""); setError(""); }} aria-label="Back to profile">← <span>Back</span></button><div><span className="eyebrow">ACCOUNT SETTINGS</span><h1 id="profile-title">Edit profile</h1></div><span /></header>
    <form className="profile-edit-form" onSubmit={save}>
      <section className="profile-photo-card"><div className="profile-edit-avatar">{preview ? <img src={preview} alt="Selected profile preview" /> : <Avatar user={displayProfile} size="profile" />}</div><div className="profile-photo-copy"><b>Your photo</b><span>Make it easy for people to recognize you.</span><div className="photo-actions"><label className="profile-secondary photo-upload-button">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /></label>{displayProfile?.profilePicture && <button type="button" className="profile-secondary" onClick={removePicture} disabled={busy}>Remove</button>}</div><small>JPG, PNG, or WebP · up to 2 MB</small></div></section>
      <div className="profile-edit-fields"><label className="form-field">Display name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></label><label className="form-field">Username<div className="username-input"><span>@</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" required /></div><small>3–24 letters, numbers, or underscores</small></label><label className="form-field">Email<input value={currentUser?.email || ""} readOnly aria-readonly="true" /><small>Email is managed with your account sign-in.</small></label></div>
      {error && <p className="profile-error" role="alert">{error}</p>}
      <footer className="profile-edit-actions"><button type="button" className="profile-secondary" onClick={() => { setEditing(false); setFile(null); setPreview(""); }}>Cancel</button><button type="submit" className="profile-primary" disabled={busy}>{busy ? notice || "Saving…" : "Save changes"}</button></footer>
    </form>
  </motion.main>;

  return <>
    <motion.button className="panel-scrim" aria-label="Close profile" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    <motion.aside className="profile-panel profile-viewer" role="dialog" aria-modal="true" aria-labelledby="profile-title" initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 22 }} transition={{ duration: .22 }}>
      <header className="panel-top"><button className="icon-button" onClick={onClose} aria-label="Close profile">×</button><span className="eyebrow">{own ? "YOUR PROFILE" : "PROFILE"}</span><span /></header>
      <div className="profile-viewer-hero"><motion.div className="profile-viewer-avatar" layoutId={`profile-avatar-${targetId}` }><Avatar user={displayProfile} size="profile" /></motion.div><h2 id="profile-title">{displayProfile?.name || "Loading profile…"}</h2><span className="profile-viewer-username">@{displayProfile?.username || ""}</span><span className="profile-status">{displayProfile?.isOnline ? <><i className="status-dot" /> Active now</> : displayProfile?.lastSeen ? `Last seen ${timeLabel(displayProfile.lastSeen)}` : "Offline"}</span></div>
      <AnimatePresence>{notice && <motion.p className="profile-success" role="status" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{notice}</motion.p>}</AnimatePresence>
      {error && <p className="profile-error" role="alert">{error}</p>}
      <div className="profile-details"><span>Display name</span><b>{displayProfile?.name || "—"}</b><span>Username</span><b>@{displayProfile?.username || "—"}</b>{own && <><span>Email</span><b>{displayProfile?.email || "—"}</b></>}</div>
      <div className="profile-viewer-actions">{own ? <button className="profile-primary" onClick={beginEdit}>Edit profile</button> : <button className="profile-primary" onClick={() => onMessage?.(displayProfile)}>Message</button>}</div>
    </motion.aside>
  </>;
}
