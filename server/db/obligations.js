import { parseGameDate, isCanonicalGameDate } from "./gameDate.js";
import { deserializeEvent } from "./events.js";

export async function createObligation(db, {
  description, originalResources, repaymentResource, amountTotal, dueGameDate, createdByEventId,
}) {
  // The ResourceChanged -> payload.newObligation path is already blocked by validateShape
  // before this runs; this is the backstop for createObligation's other caller (migrate.js's
  // loan import), which writes straight to the DB with no validateShape in between (docs/adr/0016).
  if (dueGameDate !== undefined && dueGameDate !== null && !isCanonicalGameDate(dueGameDate)) {
    throw new Error(`createObligation: dueGameDate must be formatted as "MonthName (N), Dth, YYYY" -- got ${JSON.stringify(dueGameDate)}`);
  }
  const due = dueGameDate ? parseGameDate(dueGameDate) : null;
  const info = await db.prepare(`
    INSERT INTO obligations
      (description, original_resources, repayment_resource, amount_total, amount_remaining,
       due_game_date_raw, due_game_date_sort, created_by_event_id, satisfied)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    description,
    JSON.stringify(originalResources ?? {}),
    repaymentResource,
    amountTotal,
    amountTotal,
    dueGameDate ?? null,
    due ? due.sortKey : null,
    createdByEventId ?? null,
  );
  return getObligation(db, info.lastInsertRowid);
}

export async function getObligation(db, id) {
  const row = await db.prepare("SELECT * FROM obligations WHERE id = ?").get(id);
  return row ? deserialize(row) : null;
}

export async function listObligations(db, { satisfied } = {}) {
  const rows = satisfied === undefined
    ? await db.prepare("SELECT * FROM obligations ORDER BY due_game_date_sort ASC").all()
    : await db.prepare("SELECT * FROM obligations WHERE satisfied = ? ORDER BY due_game_date_sort ASC")
        .all(satisfied ? 1 : 0);
  return rows.map(deserialize);
}

/** Every ResourceChanged event that has settled (part of) this obligation, shaped the same
 * way listEvents/getEvent return an event (gameDate, parsed payload, etc.) rather than raw
 * snake_case DB columns with payload still a JSON string. */
export async function listSettlingEvents(db, obligationId) {
  const rows = await db
    .prepare(`
      SELECT * FROM events
      WHERE type = 'ResourceChanged'
        AND json_extract(payload, '$.obligationId') = ?
      ORDER BY game_date_sort ASC
    `)
    .all(obligationId);
  return rows.map(deserializeEvent);
}

function deserialize(row) {
  return {
    id: row.id,
    description: row.description,
    originalResources: JSON.parse(row.original_resources),
    repaymentResource: row.repayment_resource,
    amountTotal: row.amount_total,
    amountRemaining: row.amount_remaining,
    dueGameDate: row.due_game_date_raw,
    createdByEventId: row.created_by_event_id,
    satisfied: !!row.satisfied,
  };
}
