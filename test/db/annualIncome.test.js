import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { computeAnnualIncomeUpkeep } from "../../server/db/annualIncome.js";

async function insertBuilding(db, name, annualEffect) {
  await db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires, annual_effect)
    VALUES (?, 'Resources', '', '{}', '[]', ?)
  `).run(name, JSON.stringify(annualEffect ?? {}));
}

test("computeAnnualIncomeUpkeep returns no lines when no building has an annual effect", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Roads", {});
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Roads', 1)").run();

  const result = await computeAnnualIncomeUpkeep(db);
  assert.deepEqual(result.lines, []);
});

test("computeAnnualIncomeUpkeep multiplies a building's rate by its count", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Logging Camp", { Wood: 1 });
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Logging Camp', 4)").run();

  const result = await computeAnnualIncomeUpkeep(db);
  assert.deepEqual(result.lines, [{ resource: "Wood", net: 4, breakdown: ["+4 (4 × Logging Camp)"] }]);
});

test("computeAnnualIncomeUpkeep sums across buildings and settlements for the same resource", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Farm", { Food: 1 });
  await insertBuilding(db, "Fishing Dock", { Food: 1 });
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Farm', 3)").run();
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Narlmarches', 'Farm', 3)").run();
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Fishing Dock', 2)").run();

  const result = await computeAnnualIncomeUpkeep(db);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].resource, "Food");
  assert.equal(result.lines[0].net, 8); // 6 from Farm (3+3) + 2 from Fishing Dock
  assert.equal(result.lines[0].breakdown.length, 2);
});

test("computeAnnualIncomeUpkeep nets upkeep (negative) against income for the same resource", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Tavern", { Wealth: 1, Food: -1 });
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Tavern', 1)").run();

  const result = await computeAnnualIncomeUpkeep(db);
  const food = result.lines.find((l) => l.resource === "Food");
  assert.equal(food.net, -1);
  assert.equal(food.breakdown[0], "-1 (1 × Tavern)");
});

test("computeAnnualIncomeUpkeep ignores buildings with no settlement_buildings rows", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Logging Camp", { Wood: 1 });
  // No settlement_buildings row for it at all.
  const result = await computeAnnualIncomeUpkeep(db);
  assert.deepEqual(result.lines, []);
});

test("computeAnnualIncomeUpkeep sorts lines by resource name", async () => {
  const db = await openDb(":memory:");
  await insertBuilding(db, "Logging Camp", { Wood: 1 });
  await insertBuilding(db, "Quarry", { Stone: 1 });
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Logging Camp', 1)").run();
  await db.prepare("INSERT INTO settlement_buildings (settlement, building, count) VALUES ('Stirling Reach', 'Quarry', 1)").run();

  const result = await computeAnnualIncomeUpkeep(db);
  assert.deepEqual(result.lines.map((l) => l.resource), ["Stone", "Wood"]);
});
