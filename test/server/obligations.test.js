import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../server/index.js";
import { openDb } from "../../server/db/connection.js";

// GET /api/obligations/:id had never actually been exercised end-to-end -- server/db/
// obligations.test.js covers createObligation/listSettlingEvents in isolation, but nothing
// hit the real route until now (the client didn't call it either -- see Dashboard.jsx's
// obligation detail view).

async function startServer(db) {
  db ??= await openDb(":memory:");
  await db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wealth', 0)").run();
  const server = createApp(db).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  return {
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

test("GET /api/obligations/:id 404s for an unknown obligation", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/obligations/999`);
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("GET /api/obligations/:id includes the creating event and every settling event, fully shaped", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ResourceChanged",
        gameDate: "Pelorune (1), 1st, 1225",
        payload: {
          changes: { Wealth: 20 },
          newObligation: { description: "Test loan", repaymentResource: "Wealth", amountTotal: 20, dueGameDate: "Meloron (6), 1st, 1233" },
        },
      }),
    });
    const created = await createRes.json();
    const obligationRes = await fetch(`${baseUrl}/api/obligations`);
    const [obligation] = await obligationRes.json();

    await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ResourceChanged",
        gameDate: "Erastus (2), 1st, 1225",
        payload: { changes: { Wealth: -5 }, obligationId: obligation.id },
      }),
    });

    const detailRes = await fetch(`${baseUrl}/api/obligations/${obligation.id}`);
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();

    assert.equal(detail.description, "Test loan");
    assert.equal(detail.amountRemaining, 15);

    assert.equal(detail.creatingEvent.id, created.event.id);
    assert.equal(detail.creatingEvent.gameDate, "Pelorune (1), 1st, 1225");
    assert.deepEqual(detail.creatingEvent.payload.changes, { Wealth: 20 });

    assert.equal(detail.settlingEvents.length, 1);
    assert.equal(detail.settlingEvents[0].gameDate, "Erastus (2), 1st, 1225");
    assert.deepEqual(detail.settlingEvents[0].payload, { changes: { Wealth: -5 }, obligationId: obligation.id });
  } finally {
    await close();
  }
});

test("GET /api/obligations/:id has a null creatingEvent when there is none", async () => {
  // migrate.js's LOAN_TITLE path and createObligation's other direct callers don't always
  // pass a createdByEventId.
  const db = await openDb(":memory:");
  const { createObligation } = await import("../../server/db/obligations.js");
  const obligation = await createObligation(db, {
    description: "No origin event", originalResources: {}, repaymentResource: "Wealth", amountTotal: 10,
  });

  const { baseUrl, close } = await startServer(db);
  try {
    const res = await fetch(`${baseUrl}/api/obligations/${obligation.id}`);
    const detail = await res.json();
    assert.equal(detail.creatingEvent, null);
  } finally {
    await close();
  }
});
