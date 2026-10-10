# AGENTS.md (instructions for OpenCode and any AI agent)

Project: Everest Textile Mills manufacturing system. Node 20 + Express + SQLite (better-sqlite3) + zod; React 18 + Vite + react-router. Fully offline capable.

Read in this order: `HANDBOOK.md` (rules, naming), `HANDOVER.md` (current state), `docs/api-contract.md`, then the member prompt in `docs/prompts/` that the human gives you.

Hard rules
- Edit only files owned by the member you are working for (table in HANDBOOK section 1). Ask before touching shared files.
- snake_case in DB and JSON; PascalCase React components; plural table names; paths under `/api`.
- Validate every request body with zod (`validate()` from `backend/src/lib/http.js`). Throw `bad()`, `notFound()`, `conflict()` for rule violations.
- Responses: `{ data }` or `{ error: { code, message, fields? } }`.
- Stock is an append-only ledger (`stock_movements`). Order status is derived (`lib/orderStatus.js`), never stored.
- Call `publish(topic)` after writes that other screens display.
- Frontend: use `lib/api.js` (`api`, `useLive`), reuse `DataTable`, `EntryForm`, `Pill`; colours only from CSS variables; add pages through `lib/modules.js`.
- No static JSON data, no CDNs, no external services.
- Small changes, one task at a time. Explain what you changed. Do not refactor unrelated code.
- Verify: `npm run db:reset`, start backend, `npm run smoke`, `npm --prefix frontend run build`.

If you are running out of context or time: update `HANDOVER.md` (done / in progress / next / gotchas) before stopping.
