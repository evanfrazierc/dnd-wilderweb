import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
