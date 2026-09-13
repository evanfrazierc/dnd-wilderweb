/**
 * The image behind each MapUpdated event (docs/adr/0018). Kept out of events.payload -- a
 * multi-MB image inline would bloat every generic event-list fetch (Timeline, StatusBar)
 * regardless of whether anyone's looking at the map -- so it lives here, one row per
 * MapUpdated event, attached in a follow-up call after createEvent (server/index.js's
 * POST /api/map) rather than inside createEvent's own transaction.
 */

export class MapVersionError extends Error {}

/** Attaches an already-uploaded image to the MapUpdated event that was just created for it.
 * Refuses an event that doesn't exist, isn't a MapUpdated, or already has an image -- the
 * last case shouldn't be reachable through the normal POST /api/map flow (each request creates
 * a fresh event first), but a broken client retrying the attach step with a stale event id
 * would otherwise silently overwrite that version's image out from under it. */
export async function attachMapImage(db, eventId, { imageData, mimeType }) {
  const event = await db.prepare("SELECT type FROM events WHERE id = ?").get(eventId);
  if (!event) throw new MapVersionError(`No event #${eventId}`);
  if (event.type !== "MapUpdated") throw new MapVersionError(`Event #${eventId} is a ${event.type}, not MapUpdated`);
  const existing = await db.prepare("SELECT 1 FROM map_versions WHERE event_id = ?").get(eventId);
  if (existing) throw new MapVersionError(`Event #${eventId} already has an image attached`);

  await db.prepare("INSERT INTO map_versions (event_id, image_data, mime_type) VALUES (?, ?, ?)")
    .run(eventId, imageData, mimeType);
}

/** The most recently dated map version, joined with its event's context -- null if no map has
 * ever been uploaded. "Most recent" is by game_date_sort (an intentionally backdated upload
 * still becomes current, same as any other event), not upload order. */
export async function getCurrentMap(db) {
  const row = await db.prepare(`
    SELECT mv.event_id, mv.image_data, mv.mime_type, e.game_date_raw, e.note, e.posted_at
    FROM map_versions mv
    JOIN events e ON e.id = mv.event_id
    ORDER BY e.game_date_sort DESC, e.id DESC
    LIMIT 1
  `).get();
  return row ?? null;
}
