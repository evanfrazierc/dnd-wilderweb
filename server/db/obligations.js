import { parseGameDate } from "./gameDate.js";

export function createObligation(db, {
  description, originalResources, repaymentResource, amountTotal, dueGameDate, createdByEventId,
}) {
  const due = dueGameDate ? parseGameDate(dueGameDate) : null;
  const stmt = db.prepare(`
    INSERT INTO obligations
      (description, original_resources, repayment_resource, amount_total, amount_remaining,
       due_game_date_raw, due_game_date_sort, created_by_event_id, satisfied)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const info = stmt.run(
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

export function getObligation(db, id) {
  const row = db.prepare("SELECT * FROM obligations WHERE id = ?").get(id);
  return row ? deserialize(row) : null;
}

export function listObligations(db, { satisfied } = {}) {
  const rows = satisfied === undefined
    ? db.prepare("SELECT * FROM obligations ORDER BY due_game_date_sort ASC").all()
    : db.prepare("SELECT * FROM obligations WHERE satisfied = ? ORDER BY due_game_date_sort ASC")
        .all(satisfied ? 1 : 0);
  return rows.map(deserialize);
}

/** Every ResourceChanged event that has settled (part of) this obligation. */
export function listSettlingEvents(db, obligationId) {
  return db
    .prepare(`
      SELECT * FROM events
      WHERE type = 'ResourceChanged'
        AND json_extract(payload, '$.obligationId') = ?
      ORDER BY game_date_sort ASC
    `)
    .all(obligationId);
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
