import { createClient } from "@libsql/client";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

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

async function initSchema(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(readFileSync(schemaPath, "utf-8"));
  await ensureColumn(client, "building_catalog", "annual_effect", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(client, "regions", "kingdom", "TEXT");
  await ensureObligationAmendedEventType(client);
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
