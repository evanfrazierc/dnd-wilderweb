import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent } from "../../server/db/events.js";
import { createObligation, getObligation, listSettlingEvents } from "../../server/db/obligations.js";

async function freshDb() {
  const db = await openDb(":memory:");
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();
  return db;
}

// createObligation's own backstop (docs/adr/0016) -- it has a caller (scripts/migrate.js) that
// never goes through createEvent/validateShape at all.
test("createObligation throws on a non-canonical dueGameDate", async () => {
  const db = await freshDb();
  await assert.rejects(
    createObligation(db, {
      description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
      dueGameDate: "Month 6, 1233",
    }),
    /dueGameDate must be formatted/,
  );
});

test("createObligation allows an absent dueGameDate", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });
  assert.equal(obligation.dueGameDate, null);
});

test("a ResourceChanged referencing an obligation pays it down", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Test loan", originalResources: { Wood: 20 }, repaymentResource: "Wealth",
    amountTotal: 50, dueGameDate: "Meloron (6), 1st, 1233",
  });

  const first = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1226",
    payload: { changes: { Wealth: -10 }, obligationId: obligation.id },
  });
  assert.equal(first.ok, true);
  assert.equal((await getObligation(db, obligation.id)).amountRemaining, 40);
  assert.equal((await getObligation(db, obligation.id)).satisfied, false);

  await createEvent(db, {
    type: "ResourceChanged", gameDate: "Erastus (2), 1st, 1226",
    payload: { changes: { Wealth: -40 }, obligationId: obligation.id },
  });
  const settled = await getObligation(db, obligation.id);
  assert.equal(settled.amountRemaining, 0);
  assert.equal(settled.satisfied, true);

  assert.equal((await listSettlingEvents(db, obligation.id)).length, 2);
});

test("overpaying an obligation clamps remaining at zero rather than going negative", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });
  await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1226",
    payload: { changes: { Wealth: -999 }, obligationId: obligation.id },
  });
  assert.equal((await getObligation(db, obligation.id)).amountRemaining, 0);
});

test("referencing an obligation with the wrong resource warns instead of silently doing nothing", async () => {
  const db = await freshDb();
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wood', 10)").run();
  const obligation = await createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });

  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1226",
    payload: { changes: { Wood: -5 }, obligationId: obligation.id },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /will not reduce its balance/);
  assert.equal((await getObligation(db, obligation.id)).amountRemaining, 10);
});

test("referencing a nonexistent obligation warns", async () => {
  const db = await freshDb();
  await db.prepare("UPDATE resource_totals SET value = 10 WHERE name = 'Wealth'").run();
  const result = await createEvent(db, {
    type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1226",
    payload: { changes: { Wealth: -5 }, obligationId: 999 },
  });
  assert.equal(result.ok, true);
  assert.match(result.warnings[0], /does not exist/);
});

test("a plain ResourceChanged with no obligationId leaves obligations untouched", async () => {
  const db = await freshDb();
  const obligation = await createObligation(db, {
    description: "Test loan", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });
  await createEvent(db, { type: "ResourceChanged", gameDate: "Pelorune (1), 1st, 1226", payload: { changes: { Wealth: -5 } } });
  assert.equal((await getObligation(db, obligation.id)).amountRemaining, 10);
});
