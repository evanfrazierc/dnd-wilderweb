# Turso (libSQL) instead of a local SQLite file

Railway's free tier ended (paid plans only), and every other platform with a genuinely free
tier for a long-running Node process (Render, Fly.io's remaining allowance) offers no
persistent disk on that tier — `node:sqlite`'s local `campaign.db` file can't survive there.

Turso is a hosted, wire-compatible fork of SQLite (libSQL) with a free tier (5GB storage,
500M row reads/mo, 10M row writes/mo) that's far beyond what a two-person campaign tracker
needs, and no credit card required. Its trade-off against ADR-0002's "no database server to
operate" reasoning: the client (`@libsql/client`) is Promise-based even for local files, so
every `server/db/` call site went from sync (`db.prepare(sql).get()`) to async
(`await db.prepare(sql).get()`) — a mechanical but repo-wide change. In exchange, local dev
and tests still run against a local file (no Turso account needed — `getDb()` falls back to
one when `TURSO_DATABASE_URL` isn't set) and production runs on Render's free web service
tier with the database elsewhere, so the compute host can be swapped or restarted freely
without any data living on its disk.

The existing local `data/campaign.db` (real play data, not just the `data/*.json` fixtures)
was moved over with `scripts/copy-to-turso.js`, a direct row copy — not a re-run of
`scripts/migrate.js`, which only replays the stale fixture snapshot.
