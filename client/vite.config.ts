import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api to the backend over IPv4 loopback. On Windows, "localhost" can resolve
// to IPv6 (::1) first and the proxy then fails with ECONNREFUSED, so use 127.0.0.1.
const API_TARGET = 'http://127.0.0.1:3001';
const WS_TARGET = 'ws://127.0.0.1:3001';

const proxy = {
    '/api/ws': { target: WS_TARGET, ws: true },
    '/api': { target: API_TARGET, changeOrigin: true },
};

export default defineConfig({
    plugins: [react()],
    // host: true binds to 0.0.0.0 so other machines on the LAN can reach the app.
    server: {
        host: true,
        port: 5173,
        proxy,
    },
    preview: {
        host: true,
        port: 4173,
        proxy,
    },
});
