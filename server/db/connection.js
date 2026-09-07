import { createClient } from "@libsql/client";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseGameDate, ordinalSuffix } from "./gameDate.js";

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
    { id: 102, type: "CalendarAdvanced", note: "Browser automation smoke test" },
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
}

// One-time normalization of every event's game_date_raw string to one consistent shape --
// "MonthName (N), <day><suffix>, year" when a day was recorded, "MonthName (N), year" when
// only month+year was -- matching what GameDatePicker/formatGameDate now always produce
// (client/src/lib/gameDate.js). Doesn't change what date anything actually represents: every
// row here already parses to a real {year, month, day}, this only re-serializes the display
// string and fixes wrong ordinal suffixes ("3th" -> "3rd") along the way. Two things are
// deliberately left alone: bare years (nothing to convert them from) and the one "Month X to
// Month Y" range event (a different shape this pass doesn't cover). The "2025-09-14"-style
// migration entries never had an in-fiction date recorded at all -- the DM supplied "Erastus
// 3rd, 1227" for that whole batch directly (see chat log) rather than this guessing one.
// Gated on each row's current string already matching its target shape, so this is a safe
// no-op forever after the one time it actually needs to run.
async function ensureConsistentDateFormatting(client) {
  const monthsResult = await client.execute("SELECT number, name FROM calendar_months");
  if (monthsResult.rows.length === 0) return; // calendar structure not seeded yet
  const monthNames = new Map(monthsResult.rows.map((r) => [r.number, r.name]));

  const ISO_DATE_CORRECTION = "Erastus (2), 3rd, 1227";
  const rows = await client.execute("SELECT id, game_date_raw FROM events");

  for (const row of rows.rows) {
    const raw = row.game_date_raw;
    let next;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      next = ISO_DATE_CORRECTION; // a real-world "as of" date, not an in-fiction one
    } else if (/^Month\s+\d+\s+to\s+Month\s+\d+,/i.test(raw) || /^\d+$/.test(raw)) {
      continue; // range or bare year -- not covered by this pass
    } else {
      const parsed = parseGameDate(raw);
      if (!parsed.matched) continue; // genuinely unparseable -- leave the original alone
      const name = monthNames.get(parsed.month);
      if (!name) continue; // unknown month number -- leave the original alone
      next = parsed.hasDay
        ? `${name} (${parsed.month}), ${parsed.day}${ordinalSuffix(parsed.day)}, ${parsed.year}`
        : `${name} (${parsed.month}), ${parsed.year}`;
    }

    if (next !== raw) {
      const sort = parseGameDate(next).sortKey;
      await client.execute({
        sql: "UPDATE events SET game_date_raw = ?, game_date_sort = ? WHERE id = ?",
        args: [next, sort, row.id],
      });
    }
  }
}

async function initSchema(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(readFileSync(schemaPath, "utf-8"));
  await ensureColumn(client, "building_catalog", "annual_effect", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(client, "regions", "kingdom", "TEXT");
  await ensureObligationAmendedEventType(client);
  await ensureKnownDataCorrections(client);
  await ensureConsistentDateFormatting(client);
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
