import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "../../server/db/connection.js";

// building_catalog's annual_effect column was added after the table itself existed in
// production DBs, so it's applied via an idempotent ALTER-TABLE-if-missing check in
// initSchema rather than CREATE TABLE IF NOT EXISTS. Since :memory: connections don't share
// state, this uses a real temp file so initSchema (and its ALTER TABLE) genuinely runs twice
// against the same already-migrated database, confirming the second run doesn't error.
test("re-opening an already-migrated file DB does not error on the ALTER TABLE check", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const first = await openDb(dbPath);
    await first.prepare(`
      INSERT INTO building_catalog (name, category, effect, cost, requires, annual_effect)
      VALUES ('Farm', 'Resources', 'Generates food', '{}', '[]', '{"Food":1}')
    `).run();
    first.close();

    const second = await openDb(dbPath);
    const info = await second.prepare("PRAGMA table_info(building_catalog)").all();
    assert.ok(info.some((c) => c.name === "annual_effect"));

    const row = await second.prepare("SELECT annual_effect FROM building_catalog WHERE name = 'Farm'").get();
    assert.equal(row.annual_effect, '{"Food":1}');

    const regionsInfo = await second.prepare("PRAGMA table_info(regions)").all();
    assert.ok(regionsInfo.some((c) => c.name === "kingdom"));
    second.close();
  } finally {
    // Windows can hold the file handle open past close() returning; best-effort cleanup so
    // that lingering lock doesn't fail a test that already got its real assertions in.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

// events.type's CHECK constraint can't be widened by CREATE TABLE IF NOT EXISTS on a table that
// already exists (docs/adr/0013) -- simulates a pre-ObligationAmended database (the original
// 8-value constraint, built directly with node:sqlite rather than openDb so it genuinely
// predates the migration) to confirm ensureObligationAmendedEventType rebuilds it in place
// without losing the existing row, and that the widened table actually accepts the new type.
test("re-opening a database with the pre-ObligationAmended events schema migrates it without losing data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN (
          'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
          'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'DMRuling'
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
      );
      CREATE INDEX idx_events_game_date_sort ON events (game_date_sort);
      CREATE INDEX idx_events_type ON events (type);
      CREATE INDEX idx_events_region ON events (region);
    `);
    legacy.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, note, payload)
      VALUES ('DMRuling', 'Month 1, 1225', 1, '2025-01-01', 'a pre-migration event', '{}')
    `).run();
    legacy.close();

    const db = await openDb(dbPath);

    // The old row survived the rebuild with its content intact.
    const old = await db.prepare("SELECT * FROM events WHERE note = ?").get("a pre-migration event");
    assert.ok(old);
    assert.equal(old.type, "DMRuling");

    // The widened constraint actually accepts the new type now.
    const info = await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'").get();
    assert.match(info.sql, /ObligationAmended/);
    await db.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, payload)
      VALUES ('ObligationAmended', 'Month 1, 1225', 1, '2025-01-01', '{"obligationId":1,"changes":{}}')
    `).run();

    // Indexes survived the drop-and-rename.
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'events'").all();
    assert.deepEqual(indexes.map((i) => i.name).sort(), ["idx_events_game_date_sort", "idx_events_region", "idx_events_type"]);

    db.close();

    // Re-opening again must not error or duplicate anything (the migration is now a no-op).
    const reopened = await openDb(dbPath);
    const count = await reopened.prepare("SELECT COUNT(*) c FROM events").get();
    assert.equal(count.c, 2);
    reopened.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});
