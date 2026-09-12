import { parseGameDate } from "./gameDate.js";
import { validateShape, checkWarnings } from "./validate.js";
import { applyProjection } from "./projections.js";

/**
 * Creates one event: validates its shape, checks in-game warnings against current
 * projections, then writes the event and updates projections in a single transaction.
 * Returns { ok: false, errors } on a shape failure (400-worthy), or
 * { ok: true, event, warnings } on success. Warnings never block the write (ADR-0005).
 */
export async function createEvent(db, { type, gameDate, postedAt, actor, region, note, payload }) {
  const errors = validateShape(type, { gameDate, note, region, payload });
  if (errors.length > 0) return { ok: false, errors };

  const parsed = parseGameDate(gameDate);
  const warnings = await checkWarnings(db, type, { region, payload: payload ?? {} });

  const event = await db.transaction(async (tx) => {
    const info = await tx.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      type,
      gameDate,
      parsed.sortKey,
      postedAt ?? new Date().toISOString().slice(0, 10),
      actor ?? null,
      region ?? null,
      note ?? null,
      JSON.stringify(payload ?? {}),
      JSON.stringify(warnings),
    );

    await applyProjection(tx, { id: info.lastInsertRowid, type, region, payload: payload ?? {} });

    return getEvent(tx, info.lastInsertRowid);
  });

  return { ok: true, event, warnings };
}

export async function getEvent(db, id) {
  const row = await db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  return row ? deserializeEvent(row) : null;
}

export async function listEvents(db, { type, region, from, to, limit = 200 } = {}) {
  const clauses = [];
  const params = [];

  if (type) {
    clauses.push("type = ?");
    params.push(type);
  }
  if (region) {
    clauses.push("region = ?");
    params.push(region);
  }
  if (from != null) {
    clauses.push("game_date_sort >= ?");
    params.push(from);
  }
  if (to != null) {
    clauses.push("game_date_sort <= ?");
    params.push(to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // A plain "ORDER BY ... ASC LIMIT ?" would keep the EARLIEST-dated matching rows once a
  // campaign has more events than the limit -- silently dropping recent (even today's) events
  // from the result instead of paging them off the end, which is backwards for every current
  // caller (Timeline and StatusBar both want "the recent slice of history", capped, not "the
  // beginning of history, capped"). Take the most recent `limit` rows first, then re-sort that
  // slice back into chronological order so the returned array's shape (oldest-to-newest) is
  // unchanged from before -- callers that reverse it for a newest-first display, or that pass a
  // limit far above the real row count (scripts/export.js's full-history dump), see no
  // difference; only truncation now truncates from the right end.
  const rows = await db
    .prepare(`
      SELECT * FROM (
        SELECT * FROM events ${where} ORDER BY game_date_sort DESC, id DESC LIMIT ?
      ) ORDER BY game_date_sort ASC, id ASC
    `)
    .all(...params, limit);

  return rows.map(deserializeEvent);
}

export function deserializeEvent(row) {
  return {
    id: row.id,
    type: row.type,
    gameDate: row.game_date_raw,
    gameDateSort: row.game_date_sort,
    postedAt: row.posted_at,
    actor: row.actor,
    region: row.region,
    note: row.note,
    payload: JSON.parse(row.payload),
    warnings: JSON.parse(row.warnings),
    createdAt: row.created_at,
  };
}
