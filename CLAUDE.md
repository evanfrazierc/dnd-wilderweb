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

`getDb()` (`server/db/connection.js`) targets a local SQLite file by default, falling back to
Turso (libSQL, ADR-0007) when `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are set — no Turso account
needed for local dev or tests. Two more one-time scripts follow that same fallback:
`scripts/copy-to-turso.js` (moved the real local `data/campaign.db` to Turso once, a direct row
copy) and `scripts/seed-annual-effects.js` (backfilled `building_catalog`'s `annual_effect` rates
for buildings with an unambiguous flat rate, ADR-0009). Neither needs running again in the
ordinary course of things.

## Architecture

`data/campaign.db` (SQLite, via `server/db/`) is the source of truth. `data/*.json` is a
git-diffable backup produced by `npm run export`, not something the running app reads or writes
(ADR-0002 / `docs/agents`'s Q7 in `.scratch/campaign-database/spec.md`). Read `CONTEXT.md` (the
event taxonomy and domain vocabulary) and `docs/adr/` before changing `server/db/` or the
event-emitting client code — one ADR per decision, growing over time, explaining things like why
trades aren't a separate event type, why validation warns instead of blocking, and why actors
stay free-text rather than full accounts.

### `server/db/` — the event log and its projections

- `schema.sql` / `connection.js`: SQLite via Node's built-in `node:sqlite` (no new dependency).
  DB file at `data/campaign.db`, gitignored — `npm run export` is the git-diffable backup path.
- `events.js` (`createEvent`/`listEvents`): every write is an event of a type documented in
  `CONTEXT.md` (the authoritative list — don't recount them here). `createEvent` validates shape
  (400 on failure), checks in-game warnings (`validate.js`), then writes the event and updates the
  relevant projection in one transaction.
- `projections.js`: applies an event's payload onto current-state tables (`resource_totals`,
  `settlement_buildings`, `garrison_units`, `map_versions`, and more — `schema.sql` has the full,
  current set). Never recomputed by replaying the full log — see ADR-0001.
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

No JSON files are read or written at request time. Routes: `GET`/`POST /api/events` plus
`PATCH /api/events/:id/hidden` (Timeline visibility only, not a new event — ADR-0019),
`GET /api/projections/:resource` (current state, shaped to match the old `data/*.json` files —
`server/index.js`'s `PROJECTION_RESOURCES` set names the current resources), `GET`/`PUT
/api/reference/:resource` (directly writable, no event history, dispatched through
`server/db/reference.js`'s `REFERENCE_RESOURCES` table, which names the current resources —
buildings, units, introduction, resourceDefinitions, calendarStructure, and regions as of this
writing), `GET /api/obligations[/:id]`, and `POST /api/map` (a `MapUpdated` event carrying the raw
image as the request body, not JSON — ADR-0018). In production, Express also serves the built
client (`client/dist`) and falls back to `index.html` for any non-`/api` route (SPA routing).

`server/index.js`'s `siteAuth` middleware can gate every route behind a single shared password —
a no-op unless the `SITE_PASSWORD` env var is set, so it's opt-in per deployment, not something
this repo's code turns on by itself (check the actual deployment's env vars for whether it's
currently in effect there). Even when set, it's one site-wide password, not per-user accounts —
see ADR-0003 for why actors still stay free-text either way.

`POST /api/events` also takes an optional `postToDiscord` flag (not part of the event itself,
stripped before it reaches `createEvent`) — when true, `server/discord.js`'s `notifyDiscord`
best-effort-posts a formatted embed to `DISCORD_WEBHOOK_URL`, never blocking or failing the save
if Discord is unreachable or unconfigured (ADR-0006). The embed's title links back to
`/timeline?event=<id>` on whatever host the triggering request actually came in on (`req.protocol`
+ `req.get("host")`, hence `trust proxy` being set — Render terminates TLS in front of the app),
not a configured constant.

### Client (`client/`) is page views that emit events, not blind writes

`client/src/App.jsx` is a tab switcher with no router library, but each top-level page is a real,
linkable URL (`client/src/lib/usePageRoute.js` syncs the active page with `window.location` via
the History API — no dependency needed, since `server/index.js`'s catch-all already serves
`index.html` for any non-`/api` path). Its `PAGES` array is the authoritative, current list of
top-level views — Dashboard, Calendar, Settlements, Garrison, Timeline, and Codex
(lore/deities/locations/map) as of this writing, but check there rather than trusting a count
here. Every write goes through `client/src/api.js`'s `postEvent` and the shared
`client/src/lib/useEventSubmit.js` hook (submit, track status, surface warnings —
`WarningsList.jsx` renders them; also owns the per-save `postToDiscord` flag, defaulted on,
rendered as `PostToDiscordToggle.jsx`'s checkbox next to a save button). Not every event type
offers the checkbox, though — corrections/tidying rather than campaign news (`BuildingAmended`,
`DeityAmended`, `LocationAmended`, `ObligationAmended`, `DMRuling`) pass `postToDiscord: false` on
the event object to force it off (the hook honors an explicit value on the event over its own
checkbox state; see the hook's own comment). Reads go through
`getProjection`/`getReference`/`getEvents`/`getObligations`. Per view:

- **Dashboard**: edits stat values locally (steppers), then on save diffs the draft against the
  loaded snapshot into one `ResourceChanged` event. Also shows the loan (Obligation) panel: adding
  one bundles a `newObligation` onto a `ResourceChanged`, repaying one is another `ResourceChanged`
  referencing its `obligationId`, and editing/forgiving one is its own `ObligationAmended` event.
- **CalendarView**: the date-set form emits `CalendarAdvanced`.
- **Settlements**: add/remove building emits `BuildingConstructed`/`BuildingRemoved`, including
  the optional `displayName` field (an in-fiction name like `"Anora's Roost"` for a `Tower`; the
  `building` field itself must match the catalog — see Q2 in the spec). Also has collapsible
  managers for the building catalog and the region list, both reference data (no event history).
- **Garrison**: mirrors Settlements but for units instead of buildings — raise/lose a unit emits
  `UnitRaised`/`UnitLost`, and it has its own collapsible unit-catalog manager.
- **Codex**'s tabs don't share one copy-pasted load/edit/save shape — each matches its data's
  actual shape: Introduction is read-only reference data; Deities saves per-card as
  `DeityAmended`; Locations saves per-kingdom as `LocationAmended` (`payload: {name, changes}`,
  mirroring `DeityAmended` — ADR-0011); Map uploads a new image as a `MapUpdated` event (the raw
  file as the request body, not JSON — ADR-0018).
- **Timeline** (replaces the old History Log): lists events newest-first, filterable by
  type/region, and its "log a new entry" form covers just `ResourceChanged`/`DMRuling`
  (auto-detected by whether resource changes were entered) — every other event type goes through
  its own view's form.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
