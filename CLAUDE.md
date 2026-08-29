# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A campaign tracker for the Wilderweb D&D campaign (a Kingmaker-style wilderness settlement game):
an Express API (`server/`) that reads/writes JSON files in `data/`, and a React (Vite) client
(`client/`) that edits that data through the UI.

## Commands

Install deps (two separate npm projects — root and client):

```bash
npm install
npm install --prefix client
```

Run server + client together in dev (API on :4000, Vite dev server on :5173):

```bash
npm run dev
```

Run unit tests (Node's built-in test runner, no separate test framework):

```bash
npm test
```

Lint the client (oxlint; there is no lint script at the root):

```bash
npm run lint --prefix client
```

Production-ish run (builds client, serves it + the API from one Express server on `PORT`,
default 4000):

```bash
npm start
```

Database (see Architecture below — in progress, not yet the client's source of truth):

```bash
npm run migrate   # data/*.json -> data/campaign.db (--force to wipe and re-run)
npm run export    # data/campaign.db -> data/*.json (do not run until Phase 2's cutover; see spec)
```

## Architecture

**A database migration is in progress** (`.scratch/campaign-database/spec.md`, `CONTEXT.md`,
`docs/adr/0001`-`0006`). Read those before changing `server/db/` — they explain the event-log
design, why trades aren't a separate event type, why validation warns instead of blocking, etc.

### `data/*.json` is still what the running app reads and writes (for now)

Everything the app displays — calendar, deities, locations, campaign lore, the building catalog,
per-region settlement buildings, current kingdom stats, and a chronological build-order/bookkeeping
history — lives as JSON files in `data/`, transcribed from the campaign's Discord channels. Edits
made in the client UI are written straight back to these files, so they show up in `git diff` like
any other change. **This is Phase 1/2 in-progress territory**: `data/campaign.db` (SQLite, via
`server/db/`) now exists alongside these files and is being built out as the eventual source of
truth, but the client hasn't been cut over yet — until then, treat `data/*.json` as authoritative
and `server/db/` as the new system being built next to it, not yet replacing it.

### `server/db/` — the event log and its projections (Phase 1)

- `schema.sql` / `connection.js`: SQLite via Node's built-in `node:sqlite` (no new dependency).
  DB file at `data/campaign.db`, gitignored — `npm run export` is the git-diffable backup path.
- `events.js` (`createEvent`/`listEvents`): every write is an event of one of seven types (see
  `CONTEXT.md`). `createEvent` validates shape (400 on failure), checks in-game warnings
  (`validate.js`), then writes the event and updates the relevant projection in one transaction.
- `projections.js`: applies an event's payload onto current-state tables (`resource_totals`,
  `settlement_buildings`, `calendar_state`, `deities`, `locations_state`). Never recomputed by
  replaying the full log — see ADR-0001.
  `read.js` reads them back out in the same shape as the old `data/*.json` files.
  `obligations.js`: the tracked-debt concept from `CONTEXT.md`; a `ResourceChanged` referencing an
  `obligationId` pays it down.
- `validate.js`: `validateShape` (structural, blocks on failure) vs. `checkWarnings` (in-game
  validity — negative resources, unmet building prerequisites — warns, never blocks; ADR-0005).
- `gameDate.js`: best-effort parser for the freeform game-date strings in `history.json`, into a
  sortable key. Original strings are always preserved for display regardless of parse success.
- `scripts/migrate.js`: one-time `data/*.json` -> `data/campaign.db` import. Replays `history.json`
  and diffs the result against `stats.json`'s snapshot rather than trusting either side — run it
  and read the mismatch report before assuming the database's numbers are correct.

### Server (`server/index.js`) is a generic JSON-resource CRUD layer

It does **not** have per-domain routes for calendar, deities, etc. Instead:

- `RESOURCES` is a whitelist of resource names (`calendar`, `deities`, `locations`,
  `introduction`, `buildings`, `settlements`, `stats`, `history`) that map 1:1 to
  `data/<resource>.json`.
- `GET /api/:resource` and `PUT /api/:resource` read/overwrite the whole file for that resource.
- `history` additionally gets `POST /api/history` (append, auto-incrementing `id`) and
  `DELETE /api/history/:id`, since it's an append/remove log rather than a single edited document.
- Adding a new data file means adding its name to `RESOURCES` — nothing else in the server needs
  to change.
- In production, Express also serves the built client (`client/dist`) and falls back to
  `index.html` for any non-`/api` route (SPA routing).

### Client (`client/`) is five independent page views over that same resource API

`client/src/App.jsx` is a simple tab switcher (no router) between: Kingdom Dashboard, Calendar,
Settlements, History Log, and Codex (lore/deities/locations). Each view component talks to the
backend only through `client/src/api.js` (`getResource`/`putResource`/`addHistoryEntry`/
`deleteHistoryEntry`), which is a thin fetch wrapper over the resource endpoints above. The common
pattern per view (see `Dashboard.jsx`) is: `GET` the resource on mount, edit local state, track a
`dirty` flag, and `PUT` the whole resource back on explicit save — there's no autosave or
per-field patching.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
