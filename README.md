# Wilderweb

A campaign tracker for the Wilderweb D&D campaign (a Kingmaker-style wilderness settlement game).

## What's here

- **`data/`** — the source of truth: calendar, deities, locations, campaign lore, the building
  catalog, per-region settlement buildings, current kingdom stats, and a chronological build
  order / bookkeeping history. Transcribed from the campaign's Discord channels.
- **`server/`** — a small Express API that reads and writes the JSON files in `data/`.
- **`client/`** — a React (Vite) app with five views: Kingdom Dashboard, Calendar, Settlements,
  History Log, and Codex (lore/deities/locations). Edits made in the UI are saved back to the
  files in `data/`, so they show up in `git diff` like any other change.

## Development

Install dependencies once:

```bash
npm install
npm install --prefix client
```

Run the server and the client together:

```bash
npm run dev
```

This starts the API on `http://localhost:4000` and the Vite dev server (with the app itself) on
`http://localhost:5173`.

## Production-ish use

```bash
npm start
```

Builds the client and serves it (plus the API) from a single Express server on `PORT`
(default `4000`).
