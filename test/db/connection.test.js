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
// Deliberately still uses the old `region` column name below -- this fixture represents a
// database old enough to predate ObligationAmended, which is older than either rename
// (docs/adr/0014, docs/adr/0015) too, and ensureObligationAmendedEventType's own rebuild logic
// still hardcodes `region` for exactly that reason (see connection.js). ensureRegionRename runs
// right after it but is a no-op here (this fixture never had a `settlements` table), so the
// column asserted on below is simply still `region`, untouched.
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

    // Indexes survived the drop-and-rename (ensureObligationAmendedEventType's rebuild);
    // ensureRegionRename running right after it is a no-op on this fixture (never had a
    // `settlements` table), so idx_events_region is untouched.
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

// A genuine pre-ADR-0014 database (a real `regions` table that never went through the
// Settlement rename at all) is already in ensureRegionRename's target shape -- confirms its gate
// correctly treats this as a no-op rather than mistaking schema.sql's own bootstrap-created
// `regions` table (created moments earlier in the same initSchema call, before this migration's
// gate check runs) for a signal that a `settlements` table needs converting. Getting this gate
// wrong here is exactly the bug that made ensureSettlementRename unsafe to keep calling once
// schema.sql went back to creating `regions` (see the long comment on ensureSettlementRename in
// connection.js) -- it would have dropped and reconstructed this real, data-holding table for no
// reason on every single boot.
test("ensureRegionRename is a no-op on a genuine pre-ADR-0014 database (regions table, region columns)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        kingdom TEXT
      );
      CREATE TABLE events (
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
      );
      CREATE INDEX idx_events_region ON events (region);
      CREATE TABLE settlement_buildings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region TEXT NOT NULL,
        building TEXT NOT NULL,
        display_name TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        detail TEXT,
        UNIQUE (region, building)
      );
    `);
    legacy.prepare("INSERT INTO regions (name, description, kingdom) VALUES ('Old Hills', 'A hill region.', NULL)").run();
    legacy.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, region, payload)
      VALUES ('BuildingConstructed', 'Month 1, 1225', 1, '2025-01-01', 'Old Hills', '{"building":"Quarry"}')
    `).run();
    legacy.prepare("INSERT INTO settlement_buildings (region, building, count) VALUES ('Old Hills', 'Quarry', 1)").run();
    legacy.close();

    const db = await openDb(dbPath);

    // The table is untouched, still named `regions`, with the real row intact.
    const regions = await db.prepare("SELECT * FROM regions").all();
    assert.equal(regions.length, 1);
    assert.equal(regions[0].name, "Old Hills");

    // No `settlements` table was ever created as an intermediate step.
    const settlementsTable = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settlements'").get();
    assert.equal(settlementsTable, undefined);

    // events.region is untouched, data intact.
    const event = await db.prepare("SELECT region, payload FROM events WHERE type = 'BuildingConstructed'").get();
    assert.equal(event.region, "Old Hills");
    assert.deepEqual(JSON.parse(event.payload), { building: "Quarry" });

    // settlement_buildings.region is untouched, data intact.
    const building = await db.prepare("SELECT region, building, count FROM settlement_buildings").get();
    assert.deepEqual(building, { region: "Old Hills", building: "Quarry", count: 1 });

    db.close();

    // Reopening again must not error or duplicate anything.
    const reopened = await openDb(dbPath);
    const count = await reopened.prepare("SELECT COUNT(*) c FROM regions").get();
    assert.equal(count.c, 1);
    reopened.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

// ensureRegionRename (docs/adr/0015) is what actually matters against this project's real
// databases today: after ADR-0014 shipped, both local dev and production genuinely have a
// `settlements` table with a `settlement` column, never having seen a `regions` table at all.
// This builds exactly that shape (not the genuine-pre-ADR-0014 fixture above, which round-trips
// through an intermediate rename it never really needs) to confirm ensureRegionRename converts
// it correctly on its own -- and to guard against the same class of bug ensureSettlementRename
// hit in the other direction: schema.sql's own `CREATE TABLE IF NOT EXISTS regions` runs before
// this migration and doesn't recognize `settlements` as "already existing" (different name), so
// without the DROP TABLE IF EXISTS fix it would silently create a second, empty `regions` table
// that collides with the rename target.
test("ensureRegionRename migrates a real post-ADR-0014 database (settlements table, settlement columns) without losing data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        kingdom TEXT
      );
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN (
          'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
          'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'ObligationAmended', 'DMRuling'
        )),
        game_date_raw TEXT NOT NULL,
        game_date_sort INTEGER NOT NULL,
        posted_at TEXT NOT NULL,
        actor TEXT,
        settlement TEXT,
        note TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        warnings TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_events_settlement ON events (settlement);
      CREATE TABLE settlement_buildings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        settlement TEXT NOT NULL,
        building TEXT NOT NULL,
        display_name TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        detail TEXT,
        UNIQUE (settlement, building)
      );
    `);
    legacy.prepare("INSERT INTO settlements (name, description, kingdom) VALUES ('Old Hills', 'A hill settlement.', NULL)").run();
    legacy.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, settlement, payload)
      VALUES ('BuildingConstructed', 'Month 1, 1225', 1, '2025-01-01', 'Old Hills', '{"building":"Quarry"}')
    `).run();
    legacy.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Old Hills', 'Quarry', 1)").run();
    legacy.close();

    const db = await openDb(dbPath);

    // The table was renamed, and the real row survived.
    const regions = await db.prepare("SELECT * FROM regions").all();
    assert.equal(regions.length, 1);
    assert.equal(regions[0].name, "Old Hills");

    // The old table name is gone.
    const oldTable = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settlements'").get();
    assert.equal(oldTable, undefined);

    // events.settlement survived as events.region, with its data intact.
    const event = await db.prepare("SELECT region, payload FROM events WHERE type = 'BuildingConstructed'").get();
    assert.equal(event.region, "Old Hills");
    assert.deepEqual(JSON.parse(event.payload), { building: "Quarry" });

    // settlement_buildings.settlement survived as .region, with its data intact.
    const building = await db.prepare("SELECT region, building, count FROM settlement_buildings").get();
    assert.deepEqual(building, { region: "Old Hills", building: "Quarry", count: 1 });

    db.close();

    // Reopening again must not error or duplicate anything.
    const reopened = await openDb(dbPath);
    const count = await reopened.prepare("SELECT COUNT(*) c FROM regions").get();
    assert.equal(count.c, 1);
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
    await insertEvent(99, "DMRuling", "Browser automation smoke test: DM clarification note, no resource changes.", "Month 2, 4th, 1227", 441753);
    await insertEvent(100, "BuildingConstructed", "Constructed via the Settlements view", "Month 2, 4th, 1227", 441753);
    await insertEvent(101, "BuildingRemoved", "Cleanup: removing browser-automation test building", "Month 2, 4th, 1227", 441753);
    await insertEvent(102, "CalendarAdvanced", "Browser automation smoke test", "Month 2, 4th, 1227", 441753);
    await insertEvent(106, "BuildingConstructed", "Constructed via the Settlements view", "Month 2, 4th, 1227", 441753);
    await insertEvent(107, "BuildingRemoved", "Removed via the Settlements view", "Month 2, 4th, 1227", 441753);
    await insertEvent(108, "CalendarAdvanced", "Nothing happened…", "Month 2, 5th, 1227", 441754);
    await insertEvent(109, "CalendarAdvanced", "Going back", "Month 2, 4th, 1227", 441753);

    // The three corrupted ResourceChanged events.
    await insertEvent(98, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":1}}');
    await insertEvent(104, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":2}}');
    await insertEvent(105, "ResourceChanged", null, "2026-08-23", 729360, '{"changes":{"Wood":-1}}');

    // Real, original-migration events dated ahead of the campaign's current date -- the DM
    // asked for these moved into the past (see chat log), not deleted or treated as corrupted.
    await insertEvent(46, "ResourceChanged", "Market Trade", "Shelune (3), 1227", 441772, '{"changes":{"Iron":-1,"Wealth":1}}');
    await insertEvent(47, "ResourceChanged", "Forge Tool at Smithy", "Shelune (3), 1227", 441772, '{"changes":{"Iron":-1,"Tools":1}}');

    // A real deity note, then a test artifact (id 103) overwriting it -- the same shape as the
    // live Calistria corruption this correction fixes.
    await insertEvent(94, "DeityAmended", null, "Month 2, 3th, 1227", 441752, JSON.stringify({ name: "Calistria", changes: { note: "Holy days: real note." } }));
    await insertEvent(103, "DeityAmended", "Amended via the Codex", "Month 2, 4th, 1227", 441753, JSON.stringify({ name: "Calistria", changes: { note: "Holy days: real note. [browser test note]" } }));
    await db.prepare(`
      INSERT INTO deities (name, note) VALUES ('Calistria', 'Holy days: real note. [browser test note]')
    `).run();

    db.close();

    const reopened = await openDb(dbPath);

    for (const id of [99, 100, 101, 102, 103, 106, 107, 108, 109]) {
      const row = await reopened.prepare("SELECT id FROM events WHERE id = ?").get(id);
      assert.equal(row, undefined, `event ${id} should have been deleted`);
    }

    const calistria = await reopened.prepare("SELECT note FROM deities WHERE name = 'Calistria'").get();
    assert.equal(calistria.note, "Holy days: real note."); // the test suffix is gone

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

    for (const id of [46, 47]) {
      const row = await reopened.prepare("SELECT game_date_raw FROM events WHERE id = ?").get(id);
      assert.equal(row.game_date_raw, "Erastus (2), 3rd, 1227"); // moved into the past
    }
    // Its note (what actually happened) is untouched -- only the sort date moved.
    const market = await reopened.prepare("SELECT note FROM events WHERE id = 46").get();
    assert.equal(market.note, "Market Trade");

    reopened.close();

    // Reopening a third time must not error or re-apply anything already fixed.
    const thirdOpen = await openDb(dbPath);
    const count = await thirdOpen.prepare("SELECT COUNT(*) c FROM events").get();
    assert.equal(count.c, 7); // 79, 94, 98, 104, 105, 46, 47 remain -- the nine test artifacts are gone
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
// suffixes, a month range, the DM-supplied correction for real-world "as of" dates) plus the
// one thing it deliberately leaves alone (a bare year -- docs/adr/0016).
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
    await db.prepare("INSERT INTO calendar_months (number, name) VALUES (1, 'Pelorune'), (2, 'Erastus'), (6, 'Meloron')").run();

    await insertEvent(1, "Month 2, 3th, 1227", 441752); // wrong ordinal suffix
    await insertEvent(2, "Month 2, 1227", 441751); // numeric, no day -- day becomes a placeholder "1st"
    await insertEvent(3, "Pelorune (1) 16, 1225", 441015); // old named, no comma, has day
    await insertEvent(4, "Pelorune (1), 1226", 441360); // old named, no day -- day becomes a placeholder "1st"
    await insertEvent(5, "Erastus (2), 3rd, 1227", 441752); // already the target shape
    await insertEvent(6, "2025-09-14", 729000); // real-world "as of" date, DM-supplied correction
    await insertEvent(7, "1225", 441000); // bare year -- no month recorded, left alone
    await insertEvent(8, "Month 6 to Month 12, 1226", 441510); // range -- collapses to its first month, day 1

    // obligations.due_game_date_raw is the same kind of string in a separate table.
    await db.prepare(`
      INSERT INTO obligations (id, description, repayment_resource, amount_total, amount_remaining, due_game_date_raw, due_game_date_sort)
      VALUES (1, 'Test loan', 'Wealth', 50, 50, 'Month 2, 3th, 1227', 441752)
    `).run();

    db.close();

    const reopened = await openDb(dbPath);
    const raw = async (id) => (await reopened.prepare("SELECT game_date_raw FROM events WHERE id = ?").get(id)).game_date_raw;

    assert.equal(await raw(1), "Erastus (2), 3rd, 1227");
    assert.equal(await raw(2), "Erastus (2), 1st, 1227");
    assert.equal(await raw(3), "Pelorune (1), 16th, 1225");
    assert.equal(await raw(4), "Pelorune (1), 1st, 1226");
    assert.equal(await raw(5), "Erastus (2), 3rd, 1227"); // unchanged (was already correct)
    assert.equal(await raw(6), "Erastus (2), 3rd, 1227");
    assert.equal(await raw(7), "1225"); // untouched -- no month recorded to build a real date from
    assert.equal(await raw(8), "Meloron (6), 1st, 1226");

    // The sort key was recomputed to match the new string, not left stale.
    const row1 = await reopened.prepare("SELECT game_date_sort FROM events WHERE id = 1").get();
    const expected = await reopened.prepare("SELECT game_date_sort FROM events WHERE id = 5").get();
    assert.equal(row1.game_date_sort, expected.game_date_sort); // 1 and 5 now represent the same date

    const obligation = await reopened.prepare("SELECT due_game_date_raw, due_game_date_sort FROM obligations WHERE id = 1").get();
    assert.equal(obligation.due_game_date_raw, "Erastus (2), 3rd, 1227");
    assert.equal(obligation.due_game_date_sort, row1.game_date_sort);

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

// ensureCurrentDateAdvancedPastRealActivity restores the campaign's current date to Erastus
// 4th once it finds the specific real activity (id 113's exact signature) that had been dated
// there before a test CalendarAdvanced entry setting that same date got cleaned up -- gated
// tightly enough that a database without that exact content (this project's own local dev
// copy, which has unrelated rows at these ids) must never fire it.
test("ensureCurrentDateAdvancedPastRealActivity advances calendar_state and inserts a real CalendarAdvanced event once it finds the real activity it's restoring for", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);
    await db.prepare(`
      INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, note, payload)
      VALUES (79, 'CalendarAdvanced', 'Erastus (2), 3rd, 1227', 441752, '2026-01-01', 'Imported from calendar.json', '{"year":1227,"month":2,"day":3}')
    `).run();
    await db.prepare(`
      INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, note, payload)
      VALUES (113, 'ResourceChanged', 'Erastus (2), 4th, 1227', 441753, '2026-01-01', 'Testing loan repayment', '{"changes":{"Wealth":-2}}')
    `).run();
    await db.prepare(`
      INSERT INTO calendar_state (id, year, year_label, month, day, note) VALUES (1, 1227, 'YEAR THREE', 2, 3, NULL)
    `).run();
    db.close();

    const reopened = await openDb(dbPath);

    const state = await reopened.prepare("SELECT year, month, day FROM calendar_state WHERE id = 1").get();
    assert.deepEqual(state, { year: 1227, month: 2, day: 4 });

    const inserted = await reopened.prepare("SELECT type, game_date_raw FROM events WHERE type = 'CalendarAdvanced' ORDER BY id DESC LIMIT 1").get();
    assert.equal(inserted.game_date_raw, "Erastus (2), 4th, 1227");

    reopened.close();

    // Reopening again must not insert a second advance event.
    const thirdOpen = await openDb(dbPath);
    const count = await thirdOpen.prepare("SELECT COUNT(*) c FROM events WHERE type = 'CalendarAdvanced'").get();
    assert.equal(count.c, 2); // the original (id 79) plus exactly one restoration
    thirdOpen.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

test("ensureCurrentDateAdvancedPastRealActivity does nothing on a database without that specific real activity", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);
    // id 113 exists, but with unrelated content -- must not be mistaken for the real activity.
    await db.prepare(`
      INSERT INTO events (id, type, game_date_raw, game_date_sort, posted_at, note, payload)
      VALUES (113, 'DeityAmended', 'Erastus (2), 9th, 1227', 441758, '2026-01-01', 'some other note entirely', '{}')
    `).run();
    db.close();

    const reopened = await openDb(dbPath);
    const count = await reopened.prepare("SELECT COUNT(*) c FROM events WHERE type = 'CalendarAdvanced'").get();
    assert.equal(count.c, 0); // no restoration event inserted
    reopened.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});

// ensureStaleAsOfNoteCleared strips stats_meta.asOfNote (a migration-era field the Dashboard
// no longer displays) without touching the rest of that JSON document.
test("ensureStaleAsOfNoteCleared removes asOfNote from stats_meta, leaving other fields intact", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wilderweb-test-"));
  const dbPath = path.join(dir, "test.db");
  try {
    const db = await openDb(dbPath);
    await db.prepare(`
      INSERT INTO campaign_meta (key, value) VALUES ('stats_meta', ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify({ settlement: "Stirling Reach", asOf: "2026-08-23", asOfNote: "Stale note." }));
    db.close();

    const reopened = await openDb(dbPath);
    const row = await reopened.prepare("SELECT value FROM campaign_meta WHERE key = 'stats_meta'").get();
    const meta = JSON.parse(row.value);
    assert.equal("asOfNote" in meta, false);
    assert.equal(meta.settlement, "Stirling Reach");
    assert.equal(meta.asOf, "2026-08-23");
    reopened.close();

    // Reopening again must not error (nothing left to clear).
    const thirdOpen = await openDb(dbPath);
    thirdOpen.close();
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // leaked temp dir under the OS temp root; not worth failing the test over.
    }
  }
});
