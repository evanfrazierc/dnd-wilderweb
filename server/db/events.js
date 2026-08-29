import { parseGameDate } from "./gameDate.js";
import { validateShape, checkWarnings } from "./validate.js";
import { applyProjection } from "./projections.js";

/**
 * Creates one event: validates its shape, checks in-game warnings against current
 * projections, then writes the event and updates projections in a single transaction.
 * Returns { ok: false, errors } on a shape failure (400-worthy), or
 * { ok: true, event, warnings } on success. Warnings never block the write (ADR-0005).
 */
export function createEvent(db, { type, gameDate, postedAt, actor, region, note, payload }) {
  const errors = validateShape(type, { note, region, payload });
  if (errors.length > 0) return { ok: false, errors };

  const parsed = parseGameDate(gameDate);
  const warnings = checkWarnings(db, type, { region, payload: payload ?? {} });

  db.exec("BEGIN");
  try {
    const stmt = db.prepare(`
      INSERT INTO events (type, game_date_raw, game_date_sort, posted_at, actor, region, note, payload, warnings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
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

    applyProjection(db, { id: info.lastInsertRowid, type, region, payload: payload ?? {} });

    db.exec("COMMIT");
    const event = getEvent(db, info.lastInsertRowid);
    return { ok: true, event, warnings };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getEvent(db, id) {
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  return row ? deserializeEvent(row) : null;
}

export function listEvents(db, { type, region, from, to, limit = 200 } = {}) {
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
  const rows = db
    .prepare(`SELECT * FROM events ${where} ORDER BY game_date_sort ASC, id ASC LIMIT ?`)
    .all(...params, limit);

  return rows.map(deserializeEvent);
}

function deserializeEvent(row) {
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
