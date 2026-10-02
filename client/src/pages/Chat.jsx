import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import api from "../services/api";
import Avatar from "../components/Avatar";
import ProfilePanel from "../components/ProfilePanel";
import GroupCreate from "../components/GroupCreate";
import GroupPanel from "../components/GroupPanel";

const idOf = (value) => value?.id || value?._id || value;
const timeLabel = (date) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(date));
const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
function revealLatest(element) { element?.scrollTo({ top: element.scrollHeight, behavior: scrollBehavior() }); }
function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>, plus: <path d="M12 5v14M5 12h14" />, send: <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>, back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>, logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>, message: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5A8.5 8.5 0 0 1 21 11.5Z" /></>, check: <path d="m5 12 4 4L19 6" />, group: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const MessageRow = memo(function MessageRow({ message, own, sender, showSender, onEdit, onDelete, onOpenProfile }) {
  return <motion.div className={`message-row ${own ? "is-own" : ""}`} initial={{ opacity: 0, y: 7, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}>
    {!own && <button className="message-avatar-button" onClick={() => onOpenProfile(sender)} aria-label={`View ${sender?.name || "sender"} profile`}><Avatar user={sender} size="tiny" /></button>}
    <div className="message-content">{showSender && <span className="message-sender-name">{own ? "You" : sender?.name || "Member"}</span>}<div className={`message-bubble ${own ? "own-bubble" : ""} ${message.isDeleted ? "deleted-bubble" : ""}`}>{message.content}</div><div className="message-meta"><time>{timeLabel(message.createdAt)}</time>{message.editedAt && !message.isDeleted && <span>Edited</span>}{message.pending && <span className="sending-label">Sending</span>}{own && !message.pending && <span className="message-check"><Icon name="check" size={12} /></span>}{own && !message.pending && !message.isDeleted && <span className="message-actions"><button type="button" aria-label="Edit message" title="Edit message" onClick={() => onEdit(message)}>Edit</button><button type="button" aria-label="Delete message" title="Delete message" onClick={() => onDelete(message)}>Delete</button></span>}</div></div>
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
  const [groupTarget, setGroupTarget] = useState(null);
  const [listMode, setListMode] = useState("chats");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmConversation, setConfirmConversation] = useState(null);
  const [unreadByConversation, setUnreadByConversation] = useState({});
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
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const selectedRef = useRef(selected);
  const conversationsRef = useRef(conversations);
  const nearBottomRef = useRef(true);
  const oldestRef = useRef(null);
  const activePeer = useMemo(() => selected?.type === "group" ? null : selected?.participants?.find((person) => idOf(person) !== idOf(user)), [selected, user]);
  const visibleConversations = conversations.filter((conversation) => (conversation.type === "group") === (listMode === "groups"));
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    const element = draftRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [draft]);

  const fetchConversations = useCallback(async () => {
    try { const { data } = await api.get("/conversations"); setConversations(data.conversations); return data.conversations; }
    catch (err) { setError(err.response?.data?.message || "Couldn't load your conversations."); return null; }
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
    setUnreadByConversation((unread) => ({ ...unread, [idOf(conversation)]: 0 }));
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

  const startGroup = (conversation, warning = "") => {
    setShowGroupCreate(false); setListMode("groups"); setSearch("");
    setConversations((items) => [conversation, ...items.filter((item) => idOf(item) !== idOf(conversation))]);
    openConversation(conversation);
    if (warning) setError(warning);
  };
  const hideConversation = async () => {
    const conversation = confirmConversation;
    if (!conversation) return;
    setConfirmConversation(null); setContextMenu(null);
    try {
      await api.delete(`/conversations/${idOf(conversation)}`);
      setConversations((items) => items.filter((item) => idOf(item) !== idOf(conversation)));
      if (idOf(selected) === idOf(conversation)) { setSelected(null); selectedRef.current = null; setMessages([]); }
    } catch (err) { setError(err.response?.data?.message || "Couldn't delete this conversation."); }
  };
  const showConversationMenu = (event, conversation) => {
    event.preventDefault();
    const width = 196; const height = 154;
    setContextMenu({ conversation, x: Math.min(event.clientX, window.innerWidth - width - 10), y: Math.min(event.clientY, window.innerHeight - height - 10) });
  };
  const beginLongPress = (event, conversation) => {
    if (event.pointerType === "mouse") return;
    longPressTriggered.current = false;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => { longPressTriggered.current = true; showConversationMenu(event, conversation); }, 560);
  };
  const endLongPress = () => clearTimeout(longPressTimer.current);
  const profilePeer = (person) => { if (person) setProfileTarget(person); };

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
      if (!active || idOf(active) !== idOf(message.conversation)) {
        if (idOf(message.sender) !== idOf(user)) setUnreadByConversation((unread) => ({ ...unread, [idOf(message.conversation)]: (unread[idOf(message.conversation)] || 0) + 1 }));
        return;
      }
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
    const onConversationUpdated = async ({ conversationId }) => {
      const updated = await fetchConversations();
      const conversation = updated?.find((item) => idOf(item) === conversationId);
      if (!conversation) return;
      setSelected((current) => idOf(current) === conversationId ? conversation : current);
      setGroupTarget((current) => current && idOf(current) === conversationId ? conversation : current);
    };
    const onGroupRemoved = ({ conversationId }) => {
      setConversations((items) => items.filter((item) => idOf(item) !== conversationId));
      if (idOf(selectedRef.current) === conversationId) { selectedRef.current = null; setSelected(null); setMessages([]); }
      setGroupTarget((current) => idOf(current) === conversationId ? null : current);
      setError("You are no longer a member of this group.");
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
    socket.on("conversation_updated", onConversationUpdated); socket.on("group_removed", onGroupRemoved);
    socket.on("typing_start", onTypingStart); socket.on("typing_stop", onTypingStop);
    if (!socket.connected) socket.connect();
    queueMicrotask(socket.connected ? onConnect : onDisconnect);
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("connect_error", onConnectError); socket.off("receive_message", onMessage); socket.off("user_online", onUserOnline); socket.off("user_offline", onUserOffline); socket.off("message_updated", onMessageChange); socket.off("message_deleted", onMessageChange); socket.off("user_profile_updated", onProfileUpdate); socket.off("conversation_updated", onConversationUpdated); socket.off("group_removed", onGroupRemoved); socket.off("typing_start", onTypingStart); socket.off("typing_stop", onTypingStop); };
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
      <div className="sidebar-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>{listMode === "groups" ? "Groups" : "Messages"} <span className="count-pill">{visibleConversations.length}</span></h1></div><div className="new-menu-wrap"><button className="icon-button new-chat-button" aria-label="Create chat or group" title="Create chat or group" aria-expanded={showNewMenu} onClick={() => setShowNewMenu((value) => !value)}><Icon name="plus" /></button><AnimatePresence>{showNewMenu && <motion.div className="new-chat-menu" initial={{ opacity: 0, y: 5, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 3 }}><button onClick={() => { setShowNewMenu(false); setListMode("chats"); document.querySelector(".search-input")?.focus(); }}> <Icon name="message" size={16} /> New chat</button><button onClick={() => { setShowNewMenu(false); setShowGroupCreate(true); }}><Icon name="group" size={16} /> New group</button></motion.div>}</AnimatePresence></div></div>
      <div className="search-wrap"><Icon name="search" size={17} /><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find someone..." aria-label="Search people" />{search && <button className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}</div>
      {!search.trim() && <div className="conversation-tabs" role="tablist" aria-label="Conversation type"><button role="tab" aria-selected={listMode === "chats"} className={listMode === "chats" ? "is-active" : ""} onClick={() => setListMode("chats")}>Chats</button><button role="tab" aria-selected={listMode === "groups"} className={listMode === "groups" ? "is-active" : ""} onClick={() => setListMode("groups")}><Icon name="group" size={14} /> Groups</button></div>}
      <div className="conversation-scroll">
        {search.trim().length >= 2 ? <>
          <div className="list-label">PEOPLE</div>
          {search.trim() !== resultsFor && <div className="search-loading"><span className="button-spinner" /> Searching people…</div>}
          {(search.trim() === resultsFor ? results : []).map((person) => <button className="person-result" key={idOf(person)} onClick={() => startConversation(person)}><Avatar user={person} /><span className="result-copy"><b>{person.name}</b><small>@{person.username}</small></span><span className="result-arrow">↗</span></button>)}
          {search.trim() === resultsFor && !results.length && <div className="sidebar-empty">No one found. Try another name.</div>}
        </> : <>
          <div className="list-label">{listMode === "groups" ? "YOUR GROUPS" : "RECENT"}</div>
          {loading ? <div className="conversation-skeletons">{[0,1,2,3].map((item) => <div className="conversation-skeleton" key={item} />)}</div> : conversations.map((conversation) => {
            if (!visibleConversations.includes(conversation)) return null;
            const isGroup = conversation.type === "group"; const person = conversationPerson(conversation); const title = isGroup ? conversation.name : person?.name; const avatarUser = isGroup ? { name: conversation.name, profilePicture: conversation.groupPicture } : person; const isSelected = idOf(selected) === idOf(conversation);
            return <button className={`conversation-item ${isSelected ? "is-selected" : ""}`} key={idOf(conversation)} onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } setContextMenu(null); openConversation(conversation); }} onContextMenu={(event) => showConversationMenu(event, conversation)} onPointerDown={(event) => beginLongPress(event, conversation)} onPointerUp={endLongPress} onPointerLeave={endLongPress} onPointerCancel={endLongPress}>
              {isSelected && <motion.span layoutId="selected-conversation" className="selected-rail" transition={{ type: "spring", stiffness: 470, damping: 38 }} />}
              <Avatar user={avatarUser} />
              <span className="conversation-copy"><span className="conversation-line"><b>{title || "New conversation"}</b><span className="conversation-trailing">{unreadByConversation[idOf(conversation)] > 0 && <span className="unread-badge">{unreadByConversation[idOf(conversation)] > 99 ? "99+" : unreadByConversation[idOf(conversation)]}</span>}<time>{conversation.lastMessage?.createdAt ? timeLabel(conversation.lastMessage.createdAt) : ""}</time></span></span><span className="conversation-line"><small>{conversation.lastMessage?.content || (isGroup ? `${conversation.participants.length} members · Start the conversation` : "Start the conversation")}</small>{conversation.lastMessage && idOf(conversation.lastMessage.sender) === idOf(user) && <span className="sent-tick"><Icon name="check" size={13} /></span>}</span></span>
            </button>;
          })}
          {!loading && visibleConversations.length === 0 && <div className="empty-list"><div className="empty-icon"><Icon name={listMode === "groups" ? "group" : "message"} size={22} /></div><b>{listMode === "groups" ? "No groups yet" : "Your conversations live here"}</b><span>{listMode === "groups" ? "Create a group to bring people together." : "Search for someone to say hello."}</span>{listMode === "groups" && <button className="subtle-action" onClick={() => setShowGroupCreate(true)}>Create a group</button>}</div>}
        </>}
      </div>
      <footer className="profile-footer"><button className="profile-open-button" onClick={() => setProfileTarget(user)} aria-label="View or edit your profile"><Avatar user={user} size="small" /></button><button className="profile-footer-copy" onClick={() => setProfileTarget(user)}><b>{user?.name}</b><small>@{user?.username}</small></button><button className="icon-button logout-button" aria-label="Sign out" title="Sign out" onClick={logout}><Icon name="logout" size={17} /></button></footer>
    </aside>

    <section className="chat-pane">
      {!selected ? <div className="welcome-state"><div className="welcome-orbit"><span className="welcome-glyph"><Icon name="message" size={25} /></span><span className="orbit-dot dot-a" /><span className="orbit-dot dot-b" /><span className="orbit-dot dot-c" /></div><span className="eyebrow">A LITTLE SPACE, JUST FOR YOU</span><h2>Good conversations<br />start with <em>hello.</em></h2><p>Choose a chat or find someone new. The rest can wait.</p><button className="welcome-button" onClick={() => document.querySelector(".search-input")?.focus()}><Icon name="plus" size={16} /> Start a conversation</button><span className="welcome-footnote"><span className="eyebrow-dot" /> PRIVATE BY DESIGN</span></div> : <>
        <motion.header className="chat-header" key={`header-${idOf(selected)}`} initial={{ opacity: .65, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}><button className="back-button icon-button" onClick={() => { setSelected(null); selectedRef.current = null; }} aria-label="Back to conversations"><Icon name="back" /></button><button className="profile-open-button" onClick={() => selected.type === "group" ? setGroupTarget(selected) : setProfileTarget(activePeer)} aria-label={selected.type === "group" ? "View group details" : `View ${activePeer?.name || "user"} profile`}><Avatar user={selected.type === "group" ? { name: selected.name, profilePicture: selected.groupPicture } : activePeer} size="small" /></button><button className="header-person" onClick={() => selected.type === "group" ? setGroupTarget(selected) : setProfileTarget(activePeer)}><b>{selected.type === "group" ? selected.name : activePeer?.name}</b><span>{selected.type === "group" ? `${selected.participants.length} members · Group` : activePeer?.isOnline ? <><i className="status-dot" /> Active now</> : activePeer?.lastSeen ? `Last seen ${timeLabel(activePeer.lastSeen)}` : `@${activePeer?.username}`}</span></button>{selected.type === "group" && <button className="group-details-button" onClick={() => setGroupTarget(selected)}><Icon name="group" size={16} /><span>Details</span></button>}<span className={`header-secure ${socketReady && socket?.connected ? "" : "is-offline"}`}><img src="/alphachat-logo.jpg" alt="alphaChat" /><span />{socketReady && socket?.connected ? "Live connection" : "Reconnecting"}</span></motion.header>
        <div className="message-scroll" ref={listRef} onScroll={onScroll}>
          <div className="message-inner">
            {hasMore && <button className="load-older" onClick={loadOlder} disabled={loadingMessages}>{loadingMessages ? "Loading…" : "Load earlier messages"}</button>}
            {loadingMessages && messages.length === 0 && <div className="message-skeleton-list" aria-label="Loading messages"><span /><span /><span /><span /></div>}
            {!loadingMessages && messages.length === 0 && <div className="conversation-intro"><div className="intro-avatar"><Avatar user={selected.type === "group" ? { name: selected.name, profilePicture: selected.groupPicture } : activePeer} size="large" /></div><span className="eyebrow">{selected.type === "group" ? `${selected.participants.length} MEMBERS` : "JUST THE TWO OF YOU"}</span><h2>{selected.type === "group" ? selected.name : activePeer?.name}</h2><p>{selected.type === "group" ? "Start a conversation with the group." : "Send the first message and get things going."}</p><span className="intro-date">TODAY</span></div>}
            <AnimatePresence initial={false}>{messages.map((message) => { const sender = selected.participants?.find((person) => idOf(person) === idOf(message.sender)) || activePeer; return <MessageRow key={message._id || message.clientId} message={message} own={idOf(message.sender) === idOf(user)} sender={sender} showSender={selected.type === "group"} onOpenProfile={profilePeer} onEdit={beginEdit} onDelete={deleteMessage} />; })}</AnimatePresence>
            <AnimatePresence>{typing && <motion.div className="typing-row" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Avatar user={activePeer || { name: selected.name, profilePicture: selected.groupPicture }} size="tiny" /><span className="typing-bubble"><i /><i /><i /></span><small>{selected.type === "group" ? "Someone is typing" : `${activePeer?.name} is typing`}</small></motion.div>}</AnimatePresence>
          </div>
        </div>
        {newCount > 0 && <button className="new-message-pill" onClick={() => revealLatest(listRef.current)}>{newCount} new {newCount === 1 ? "message" : "messages"} ↓</button>}
        <div className="composer-area">{editing && <div className="editing-indicator">Editing message <button type="button" onClick={cancelEdit}>Cancel</button></div>}{error && <div className="chat-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}<form className="composer" onSubmit={sendMessage}><textarea ref={draftRef} value={draft} onChange={onDraftChange} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(event); } }} rows={1} maxLength={4000} placeholder={editing ? "Edit your message..." : "Write a message..."} aria-label={editing ? "Edit message" : "Message"} /><motion.button className="send-button" type="submit" aria-label={editing ? "Save message" : "Send message"} disabled={!draft.trim() || !socketReady || !socket?.connected} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }}>{editing ? <Icon name="check" size={17} /> : <Icon name="send" size={17} />}</motion.button></form><div className="composer-hint"><span><kbd>↵</kbd> {editing ? "to save" : "to send"} <span className="hint-divider">·</span> <kbd>shift</kbd> + <kbd>↵</kbd> for a new line</span><span>{draft.length > 0 ? `${draft.length}/4000` : "A little kindness goes a long way."}</span></div></div>
      </>}
    </section>
    <AnimatePresence>{profileTarget && <ProfilePanel key={`profile-${idOf(profileTarget)}`} target={profileTarget} currentUser={user} updateUser={updateUser} onClose={() => setProfileTarget(null)} onMessage={(person) => { setProfileTarget(null); startConversation(person); }} />}</AnimatePresence>
    <AnimatePresence>{groupTarget && <GroupPanel key={`group-${idOf(groupTarget)}`} conversation={groupTarget} currentUser={user} onClose={() => setGroupTarget(null)} onOpenUser={(person) => { setGroupTarget(null); setProfileTarget(person); }} onChanged={async () => { const items = await fetchConversations(); const updated = items?.find((item) => idOf(item) === idOf(groupTarget)); if (updated) { setGroupTarget(updated); setSelected((current) => idOf(current) === idOf(updated) ? updated : current); } }} onLeave={() => { const id = idOf(groupTarget); setGroupTarget(null); if (idOf(selectedRef.current) === id) { selectedRef.current = null; setSelected(null); setMessages([]); } fetchConversations(); }} />}</AnimatePresence>
    <AnimatePresence>{showGroupCreate && <GroupCreate onClose={() => setShowGroupCreate(false)} onCreated={startGroup} />}</AnimatePresence>
    <AnimatePresence>{contextMenu && <>
      <motion.button className="context-dismiss" aria-label="Close conversation menu" onClick={() => setContextMenu(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="conversation-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} initial={{ opacity: 0, scale: .96, y: 3 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .13 }}><button role="menuitem" onClick={() => { openConversation(contextMenu.conversation); setContextMenu(null); }}><Icon name="message" size={15} /> Open chat</button><button role="menuitem" onClick={() => { setUnreadByConversation((unread) => ({ ...unread, [idOf(contextMenu.conversation)]: 0 })); setContextMenu(null); }}>Mark as read</button><button role="menuitem" className="danger-menu-item" onClick={() => { setConfirmConversation(contextMenu.conversation); setContextMenu(null); }}>Delete chat</button></motion.div>
    </>}</AnimatePresence>
    <AnimatePresence>{confirmConversation && <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="dialog-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-conversation-title" initial={{ opacity: 0, scale: .96, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}><span className="eyebrow">REMOVE FROM YOUR CHATS</span><h2 id="delete-conversation-title">Delete conversation?</h2><p>This will remove <b>{confirmConversation.type === "group" ? confirmConversation.name : conversationPerson(confirmConversation)?.name || "this chat"}</b> from your chat list. Other members keep their conversation history.</p><footer className="dialog-actions"><button className="profile-secondary" onClick={() => setConfirmConversation(null)}>Cancel</button><button className="danger-button" onClick={hideConversation}>Delete chat</button></footer></motion.section></motion.div>}</AnimatePresence>
  </main>;
}
