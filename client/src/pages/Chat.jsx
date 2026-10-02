import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import api from "../services/api";
import Avatar from "../components/Avatar";
import ProfilePanel from "../components/ProfilePanel";

const idOf = (value) => value?.id || value?._id || value;
const timeLabel = (date) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(date));
const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
function revealLatest(element) { element?.scrollTo({ top: element.scrollHeight, behavior: scrollBehavior() }); }
function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, plus: <path d="M12 5v14M5 12h14" />, send: <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>, back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>, logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>, message: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5A8.5 8.5 0 0 1 21 11.5Z" /></>, check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const MessageRow = memo(function MessageRow({ message, own, peer, onEdit, onDelete }) {
  return <motion.div className={`message-row ${own ? "is-own" : ""}`} initial={{ opacity: 0, y: 7, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}>
    {!own && <Avatar user={peer} size="tiny" />}
    <div className="message-content"><div className={`message-bubble ${own ? "own-bubble" : ""} ${message.isDeleted ? "deleted-bubble" : ""}`}>{message.content}</div><div className="message-meta"><time>{timeLabel(message.createdAt)}</time>{message.editedAt && !message.isDeleted && <span>Edited</span>}{message.pending && <span className="sending-label">Sending</span>}{own && !message.pending && <span className="message-check"><Icon name="check" size={12} /></span>}{own && !message.pending && !message.isDeleted && <span className="message-actions"><button type="button" aria-label="Edit message" title="Edit message" onClick={() => onEdit(message)}>Edit</button><button type="button" aria-label="Delete message" title="Delete message" onClick={() => onDelete(message)}>Delete</button></span>}</div></div>
  </motion.div>;
});
export default function Chat() {
  const { user, logout, updateUser } = useAuth();
  const token = localStorage.getItem("alphaChat.token");
  const socket = useSocket(token);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [resultsFor, setResultsFor] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [socketReady, setSocketReady] = useState(() => Boolean(socket?.connected));
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef(null);
  const draftRef = useRef(null);
  const typingTimer = useRef(null);
  const searchTimer = useRef(null);
  const selectedRef = useRef(selected);
  const conversationsRef = useRef(conversations);
  const nearBottomRef = useRef(true);
  const oldestRef = useRef(null);
  const activePeer = useMemo(() => selected?.participants?.find((person) => idOf(person) !== idOf(user)), [selected, user]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    const element = draftRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [draft]);

  const fetchConversations = useCallback(async () => {
    try { const { data } = await api.get("/conversations"); setConversations(data.conversations); }
    catch (err) { setError(err.response?.data?.message || "Couldn't load your conversations."); }
    finally { setLoading(false); }
  }, []);
  // Fetching is an external synchronization; state updates happen after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (search.trim().length < 2) return undefined;
    const query = search.trim(); const controller = new AbortController();
    searchTimer.current = setTimeout(async () => {
      try { const { data } = await api.get("/users", { params: { q: query }, signal: controller.signal }); setResults(data.users); setResultsFor(query); }
      catch { if (!controller.signal.aborted) { setResults([]); setResultsFor(query); } }
    }, 180);
    return () => { clearTimeout(searchTimer.current); controller.abort(); };
  }, [search]);

  const openConversation = useCallback(async (conversation) => {
    setSelected(conversation); selectedRef.current = conversation;
    setMessages([]); setNewCount(0); setTyping(false); setHasMore(false); setError(""); setLoadingMessages(true); nearBottomRef.current = true;
    try {
      const { data } = await api.get(`/conversations/${idOf(conversation)}/messages`);
      if (idOf(selectedRef.current) !== idOf(conversation)) return;
      setMessages((current) => {
        const combined = [...data.messages, ...current];
        const confirmedClients = new Set(combined.filter((message) => !message.pending && message.clientId).map((message) => message.clientId));
        const merged = new Map();
        combined.forEach((message) => {
          if (message.pending && confirmedClients.has(message.clientId)) return;
          merged.set(message.pending ? `client:${message.clientId}` : `id:${idOf(message)}`, message);
        });
        return [...merged.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      });
      setHasMore(data.hasMore); oldestRef.current = data.messages[0]?._id;
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
    } catch (err) { setError(err.response?.data?.message || "Couldn't load this conversation."); }
    finally { setLoadingMessages(false); }
  }, []);

  const startConversation = useCallback(async (person) => {
    setSearch(""); setResults([]); setError("");
    try {
      const { data } = await api.post(`/conversations/${idOf(person)}`);
      setConversations((items) => [data.conversation, ...items.filter((item) => idOf(item) !== idOf(data.conversation))]);
      openConversation(data.conversation);
    } catch (err) { setError(err.response?.data?.message || "Couldn't start that conversation."); }
  }, [openConversation]);

  useEffect(() => {
    if (!socket) return undefined;
    const onConnect = () => { setSocketReady(true); setError(""); };
    const onDisconnect = () => setSocketReady(false);
    const onConnectError = (connectionError) => {
      setSocketReady(false);
      const message = connectionError?.message || "Chat connection lost. Reconnecting…";
      setError(message);
      if (/authentication required|invalid session|session expired/i.test(message)) socket.disconnect();
    };
    const onMessage = (message) => {
      const active = selectedRef.current;
      if (!conversationsRef.current.some((item) => idOf(item) === idOf(message.conversation))) fetchConversations();
      setConversations((items) => {
        const updated = items.map((item) => idOf(item) === idOf(message.conversation) ? { ...item, lastMessage: message, lastMessageAt: message.createdAt } : item);
        return updated.sort((a, b) => new Date(b.lastMessageAt || b.updatedAt) - new Date(a.lastMessageAt || a.updatedAt));
      });
      if (!active || idOf(active) !== idOf(message.conversation)) { return; }
      setMessages((items) => {
        if (items.some((item) => idOf(item) === idOf(message) || (message.clientId && item.clientId === message.clientId))) return items;
        return [...items.filter((item) => !(message.clientId && item.clientId === message.clientId)), message];
      });
      if (nearBottomRef.current) requestAnimationFrame(() => revealLatest(listRef.current));
      else if (idOf(message.sender) !== idOf(user)) setNewCount((count) => count + 1);
    };
    const onMessageChange = (message) => {
      setMessages((items) => items.map((item) => idOf(item) === idOf(message) ? message : item));
      setConversations((items) => items.map((item) => idOf(item) === idOf(message.conversation) && idOf(item.lastMessage) === idOf(message) ? { ...item, lastMessage: message } : item));
    };
    const onProfileUpdate = (profile) => {
      const profileId = idOf(profile);
      const apply = (person) => idOf(person) === profileId ? { ...person, ...profile, _id: profileId } : person;
      setConversations((items) => items.map((item) => ({ ...item, participants: item.participants.map(apply) })));
      setSelected((current) => current ? { ...current, participants: current.participants.map(apply) } : current);
      setProfileTarget((current) => current && idOf(current) === profileId ? { ...current, ...profile, _id: profileId } : current);
      if (profileId === idOf(user)) updateUser(profile);
    };
    const presence = (online) => ({ userId, lastSeen }) => {
      const update = (person) => idOf(person) === userId ? { ...person, isOnline: online, ...(lastSeen ? { lastSeen } : {}) } : person;
      setConversations((items) => items.map((item) => ({ ...item, participants: item.participants.map(update) })));
      setSelected((current) => current ? { ...current, participants: current.participants.map(update) } : current);
      setProfileTarget((current) => current && idOf(current) === userId ? { ...current, isOnline: online, ...(lastSeen ? { lastSeen } : {}) } : current);
    };
    const onUserOnline = presence(true); const onUserOffline = presence(false);
    const onTypingStart = ({ conversationId }) => { if (idOf(selectedRef.current) === conversationId) setTyping(true); };
    const onTypingStop = ({ conversationId }) => { if (idOf(selectedRef.current) === conversationId) setTyping(false); };
    socket.on("connect", onConnect); socket.on("disconnect", onDisconnect); socket.on("connect_error", onConnectError); socket.on("receive_message", onMessage);
    socket.on("user_online", onUserOnline); socket.on("user_offline", onUserOffline);
    socket.on("message_updated", onMessageChange); socket.on("message_deleted", onMessageChange); socket.on("user_profile_updated", onProfileUpdate);
    socket.on("typing_start", onTypingStart); socket.on("typing_stop", onTypingStop);
    if (!socket.connected) socket.connect();
    queueMicrotask(socket.connected ? onConnect : onDisconnect);
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect_error", onConnectError); socket.off("receive_message", onMessage); socket.off("user_online", onUserOnline); socket.off("user_offline", onUserOffline); socket.off("message_updated", onMessageChange); socket.off("message_deleted", onMessageChange); socket.off("user_profile_updated", onProfileUpdate); socket.off("typing_start", onTypingStart); socket.off("typing_stop", onTypingStop); };
  }, [socket, user, fetchConversations, updateUser]);

  const loadOlder = async () => {
    if (!selected || !hasMore || loadingMessages) return;
    const element = listRef.current; if (!element) return;
    const previousHeight = element.scrollHeight; const previousTop = element.scrollTop;
    setLoadingMessages(true);
    try {
      const { data } = await api.get(`/conversations/${idOf(selected)}/messages`, { params: { before: oldestRef.current } });
      oldestRef.current = data.messages[0]?._id || oldestRef.current; setHasMore(data.hasMore); setMessages((items) => [...data.messages, ...items]);
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = previousTop + (listRef.current.scrollHeight - previousHeight); });
    } catch (err) { setError(err.response?.data?.message || "Couldn't load older messages."); }
    finally { setLoadingMessages(false); }
  };

  const sendMessage = (event) => {
    event.preventDefault();
    const content = draft.trim(); if (!content || !selected) return;
    if (!socket?.connected) {
      setSocketReady(false);
      setError("Chat connection is unavailable. Please wait for it to reconnect.");
      return;
    }
    if (editing) {
      socket.timeout(10000).emit("edit_message", { messageId: idOf(editing), content }, (timeoutError, response) => {
        if (timeoutError || response?.error || !response?.message) { setError(response?.error || "Message could not be edited. Please try again."); return; }
        setMessages((items) => items.map((item) => idOf(item) === idOf(response.message) ? response.message : item));
        setConversations((items) => items.map((item) => idOf(item) === idOf(selected) && idOf(item.lastMessage) === idOf(response.message) ? { ...item, lastMessage: response.message } : item));
        setEditing(null); setDraft(""); setError("");
      });
      return;
    }
    const clientId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const optimistic = { _id: `temp-${clientId}`, clientId, conversation: idOf(selected), sender: idOf(user), receiver: idOf(activePeer), content, createdAt: new Date().toISOString(), pending: true };
    const shouldScroll = nearBottomRef.current;
    setMessages((items) => [...items, optimistic]); setDraft(""); setError("");
    if (shouldScroll) requestAnimationFrame(() => revealLatest(listRef.current));
    clearTimeout(typingTimer.current); socket.emit("typing_stop", { conversationId: idOf(selected) });
    socket.timeout(10000).emit("send_message", { conversationId: idOf(selected), content, clientId }, (timeoutError, response) => {
      if (timeoutError || response?.error || !response?.message) { setMessages((items) => items.filter((item) => item.clientId !== clientId)); setError(response?.error || "Message could not be confirmed. Please try again."); return; }
      const saved = response.message;
      setMessages((items) => items.map((item) => item.clientId === clientId ? { ...saved, clientId, pending: false } : item));
      setConversations((items) => items.map((item) => idOf(item) === idOf(selected) ? { ...item, lastMessage: saved, lastMessageAt: saved.createdAt } : item));
    });
  };

  const beginEdit = (message) => { setEditing(message); setDraft(message.content); setError(""); requestAnimationFrame(() => draftRef.current?.focus()); };
  const cancelEdit = () => { setEditing(null); setDraft(""); setError(""); };
  const deleteMessage = (message) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    if (!socket?.connected) { setError("Chat connection is unavailable. Please wait for it to reconnect."); return; }
    socket.timeout(10000).emit("delete_message", { messageId: idOf(message) }, (timeoutError, response) => {
      if (timeoutError || response?.error || !response?.message) { setError(response?.error || "Message could not be deleted. Please try again."); return; }
      setMessages((items) => items.map((item) => idOf(item) === idOf(response.message) ? response.message : item));
      setConversations((items) => items.map((item) => idOf(item) === idOf(selected) && idOf(item.lastMessage) === idOf(response.message) ? { ...item, lastMessage: response.message } : item));
    });
  };

  const onDraftChange = (event) => {
    const value = event.target.value; setDraft(value);
    if (selected && socket?.connected) {
      socket.emit(value.trim() ? "typing_start" : "typing_stop", { conversationId: idOf(selected) });
      clearTimeout(typingTimer.current);
      if (value.trim()) typingTimer.current = setTimeout(() => socket.emit("typing_stop", { conversationId: idOf(selected) }), 650);
    }
  };
  const onScroll = () => {
    const element = listRef.current; if (!element) return;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    if (nearBottomRef.current) setNewCount(0);
  };
  const conversationPerson = (conversation) => conversation.participants?.find((person) => idOf(person) !== idOf(user));

  return <main className={`chat-shell ${selected ? "is-chat-open" : ""}`}>
    <aside className="sidebar">
      <header className="sidebar-top"><a className="brand-lockup" href="/chat"><img className="brand-mark brand-logo-image" src="/alphachat-logo.jpg" alt="" /><span>alpha<span className="brand-light">Chat</span></span></a><span className={`connection-dot ${socketReady ? "is-connected" : ""}`} title={socketReady ? "Connected" : "Connecting"} /></header>
      <div className="sidebar-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>Messages <span className="count-pill">{conversations.length}</span></h1></div><button className="icon-button new-chat-button" aria-label="Start a conversation" title="Start a conversation" onClick={() => document.querySelector(".search-input")?.focus()}><Icon name="plus" /></button></div>
      <div className="search-wrap"><Icon name="search" size={17} /><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find someone..." aria-label="Search people" />{search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}</div>
      <div className="conversation-scroll">
        {search.trim().length >= 2 ? <>
          <div className="list-label">PEOPLE</div>
          {(search.trim() === resultsFor ? results : []).map((person) => <button className="person-result" key={idOf(person)} onClick={() => startConversation(person)}><Avatar user={person} /><span className="result-copy"><b>{person.name}</b><small>@{person.username}</small></span><span className="result-arrow">↗</span></button>)}
          {search.trim() === resultsFor && !results.length && <div className="sidebar-empty">No one found. Try another name.</div>}
        </> : <>
          <div className="list-label">RECENT</div>
          {loading ? <div className="conversation-skeletons">{[0,1,2,3].map((item) => <div className="conversation-skeleton" key={item} />)}</div> : conversations.map((conversation) => {
            const person = conversationPerson(conversation); const isSelected = idOf(selected) === idOf(conversation);
            return <button className={`conversation-item ${isSelected ? "is-selected" : ""}`} key={idOf(conversation)} onClick={() => openConversation(conversation)}>
              {isSelected && <motion.span layoutId="selected-conversation" className="selected-rail" transition={{ type: "spring", stiffness: 470, damping: 38 }} />}
              <Avatar user={person} />
              <span className="conversation-copy"><span className="conversation-line"><b>{person?.name || "New conversation"}</b><time>{conversation.lastMessage?.createdAt ? timeLabel(conversation.lastMessage.createdAt) : ""}</time></span><span className="conversation-line"><small>{conversation.lastMessage?.content || "Start the conversation"}</small>{conversation.lastMessage && idOf(conversation.lastMessage.sender) === idOf(user) && <span className="sent-tick"><Icon name="check" size={13} /></span>}</span></span>
            </button>;
          })}
          {!loading && conversations.length === 0 && <div className="empty-list"><div className="empty-icon"><Icon name="message" size={22} /></div><b>Your conversations live here</b><span>Search for someone to say hello.</span></div>}
        </>}
      </div>
      <footer className="profile-footer"><button className="profile-open-button" onClick={() => setProfileTarget(user)} aria-label="View or edit your profile"><Avatar user={user} size="small" /></button><button className="profile-footer-copy" onClick={() => setProfileTarget(user)}><b>{user?.name}</b><small>@{user?.username}</small></button><button className="icon-button logout-button" aria-label="Sign out" title="Sign out" onClick={logout}><Icon name="logout" size={17} /></button></footer>
    </aside>

    <section className="chat-pane">
      {!selected ? <div className="welcome-state"><div className="welcome-orbit"><span className="welcome-glyph"><Icon name="message" size={25} /></span><span className="orbit-dot dot-a" /><span className="orbit-dot dot-b" /><span className="orbit-dot dot-c" /></div><span className="eyebrow">A LITTLE SPACE, JUST FOR YOU</span><h2>Good conversations<br />start with <em>hello.</em></h2><p>Choose a chat or find someone new. The rest can wait.</p><button className="welcome-button" onClick={() => document.querySelector(".search-input")?.focus()}><Icon name="plus" size={16} /> Start a conversation</button><span className="welcome-footnote"><span className="eyebrow-dot" /> PRIVATE BY DESIGN</span></div> : <>
        <header className="chat-header"><button className="back-button icon-button" onClick={() => setSelected(null)} aria-label="Back to conversations"><Icon name="back" /></button><button className="profile-open-button" onClick={() => setProfileTarget(activePeer)} aria-label={`View ${activePeer?.name || "user"} profile`}><Avatar user={activePeer} size="small" /></button><button className="header-person" onClick={() => setProfileTarget(activePeer)}><b>{activePeer?.name}</b><span>{activePeer?.isOnline ? <><i className="status-dot" /> Active now</> : activePeer?.lastSeen ? `Last seen ${timeLabel(activePeer.lastSeen)}` : `@${activePeer?.username}`}</span></button><span className={`header-secure ${socketReady && socket?.connected ? "" : "is-offline"}`}><img src="/alphachat-logo.jpg" alt="alphaChat" /><span />{socketReady && socket?.connected ? "Live connection" : "Reconnecting"}</span></header>
        <div className="message-scroll" ref={listRef} onScroll={onScroll}>
          <div className="message-inner">
            {hasMore && <button className="load-older" onClick={loadOlder} disabled={loadingMessages}>{loadingMessages ? "Loading…" : "Load earlier messages"}</button>}
            {!loadingMessages && messages.length === 0 && <div className="conversation-intro"><div className="intro-avatar"><Avatar user={activePeer} size="large" /></div><span className="eyebrow">JUST THE TWO OF YOU</span><h2>{activePeer?.name}</h2><p>Send the first message and get things going.</p><span className="intro-date">TODAY</span></div>}
            <AnimatePresence initial={false}>{messages.map((message) => <MessageRow key={message._id || message.clientId} message={message} own={idOf(message.sender) === idOf(user)} peer={activePeer} onEdit={beginEdit} onDelete={deleteMessage} />)}</AnimatePresence>
            <AnimatePresence>{typing && <motion.div className="typing-row" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Avatar user={activePeer} size="tiny" /><span className="typing-bubble"><i /><i /><i /></span><small>{activePeer?.name} is typing</small></motion.div>}</AnimatePresence>
          </div>
        </div>
        {newCount > 0 && <button className="new-message-pill" onClick={() => revealLatest(listRef.current)}>{newCount} new {newCount === 1 ? "message" : "messages"} ↓</button>}
        <div className="composer-area">{editing && <div className="editing-indicator">Editing message <button type="button" onClick={cancelEdit}>Cancel</button></div>}{error && <div className="chat-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}<form className="composer" onSubmit={sendMessage}><textarea ref={draftRef} value={draft} onChange={onDraftChange} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(event); } }} rows={1} maxLength={4000} placeholder={editing ? "Edit your message..." : "Write a message..."} aria-label={editing ? "Edit message" : "Message"} /><motion.button className="send-button" type="submit" aria-label={editing ? "Save message" : "Send message"} disabled={!draft.trim() || !socketReady || !socket?.connected} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}>{editing ? <Icon name="check" size={17} /> : <Icon name="send" size={17} />}</motion.button></form><div className="composer-hint"><span><kbd>↵</kbd> {editing ? "to save" : "to send"} <span className="hint-divider">·</span> <kbd>shift</kbd> + <kbd>↵</kbd> for a new line</span><span>{draft.length > 0 ? `${draft.length}/4000` : "A little kindness goes a long way."}</span></div></div>
      </>}
    </section>
    {profileTarget && <ProfilePanel target={profileTarget} currentUser={user} updateUser={updateUser} onClose={() => setProfileTarget(null)} />}
  </main>;
}
