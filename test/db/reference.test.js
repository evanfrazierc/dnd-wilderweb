import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import {
  ValidationError,
  replaceBuildingCatalog,
  replaceResourceDefinitions,
  replaceCalendarStructure,
  replaceIntroduction,
  readRegions,
  replaceRegions,
  ensureRegionsSeeded,
  ensureKingdomsSeeded,
  migrateKingdomPlacesToRegions,
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

test("replaceRegions adds a new region", async () => {
  const db = await openDb(":memory:");
  await replaceRegions(db, [{ name: "Stirling Reach", description: "The party's settlement." }]);
  const regions = await readRegions(db);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, "Stirling Reach");
  assert.equal(regions[0].description, "The party's settlement.");
});

test("replaceRegions optionally assigns a region to a kingdom by name", async () => {
  const db = await openDb(":memory:");
  await replaceRegions(db, [{ name: "Stirling Reach", kingdom: "Kingdom of Casdenia" }]);
  let [region] = await readRegions(db);
  assert.equal(region.kingdom, "Kingdom of Casdenia");

  await replaceRegions(db, [{ id: region.id, name: "Stirling Reach", kingdom: null }]);
  [region] = await readRegions(db);
  assert.equal(region.kingdom, null);
});

test("replaceRegions rejects a duplicate name", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(
    () => replaceRegions(db, [{ name: "Stirling Reach" }, { name: "Stirling Reach" }]),
    ValidationError,
  );
});

test("replaceRegions renaming (by id) cascades to every building currently in it", async () => {
  const db = await openDb(":memory:");
  await replaceRegions(db, [{ name: "Old Hills" }]);
  const [region] = await readRegions(db);
  await db.prepare("INSERT INTO settlement_buildings (region, building, count) VALUES ('Old Hills', 'Quarry', 1)").run();

  await replaceRegions(db, [{ id: region.id, name: "New Hills" }]);

  const regions = await readRegions(db);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, "New Hills");
  const building = await db.prepare("SELECT region FROM settlement_buildings WHERE building = 'Quarry'").get();
  assert.equal(building.region, "New Hills");
});

test("replaceRegions refuses to remove a region that still has buildings", async () => {
  const db = await openDb(":memory:");
  await replaceRegions(db, [{ name: "Old Hills" }]);
  await db.prepare("INSERT INTO settlement_buildings (region, building, count) VALUES ('Old Hills', 'Quarry', 1)").run();

  await assert.rejects(() => replaceRegions(db, []), ValidationError);
  assert.equal((await readRegions(db)).length, 1);
});

test("replaceRegions removes a region with no buildings", async () => {
  const db = await openDb(":memory:");
  await replaceRegions(db, [{ name: "Old Hills" }]);
  await replaceRegions(db, []);
  assert.equal((await readRegions(db)).length, 0);
});

test("ensureRegionsSeeded seeds from wilderlandsRegions and settlement_buildings, and is idempotent", async () => {
  const db = await openDb(":memory:");
  await db.prepare("INSERT INTO locations_state (id, data) VALUES (1, ?)").run(
    JSON.stringify({ wilderlandsRegions: [{ name: "Stirling Reach", description: "Capital." }] }),
  );
  await db.prepare("INSERT INTO settlement_buildings (region, building, count) VALUES ('Narlmarches', 'Farm', 1)").run();

  await ensureRegionsSeeded(db);
  let regions = await readRegions(db);
  assert.deepEqual(regions.map((r) => r.name).sort(), ["Narlmarches", "Stirling Reach"]);
  assert.equal(regions.find((r) => r.name === "Stirling Reach").description, "Capital.");

  // Second call must not clobber a DM edit made after the first seed.
  await replaceRegions(db, regions.map((r) => (r.name === "Narlmarches" ? { ...r, description: "Edited" } : r)));
  await ensureRegionsSeeded(db);
  regions = await readRegions(db);
  assert.equal(regions.length, 2);
  assert.equal(regions.find((r) => r.name === "Narlmarches").description, "Edited");
});

test("ensureKingdomsSeeded seeds kingdoms and turns each kingdom's old `other` places into Regions claiming it, and is idempotent", async () => {
  const db = await openDb(":memory:");
  await db.prepare("INSERT INTO locations_state (id, data) VALUES (1, ?)").run(
    JSON.stringify({
      kingdoms: [
        {
          name: "Kingdom of Casdenia",
          capital: "Royal City of Casdenor",
          counties: [{ name: "County of Arnestal", seat: "City of Arnestal" }],
          other: [{ name: "Olen's Rest", type: "Landmark" }],
        },
        { name: "Kingdom of Galderoy", capital: null, counties: [], other: [], note: "No locations posted yet." },
      ],
    }),
  );

  await ensureKingdomsSeeded(db);
  let rows = await db.prepare("SELECT * FROM kingdoms ORDER BY name").all();
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.name === "Kingdom of Casdenia").capital, "Royal City of Casdenor");
  assert.equal(rows.find((r) => r.name === "Kingdom of Galderoy").note, "No locations posted yet.");

  const regions = await readRegions(db);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, "Olen's Rest");
  assert.equal(regions[0].description, "Landmark");
  assert.equal(regions[0].kingdom, "Kingdom of Casdenia");

  // Second call must not clobber a DM edit made after the first seed.
  await db.prepare("UPDATE kingdoms SET note = ? WHERE name = ?").run("Edited", "Kingdom of Galderoy");
  await ensureKingdomsSeeded(db);
  rows = await db.prepare("SELECT * FROM kingdoms").all();
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.name === "Kingdom of Galderoy").note, "Edited");
});

test("migrateKingdomPlacesToRegions turns an already-seeded kingdom's places column into Regions, and is idempotent", async () => {
  const db = await openDb(":memory:");
  await db.prepare("ALTER TABLE kingdoms ADD COLUMN places TEXT NOT NULL DEFAULT '[]'").run();
  await db.prepare("INSERT INTO kingdoms (name, capital, places) VALUES (?, ?, ?)").run(
    "Kingdom of Casdenia", "Royal City of Casdenor", JSON.stringify([{ name: "Olen's Rest", type: "Landmark" }]),
  );

  await migrateKingdomPlacesToRegions(db);
  let regions = await readRegions(db);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].name, "Olen's Rest");
  assert.equal(regions[0].kingdom, "Kingdom of Casdenia");

  // Second call must not create a duplicate region.
  await migrateKingdomPlacesToRegions(db);
  regions = await readRegions(db);
  assert.equal(regions.length, 1);
});

test("migrateKingdomPlacesToRegions is a no-op when kingdoms has no places column", async () => {
  const db = await openDb(":memory:");
  await db.prepare("INSERT INTO kingdoms (name) VALUES (?)").run("Kingdom of Casdenia");
  await migrateKingdomPlacesToRegions(db);
  assert.equal((await readRegions(db)).length, 0);
});
