# Campaign database, event history, timeline, and Discord integration

## Goals

1. Move campaign data from JSON files into a persistent database; the database becomes the single source of truth.
2. Model campaign changes as historical events instead of only storing current values.
3. Make the website the primary way to manage campaign state — every change made through the site updates data and becomes part of its history.
4. Add Discord integration: publish notable changes out, import selected data in.
5. Build a campaign history/timeline.
6. Add data validation and auditability.

Domain vocabulary is in [`CONTEXT.md`](../../CONTEXT.md). Six decisions from the design session are recorded as ADRs in [`docs/adr/`](../../docs/adr/) (0001–0006) — read those before second-guessing the event-log shape, SQLite, the no-auth actor model, folding trades into `ResourceChanged`, warn-not-block validation, or the webhook/paste-parse Discord shape.

## Architecture

- **SQLite**, no ORM — a thin query layer (e.g. `better-sqlite3`, synchronous, matches the project's existing minimal-dependency style) rather than adding an abstraction layer over a single-file database.
- **`events` table**: append-only. `id`, `type` (`ResourceChanged` / `BuildingConstructed` / `BuildingRemoved` / `CalendarAdvanced` / `DeityAmended` / `LocationAmended` / `DMRuling`), `game_date` (normalized, sortable), `posted_at`, `actor`, `region` (nullable), `note`, `payload` (JSON — type-specific fields: `changes` + optional `counterparty` + optional `obligation_id` for `ResourceChanged`; building name for `BuildingConstructed`/`Removed`; etc.), `warnings` (JSON, from validation — see below).
- **Projection tables**, updated transactionally in the same write as the event that caused them: `resource_totals` (resource/asset/society name → value), `settlement_buildings` (region, building, count, detail), `calendar_state` (current date), `deities`, `locations`. These are what the UI reads for "current state" — never recomputed by replaying the whole log, per ADR-0001.
- **`obligations` table**: `id`, `description`, resources originally borrowed (JSON, for the record), `repayment_resource`, `amount_total`, `amount_remaining`, `due_game_date`, `created_by_event_id`, `satisfied`. A `ResourceChanged` event that references an `obligation_id` decrements `amount_remaining` transactionally, same pattern as any other projection update.
- **Reference tables** (no event history, edited directly): building catalog, campaign introduction, calendar month/holiday definitions.
- **Validation module**: one function per event type, run before commit. Returns warnings (negative resource total, building missing a prerequisite from the catalog, calendar moving backwards), never throws to block the write (ADR-0005). Warnings are stored on the event and surfaced in the UI.

## Phase 1 — Database, events, validation, migration

- [x] Schema + migrations for `events`, the projection tables, `obligations`, and the reference tables. (`server/db/schema.sql`, using Node's built-in `node:sqlite` — no new dependency.)
- [x] `POST /api/events` — validates payload shape for the given `type`, runs the validation module, writes the event and updates the relevant projection(s) in one transaction, returns the created event plus any warnings.
- [x] `GET /api/events` — filterable by `type`, `region`, `game_date` range; powers Phase 2's timeline.
- [x] `GET /api/projections/:resource` — added alongside (not replacing yet) the old `GET /api/:resource`; the client still reads the JSON files directly until Phase 2's cutover.
- [x] `GET /api/reference/:resource` — building catalog, introduction; plain read, no events.
- [x] `GET /api/obligations` / obligation detail (amount remaining, linked settling events).
- [x] Migration script:
  - Import every `history.json` entry as a `ResourceChanged` (or `DMRuling`, for entries with empty `changes`) event, preserving original `postedAt`/`gameDate`, normalizing `gameDate` into a sortable form.
  - Replay the imported events into `resource_totals` and diff the result against `stats.json`'s current values — report every mismatch for manual review before cutover, don't silently trust either side (ADR/Q10).
  - Import `settlements.json` into `settlement_buildings` plus one `BuildingConstructed` event per existing building, dated at each region's `asOf`.
  - Import `calendar.json`, `deities.json`, `locations.json` into their projection tables plus one seed event each for future-facing history.
  - Load the building catalog, introduction, and calendar month/holiday definitions into reference tables.
  - Turn `history.json` id 49 (the resource loan) into the first `Obligation`: `amount_total: 50`, `repayment_resource: "Wealth"`, `due_game_date` computed from "8 years" out from the loan's game-date, `amount_remaining: 50`.
  - **Run, real output**: 96 events imported, 1 obligation created. The replay-vs-snapshot diff found real mismatches on 10 of 17 resources (e.g. Wood: replayed -13 vs. snapshot 12) — expected per Q10, and not something this migration should paper over; see "Known open items" below. Also surfaced 7 building names in `settlements.json` that don't match the catalog (`"Iron Mine"` vs. catalog's `"Mine"`, `"Stone Bridge"` vs. `"Bridge"`, etc.) and one real unmet prerequisite (Apothecary before Herbalist Hut).
- [x] `npm run export` — dumps current projections + reference tables back to `data/*.json` (plus `events.json`/`obligations.json`) in today's shape, for git-diffable backup (ADR/Q7). **Do not run this against the live `data/` directory until Phase 2's cutover** — it overwrites the files the running app still reads directly, with numbers that haven't been reconciled yet. The script prints this warning before writing.
- [x] Tests for the validation module and the migration's replay/diff logic — 21 tests in `test/db/`, first real test coverage in the repo.

### Post-Phase-1 follow-up grilling session — resolved

A second round of design questions came out of actually running the migration. All resolved and implemented:

- **Resource mismatch**: closed with one dated, clearly-labeled `ResourceChanged` reconciliation event (`reconcileOpeningBalance` in `scripts/migrate.js`) rather than silently editing `resource_totals` or hiding the gap. All 17 resources now match `stats.json` exactly after migration.
- **Building-name mismatches**: `settlement_buildings` gained a `display_name` column. The 7 mismatched names are canonicalized to the catalog name (`"Iron Mine"` → `Mine`, `"Anora's Roost"` → `Tower`, etc.) with the in-fiction name preserved as `displayName`, not lost.
- **Obligation repayment no-op**: `checkWarnings` now warns when a `ResourceChanged` references an `obligationId` but doesn't move that obligation's `repayment_resource` (or references a nonexistent obligation), instead of silently doing nothing.
- **`LocationAmended` note**: now required, since `payload.data` replaces the whole document and the note is the only readable record of what changed.
- **`settlements.json` staleness** (missing Trade Post / Tower, per `stats.json`'s own `asOfNote`): left for manual follow-up rather than fuzzy-matched from `history.json` prose — same human-in-the-loop reasoning as the paste-and-parse Discord import.
- **Migration lifecycle guard**: `migrate.js` now refuses to run at all (even with `--force`) once a prior migration has completed (`campaign_meta.migrated_at`), rather than trusting a flag not to be run against a database with real live-app events in it.

## Phase 2 — Timeline UI and site-driven writes

- [ ] Replace `History.jsx` with a **Timeline** view backed by `GET /api/events`: chronological by `gameDate`, filterable by type/region/date range, `postedAt` shown as secondary metadata, warnings visible per entry.
- [ ] Obligation progress display: amount remaining vs. total, due date, linked repayment events.
- [ ] Rework `Dashboard.jsx`, `CalendarView.jsx`, `Settlements.jsx`, `Codex.jsx` so edits emit `POST /api/events` calls (a stat change → `ResourceChanged`, a new building → `BuildingConstructed`, a calendar tick → `CalendarAdvanced`, a deity/location edit → `DeityAmended`/`LocationAmended`) instead of blind whole-resource `PUT`s. This is also where `Codex.jsx`'s three duplicated load/edit/save blocks (flagged in the earlier architecture review) get collapsed into one shared mechanism, since all three now go through the same event-creation path.

## Phase 3 — Discord integration

- [ ] Outbound webhook: after each successful `POST /api/events`, best-effort `POST` a formatted summary (type, game date, actor, note) to a configured webhook URL. Never blocks or fails the write if Discord is unreachable (ADR-0006).
- [ ] Inbound paste-and-parse: an admin panel where the DM pastes raw Discord message text; a parser (extending the existing `parseChanges` logic from `History.jsx`) extracts a draft `ResourceChanged` or `DMRuling` for review and edit before it's submitted as a real event. Scoped to just these two types at launch (Q17) — the other five event types go through normal site forms.

## Explicitly deferred (see ADRs)

- User accounts / auth beyond free-text actor names (ADR-0003).
- A full Discord bot (slash commands, automatic channel ingestion) in place of the webhook + paste-parse flow (ADR-0006).
