import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent, listEvents } from "../../server/db/events.js";
import { getObligation } from "../../server/db/obligations.js";

async function freshDb() {
  const db = await openDb(":memory:");
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wood', 10)").run();
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Stone', 5)").run();
  await db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires)
    VALUES ('Farm', 'Resources', 'Generates food', '{}', '[]')
  `).run();
  await db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires)
    VALUES ('Mill', 'Resources', 'Boosts farms', '{}', '["Farm"]')
  `).run();
  return db;
}

test("ResourceChanged applies its delta to the projection", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", actor: "DM", payload: { changes: { Wood: -3 } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  const row = await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 7);
});

test("ResourceChanged warns but still applies when it would go negative (ADR-0005)", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: { Wood: -20 } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Wood would go negative/);
  const row = await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, -10);
});

test("ResourceChanged rejects an empty changes object", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: {} },
  });
  assert.equal(result.ok, false);
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM events").get()).c, 0);
});

test("DMRuling requires a note and must not carry changes", async () => {
  const db = await freshDb();
  const missingNote = await createEvent(db, { type: "DMRuling", gameDate: "1225", payload: {} });
  assert.equal(missingNote.ok, false);

  const withChanges = await createEvent(db, {
    type: "DMRuling", gameDate: "1225", note: "Mills don't stack", payload: { changes: { Wood: 1 } },
  });
  assert.equal(withChanges.ok, false);

  const valid = await createEvent(db, { type: "DMRuling", gameDate: "1225", note: "Mills don't stack", payload: {} });
  assert.equal(valid.ok, true);
  const row = await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 10, "a DMRuling must not touch projections");
});

test("BuildingConstructed records the building and warns on an unmet prerequisite", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingConstructed", gameDate: "1225", region: "Stirling Reach",
    payload: { building: "Mill" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /requires "Farm"/);
  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE region = 'Stirling Reach' AND building = 'Mill'").get();
  assert.equal(row.count, 1);
});

test("BuildingConstructed with its prerequisite present raises no warning", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "BuildingConstructed", gameDate: "1225", region: "Stirling Reach", payload: { building: "Farm" } });
  const result = await createEvent(db, { type: "BuildingConstructed", gameDate: "1226", region: "Stirling Reach", payload: { building: "Mill" } });
  assert.deepEqual(result.warnings, []);
});

test("BuildingConstructed accepts an optional displayName alongside the catalog name", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "BuildingConstructed", gameDate: "1225", region: "Old Hills",
    payload: { building: "Farm", displayName: "Anora's Roost" },
  });
  const row = await db.prepare("SELECT display_name FROM settlement_buildings WHERE region = 'Old Hills'").get();
  assert.equal(row.display_name, "Anora's Roost");
});

test("BuildingAmended updates displayName and detail without touching count", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "BuildingConstructed", gameDate: "1225", region: "Old Hills", payload: { building: "Farm", count: 3 } });

  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "1226", region: "Old Hills",
    payload: { building: "Farm", changes: { displayName: "Anora's Roost", detail: "Watch post" } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);

  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE region = 'Old Hills' AND building = 'Farm'").get();
  assert.equal(row.display_name, "Anora's Roost");
  assert.equal(row.detail, "Watch post");
  assert.equal(row.count, 3);
});

test("BuildingAmended merges partial changes, leaving fields not mentioned untouched", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "BuildingConstructed", gameDate: "1225", region: "Old Hills",
    payload: { building: "Farm", displayName: "Old Name", detail: "Old detail" },
  });

  await createEvent(db, {
    type: "BuildingAmended", gameDate: "1226", region: "Old Hills",
    payload: { building: "Farm", changes: { displayName: "New Name" } },
  });

  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE region = 'Old Hills' AND building = 'Farm'").get();
  assert.equal(row.display_name, "New Name");
  assert.equal(row.detail, "Old detail");
});

test("BuildingAmended warns when the building isn't currently built in that region", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "1225", region: "Old Hills",
    payload: { building: "Farm", changes: { detail: "x" } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /not currently built/);
});

test("BuildingAmended rejects an empty changes object", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "1225", region: "Old Hills", payload: { building: "Farm", changes: {} },
  });
  assert.equal(result.ok, false);
});

test("LocationAmended requires payload.name", async () => {
  const db = await freshDb();
  const missingName = await createEvent(db, { type: "LocationAmended", gameDate: "1225", payload: { changes: {} } });
  assert.equal(missingName.ok, false);

  const valid = await createEvent(db, {
    type: "LocationAmended", gameDate: "1225", payload: { name: "Kingdom of Casdenia", changes: {} },
  });
  assert.equal(valid.ok, true);
});

test("LocationAmended creates a new kingdom and merges partial changes onto an existing one", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "LocationAmended",
    gameDate: "1225",
    payload: { name: "Kingdom of Casdenia", changes: { capital: "Royal City of Casdenor", note: "Friendly." } },
  });
  let row = await db.prepare("SELECT * FROM kingdoms WHERE name = ?").get("Kingdom of Casdenia");
  assert.equal(row.capital, "Royal City of Casdenor");
  assert.equal(row.note, "Friendly.");
  assert.deepEqual(JSON.parse(row.places), []);

  // A later save touching only `places` must not clobber the capital/note set earlier.
  await createEvent(db, {
    type: "LocationAmended",
    gameDate: "1226",
    payload: { name: "Kingdom of Casdenia", changes: { places: [{ name: "Olen's Rest", type: "Landmark" }] } },
  });
  row = await db.prepare("SELECT * FROM kingdoms WHERE name = ?").get("Kingdom of Casdenia");
  assert.equal(row.capital, "Royal City of Casdenor");
  assert.equal(row.note, "Friendly.");
  assert.deepEqual(JSON.parse(row.places), [{ name: "Olen's Rest", type: "Landmark" }]);
});

test("ResourceChanged with payload.newObligation creates an Obligation tied to the event", async () => {
  const db = await freshDb();
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();

  const result = await createEvent(db, {
    type: "ResourceChanged",
    gameDate: "Month 1, 1225",
    payload: {
      changes: { Wood: 20, Stone: 20 },
      newObligation: { description: "Test loan", repaymentResource: "Wealth", amountTotal: 50, dueGameDate: "Month 6, 1226" },
    },
  });
  assert.equal(result.ok, true);

  const obligation = await db.prepare("SELECT * FROM obligations WHERE created_by_event_id = ?").get(result.event.id);
  assert.ok(obligation);
  assert.equal(obligation.description, "Test loan");
  assert.equal(obligation.repayment_resource, "Wealth");
  assert.equal(obligation.amount_total, 50);
  assert.equal(obligation.amount_remaining, 50);
  assert.deepEqual(JSON.parse(obligation.original_resources), { Wood: 20, Stone: 20 });

  const fetched = await getObligation(db, obligation.id);
  assert.equal(fetched.createdByEventId, result.event.id);
});

test("ResourceChanged rejects a malformed newObligation", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged",
    gameDate: "Month 1, 1225",
    payload: { changes: { Wood: 5 }, newObligation: { description: "Missing fields" } },
  });
  assert.equal(result.ok, false);
});

test("listEvents filters by type and region, sorted by game date", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "ResourceChanged", gameDate: "Month 6, 1226", payload: { changes: { Wood: 1 } } });
  await createEvent(db, { type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: { Wood: 1 } } });
  await createEvent(db, { type: "BuildingConstructed", gameDate: "Month 1, 1225", region: "Narlmarches", payload: { building: "Farm" } });

  const resourceEvents = await listEvents(db, { type: "ResourceChanged" });
  assert.equal(resourceEvents.length, 2);
  assert.ok(resourceEvents[0].gameDateSort < resourceEvents[1].gameDateSort);

  const narlmarches = await listEvents(db, { region: "Narlmarches" });
  assert.equal(narlmarches.length, 1);
  assert.equal(narlmarches[0].type, "BuildingConstructed");
});
