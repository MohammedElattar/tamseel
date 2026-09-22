import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './middleware/auth.js';

// Connected WebSocket clients. Single-process app, so a plain Set is enough.
type LiveSocket = WebSocket & { isAlive?: boolean };
const clients = new Set<LiveSocket>();
let rev = 0;

// Attach a WebSocket server to the shared HTTP server. Clients connect to
// /api/ws?token=<jwt> (browsers can't set headers on the WS handshake); the token
// is optional so the pre-login screen can subscribe too (see below).
export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (ws: LiveSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    // Authenticated clients (admins/members) get live updates. The login screen also
    // needs realtime refreshes for its seat list, but it has no token yet — so allow
    // token-less connections too. Broadcasts carry only a "something changed" signal
    // (no sensitive data), so anonymous listeners just learn to refetch. A present but
    // invalid token is still rejected.
    if (token && !verifyToken(token)) {
      ws.close(1008, 'unauthorized');
      return;
    }

    ws.isAlive = true;
    clients.add(ws);
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { clients.delete(ws); });
    ws.on('error', () => { clients.delete(ws); });
  });

  // Heartbeat: drop sockets that stopped answering pings (dead proxies/tabs).
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        clients.delete(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { clients.delete(ws); }
    }
  }, 30000);
  heartbeat.unref();
}

// Notify every open client that the DB changed so they refetch their own view.
export function broadcast(payload: Record<string, any>): void {
  if (clients.size === 0) return;
  rev += 1;
  const msg = JSON.stringify({ ...payload, rev });
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) {
      clients.delete(ws);
      continue;
    }
    try {
      ws.send(msg);
    } catch {
      clients.delete(ws);
    }
  }
}
