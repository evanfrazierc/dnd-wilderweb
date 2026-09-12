import { createClient } from "@libsql/client";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseGameDate, canonicalizeGameDate } from "./gameDate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

let db = null;

// Wraps a libSQL Client or Transaction (both expose `.execute()`) in the
// `db.prepare(sql).get/all/run(...)` shape the rest of server/db/ was written against, so
// swapping node:sqlite's DatabaseSync for libSQL only meant adding `await` at call sites
// instead of rewriting every query (docs/adr/0007-turso-for-hosting.md).
function wrapExecutor(executor) {
  return {
    prepare(sql) {
      return {
        async get(...args) {
          const result = await executor.execute({ sql, args });
          return result.rows[0];
        },
        async all(...args) {
          const result = await executor.execute({ sql, args });
          return result.rows;
        },
        async run(...args) {
          const result = await executor.execute({ sql, args });
          return {
            lastInsertRowid: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
            changes: result.rowsAffected,
          };
        },
      };
    },
  };
}

function wrapClient(client) {
  const wrapped = wrapExecutor(client);
  // Explicit transactions go through libSQL's Transaction API (not raw BEGIN/COMMIT via
  // execute()) so the statements are guaranteed to share one logical connection whether
  // this is a local file or a remote Turso database.
  wrapped.transaction = async (fn) => {
    const tx = await client.transaction("write");
    try {
      const result = await fn(wrapExecutor(tx));
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  };
  wrapped.close = () => client.close();
  return wrapped;
}

// `CREATE TABLE IF NOT EXISTS` (schema.sql) can't retroactively add a column to a table
// that already existed before the column did -- an already-migrated DB needs an explicit
// ALTER TABLE, run at most once. Add future column migrations the same way.
async function ensureColumn(client, table, column, definition) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => row.name === column);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// "Region" retired in favor of "Settlement" as the campaign's one name for a buildable place
// (docs/adr/0014, reversing ADR-0008's original choice) -- the `regions` table becomes
// `settlements` (settlement_buildings already had the right name; only its `region` column
// needed to follow), and events.region becomes events.settlement. Plain ALTER TABLE RENAME
// (SQLite/libSQL support this natively, including updating the UNIQUE constraint and index
// definitions that reference the renamed columns) rather than the CREATE-copy-DROP-rename
// dance ensureObligationAmendedEventType needs below -- that one exists only because CHECK
// constraints specifically can't be altered in place; a plain column or table rename has no
// such restriction. Gated on the OLD name still existing, so a fresh database (schema.sql
// used to create `settlements`/`settlement` at the time this shipped) or an already-migrated
// one was a safe no-op.
//
// NO LONGER CALLED (docs/adr/0015) -- kept only as the historical record of ADR-0014 actually
// having happened, same spirit as ensureObligationAmendedEventType never getting rewritten once
// ObligationAmended shipped. Once schema.sql went back to creating `regions` (ADR-0015's
// reversal), this function's own gate -- "does a table named `regions` exist" -- stopped being
// able to tell "genuine pre-ADR-0014 database" apart from "schema.sql's own bootstrap just
// created today's normal, current, real `regions` table a moment ago in this same initSchema
// call" -- they're now the same table by construction. Calling this unconditionally on every
// boot, as it originally was, would DROP TABLE the real, live `settlements`... no wait, by the
// time ADR-0015 shipped there's no live `settlements` table for it to find on a real database
// either; the actual failure mode caught in testing was worse: on a database already fully
// reverted to `regions`, this function's gate fires anyway (schema.sql just made that table
// exist), so it drops the empty placeholder `settlements` (harmless) but then renames the REAL,
// data-holding `regions` table into `settlements`, discarding its identity as the current table
// right before ensureRegionRename renames it right back -- a wasteful and fragile round-trip on
// every single boot rather than the safe no-op it was designed to be. Do not re-add the call.
async function ensureSettlementRename(client) {
  const oldTable = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'regions'");
  if (oldTable.rows.length > 0) {
    // schema.sql's own `CREATE TABLE IF NOT EXISTS settlements` (initSchema runs it before any
    // migration, including this one) doesn't see the old `regions` table as "already existing"
    // -- different name -- so on a database still mid-migration it unconditionally creates a
    // second, empty `settlements` table moments before this function runs, which the rename
    // below would otherwise collide with. Safe to drop: nothing has had a chance to write to
    // it yet at this point in a single initSchema call.
    await client.execute("DROP TABLE IF EXISTS settlements");
    await client.execute("ALTER TABLE regions RENAME TO settlements");
  }

  const eventsInfo = await client.execute("PRAGMA table_info(events)");
  if (eventsInfo.rows.some((c) => c.name === "region")) {
    await client.execute("ALTER TABLE events RENAME COLUMN region TO settlement");
    await client.execute("DROP INDEX IF EXISTS idx_events_region");
  }
  // Unconditional, not just inside the `if` above: schema.sql deliberately doesn't create
  // this index itself (a fresh database's events table already has the right column name by
  // the time this runs, but schema.sql's own statements execute earlier in initSchema, before
  // any rename has happened, which is too early for an existing database still on `region`).
  // By this point the column is guaranteed to be `settlement` either way.
  await client.execute("CREATE INDEX IF NOT EXISTS idx_events_settlement ON events (settlement)");

  const buildingsInfo = await client.execute("PRAGMA table_info(settlement_buildings)");
  if (buildingsInfo.rows.some((c) => c.name === "region")) {
    await client.execute("ALTER TABLE settlement_buildings RENAME COLUMN region TO settlement");
  }
}

// "Settlement" reverted back to "Region" (docs/adr/0015) -- not every one of these is a
// settled place, so the brief rename in ADR-0014 didn't fit after all. This is the mirror image
// of ensureSettlementRename above, but it's the only one of the pair actually called from
// initSchema now (see the comment there) -- gated on the OLD name (`settlements`) still
// existing, so it's a safe no-op on a database that never went through ADR-0014 at all (already
// `regions`/`region`, schema.sql's own bootstrap having just created that same shape moments
// earlier can't be confused for a real `settlements` table under a different name) or one
// that's already been through this migration.
async function ensureRegionRename(client) {
  const oldTable = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settlements'");
  if (oldTable.rows.length > 0) {
    // Same schema.sql race as ensureSettlementRename hit in the other direction: its own
    // `CREATE TABLE IF NOT EXISTS regions` runs earlier in initSchema and doesn't recognize
    // `settlements` as "already existing" (different name), so it creates a second, empty
    // `regions` table that would otherwise collide with the rename target. Safe to drop for
    // the same reason: nothing could have written to it yet this call.
    await client.execute("DROP TABLE IF EXISTS regions");
    await client.execute("ALTER TABLE settlements RENAME TO regions");
  }

  const eventsInfo = await client.execute("PRAGMA table_info(events)");
  if (eventsInfo.rows.some((c) => c.name === "settlement")) {
    await client.execute("ALTER TABLE events RENAME COLUMN settlement TO region");
    await client.execute("DROP INDEX IF EXISTS idx_events_settlement");
  }
  await client.execute("CREATE INDEX IF NOT EXISTS idx_events_region ON events (region)");

  const buildingsInfo = await client.execute("PRAGMA table_info(settlement_buildings)");
  if (buildingsInfo.rows.some((c) => c.name === "settlement")) {
    await client.execute("ALTER TABLE settlement_buildings RENAME COLUMN settlement TO region");
  }
}

// SQLite can't ALTER a CHECK constraint in place -- adding 'ObligationAmended' to events.type's
// allowed values (schema.sql) only takes effect on a table CREATEd fresh with the new list. An
// already-existing events table (this project's local dev DB, and production once deployed)
// needs the standard SQLite rebuild-and-swap: create a copy with the new constraint, copy every
// row across explicitly (not `SELECT *`, so column order can never silently matter), drop the
// old table, rename the copy into place, then recreate its indexes (DROP TABLE takes them with
// it). Foreign keys are held off for the swap since `obligations.created_by_event_id` points at
// this table and DROP TABLE isn't the kind of change ON DELETE/UPDATE actions are meant to
// intercept. Gated on inspecting the live table's own CREATE TABLE SQL (sqlite_master), not a
// version counter, so this is a safe no-op forever after the one time it's actually needed.
async function ensureObligationAmendedEventType(client) {
  const result = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'");
  const sql = result.rows[0]?.sql ?? "";
  if (!sql || sql.includes("ObligationAmended")) return;

  await client.execute("PRAGMA foreign_keys = OFF");
  try {
    const tx = await client.transaction("write");
    try {
      await tx.execute(`
        CREATE TABLE events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN (
            'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
            'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'ObligationAmended', 'DMRuling'
          )),
          game_date_raw TEXT NOT NULL,
          game_date_sort INTEGER NOT NULL,
          posted_at TEXT NOT NULL,
          actor TEXT,
          region TEXT,
          note TEXT,
          payload TEXT NOT NULL DEFAULT '{}',
          warnings TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await tx.execute(`
        INSERT INTO events_new
          (id, type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings, created_at)
        SELECT id, type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings, created_at
        FROM events
      `);
      await tx.execute("DROP TABLE events");
      await tx.execute("ALTER TABLE events_new RENAME TO events");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_game_date_sort ON events (game_date_sort)");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_region ON events (region)");
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } finally {
    await client.execute("PRAGMA foreign_keys = ON");
  }
}

// Same rebuild-and-swap as ensureObligationAmendedEventType just above, for the same reason:
// adding 'UnitRaised'/'UnitLost' to events.type's CHECK constraint (docs/adr/0017) only takes
// effect on a table CREATEd fresh with the new list.
async function ensureUnitEventTypesAdded(client) {
  const result = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'");
  const sql = result.rows[0]?.sql ?? "";
  if (!sql || sql.includes("UnitRaised")) return;

  await client.execute("PRAGMA foreign_keys = OFF");
  try {
    const tx = await client.transaction("write");
    try {
      await tx.execute(`
        CREATE TABLE events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN (
            'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
            'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'ObligationAmended', 'DMRuling',
            'UnitRaised', 'UnitLost'
          )),
          game_date_raw TEXT NOT NULL,
          game_date_sort INTEGER NOT NULL,
          posted_at TEXT NOT NULL,
          actor TEXT,
          region TEXT,
          note TEXT,
          payload TEXT NOT NULL DEFAULT '{}',
          warnings TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await tx.execute(`
        INSERT INTO events_new
          (id, type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings, created_at)
        SELECT id, type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings, created_at
        FROM events
      `);
      await tx.execute("DROP TABLE events");
      await tx.execute("ALTER TABLE events_new RENAME TO events");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_game_date_sort ON events (game_date_sort)");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)");
      await tx.execute("CREATE INDEX IF NOT EXISTS idx_events_region ON events (region)");
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } finally {
    await client.execute("PRAGMA foreign_keys = ON");
  }
}

// One-time cleanup of a handful of specific, known-bad rows discovered in the live campaign
// log: a browser-testing session's CalendarAdvanced entries and a build-then-immediately-
// remove Ferry test (both confirmed by the DM to be test artifacts, not campaign history --
// see chat log), plus three ResourceChanged events whose gameDate got corrupted into a
// real-world display string ("2026-08-23") instead of an in-fiction date by a Dashboard bug
// (since fixed -- it fell back to stats.asOf when the date picker hadn't resolved yet).
//
// Every row is matched on id AND its exact note (or, for the ResourceChanged rows, its exact
// corrupted game_date_raw) before being touched, so this can never fire against a different
// database that happens to reuse one of these ids for something else -- a safe no-op forever
// after the one time this specific campaign's data actually needs it, same gating approach as
// ensureObligationAmendedEventType above.
async function ensureKnownDataCorrections(client) {
  const testArtifacts = [
    { id: 99, type: "DMRuling", note: "Browser automation smoke test: DM clarification note, no resource changes." },
    { id: 100, type: "BuildingConstructed", note: "Constructed via the Settlements view" },
    { id: 101, type: "BuildingRemoved", note: "Cleanup: removing browser-automation test building" },
    { id: 102, type: "CalendarAdvanced", note: "Browser automation smoke test" },
    { id: 103, type: "DeityAmended", note: "Amended via the Codex" },
    { id: 106, type: "BuildingConstructed", note: "Constructed via the Settlements view" },
    { id: 107, type: "BuildingRemoved", note: "Removed via the Settlements view" },
    { id: 108, type: "CalendarAdvanced", note: "Nothing happened…" },
    { id: 109, type: "CalendarAdvanced", note: "Going back" },
  ];
  for (const { id, type, note } of testArtifacts) {
    const result = await client.execute({
      sql: "SELECT id FROM events WHERE id = ? AND type = ? AND note = ?",
      args: [id, type, note],
    });
    if (result.rows.length > 0) {
      await client.execute({ sql: "DELETE FROM events WHERE id = ?", args: [id] });
    }
  }

  // calendar_state is a plain last-write-wins projection (applyCalendarAdvanced in
  // projections.js) -- deleting CalendarAdvanced events above doesn't recompute it on its own,
  // it just keeps showing whatever the last one to run wrote. Not hardcoded to any particular
  // remaining event: this re-derives it from whichever CalendarAdvanced event now has the
  // highest id (the actual applied-order tiebreak createEvent itself uses), so it comes out
  // correct whether that's the original migration's entry (nothing else legitimate on record,
  // production's case) or some other real advance this cleanup didn't touch.
  const latest = await client.execute("SELECT payload FROM events WHERE type = 'CalendarAdvanced' ORDER BY id DESC LIMIT 1");
  if (latest.rows.length > 0) {
    const p = JSON.parse(latest.rows[0].payload);
    await client.execute({
      sql: `
        INSERT INTO calendar_state (id, year, year_label, month, day, note)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          year = excluded.year, year_label = excluded.year_label,
          month = excluded.month, day = excluded.day, note = excluded.note
      `,
      args: [p.year, p.yearLabel ?? null, p.month, p.day, p.note ?? null],
    });
  }

  // Same idea as calendar_state above, but for `deities`: event 103's deletion (it overwrote
  // Calistria's real note with test content) needs the projection re-derived from whatever
  // DeityAmended event for that name now has the highest id, not left holding the deleted
  // event's stale write.
  const deityNames = await client.execute("SELECT DISTINCT json_extract(payload, '$.name') AS name FROM events WHERE type = 'DeityAmended'");
  for (const { name } of deityNames.rows) {
    if (!name) continue;
    const latestDeity = await client.execute({
      sql: "SELECT payload FROM events WHERE type = 'DeityAmended' AND json_extract(payload, '$.name') = ? ORDER BY id DESC LIMIT 1",
      args: [name],
    });
    if (latestDeity.rows.length === 0) continue;
    const changes = JSON.parse(latestDeity.rows[0].payload).changes ?? {};
    const existing = await client.execute({ sql: "SELECT * FROM deities WHERE name = ?", args: [name] });
    const current = existing.rows[0] ?? {};
    await client.execute({
      sql: `
        INSERT INTO deities (name, title, alignment, confirmed, note)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (name) DO UPDATE SET
          title = excluded.title, alignment = excluded.alignment,
          confirmed = excluded.confirmed, note = excluded.note
      `,
      args: [
        name,
        (changes.title !== undefined ? changes.title : current.title) ?? null,
        (changes.alignment !== undefined ? changes.alignment : current.alignment) ?? null,
        (changes.confirmed !== undefined ? (changes.confirmed ? 1 : 0) : current.confirmed) ?? 0,
        (changes.note !== undefined ? changes.note : current.note) ?? null,
      ],
    });
  }

  // The three corrupted ResourceChanged events: corrected to the campaign's actual current
  // date throughout the period they were saved (Erastus 3rd, 1227 -- the same event 79 above),
  // in the named-month format formatGameDate now produces going forward.
  const correctedRaw = "Erastus (2), 3rd, 1227";
  const correctedSort = parseGameDate(correctedRaw).sortKey;
  for (const id of [98, 104, 105]) {
    const result = await client.execute({
      sql: "SELECT id FROM events WHERE id = ? AND type = 'ResourceChanged' AND game_date_raw = '2026-08-23'",
      args: [id],
    });
    if (result.rows.length > 0) {
      await client.execute({
        sql: "UPDATE events SET game_date_raw = ?, game_date_sort = ? WHERE id = ?",
        args: [correctedRaw, correctedSort, id],
      });
    }
  }

  // Three real, original-migration ResourceChanged events (ids 46-48) were dated Shelune
  // (month 3) -- genuine history, not test data, but ahead of where the campaign's current
  // date sits, which read as "the future" once that current date was corrected elsewhere in
  // this file. The DM asked for these moved into the past rather than left ahead of "now"
  // (see chat log); their notes -- what actually happened -- are untouched, only the date
  // they're sorted by.
  const pastMoves = [
    { id: 46, note: "Market Trade" },
    { id: 47, note: "Forge Tool at Smithy" },
    { id: 48, note: "Build Tower near Mettlewood — Constructs in Month 4, 1227." },
  ];
  for (const { id, note } of pastMoves) {
    const result = await client.execute({
      sql: "SELECT id FROM events WHERE id = ? AND type = 'ResourceChanged' AND note = ? AND game_date_raw = 'Shelune (3), 1227'",
      args: [id, note],
    });
    if (result.rows.length > 0) {
      await client.execute({
        sql: "UPDATE events SET game_date_raw = ?, game_date_sort = ? WHERE id = ?",
        args: [correctedRaw, correctedSort, id],
      });
    }
  }
}

// Deleting the test CalendarAdvanced entries above rolled the campaign's current date back to
// Erastus 3rd, 1227 (the last *formally* real advance) -- but real, non-test activity (the
// DM's own actions saved via GameDatePicker's auto-defaulted "today") had already happened
// dated Erastus 4th by the time that test entry was cleaned up, which made those real actions
// look like they were set in the campaign's future relative to the rolled-back date. The DM
// confirmed Erastus 4th as the real current date (see chat log) -- this restores it as a
// genuine CalendarAdvanced event (not just a projection patch), gated on that exact advance
// not already existing so it's a safe no-op after the one time it's needed.
async function ensureCurrentDateAdvancedPastRealActivity(client) {
  const marker = "Restored: a test CalendarAdvanced entry had briefly set this same date before being removed as test data, but real activity (events 110-114) had already happened dated Erastus 4th by then";
  const existing = await client.execute({ sql: "SELECT id FROM events WHERE type = 'CalendarAdvanced' AND note = ?", args: [marker] });
  if (existing.rows.length > 0) return;

  // Gated on an exact content signature, not just an id range -- a database with unrelated
  // content sitting at these same ids (this project's local dev copy, for instance, diverged
  // from production long ago and has entirely different rows here) must never trigger this.
  const activity = await client.execute({
    sql: "SELECT id FROM events WHERE id = 113 AND type = 'ResourceChanged' AND note = 'Testing loan repayment'",
  });
  if (activity.rows.length === 0) return; // that specific real activity isn't present in this database

  const payload = { year: 1227, yearLabel: "YEAR THREE", month: 2, day: 4, note: "Marked in the calendar channel as \"You are here\"" };
  const gameDateRaw = "Erastus (2), 4th, 1227";
  const gameDateSort = parseGameDate(gameDateRaw).sortKey;
  const postedAt = new Date().toISOString().slice(0, 10);

  await client.execute({
    sql: `
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, actor, note, payload)
      VALUES ('CalendarAdvanced', ?, ?, ?, 'Migration', ?, ?)
    `,
    args: [gameDateRaw, gameDateSort, postedAt, marker, JSON.stringify(payload)],
  });
  await client.execute({
    sql: `
      INSERT INTO calendar_state (id, year, year_label, month, day, note)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        year = excluded.year, year_label = excluded.year_label,
        month = excluded.month, day = excluded.day, note = excluded.note
    `,
    args: [payload.year, payload.yearLabel, payload.month, payload.day, payload.note],
  });
}

// Bare-year rows already in the live database that predate docs/adr/0016 (canonicalizeGameDate
// won't guess a month for these in general -- these are hand-researched, one-off exceptions for
// specific rows that already exist, the same idea as isoCorrection just below). Cross-referenced
// against wilderlands-discord-export.txt (.scratch/discord-seed/findings.md has the reasoning):
// - The original migration's "no source date exists for lore/reference imports" placeholder
//   (scripts/migrate.js's CAMPAIGN_START_GAME_DATE) -- every DeityAmended/LocationAmended event
//   it created is attributed to actor "Migration" and was left as a bare "1225", a marker no
//   live-app write can produce (the picker always supplies a full date) so this can't misfire on
//   a real player-authored event.
// - Three ResourceChanged entries from history.json (ids 33/35/36) whose Discord source gave a
//   year but no month ("through 1226" / "in 1226") -- identified by their exact note text,
//   which only these three rows carry, rather than by id (ids aren't stable across a fresh
//   local migrate, note text is).
const MIGRATION_IMPORT_CAMPAIGN_START = "Pelorune (1), 1st, 1225";
const HISTORY_BATCH_ANCHOR_1226 = "Meloron (6), 1st, 1226";
const HISTORY_BATCH_ANCHOR_NOTES = new Set([
  "Forge Weapons at Smithy",
  "Annual trade with Carthrun",
  "Building Iron Mine near Carthrun",
]);

// Returns the normalized string for a raw date, or null if this raw string isn't covered by
// this pass (a bare year not covered by one of the specific corrections above -- no month
// recorded, so canonicalizeGameDate won't guess one -- or genuinely unparseable text; both left
// as they already were). Shared between events.game_date_raw and obligations.due_game_date_raw,
// which carry the exact same kind of string (obligations has no actor/note, so `context` is
// always {} there and only the generic path applies). Delegates the actual reserialization to
// gameDate.js's canonicalizeGameDate, which also backstops new writes (docs/adr/0016) -- one
// canonical shape, one place that produces it.
function normalizeDate(raw, monthNames, isoCorrection, { actor, note } = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoCorrection; // a real-world "as of" date, not an in-fiction one
  if (raw === "1225" && actor === "Migration") return MIGRATION_IMPORT_CAMPAIGN_START;
  if (raw === "1226" && HISTORY_BATCH_ANCHOR_NOTES.has(note)) return HISTORY_BATCH_ANCHOR_1226;
  return canonicalizeGameDate(raw, monthNames);
}

// One-time (and self-healing) normalization of every event's game_date_raw (and every
// obligation's due_game_date_raw -- the same kind of string, a separate table) to the one
// canonical shape validateShape now requires of every new write, "MonthName (N), <day><suffix>,
// year" (docs/adr/0016) -- matching what GameDatePicker/formatGameDate always produce
// (client/src/lib/gameDate.js). A day the source never recorded becomes day 1 (the same
// placeholder convention canonicalizeGameDate applies everywhere); a month range collapses to
// its first month, day 1. Doesn't invent what year/month/day anything actually represents where
// that's genuinely unknown: a bare year (no month at all to build a real date from) is left
// alone in general, except the specific already-existing rows normalizeDate hand-corrects above.
// The "2025-09-14"-style migration entries never had an in-fiction date recorded at all
// -- the DM supplied "Erastus 3rd, 1227" for that whole batch directly (see chat log) rather
// than this guessing one. Gated on each row's current string already matching its target shape,
// so this is a safe no-op forever after the one time it actually needs to run.
async function ensureConsistentDateFormatting(client) {
  const monthsResult = await client.execute("SELECT number, name FROM calendar_months");
  if (monthsResult.rows.length === 0) return; // calendar structure not seeded yet
  const monthNames = new Map(monthsResult.rows.map((r) => [r.number, r.name]));
  const isoCorrection = "Erastus (2), 3rd, 1227";

  const events = await client.execute("SELECT id, game_date_raw, actor, note FROM events");
  for (const row of events.rows) {
    const next = normalizeDate(row.game_date_raw, monthNames, isoCorrection, { actor: row.actor, note: row.note });
    if (next && next !== row.game_date_raw) {
      await client.execute({
        sql: "UPDATE events SET game_date_raw = ?, game_date_sort = ? WHERE id = ?",
        args: [next, parseGameDate(next).sortKey, row.id],
      });
    }
  }

  const obligations = await client.execute("SELECT id, due_game_date_raw FROM obligations WHERE due_game_date_raw IS NOT NULL");
  for (const row of obligations.rows) {
    const next = normalizeDate(row.due_game_date_raw, monthNames, isoCorrection);
    if (next && next !== row.due_game_date_raw) {
      await client.execute({
        sql: "UPDATE obligations SET due_game_date_raw = ?, due_game_date_sort = ? WHERE id = ?",
        args: [next, parseGameDate(next).sortKey, row.id],
      });
    }
  }
}

// stats_meta's `asOfNote` ("Latest values from the #current-stats channel, after the Trade
// Post and Tower build orders.") was carried over from the original JSON migration and shown
// on the Dashboard indefinitely -- stale the moment any resource changed after that one import,
// which happened immediately (see chat log: the DM was still seeing it long after). The
// Dashboard no longer displays this field at all; this clears it from storage too, so the dead
// text doesn't linger in campaign_meta for someone to find later and wonder about. Gated on the
// field actually being present, so a safe no-op forever after the one time it's needed.
async function ensureStaleAsOfNoteCleared(client) {
  const row = await client.execute("SELECT value FROM campaign_meta WHERE key = 'stats_meta'");
  if (row.rows.length === 0) return;
  const meta = JSON.parse(row.rows[0].value);
  if (meta.asOfNote === undefined) return;
  delete meta.asOfNote;
  await client.execute({
    sql: "UPDATE campaign_meta SET value = ? WHERE key = 'stats_meta'",
    args: [JSON.stringify(meta)],
  });
}

async function initSchema(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(readFileSync(schemaPath, "utf-8"));
  await ensureColumn(client, "building_catalog", "annual_effect", "TEXT NOT NULL DEFAULT '{}'");
  // Must run before ensureRegionRename: its events-table rebuild still hardcodes the old
  // `region` column name (it predates both renames and only needs to run once, ever, on a
  // database old enough to still be missing ObligationAmended from the CHECK constraint --
  // renaming settlement to region first would break that rebuild's column list, and this
  // migration is old enough it never got updated to expect `settlement` either since it only
  // ever needs to fire on a database from before either rename existed).
  await ensureObligationAmendedEventType(client);
  // ensureSettlementRename is NOT called here -- see the long comment on its own definition
  // above for why doing so would be actively destructive now that schema.sql creates `regions`
  // again. ensureRegionRename alone is sufficient: a genuine never-migrated database (still
  // named `regions`/`region`, having skipped ADR-0014 entirely) is already in its target shape
  // and this is a safe no-op on it; a real post-ADR-0014 database (`settlements`/`settlement`)
  // is exactly what this converts.
  await ensureRegionRename(client);
  // Must run after the rename above: by now the table is named `regions` either way
  // (freshly created that way, or renamed back), never `settlements`.
  await ensureColumn(client, "regions", "kingdom", "TEXT");
  // Unlike ensureObligationAmendedEventType above, this one has no "predates the rename"
  // guarantee -- it's new today, so it runs after ensureRegionRename instead, once the events
  // table's region column is guaranteed to be named `region` either way (its rebuild hardcodes
  // that name, same as ensureObligationAmendedEventType's does).
  await ensureUnitEventTypesAdded(client);
  await ensureKnownDataCorrections(client);
  await ensureCurrentDateAdvancedPastRealActivity(client);
  await ensureConsistentDateFormatting(client);
  await ensureStaleAsOfNoteCleared(client);
}

/** Opens a local database: `:memory:` or a filesystem path. Used by tests and local scripts. */
export async function openDb(target) {
  const url = target === ":memory:" ? ":memory:" : pathToFileURL(target).href;
  const client = createClient({ url });
  await initSchema(client);
  return wrapClient(client);
}

/** Opens a remote Turso/libSQL database. Used in production. */
export async function openRemoteDb({ url, authToken }) {
  const client = createClient({ url, authToken });
  await initSchema(client);
  return wrapClient(client);
}

export async function getDb() {
  if (!db) {
    if (process.env.TURSO_DATABASE_URL) {
      db = await openRemoteDb({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } else {
      const dbPath = process.env.WILDERWEB_DB_PATH
        || path.join(__dirname, "..", "..", "data", "campaign.db");
      db = await openDb(dbPath);
    }
  }
  return db;
}
