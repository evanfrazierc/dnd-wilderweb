import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import {
  ValidationError,
  replaceBuildingCatalog,
  replaceResourceDefinitions,
  replaceCalendarStructure,
  replaceIntroduction,
} from "../../server/db/reference.js";

test("replaceBuildingCatalog replaces the whole catalog", async () => {
  const db = await openDb(":memory:");
  await db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires) VALUES ('Old Mill', 'Resources', 'old', '{}', '[]')
  `).run();

  await replaceBuildingCatalog(db, [
    { name: "Farm", category: "Resources", effect: "Generates food", cost: { Wood: 5 }, requires: [] },
    { name: "Mill", category: "Resources", effect: "Boosts farms", cost: {}, requires: ["Farm"] },
  ]);

  const rows = await db.prepare("SELECT * FROM building_catalog ORDER BY name").all();
  assert.deepEqual(rows.map((r) => r.name), ["Farm", "Mill"]);
  assert.equal(JSON.parse(rows[1].requires)[0], "Farm");
});

test("replaceBuildingCatalog rejects a duplicate name", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(
    () => replaceBuildingCatalog(db, [{ name: "Farm" }, { name: "Farm" }]),
    ValidationError,
  );
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM building_catalog").get()).c, 0);
});

test("replaceBuildingCatalog rejects a missing name", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(() => replaceBuildingCatalog(db, [{ category: "Resources" }]), ValidationError);
});

test("replaceResourceDefinitions adds a new resource with a zero baseline", async () => {
  const db = await openDb(":memory:");
  await replaceResourceDefinitions(db, [{ grp: "resources", name: "Wood", description: "Lumber" }]);

  const def = await db.prepare("SELECT * FROM resource_definitions WHERE name = 'Wood'").get();
  assert.equal(def.description, "Lumber");
  const total = await db.prepare("SELECT * FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(total.value, 0);
  assert.equal(total.grp, "resources");
});

test("replaceResourceDefinitions updates a description without touching the value", async () => {
  const db = await openDb(":memory:");
  await replaceResourceDefinitions(db, [{ grp: "resources", name: "Wood", description: "Lumber" }]);
  await db.prepare("UPDATE resource_totals SET value = 42 WHERE name = 'Wood'").run();

  await replaceResourceDefinitions(db, [{ grp: "resources", name: "Wood", description: "Timber" }]);

  assert.equal((await db.prepare("SELECT description FROM resource_definitions WHERE name = 'Wood'").get()).description, "Timber");
  assert.equal((await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get()).value, 42);
});

test("replaceResourceDefinitions removes a resource whose value is already zero", async () => {
  const db = await openDb(":memory:");
  await replaceResourceDefinitions(db, [{ grp: "resources", name: "Wood", description: "Lumber" }]);

  await replaceResourceDefinitions(db, []);

  assert.equal((await db.prepare("SELECT COUNT(*) c FROM resource_definitions").get()).c, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM resource_totals").get()).c, 0);
});

test("replaceResourceDefinitions refuses to remove a resource with a nonzero value", async () => {
  const db = await openDb(":memory:");
  await replaceResourceDefinitions(db, [{ grp: "resources", name: "Wood", description: "Lumber" }]);
  await db.prepare("UPDATE resource_totals SET value = 10 WHERE name = 'Wood'").run();

  await assert.rejects(() => replaceResourceDefinitions(db, []), ValidationError);
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM resource_definitions").get()).c, 1);
});

test("replaceResourceDefinitions rejects an unknown group", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(
    () => replaceResourceDefinitions(db, [{ grp: "bogus", name: "Wood" }]),
    ValidationError,
  );
});

test("replaceCalendarStructure replaces months and the calendar meta", async () => {
  const db = await openDb(":memory:");
  await replaceCalendarStructure(db, {
    era: "Test Era",
    daysPerMonth: 30,
    months: [
      { number: 1, name: "Firstmonth", season: "Spring", holidays: [{ day: 1, name: "New Year" }] },
    ],
  });

  const months = await db.prepare("SELECT * FROM calendar_months").all();
  assert.equal(months.length, 1);
  assert.equal(months[0].name, "Firstmonth");
  assert.deepEqual(JSON.parse(months[0].holidays), [{ day: 1, name: "New Year" }]);

  const meta = JSON.parse((await db.prepare("SELECT value FROM campaign_meta WHERE key = 'calendar_meta'").get()).value);
  assert.equal(meta.era, "Test Era");
  assert.equal(meta.daysPerMonth, 30);
});

test("replaceCalendarStructure rejects a duplicate month number", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(
    () => replaceCalendarStructure(db, { months: [{ number: 1, name: "A" }, { number: 1, name: "B" }] }),
    ValidationError,
  );
});

test("replaceIntroduction upserts the introduction document", async () => {
  const db = await openDb(":memory:");
  await replaceIntroduction(db, { postedBy: "DM", postedAt: "2026-01-01", paragraphs: ["Welcome."] });
  let row = JSON.parse((await db.prepare("SELECT value FROM campaign_meta WHERE key = 'introduction'").get()).value);
  assert.deepEqual(row.paragraphs, ["Welcome."]);

  await replaceIntroduction(db, { postedBy: "DM", postedAt: "2026-01-02", paragraphs: ["Welcome.", "More."] });
  row = JSON.parse((await db.prepare("SELECT value FROM campaign_meta WHERE key = 'introduction'").get()).value);
  assert.deepEqual(row.paragraphs, ["Welcome.", "More."]);
});

test("replaceIntroduction rejects a non-array paragraphs field", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(() => replaceIntroduction(db, { paragraphs: "not an array" }), ValidationError);
});
