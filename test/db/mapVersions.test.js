import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent } from "../../server/db/events.js";
import { attachMapImage, getCurrentMap, MapVersionError } from "../../server/db/mapVersions.js";

test("getCurrentMap returns null when nothing's been uploaded", async () => {
  const db = await openDb(":memory:");
  assert.equal(await getCurrentMap(db), null);
});

test("attachMapImage refuses a nonexistent event", async () => {
  const db = await openDb(":memory:");
  await assert.rejects(
    () => attachMapImage(db, 999, { imageData: Buffer.from("x"), mimeType: "image/jpeg" }),
    MapVersionError,
  );
});

test("attachMapImage refuses an event that isn't a MapUpdated", async () => {
  const db = await openDb(":memory:");
  const result = await createEvent(db, { type: "DMRuling", gameDate: "Pelorune (1), 1st, 1225", note: "x", payload: {} });
  await assert.rejects(
    () => attachMapImage(db, result.event.id, { imageData: Buffer.from("x"), mimeType: "image/jpeg" }),
    MapVersionError,
  );
});

test("attachMapImage refuses to attach a second image to the same event", async () => {
  const db = await openDb(":memory:");
  const result = await createEvent(db, { type: "MapUpdated", gameDate: "Pelorune (1), 1st, 1225", payload: {} });
  await attachMapImage(db, result.event.id, { imageData: Buffer.from("first"), mimeType: "image/jpeg" });
  await assert.rejects(
    () => attachMapImage(db, result.event.id, { imageData: Buffer.from("second"), mimeType: "image/jpeg" }),
    MapVersionError,
  );
});

test("getCurrentMap picks the version with the latest game_date_sort, not upload order", async () => {
  const db = await openDb(":memory:");
  const later = await createEvent(db, { type: "MapUpdated", gameDate: "Meloron (6), 1st, 1227", note: "later", payload: {} });
  await attachMapImage(db, later.event.id, { imageData: Buffer.from("later map"), mimeType: "image/jpeg" });

  // Uploaded second, but dated earlier -- current should still be "later".
  const earlier = await createEvent(db, { type: "MapUpdated", gameDate: "Pelorune (1), 1st, 1225", note: "earlier", payload: {} });
  await attachMapImage(db, earlier.event.id, { imageData: Buffer.from("earlier map"), mimeType: "image/png" });

  const current = await getCurrentMap(db);
  assert.equal(current.note, "later");
  assert.equal(current.mime_type, "image/jpeg");
  assert.deepEqual(Buffer.from(current.image_data), Buffer.from("later map"));
});
