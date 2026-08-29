# Wilderweb

A campaign tracker for the Wilderweb D&D campaign (a Kingmaker-style wilderness settlement game).

## What's here

- **`server/db/`** — a SQLite event log (`data/campaign.db`) that's the source of truth: every
  campaign change (resource changes, construction, calendar advances, deity/location amendments,
  DM rulings) is recorded as an event, with current state kept as a queryable projection.
  See `CONTEXT.md` for the vocabulary and `docs/adr/` for the design decisions behind it.
- **`server/`** — a small Express API over that database.
- **`client/`** — a React (Vite) app with five views: Dashboard, Calendar, Settlements, Timeline,
  and Codex (lore/deities/locations). Edits made in the UI are recorded as events, not overwrites.
- **`data/*.json`** — a git-diffable backup of current state, produced on demand by
  `npm run export`; originally transcribed from the campaign's Discord channels and migrated into
  the database by `npm run migrate`.

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
