import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMsg } from "./types";

/**
 * Tiny native-WebSocket hook with auto-reconnect.
 * `onMessage` is kept in a ref so callers can pass an inline function.
 */
export function useSocket(url: string | null, onMessage: (msg: ServerMsg) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!url) return;
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const open = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { attempts = 0; setConnected(true); };
      ws.onmessage = (e) => handler.current(JSON.parse(e.data) as ServerMsg);
      ws.onclose = (e) => {
        setConnected(false);
        // 4401/4403 = auth / not-your-match: don't hammer the server
        if (closedByUs || e.code === 4401 || e.code === 4403) return;
        retry = setTimeout(open, Math.min(5000, 500 * 2 ** attempts++));
      };
    };
    open();
    return () => { closedByUs = true; clearTimeout(retry); wsRef.current?.close(); };
  }, [url]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(data));
  }, []);

  return { send, connected };
}
