import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent } from "../../server/db/events.js";

async function freshDb() {
  const db = await openDb(":memory:");
  await db.prepare(`
    INSERT INTO unit_catalog (name, cost, upkeep, combat_bonus, requires)
    VALUES ('Militia', '{"Food":1}', '{}', 0, '[]')
  `).run();
  await db.prepare(`
    INSERT INTO unit_catalog (name, cost, upkeep, combat_bonus, requires)
    VALUES ('Guard', '{"Food":1,"Weapons":1}', '{"Food":1}', 1, '["Barracks"]')
  `).run();
  return db;
}

test("UnitRaised requires payload.unit", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: {},
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /payload\.unit/);
});

test("UnitRaised does not require a region, unlike BuildingConstructed", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Militia" },
  });
  assert.equal(result.ok, true);
});

test("UnitRaised records the unit and warns on an unmet prerequisite", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Guard" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /requires "Barracks", not yet built anywhere/);
  const row = await db.prepare("SELECT * FROM garrison_units WHERE unit = 'Guard'").get();
  assert.equal(row.count, 1);
});

test("UnitRaised with its prerequisite present raises no warning", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Stirling Reach",
    payload: { building: "Barracks" },
  });
  const result = await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Guard" },
  });
  assert.deepEqual(result.warnings, []);
});

test("UnitRaised warns when the unit isn't in the catalog, same as an uncatalogued building", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Mercenary" },
  });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /not in the unit catalog/);
});

test("UnitRaised accepts an optional detail", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225",
    payload: { unit: "Militia", detail: "House Elmander guards" },
  });
  const row = await db.prepare("SELECT detail FROM garrison_units WHERE unit = 'Militia'").get();
  assert.equal(row.detail, "House Elmander guards");
});

test("repeated UnitRaised events accumulate count rather than overwriting it", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Militia", count: 2 } });
  await createEvent(db, { type: "UnitRaised", gameDate: "Erastus (2), 1st, 1225", payload: { unit: "Militia", count: 1 } });
  const row = await db.prepare("SELECT count FROM garrison_units WHERE unit = 'Militia'").get();
  assert.equal(row.count, 3);
});

test("UnitLost warns when losing more than are recorded in the garrison", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Militia", count: 1 } });
  const result = await createEvent(db, {
    type: "UnitLost", gameDate: "Erastus (2), 1st, 1225", payload: { unit: "Militia", count: 2 },
  });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /Losing more "Militia" than are recorded/);
});

test("UnitLost decrements the count without removing the row when count remains positive", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Militia", count: 3 } });
  await createEvent(db, { type: "UnitLost", gameDate: "Erastus (2), 1st, 1225", payload: { unit: "Militia", count: 1 } });
  const row = await db.prepare("SELECT count FROM garrison_units WHERE unit = 'Militia'").get();
  assert.equal(row.count, 2);
});

test("UnitLost removes the row once its count reaches zero", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "UnitRaised", gameDate: "Pelorune (1), 1st, 1225", payload: { unit: "Militia", count: 1 } });
  await createEvent(db, { type: "UnitLost", gameDate: "Erastus (2), 1st, 1225", payload: { unit: "Militia", count: 1 } });
  const row = await db.prepare("SELECT * FROM garrison_units WHERE unit = 'Militia'").get();
  assert.equal(row, undefined);
});
