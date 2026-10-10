import 'node:process';
import express from 'express';
import cors from 'cors';
import './lib/db.js';
import { errorHandler } from './lib/http.js';
import { sseHandler } from './lib/events.js';
import inventory from './modules/inventory.js';
import orders from './modules/orders.js';
import production from './modules/production.js';
import qc from './modules/qc.js';
import dispatch from './modules/dispatch.js';
import workforce from './modules/workforce.js';
import finance from './modules/finance.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_q, res) => res.json({ data: { ok: true } }));
app.get('/api/events', sseHandler);
// Each member mounts only their own module(s) below.
for (const m of [inventory, orders, production, qc, dispatch, workforce, finance]) app.use('/api', m);
app.use('/api', (_q, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }));
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
