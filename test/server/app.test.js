import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../server/index.js";
import { openDb } from "../../server/db/connection.js";
import { REFERENCE_RESOURCES } from "../../server/db/reference.js";

async function startServer() {
  const db = await openDb(":memory:");
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

// HTTP-level coverage for the reference-resource routes: server/db/reference.test.js already
// covers the replace*/read* functions in isolation, but nothing exercised the routing glue
// (server/index.js's lookup into REFERENCE_RESOURCES, the 404/400 mapping) until now.

const VALID_PAYLOADS = {
  buildings: [{ name: "Farm", category: "Resources", effect: "Grows food", cost: { Wood: 5 }, requires: [] }],
  introduction: { postedBy: "DM", postedAt: "2026-01-01", paragraphs: ["Welcome."] },
  resourceDefinitions: [{ grp: "resources", name: "Wood", description: "Lumber" }],
  calendarStructure: {
    era: "Test Era",
    daysPerMonth: 30,
    months: [{ number: 1, name: "Firstmonth", season: "Spring", holidays: [] }],
  },
  settlements: [{ name: "Stirling Reach", description: "The party's settlement.", kingdom: "Kingdom of Casdenia" }],
};

test("GET /api/reference/:resource 404s for an unknown resource", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/reference/bogus`);
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

test("PUT /api/reference/:resource 404s for an unknown resource", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/reference/bogus`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  } finally {
    await close();
  }
});

for (const resource of Object.keys(REFERENCE_RESOURCES)) {
  test(`PUT then GET /api/reference/${resource} round-trips through the real route`, async () => {
    const { baseUrl, close } = await startServer();
    try {
      const putRes = await fetch(`${baseUrl}/api/reference/${resource}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_PAYLOADS[resource]),
      });
      assert.equal(putRes.status, 200, await putRes.text());

      const getRes = await fetch(`${baseUrl}/api/reference/${resource}`);
      assert.equal(getRes.status, 200);
      assert.ok(await getRes.json());
    } finally {
      await close();
    }
  });
}

test("PUT /api/reference/buildings maps a ValidationError to 400", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/reference/buildings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ name: "Farm" }, { name: "Farm" }]),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Duplicate/);
  } finally {
    await close();
  }
});
