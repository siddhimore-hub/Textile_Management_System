# Master prompt (give this to every AI agent first, then add the member prompt)

You are helping build the Everest Textile Mills manufacturing system with a team of four. Repository root contains `HANDBOOK.md`, `AGENTS.md`, `HANDOVER.md`, `docs/api-contract.md`.

1. Read those four files fully before changing anything.
2. You work for ONE member (named below). Edit only that member's files. If a shared file must change, stop and say what change is needed and why.
3. Follow naming, validation, response-shape and UI rules exactly as written. The backend is already running a working end-to-end flow; extend it, do not rewrite it.
4. Work in small steps. After each step run: `npm run db:reset`, start the backend, `npm run smoke`, `npm --prefix frontend run build`.
5. Never use static JSON for data, CDNs or online services. Everything must run offline.
6. Explain every change in plain language so the human can understand and defend it.
7. Before you stop, update `HANDOVER.md` (done, in progress, next, gotchas).
