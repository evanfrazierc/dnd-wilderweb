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

// ensureKnownDataCorrections (server/db/connection.js) is a one-time cleanup of specific rows
// discovered in the live campaign log: a testing session's leftover events, and a handful of
// ResourceChanged events whose gameDate got corrupted into a real-world date by the (since
// fixed) Dashboard stats.asOf bug. This reproduces that exact shape in a fresh temp DB, opens
// it (which finds nothing to do -- the target rows don't exist yet), inserts them, then
// reopens (which is when the migration actually fires), same two-open pattern as the
// ObligationAmended test above.
test("ensureKnownDataCorrections removes known test artifacts and corrects the three corrupted ResourceChanged dates", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);

    async function insertEvent(id, type, note, gameDateRaw, gameDateSort, payload = "{}") {
      await db.prepare(`
        INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, note, payload)
        VALUES (?, ?, ?, ?, '2026-01-01', ?, ?)
      `).run(id, type, gameDateRaw, gameDateSort, note, payload);
    }

    // The original migration's real calendar entry -- the anchor the correction restores
    // calendar_state to once the test CalendarAdvanced entries below are removed.
    await insertEvent(
      79, "CalendarAdvanced", "Imported from calendar.json", "Month 2, 3th, 1227", 441752,
      JSON.stringify({ year: 1227, yearLabel: "YEAR THREE", month: 2, day: 3, note: "You are here" }),
    );
    await db.prepare(`
      INSERT INTO calendar_state (id, year, year_label, month, day, note)
      VALUES (1, 1227, 'YEAR THREE', 2, 5, 'stale test value')
    `).run();

    // The known test artifacts.
    await insertEvent(102, "CalendarAdvanced", "Browser automation smoke test", "Month 2, 4th, 1227", 441753);
    await insertEvent(106, "BuildingConstructed", "Constructed via the Settlements view", "Month 2, 4th, 1227", 441753);
    await insertEvent(107, "BuildingRemoved", "Removed via the Settlements view", "Month 2, 4th, 1227", 441753);
    await insertEvent(108, "CalendarAdvanced", "Nothing happened…", "Month 2, 5th, 1227", 441754);
    await insertEvent(109, "CalendarAdvanced", "Going back", "Month 2, 4th, 1227", 441753);

    // The three corrupted ResourceChanged events.
    await insertEvent(98, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":1}}');
    await insertEvent(104, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":2}}');
    await insertEvent(105, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":-1}}');

    db.close();

    const reopened = await openDb(dbPath);

    for (const id of [102, 106, 107, 108, 109]) {
      const row = await reopened.prepare("SELECT id FROM events WHERE id = ?").get(id);
      assert.equal(row, undefined, `event ${id} should have been deleted`);
    }

    const state = await reopened.prepare("SELECT * FROM calendar_state WHERE id = 1").get();
    assert.deepEqual(
      { year: state.year, year_label: state.year_label, month: state.month, day: state.day },
      { year: 1227, year_label: "YEAR THREE", month: 2, day: 3 },
    );

    for (const id of [98, 104, 105]) {
      const row = await reopened.prepare("SELECT game_date_raw, game_date_sort FROM events WHERE id = ?").get(id);
      assert.equal(row.game_date_raw, "Erastus (2), 3rd, 1227");
      assert.ok(row.game_date_sort < 729360); // no longer sorts as a fake future date
    }

    // The original resource deltas were never touched -- only the date.
    const still = await reopened.prepare("SELECT payload FROM events WHERE id = 104").get();
    assert.deepEqual(JSON.parse(still.payload), { changes: { Wood: 2 } });

    reopened.close();

    // Reopening a third time must not error or re-apply anything already fixed.
    const thirdOpen = await openDb(dbPath);
    const count = await thirdOpen.prepare("SELECT COUNT(*) c FROM events").get();
    assert.equal(count.c, 4); // 79, 98, 104, 105 -- the five test artifacts are gone
    thirdOpen.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

// The recovered calendar_state must reflect whatever CalendarAdvanced event is actually left
// after cleanup, not always fall back to event 79 -- a database with its own separate, real
// (non-test) calendar advance beyond id 79 must keep it, not get silently reverted.
test("ensureKnownDataCorrections' calendar_state recovery keeps a real CalendarAdvanced event that isn't one of the known test artifacts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);

    async function insertEvent(id, type, note, gameDateRaw, gameDateSort, payload = "{}") {
      await db.prepare(`
        INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, note, payload)
        VALUES (?, ?, ?, ?, '2026-01-01', ?, ?)
      `).run(id, type, gameDateRaw, gameDateSort, note, payload);
    }

    await insertEvent(
      79, "CalendarAdvanced", "Imported from calendar.json", "Month 2, 3th, 1227", 441752,
      JSON.stringify({ year: 1227, yearLabel: "YEAR THREE", month: 2, day: 3, note: "You are here" }),
    );
    // The one known-bad test artifact this database happens to also carry.
    await insertEvent(102, "CalendarAdvanced", "Browser automation smoke test", "Month 2, 4th, 1227", 441753);
    // A real, later calendar advance -- not on the known-artifact list, so it must survive.
    await insertEvent(
      150, "CalendarAdvanced", "Advanced in session", "Month 2, 9th, 1227", 441758,
      JSON.stringify({ year: 1227, yearLabel: "YEAR THREE", month: 2, day: 9, note: null }),
    );
    await db.prepare(`
      INSERT INTO calendar_state (id, year, year_label, month, day, note)
      VALUES (1, 1227, 'YEAR THREE', 2, 9, NULL)
    `).run();

    db.close();

    const reopened = await openDb(dbPath);

    const artifact = await reopened.prepare("SELECT id FROM events WHERE id = 102").get();
    assert.equal(artifact, undefined);

    const real = await reopened.prepare("SELECT id FROM events WHERE id = 150").get();
    assert.ok(real, "the real, non-test calendar advance must not be deleted");

    const state = await reopened.prepare("SELECT year, month, day FROM calendar_state WHERE id = 1").get();
    assert.deepEqual(state, { year: 1227, month: 2, day: 9 }); // still the real advance, not reverted to event 79

    reopened.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

// ensureConsistentDateFormatting normalizes every event's gameDate string to one shape without
// changing what date anything actually represents -- covers every bucket found in the real
// campaign log (numeric with/without day, old-style named with/without day, wrong ordinal
// suffixes, the DM-supplied correction for real-world "as of" dates) plus the two things it
// deliberately leaves alone (bare years, a month range).
test("ensureConsistentDateFormatting normalizes every known date shape to one consistent format", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);

    async function insertEvent(id, gameDateRaw, gameDateSort) {
      await db.prepare(`
        INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, payload)
        VALUES (?, 'DMRuling', ?, ?, '2026-01-01', '{}')
      `).run(id, gameDateRaw, gameDateSort);
    }

    // The migration needs month names to reformat with -- only months referenced below.
    await db.prepare("INSERT INTO calendar_months (number, name) VALUES (1, 'Pelorune'), (2, 'Erastus')").run();

    await insertEvent(1, "Month 2, 3th, 1227", 441752); // wrong ordinal suffix
    await insertEvent(2, "Month 2, 1227", 441751); // numeric, no day
    await insertEvent(3, "Pelorune (1) 16, 1225", 441015); // old named, no comma, has day
    await insertEvent(4, "Pelorune (1), 1226", 441360); // old named, no day
    await insertEvent(5, "Erastus (2), 3rd, 1227", 441752); // already the target shape
    await insertEvent(6, "2025-09-14", 729000); // real-world "as of" date, DM-supplied correction
    await insertEvent(7, "1225", 441000); // bare year -- left alone
    await insertEvent(8, "Month 6 to Month 12, 1226", 441510); // range -- left alone
    db.close();

    const reopened = await openDb(dbPath);
    const raw = async (id) => (await reopened.prepare("SELECT game_date_raw FROM events WHERE id = ?").get(id)).game_date_raw;

    assert.equal(await raw(1), "Erastus (2), 3rd, 1227");
    assert.equal(await raw(2), "Erastus (2), 1227");
    assert.equal(await raw(3), "Pelorune (1), 16th, 1225");
    assert.equal(await raw(4), "Pelorune (1), 1226");
    assert.equal(await raw(5), "Erastus (2), 3rd, 1227"); // unchanged (was already correct)
    assert.equal(await raw(6), "Erastus (2), 3rd, 1227");
    assert.equal(await raw(7), "1225"); // untouched
    assert.equal(await raw(8), "Month 6 to Month 12, 1226"); // untouched

    // The sort key was recomputed to match the new string, not left stale.
    const row1 = await reopened.prepare("SELECT game_date_sort FROM events WHERE id = 1").get();
    const expected = await reopened.prepare("SELECT game_date_sort FROM events WHERE id = 5").get();
    assert.equal(row1.game_date_sort, expected.game_date_sort); // 1 and 5 now represent the same date

    reopened.close();

    // Reopening again must not error or drift the already-normalized strings further.
    const thirdOpen = await openDb(dbPath);
    assert.equal((await thirdOpen.prepare("SELECT game_date_raw FROM events WHERE id = 1").get()).game_date_raw, "Erastus (2), 3rd, 1227");
    thirdOpen.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});
