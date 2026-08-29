# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A campaign tracker for the Wilderweb D&D campaign (a Kingmaker-style wilderness settlement game):
an Express API (`server/`) backed by a SQLite event log (`server/db/`), and a React (Vite) client
(`client/`) where every edit is recorded as a historical event, not a blind overwrite.

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

Database:

```bash
npm run migrate   # one-time: data/*.json -> data/campaign.db. Refuses to re-run once
                   # completed (even with --force) -- delete data/campaign.db manually
                   # first if you really mean to start over; see scripts/migrate.js.
npm run export    # data/campaign.db -> data/*.json, for a git-diffable backup. Safe to
                   # run any time now that the database is what the app actually reads.
```

## Architecture

`data/campaign.db` (SQLite, via `server/db/`) is the source of truth. `data/*.json` is a
git-diffable backup produced by `npm run export`, not something the running app reads or writes
(ADR-0002 / `docs/agents`'s Q7 in `.scratch/campaign-database/spec.md`). Read `CONTEXT.md` (the
event taxonomy and domain vocabulary) and `docs/adr/0001`-`0006` before changing `server/db/` or
the event-emitting client code — they explain why trades aren't a separate event type, why
validation warns instead of blocking, why there's no auth yet, etc.

### `server/db/` — the event log and its projections

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

### Server (`server/index.js`) — thin routing over `server/db/`

No JSON files are read or written at request time. Routes: `GET`/`POST /api/events`,
`GET /api/projections/:resource` (`stats`, `settlements`, `calendar`, `deities`, `locations` —
current state, shaped to match the old `data/*.json` files), `GET /api/reference/:resource`
(`buildings`, `introduction` — static, read-only, no event history), `GET /api/obligations[/:id]`.
In production, Express also serves the built client (`client/dist`) and falls back to
`index.html` for any non-`/api` route (SPA routing).

### Client (`client/`) is five page views that emit events, not blind writes

`client/src/App.jsx` is a simple tab switcher (no router) between: Dashboard, Calendar,
Settlements, Timeline, and Codex (lore/deities/locations). Every write goes through
`client/src/api.js`'s `postEvent` and the shared `client/src/lib/useEventSubmit.js` hook (submit,
track status, surface warnings — `WarningsList.jsx` renders them). Reads go through
`getProjection`/`getReference`/`getEvents`/`getObligations`. Per view:

- **Dashboard**: edits stat values locally (steppers, same UX as before), then on save diffs the
  draft against the loaded snapshot into one `ResourceChanged` event.
- **CalendarView**: the date-set form emits `CalendarAdvanced`.
- **Settlements**: add/remove building emits `BuildingConstructed`/`BuildingRemoved`, including
  the optional `displayName` field (an in-fiction name like `"Anora's Roost"` for a `Tower`; the
  `building` field itself must match the catalog — see Q2 in the spec).
- **Codex**'s three tabs no longer share one copy-pasted load/edit/save shape (the thing the
  earlier architecture review flagged) — each now matches its data's actual shape: Introduction is
  read-only reference data; Deities saves per-card as `DeityAmended`; Locations batches edits into
  one whole-document `LocationAmended`, which requires a note since the payload replaces the
  entire document.
- **Timeline** (replaces the old History Log): lists events newest-first, filterable by
  type/region, shows an obligation-progress panel, and its "log a new entry" form covers just
  `ResourceChanged`/`DMRuling` (auto-detected by whether resource changes were entered) — the
  other five event types go through their own view's form.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
