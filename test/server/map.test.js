import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../server/index.js";
import { openDb } from "../../server/db/connection.js";

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

const FAKE_IMAGE = Buffer.from("not a real image, just test bytes");

test("GET /api/projections/map returns null before anything's been uploaded", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/projections/map`);
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
  } finally {
    await close();
  }
});

test("POST /api/map creates a MapUpdated event and stores the image, retrievable as a data URI", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const qs = new URLSearchParams({ gameDate: "Erastus (2), 4th, 1227", note: "Revealed the Wilderwood" });
    const uploadRes = await fetch(`${baseUrl}/api/map?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: FAKE_IMAGE,
    });
    const uploaded = await uploadRes.json();
    assert.equal(uploadRes.status, 201, JSON.stringify(uploaded));
    assert.equal(uploaded.event.type, "MapUpdated");
    assert.equal(uploaded.event.note, "Revealed the Wilderwood");

    const mapRes = await fetch(`${baseUrl}/api/projections/map`);
    const map = await mapRes.json();
    assert.equal(map.gameDate, "Erastus (2), 4th, 1227");
    assert.equal(map.note, "Revealed the Wilderwood");
    assert.equal(map.eventId, uploaded.event.id);

    const [, base64] = map.imageDataUri.split(",");
    assert.ok(map.imageDataUri.startsWith("data:image/jpeg;base64,"));
    assert.deepEqual(Buffer.from(base64, "base64"), FAKE_IMAGE);
  } finally {
    await close();
  }
});

test("POST /api/map requires a canonical gameDate, same as any other event", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/map?gameDate=1227`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: FAKE_IMAGE,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.errors.join(), /gameDate/);
  } finally {
    await close();
  }
});

test("POST /api/map rejects an empty body", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const qs = new URLSearchParams({ gameDate: "Erastus (2), 4th, 1227" });
    const res = await fetch(`${baseUrl}/api/map?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
    });
    assert.equal(res.status, 400);
  } finally {
    await close();
  }
});

test("POST /api/map rejects an upload over the size limit with a clean JSON error", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const oversized = Buffer.alloc(16 * 1024 * 1024); // over the 15mb route limit
    const qs = new URLSearchParams({ gameDate: "Erastus (2), 4th, 1227" });
    const res = await fetch(`${baseUrl}/api/map?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: oversized,
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.ok(body.errors[0].includes("too large") || body.errors[0].includes("15mb"));
  } finally {
    await close();
  }
});

test("a second upload becomes current while the first stays queryable via its own event", async () => {
  const { baseUrl, close } = await startServer();
  try {
    const firstQs = new URLSearchParams({ gameDate: "Erastus (2), 4th, 1227", note: "First" });
    const first = await fetch(`${baseUrl}/api/map?${firstQs}`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: FAKE_IMAGE,
    }).then((r) => r.json());

    const secondImage = Buffer.from("a different, later map image");
    const secondQs = new URLSearchParams({ gameDate: "Shelune (3), 1st, 1227", note: "Second" });
    await fetch(`${baseUrl}/api/map?${secondQs}`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: secondImage,
    });

    const current = await fetch(`${baseUrl}/api/projections/map`).then((r) => r.json());
    assert.equal(current.note, "Second");

    const events = await fetch(`${baseUrl}/api/events?type=MapUpdated`).then((r) => r.json());
    assert.equal(events.length, 2);
    assert.ok(events.some((e) => e.id === first.event.id && e.note === "First"));
  } finally {
    await close();
  }
});
