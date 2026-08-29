import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent } from "../../server/db/events.js";
import { createObligation, getObligation, listSettlingEvents } from "../../server/db/obligations.js";

function freshDb() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();
  return db;
}

test("a ResourceChanged referencing an obligation pays it down", () => {
  const db = freshDb();
  const obligation = createObligation(db, {
    description: "Test loan", originalResources: { Wood: 20 }, repaymentResource: "Wealth",
    amountTotal: 50, dueGameDate: "Month 6, 1233",
  });

  const first = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1226",
    payload: { changes: { Wealth: -10 }, obligationId: obligation.id },
  });
  assert.equal(first.ok, true);
  assert.equal(getObligation(db, obligation.id).amountRemaining, 40);
  assert.equal(getObligation(db, obligation.id).satisfied, false);

  createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 2, 1226",
    payload: { changes: { Wealth: -40 }, obligationId: obligation.id },
  });
  const settled = getObligation(db, obligation.id);
  assert.equal(settled.amountRemaining, 0);
  assert.equal(settled.satisfied, true);

  assert.equal(listSettlingEvents(db, obligation.id).length, 2);
});

test("overpaying an obligation clamps remaining at zero rather than going negative", () => {
  const db = freshDb();
  const obligation = createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });
  createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1226",
    payload: { changes: { Wealth: -999 }, obligationId: obligation.id },
  });
  assert.equal(getObligation(db, obligation.id).amountRemaining, 0);
});

test("referencing an obligation with the wrong resource warns instead of silently doing nothing", () => {
  const db = freshDb();
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wood', 10)").run();
  const obligation = createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });

  const result = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1226",
    payload: { changes: { Wood: -5 }, obligationId: obligation.id },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /will not reduce its balance/);
  assert.equal(getObligation(db, obligation.id).amountRemaining, 10);
});

test("referencing a nonexistent obligation warns", () => {
  const db = freshDb();
  db.prepare("UPDATE resource_totals SET value = 10 WHERE name = 'Wealth'").run();
  const result = createEvent(db, {
    type: "ResourceChanged", gameDate: "Month 1, 1226",
    payload: { changes: { Wealth: -5 }, obligationId: 999 },
  });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /does not exist/);
});

test("a plain ResourceChanged with no obligationId leaves obligations untouched", () => {
  const db = freshDb();
  const obligation = createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });
  createEvent(db, { type: "ResourceChanged", gameDate: "Month 1, 1226", payload: { changes: { Wealth: -5 } } });
  assert.equal(getObligation(db, obligation.id).amountRemaining, 10);
});
