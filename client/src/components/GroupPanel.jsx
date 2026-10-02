import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Avatar from "./Avatar";
import api from "../services/api";

const idOf = (value) => value?.id || value?._id || value;

export default function GroupPanel({ conversation, currentUser, onClose, onOpenUser, onChanged, onLeave }) {
  const [name, setName] = useState(conversation.name || "");
  const [editingName, setEditingName] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [resultsFor, setResultsFor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = conversation.admins?.some((member) => idOf(member) === idOf(currentUser));

  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    const requestedQuery = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const { data } = await api.get("/users", { params: { q: requestedQuery }, signal: controller.signal }); setResults(data.users.filter((person) => !conversation.participants.some((member) => idOf(member) === idOf(person)))); setResultsFor(requestedQuery); }
      catch { if (!controller.signal.aborted) { setResults([]); setResultsFor(requestedQuery); } }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, conversation.participants]);

  const saveName = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.patch(`/groups/${idOf(conversation)}`, { name }); setEditingName(false); onChanged(); }
    catch (err) { setError(err.response?.data?.message || "Couldn't update the group."); }
    finally { setBusy(false); }
  };
  const addMember = async (person) => {
    setBusy(true); setError("");
    try { await api.post(`/groups/${idOf(conversation)}/members`, { memberIds: [idOf(person)] }); setQuery(""); setResults([]); onChanged(); }
    catch (err) { setError(err.response?.data?.message || "Couldn't add that member."); }
    finally { setBusy(false); }
  };
  const removeMember = async (person) => {
    if (!window.confirm(`Remove ${person.name} from this group?`)) return;
    setBusy(true); setError("");
    try { await api.delete(`/groups/${idOf(conversation)}/members/${idOf(person)}`); onChanged(); }
    catch (err) { setError(err.response?.data?.message || "Couldn't remove that member."); }
    finally { setBusy(false); }
  };
  const leave = async () => {
    if (!window.confirm("Leave this group? You can be added again by an admin.")) return;
    setBusy(true); setError("");
    try { await api.delete(`/groups/${idOf(conversation)}/members/${idOf(currentUser)}`); onLeave(); }
    catch (err) { setError(err.response?.data?.message || "Couldn't leave the group."); }
    finally { setBusy(false); }
  };
  const changePicture = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image up to 2 MB."); return; }
    setBusy(true); setError("");
    try { const body = new FormData(); body.append("image", file); await api.post(`/groups/${idOf(conversation)}/picture`, body); onChanged(); }
    catch (err) { setError(err.response?.data?.message || "Couldn't update the group picture."); }
    finally { setBusy(false); event.target.value = ""; }
  };

  return <>
    <motion.button className="panel-scrim" aria-label="Close group details" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    <motion.aside className="group-panel" role="dialog" aria-modal="true" aria-labelledby="group-panel-title" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: .22 }}>
      <header className="panel-top"><button className="icon-button" onClick={onClose} aria-label="Close">×</button><span className="eyebrow">GROUP DETAILS</span><span /></header>
      <div className="group-panel-hero"><div className="group-panel-avatar"><Avatar user={{ name: conversation.name, profilePicture: conversation.groupPicture }} size="profile" />{admin && <label className="photo-edit-dot" title="Change group photo">✎<input type="file" accept="image/jpeg,image/png,image/webp" onChange={changePicture} disabled={busy} /></label>}</div>
        {editingName ? <form className="group-name-edit" onSubmit={saveName}><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus /><button className="profile-primary" disabled={busy}>Save</button><button type="button" className="profile-secondary" onClick={() => { setName(conversation.name); setEditingName(false); }}>Cancel</button></form> : <><h2 id="group-panel-title">{conversation.name}</h2>{admin && <button className="subtle-action" onClick={() => setEditingName(true)}>Edit group name</button>}</>}
        <span className="group-member-count">{conversation.participants.length} members · Created {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(conversation.createdAt))}</span>
      </div>
      {error && <p className="profile-error group-panel-error" role="alert">{error}</p>}
      {admin && <section className="group-add-section"><label className="form-field">Add people<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" /></label>{(resultsFor === query.trim() ? results : []).map((person) => <button className="group-search-person" key={idOf(person)} onClick={() => addMember(person)} disabled={busy}><Avatar user={person} size="small" /><span><b>{person.name}</b><small>@{person.username}</small></span><i>+</i></button>)}</section>}
      <section className="group-member-section"><div className="group-section-heading"><b>Members</b><span>{conversation.participants.length}</span></div>{conversation.participants.map((person) => <div className="group-member-row" key={idOf(person)}><button className="group-member-identity" onClick={() => onOpenUser(person)}><Avatar user={person} size="small" /><span><b>{person.name}</b><small>@{person.username}{idOf(person) === idOf(conversation.createdBy) ? " · Creator" : ""}</small></span></button>{conversation.admins?.some((member) => idOf(member) === idOf(person)) && <span className="admin-tag">Admin</span>}{admin && idOf(person) !== idOf(currentUser) && <button className="remove-member-button" onClick={() => removeMember(person)} disabled={busy} aria-label={`Remove ${person.name}`}>×</button>}</div>)}</section>
      <footer className="group-panel-footer"><button className="profile-secondary danger-action" onClick={leave} disabled={busy}>Leave group</button></footer>
    </motion.aside>
  </>;
}
