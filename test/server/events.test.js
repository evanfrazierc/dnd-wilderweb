import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../server/index.js";
import { openDb } from "../../server/db/connection.js";

// Covers the postToDiscord wiring in the POST /api/events route -- test/db/events.test.js
// covers createEvent itself; this covers the routing glue that strips postToDiscord out of
// the event body and turns it into a best-effort notifyDiscord call.

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

test("postToDiscord:true with no webhook configured reports a skipped, successful discord result", async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "A note", postToDiscord: true }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(body.discord, { ok: true, skipped: true });
  } finally {
    await close();
  }
});

test("postToDiscord:false omits discord from the response entirely", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "A note", postToDiscord: false }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.discord, undefined);
  } finally {
    await close();
  }
});

test("postToDiscord is not stored as part of the saved event's payload", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ResourceChanged",
        gameDate: "Pelorune (1), 1st, 1225",
        payload: { changes: { Wood: 1 } },
        postToDiscord: true,
      }),
    });
    const body = await res.json();
    assert.equal(body.event.postToDiscord, undefined);
    assert.deepEqual(body.event.payload, { changes: { Wood: 1 } });
  } finally {
    await close();
  }
});

test("a save that fails shape validation never attempts a Discord post", async () => {
  process.env.DISCORD_WEBHOOK_URL = "http://127.0.0.1:1"; // would fail loudly if ever called
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "", postToDiscord: true }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.discord, undefined);
  } finally {
    delete process.env.DISCORD_WEBHOOK_URL;
    await close();
  }
});
