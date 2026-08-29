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

## Architecture

### `data/` is the source of truth

Everything the app displays — calendar, deities, locations, campaign lore, the building catalog,
per-region settlement buildings, current kingdom stats, and a chronological build-order/bookkeeping
history — lives as JSON files in `data/`, transcribed from the campaign's Discord channels. There
is no database. Edits made in the client UI are written straight back to these files, so they show
up in `git diff` like any other change. When reasoning about "where does X live," check `data/`
before assuming there's a schema or model file somewhere.

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
