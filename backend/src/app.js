// The Express app, separate from listen() so automated tests can start it on any port.
import express from 'express';
import cors from 'cors';
import './lib/db.js';
import { errorHandler } from './lib/http.js';
import { sseHandler } from './lib/events.js';
import { guard } from './lib/auth.js';
import { idempotency } from './lib/idempotency.js';
import { audit } from './lib/audit.js';
import inventory from './modules/inventory.js';
import purchasing from './modules/purchasing.js';
import orders from './modules/orders.js';
import products from './modules/products.js';
import compatibility from './modules/compatibility.js';
import production from './modules/production.js';
import runs from './modules/runs.js';
import qc from './modules/qc.js';
import dispatch from './modules/dispatch.js';
import buyerHistory from './modules/buyerHistory.js';
import workforce from './modules/workforce.js';
import finance from './modules/finance.js';
import ledger from './modules/ledger.js';
import auth from './modules/auth.js';
import notifications from './modules/notifications.js';

export const app = express();
app.use(cors());
app.use(express.json());

// Every /api request: log in check + role check, then offline-replay protection, then the audit trail.
app.use('/api', guard, idempotency, audit);
app.get('/api/health', (_q, res) => res.json({ data: { ok: true } }));
app.get('/api/events', sseHandler);
// Each member mounts only their own module(s) below.
for (const m of [auth, notifications, inventory, purchasing, orders, products, compatibility, production, runs, qc, dispatch, buyerHistory, workforce, finance, ledger]) app.use('/api', m);
app.use('/api', (_q, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }));
app.use(errorHandler);
