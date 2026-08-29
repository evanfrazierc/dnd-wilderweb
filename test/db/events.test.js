import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent, listEvents } from "../../server/db/events.js";

function freshDb() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wood', 10)").run();
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Stone', 5)").run();
  db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires)
    VALUES ('Farm', 'Resources', 'Generates food', '{}', '[]')
  `).run();
  db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, requires)
    VALUES ('Mill', 'Resources', 'Boosts farms', '{}', '["Farm"]')
  `).run();
  return db;
}

test("ResourceChanged applies its delta to the projection", () => {
  const db = freshDb();
  const result = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", actor: "DM", payload: { changes: { Wood: -3 } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  const row = db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 7);
});

test("ResourceChanged warns but still applies when it would go negative (ADR-0005)", () => {
  const db = freshDb();
  const result = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: { Wood: -20 } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Wood would go negative/);
  const row = db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, -10);
});

test("ResourceChanged rejects an empty changes object", () => {
  const db = freshDb();
  const result = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: {} },
  });
  assert.equal(result.ok, false);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM events").get().c, 0);
});

test("DMRuling requires a note and must not carry changes", () => {
  const db = freshDb();
  const missingNote = createEvent(db, { type: "DMRuling", gameDate: "1225", payload: {} });
  assert.equal(missingNote.ok, false);

  const withChanges = createEvent(db, {
    type: "DMRuling", gameDate: "1225", note: "Mills don't stack", payload: { changes: { Wood: 1 } },
  });
  assert.equal(withChanges.ok, false);

  const valid = createEvent(db, { type: "DMRuling", gameDate: "1225", note: "Mills don't stack", payload: {} });
  assert.equal(valid.ok, true);
  const row = db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 10, "a DMRuling must not touch projections");
});

test("BuildingConstructed records the building and warns on an unmet prerequisite", () => {
  const db = freshDb();
  const result = createEvent(db, {
    type: "BuildingConstructed", gameDate: "1225", region: "Stirling Reach",
    payload: { building: "Mill" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /requires "Farm"/);
  const row = db.prepare("SELECT * FROM settlement_buildings WHERE region = 'Stirling Reach' AND building = 'Mill'").get();
  assert.equal(row.count, 1);
});

test("BuildingConstructed with its prerequisite present raises no warning", () => {
  const db = freshDb();
  createEvent(db, { type: "BuildingConstructed", gameDate: "1225", region: "Stirling Reach", payload: { building: "Farm" } });
  const result = createEvent(db, { type: "BuildingConstructed", gameDate: "1226", region: "Stirling Reach", payload: { building: "Mill" } });
  assert.deepEqual(result.warnings, []);
});

test("BuildingConstructed accepts an optional displayName alongside the catalog name", () => {
  const db = freshDb();
  createEvent(db, {
    type: "BuildingConstructed", gameDate: "1225", region: "Old Hills",
    payload: { building: "Farm", displayName: "Anora's Roost" },
  });
  const row = db.prepare("SELECT display_name FROM settlement_buildings WHERE region = 'Old Hills'").get();
  assert.equal(row.display_name, "Anora's Roost");
});

test("LocationAmended requires a non-empty note, since payload.data replaces the whole document", () => {
  const db = freshDb();
  const missingNote = createEvent(db, { type: "LocationAmended", gameDate: "1225", payload: { data: {} } });
  assert.equal(missingNote.ok, false);

  const valid = createEvent(db, {
    type: "LocationAmended", gameDate: "1225", note: "Discovered a new village", payload: { data: { kingdoms: [] } },
  });
  assert.equal(valid.ok, true);
});

test("listEvents filters by type and region, sorted by game date", () => {
  const db = freshDb();
  createEvent(db, { type: "ResourceChanged", gameDate: "Month 6, 1226", payload: { changes: { Wood: 1 } } });
  createEvent(db, { type: "ResourceChanged", gameDate: "Month 1, 1225", payload: { changes: { Wood: 1 } } });
  createEvent(db, { type: "BuildingConstructed", gameDate: "Month 1, 1225", region: "Narlmarches", payload: { building: "Farm" } });

  const resourceEvents = listEvents(db, { type: "ResourceChanged" });
  assert.equal(resourceEvents.length, 2);
  assert.ok(resourceEvents[0].gameDateSort < resourceEvents[1].gameDateSort);

  const narlmarches = listEvents(db, { region: "Narlmarches" });
  assert.equal(narlmarches.length, 1);
  assert.equal(narlmarches[0].type, "BuildingConstructed");
});
