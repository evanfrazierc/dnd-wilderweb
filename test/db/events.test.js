import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent, listEvents, setEventHidden } from "../../server/db/events.js";
import { getObligation, createObligation } from "../../server/db/obligations.js";

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

// docs/adr/0016: gameDate format is a structural (blocking) check, not a checkWarnings
// in-game-validity one -- same footing as requiring payload.building.
test("createEvent rejects a non-canonically-formatted gameDate regardless of event type", async () => {
  const db = await freshDb();
  for (const gameDate of ["1225", "Month 1, 1225", "Month 6 to Month 12, 1226", "", "whenever"]) {
    const result = await createEvent(db, { type: "DMRuling", gameDate, note: "x", payload: {} });
    assert.equal(result.ok, false, `expected ${JSON.stringify(gameDate)} to be rejected`);
    assert.match(result.errors.join(), /gameDate/);
  }
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM events").get()).c, 0, "none of the rejected writes should have landed");
});

test("createEvent rejects a non-canonical newObligation.dueGameDate and ObligationAmended.changes.dueGameDate", async () => {
  const db = await freshDb();
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();

  const badNewObligation = await createEvent(db, {
    type: "ResourceChanged",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: {
      changes: { Wood: 20 },
      newObligation: { description: "Loan", repaymentResource: "Wealth", amountTotal: 50, dueGameDate: "1233" },
    },
  });
  assert.equal(badNewObligation.ok, false);
  assert.match(badNewObligation.errors.join(), /dueGameDate/);

  const obligation = await createObligation(db, {
    description: "Loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 50,
  });
  const badAmend = await createEvent(db, {
    type: "ObligationAmended",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: { obligationId: obligation.id, changes: { dueGameDate: "Month 6, 1233" } },
  });
  assert.equal(badAmend.ok, false);
  assert.match(badAmend.errors.join(), /dueGameDate/);
});

test("ResourceChanged applies its delta to the projection", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1225", actor: "DM", payload: { changes: { Wood: -3 } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  const row = await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 7);
});

test("ResourceChanged warns but still applies when it would go negative (ADR-0005)", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1225", payload: { changes: { Wood: -20 } },
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
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1225", payload: { changes: {} },
  });
  assert.equal(result.ok, false);
  assert.equal((await db.prepare("SELECT COUNT(*) c FROM events").get()).c, 0);
});

test("DMRuling requires a note and must not carry changes", async () => {
  const db = await freshDb();
  const missingNote = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", payload: {} });
  assert.equal(missingNote.ok, false);

  const withChanges = await createEvent(db, {
    type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "Mills don't stack", payload: { changes: { Wood: 1 } },
  });
  assert.equal(withChanges.ok, false);

  const valid = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "Mills don't stack", payload: {} });
  assert.equal(valid.ok, true);
  const row = await db.prepare("SELECT value FROM resource_totals WHERE name = 'Wood'").get();
  assert.equal(row.value, 10, "a DMRuling must not touch projections");
});

test("BuildingConstructed records the building and warns on an unmet prerequisite", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Stirling Reach",
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
  await createEvent(db, { type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Stirling Reach", payload: { building: "Farm" } });
  const result = await createEvent(db, { type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1226", region: "Stirling Reach", payload: { building: "Mill" } });
  assert.deepEqual(result.warnings, []);
});

test("BuildingConstructed accepts an optional displayName alongside the catalog name", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Old Hills",
    payload: { building: "Farm", displayName: "Anora's Roost" },
  });
  const row = await db.prepare("SELECT display_name FROM settlement_buildings WHERE region = 'Old Hills'").get();
  assert.equal(row.display_name, "Anora's Roost");
});

test("BuildingAmended updates displayName and detail without touching count", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Old Hills", payload: { building: "Farm", count: 3 } });

  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "Pelorune (1), 1st, 1226", region: "Old Hills",
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
    type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Old Hills",
    payload: { building: "Farm", displayName: "Old Name", detail: "Old detail" },
  });

  await createEvent(db, {
    type: "BuildingAmended", gameDate: "Pelorune (1), 1st, 1226", region: "Old Hills",
    payload: { building: "Farm", changes: { displayName: "New Name" } },
  });

  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE region = 'Old Hills' AND building = 'Farm'").get();
  assert.equal(row.display_name, "New Name");
  assert.equal(row.detail, "Old detail");
});

test("BuildingAmended warns when the building isn't currently built in that region", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "Pelorune (1), 1st, 1225", region: "Old Hills",
    payload: { building: "Farm", changes: { detail: "x" } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /not currently built/);
});

test("BuildingAmended rejects an empty changes object", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "BuildingAmended", gameDate: "Pelorune (1), 1st, 1225", region: "Old Hills", payload: { building: "Farm", changes: {} },
  });
  assert.equal(result.ok, false);
});

test("LocationAmended requires payload.name", async () => {
  const db = await freshDb();
  const missingName = await createEvent(db, { type: "LocationAmended", gameDate: "Pelorune (1), 1st, 1225", payload: { changes: {} } });
  assert.equal(missingName.ok, false);

  const valid = await createEvent(db, {
    type: "LocationAmended", gameDate: "Pelorune (1), 1st, 1225", payload: { name: "Kingdom of Casdenia", changes: {} },
  });
  assert.equal(valid.ok, true);
});

test("ObligationAmended requires payload.obligationId", async () => {
  const db = await freshDb();
  const missingId = await createEvent(db, { type: "ObligationAmended", gameDate: "Pelorune (1), 1st, 1225", payload: { changes: {} } });
  assert.equal(missingId.ok, false);
});

test("ObligationAmended warns but still applies when it references a nonexistent obligation (ADR-0005)", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "ObligationAmended", gameDate: "Pelorune (1), 1st, 1225", payload: { obligationId: 999, changes: { description: "x" } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /obligation #999.*does not exist/);
});

test("ObligationAmended corrects description/dueGameDate without touching amountTotal/amountRemaining/repaymentResource", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Resource loan (history.json id 49)",
    originalResources: { Wood: 20 },
    repaymentResource: "Wealth",
    amountTotal: 50,
    dueGameDate: "Meloron (6), 16th, 1233",
  });

  const result = await createEvent(db, {
    type: "ObligationAmended",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: { obligationId: obligation.id, changes: { description: "Loan from the Countess of Ravenstone" } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);

  const updated = await getObligation(db, obligation.id);
  assert.equal(updated.description, "Loan from the Countess of Ravenstone");
  assert.equal(updated.dueGameDate, "Meloron (6), 16th, 1233"); // untouched -- not in `changes`
  assert.equal(updated.amountTotal, 50);
  assert.equal(updated.amountRemaining, 50);
  assert.equal(updated.repaymentResource, "Wealth");

  // A later save touching only dueGameDate must not clobber the description just corrected.
  await createEvent(db, {
    type: "ObligationAmended",
    gameDate: "Pelorune (1), 1st, 1226",
    payload: { obligationId: obligation.id, changes: { dueGameDate: "Pelorune (1), 1st, 1234" } },
  });
  const reUpdated = await getObligation(db, obligation.id);
  assert.equal(reUpdated.description, "Loan from the Countess of Ravenstone");
  assert.equal(reUpdated.dueGameDate, "Pelorune (1), 1st, 1234");
});

test("ObligationAmended can set satisfied directly, the app's only way to \"delete\" a loan", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Emergency grain shipment",
    originalResources: { Food: 30 },
    repaymentResource: "Wealth",
    amountTotal: 40,
    dueGameDate: "Shelune (3), 1st, 1226",
  });

  const forgiven = await createEvent(db, {
    type: "ObligationAmended",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: { obligationId: obligation.id, changes: { satisfied: true } },
  });
  assert.equal(forgiven.ok, true);

  const updated = await getObligation(db, obligation.id);
  assert.equal(updated.satisfied, true);
  assert.equal(updated.amountRemaining, 40); // forgiving doesn't retroactively pay it off
  assert.equal(updated.description, "Emergency grain shipment"); // untouched -- not in `changes`

  // Reversible: the row stays, so a DM can un-forgive it too.
  await createEvent(db, {
    type: "ObligationAmended",
    gameDate: "Pelorune (1), 1st, 1226",
    payload: { obligationId: obligation.id, changes: { satisfied: false } },
  });
  const reopened = await getObligation(db, obligation.id);
  assert.equal(reopened.satisfied, false);
});

test("LocationAmended creates a new kingdom and merges partial changes onto an existing one", async () => {
  const db = await freshDb();
  await createEvent(db, {
    type: "LocationAmended",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: { name: "Kingdom of Casdenia", changes: { capital: "Royal City of Casdenor", note: "Friendly." } },
  });
  let row = await db.prepare("SELECT * FROM kingdoms WHERE name = ?").get("Kingdom of Casdenia");
  assert.equal(row.capital, "Royal City of Casdenor");
  assert.equal(row.note, "Friendly.");

  // A later save touching only `note` must not clobber the capital set earlier.
  await createEvent(db, {
    type: "LocationAmended",
    gameDate: "Pelorune (1), 1st, 1226",
    payload: { name: "Kingdom of Casdenia", changes: { note: "Now hostile." } },
  });
  row = await db.prepare("SELECT * FROM kingdoms WHERE name = ?").get("Kingdom of Casdenia");
  assert.equal(row.capital, "Royal City of Casdenor");
  assert.equal(row.note, "Now hostile.");
});

test("ResourceChanged with payload.newObligation creates an Obligation tied to the event", async () => {
  const db = await freshDb();
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();

  const result = await createEvent(db, {
    type: "ResourceChanged",
    gameDate: "Pelorune (1), 1st, 1225",
    payload: {
      changes: { Wood: 20, Stone: 20 },
      newObligation: { description: "Test loan", repaymentResource: "Wealth", amountTotal: 50, dueGameDate: "Meloron (6), 1st, 1226" },
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
    gameDate: "Pelorune (1), 1st, 1225",
    payload: { changes: { Wood: 5 }, newObligation: { description: "Missing fields" } },
  });
  assert.equal(result.ok, false);
});

test("listEvents filters by type and region, sorted by game date", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "ResourceChanged", gameDate: "Meloron (6), 1st, 1226", payload: { changes: { Wood: 1 } } });
  await createEvent(db, { type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1225", payload: { changes: { Wood: 1 } } });
  await createEvent(db, { type: "BuildingConstructed", gameDate: "Pelorune (1), 1st, 1225", region: "Narlmarches", payload: { building: "Farm" } });

  const resourceEvents = await listEvents(db, { type: "ResourceChanged" });
  assert.equal(resourceEvents.length, 2);
  assert.ok(resourceEvents[0].gameDateSort < resourceEvents[1].gameDateSort);

  const narlmarches = await listEvents(db, { region: "Narlmarches" });
  assert.equal(narlmarches.length, 1);
  assert.equal(narlmarches[0].type, "BuildingConstructed");
});

test("listEvents keeps the most recent events once there are more than `limit`, not the earliest", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "oldest" });
  await createEvent(db, { type: "DMRuling", gameDate: "Erastus (2), 1st, 1225", note: "middle" });
  await createEvent(db, { type: "DMRuling", gameDate: "Shelune (3), 1st, 1225", note: "newest" });

  const capped = await listEvents(db, { limit: 2 });
  assert.equal(capped.length, 2);
  // A plain "ORDER BY game_date_sort ASC LIMIT 2" would keep ["oldest", "middle"] --
  // silently dropping the newest event, which is exactly backwards for a UI paging recent
  // history (Timeline, StatusBar). Still returned oldest-first within the kept set.
  assert.deepEqual(capped.map((e) => e.note), ["middle", "newest"]);
  assert.ok(capped[0].gameDateSort < capped[1].gameDateSort);
});

// docs/adr/0019: hidden is display state, not a new event -- a direct update on the row.
test("a new event is not hidden by default", async () => {
  const db = await freshDb();
  const result = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "x" });
  assert.equal(result.event.hidden, false);
});

test("setEventHidden toggles hidden and returns the updated event, or null for an unknown id", async () => {
  const db = await freshDb();
  const created = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "x" });

  const hidden = await setEventHidden(db, created.event.id, true);
  assert.equal(hidden.hidden, true);

  const shown = await setEventHidden(db, created.event.id, false);
  assert.equal(shown.hidden, false);

  assert.equal(await setEventHidden(db, 999, true), null);
});

test("listEvents excludes hidden entries by default, and includeHidden:true shows both", async () => {
  const db = await freshDb();
  const visible = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "visible" });
  const hidden = await createEvent(db, { type: "DMRuling", gameDate: "Erastus (2), 1st, 1225", note: "hidden" });
  await setEventHidden(db, hidden.event.id, true);

  const defaultView = await listEvents(db);
  assert.deepEqual(defaultView.map((e) => e.note), ["visible"]);

  const all = await listEvents(db, { includeHidden: true });
  assert.deepEqual(all.map((e) => e.note).sort(), ["hidden", "visible"]);
  assert.equal(all.find((e) => e.id === visible.event.id).hidden, false);
  assert.equal(all.find((e) => e.id === hidden.event.id).hidden, true);
});
