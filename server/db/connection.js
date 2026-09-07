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

async function initSchema(client) {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(readFileSync(schemaPath, "utf-8"));
  await ensureColumn(client, "building_catalog", "annual_effect", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(client, "regions", "kingdom", "TEXT");
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
