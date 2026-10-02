import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import api from "../services/api";
import Avatar from "./Avatar";

const idOf = (value) => value?.id || value?._id || value;

export default function GroupCreate({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [resultsFor, setResultsFor] = useState("");
  const [members, setMembers] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    const requestedQuery = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try { const { data } = await api.get("/users", { params: { q: requestedQuery }, signal: controller.signal }); setResults(data.users.filter((person) => !members.some((member) => idOf(member) === idOf(person)))); setResultsFor(requestedQuery); }
      catch { if (!controller.signal.aborted) { setResults([]); setResultsFor(requestedQuery); } }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, members]);

  const choosePhoto = (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!/^image\/(jpeg|png|webp)$/.test(picked.type) || picked.size > 2 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image up to 2 MB."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(picked); setPreview(URL.createObjectURL(picked)); setError("");
  };
  const create = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/groups", { name, memberIds: members.map(idOf) });
      let conversation = data.conversation;
      let warning = "";
      if (file) {
        const body = new FormData(); body.append("image", file);
        try {
          const picture = await api.post(`/groups/${idOf(conversation)}/picture`, body);
          conversation = { ...conversation, groupPicture: picture.data.groupPicture };
        } catch (err) { warning = err.response?.data?.message || "Group created, but the photo could not be uploaded."; }
      }
      onCreated(conversation, warning);
    } catch (err) { setError(err.response?.data?.message || "Couldn't create the group."); }
    finally { setBusy(false); }
  };

  return <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <motion.section className="group-create dialog-card" role="dialog" aria-modal="true" aria-labelledby="group-create-title" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: .98 }} transition={{ duration: .2 }}>
      <button className="profile-close icon-button" onClick={onClose} aria-label="Close">×</button>
      <span className="eyebrow">A SPACE FOR EVERYONE</span><h2 id="group-create-title">New group</h2>
      <div className="group-steps" aria-label={`Step ${step} of 2`}><span className={step === 1 ? "is-active" : "is-done"}>01 <b>Details</b></span><i /><span className={step === 2 ? "is-active" : ""}>02 <b>Members</b></span></div>
      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? <motion.div className="group-step-content" key="details" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .16 }}>
          <div className="group-photo-choice"><div className="group-photo-preview">{preview ? <img src={preview} alt="Group picture preview" /> : <span>{name.trim().slice(0, 1).toUpperCase() || "G"}</span>}</div><label className="profile-secondary">Add group photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label><small>Optional · JPG, PNG, or WebP · 2 MB max</small></div>
          <label className="form-field">Group name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Give your group a name" /></label>
        </motion.div> : <motion.div className="group-step-content" key="members" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: .16 }}>
          <label className="form-field">Find people<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" /></label>
          <div className="group-member-results">{members.map((person) => <button className="selected-member-chip" key={idOf(person)} onClick={() => setMembers((items) => items.filter((item) => idOf(item) !== idOf(person)))}><Avatar user={person} size="small" /><span>{person.name}<small>@{person.username}</small></span><i>×</i></button>)}
            {(resultsFor === query.trim() ? results : []).map((person) => <button className="group-search-person" key={idOf(person)} onClick={() => { setMembers((items) => [...items, person]); setQuery(""); }}><Avatar user={person} size="small" /><span><b>{person.name}</b><small>@{person.username}</small></span><i>+</i></button>)}
            {query.trim().length >= 2 && resultsFor === query.trim() && !results.length && <p className="sidebar-empty">No more people found.</p>}
          </div><small className="member-count-note">{members.length} selected · add at least one person</small>
        </motion.div>}
      </AnimatePresence>
      {error && <p className="profile-error" role="alert">{error}</p>}
      <footer className="dialog-actions">{step === 2 && <button className="profile-secondary" onClick={() => { setStep(1); setError(""); }}>Back</button>}<button className="profile-secondary" onClick={onClose} disabled={busy}>Cancel</button>{step === 1 ? <button className="profile-primary" disabled={name.trim().length < 2} onClick={() => { setStep(2); setError(""); }}>Choose members <span>→</span></button> : <button className="profile-primary" disabled={members.length < 1 || busy} onClick={create}>{busy ? "Creating…" : "Create group"}</button>}</footer>
    </motion.section>
  </motion.div>;
}
