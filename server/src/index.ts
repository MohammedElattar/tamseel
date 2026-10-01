// Load server/.env before anything else reads process.env (e.g. JWT_SECRET in the
// auth middleware is captured at module load). Keep this the first import.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getDB, initDB, saveDB } from './db/connection.js';
import authRoutes from './routes/auth.js';
import officerRoutes from './routes/officers.js';
import committeeRoutes from './routes/committees.js';
import evaluationRoutes from './routes/evaluations.js';
import importRoutes from './routes/import.js';
import reportRoutes from './routes/reports.js';
import lookupRoutes from './routes/lookup.js';
import scoringRoutes from './routes/scoring.js';
import memberRoutes from './routes/members.js';
import categoryRoutes from './routes/categories.js';
import { seedAdmin, seedGuest, seedLookups, seedCommitteePanelMembers, removeSeededTestData } from './db/seed.js';
import { backfillCompletedTagddedDecisions } from './services/scoringService.js';
import { arabizeStoredText } from './config/arabicText.js';
import { initWebSocket } from './realtime.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Bind to all interfaces by default so the app is reachable from other machines on
// the LAN (Windows host). Override with HOST=127.0.0.1 to keep it local-only.
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '100mb' }));

async function start() {
  await initDB();
  await seedAdmin();
  await seedGuest();
  await seedLookups();
  // Officers come from the real import; remove any leftover seeded test officers (keeps members).
  await removeSeededTestData();
  await seedCommitteePanelMembers();

  // Runs after the seeds so imported rows and Western-digit test data are both covered.
  const arabized = arabizeStoredText(getDB());
  if (arabized > 0) {
    saveDB();
    console.log(`Converted ${arabized} verbatim text value(s) to Arabic-Indic digits`);
  }

  // Self-heal: fill missing final decisions on tagdded committees finished before auto-احتساب
  // existed, so the committee-chain hint and decision reports always have a stored decision.
  const healed = backfillCompletedTagddedDecisions();
  if (healed.officers > 0) {
    saveDB();
    console.log(`Backfilled decisions for ${healed.officers} officer(s) across ${healed.committees} completed committee(s)`);
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/officers', officerRoutes);
  app.use('/api/committees', committeeRoutes);
  app.use('/api/evaluations', evaluationRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/lookup', lookupRoutes);
  app.use('/api/scoring', scoringRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/categories', categoryRoutes);

  // Production single-process deploy: serve the built client from this same server so the whole
  // app runs on one port with no separate web server (the offline single-folder bundle). Skipped
  // in dev, where Vite serves the client and proxies /api here. Override the folder with CLIENT_DIR.
  const clientDir = process.env.CLIENT_DIR || path.resolve('public');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    // SPA fallback: return index.html for any non-API GET so client-side routes work on refresh.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
    console.log(`Serving client from ${clientDir}`);
  }

  const server = app.listen(PORT, HOST, () => {
    const lanHint = HOST === '0.0.0.0' ? " (reachable on this machine's LAN IP)" : '';
    console.log(`Edara server running on http://${HOST}:${PORT}${lanHint}`);
  });

  // Realtime over WebSocket (/api/ws?token=), authenticated via query token.
  initWebSocket(server);
}

start().catch(console.error);
