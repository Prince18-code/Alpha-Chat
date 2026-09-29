import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://192.168.31.81:5000";
export function useSocket(token) {
  const [socket, setSocket] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    const connection = io(socketUrl, { auth: { token }, autoConnect: true, transports: ["websocket", "polling"] });
    // Store the socket created by this effect so the component can bind its event handlers.
    // This is a subscription handle, not UI data derived in the render phase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(connection);
    return () => { connection.removeAllListeners(); connection.disconnect(); };
  }, [token]);
  return socket;
}
