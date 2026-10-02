import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? "http://localhost:5000" : "");
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    if (!socketUrl) {
      console.error("Socket.io is not configured. Set VITE_SOCKET_URL to the current Render backend URL.");
      return undefined;
    }
    const connection = io(socketUrl, { auth: { token }, autoConnect: false, transports: ["websocket", "polling"] });
    const onConnect = () => console.info("[socket] connected");
    const onConnectError = (error) => console.error("[socket] connect_error:", error.message);
    const onDisconnect = (reason) => console.info("[socket] disconnected:", reason);
    connection.on("connect", onConnect);
    connection.on("connect_error", onConnectError);
    connection.on("disconnect", onDisconnect);
    // Store the socket created by this effect so the component can bind its event handlers.
    // This is a subscription handle, not UI data derived in the render phase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(connection);
    return () => { connection.off("connect", onConnect); connection.off("connect_error", onConnectError); connection.off("disconnect", onDisconnect); connection.disconnect(); };
  }, [token]);
  return socket;
}
