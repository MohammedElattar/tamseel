// Single shared WebSocket for the whole app. One connection (not one per
// component) avoids the browser's 6-connections-per-host limit that made the
// old per-component EventSource flaky. Screens subscribe via useLiveUpdates.

type Listener = () => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;

function connect(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  // The login screen subscribes before anyone has authenticated, so connect even
  // without a token — the server sends token-less listeners only change signals. Once
  // logged in, the token is included so the connection is authenticated.
  const token = localStorage.getItem('edara_token');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const socket = new WebSocket(`${proto}://${location.host}/api/ws${query}`);
  ws = socket;

  socket.onopen = () => { backoff = 1000; };
  socket.onmessage = () => { for (const fn of listeners) fn(); };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    scheduleReconnect();
  };
  socket.onerror = () => { try { socket.close(); } catch { /* noop */ } };
}

function scheduleReconnect(): void {
  if (reconnectTimer || listeners.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, 10000);
    connect();
  }, backoff);
}

// Tear the shared socket down once nothing is listening. Calling close() on a socket that
// is still CONNECTING makes the browser log "WebSocket is closed before the connection is
// established", so in that state we close it only once it has finished opening.
function teardown(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const socket = ws;
  ws = null;
  if (!socket) return;
  socket.onmessage = null;
  socket.onclose = null; // an intentional teardown must not schedule a reconnect
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => { try { socket.close(); } catch { /* noop */ } };
  } else {
    try { socket.close(); } catch { /* noop */ }
  }
}

export function subscribe(fn: Listener): () => void {
  // A pending teardown means a screen just unmounted; cancel it so a re-subscribe (React
  // StrictMode's mount→unmount→mount in dev, or a quick route change) keeps the one socket.
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      // Defer teardown briefly: StrictMode and route changes unmount then immediately
      // remount, so this grace period avoids closing (and re-opening) the socket each time —
      // and never closes one that is still mid-connection.
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (listeners.size === 0) teardown();
      }, 1000);
    }
  };
}
