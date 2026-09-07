import { createObligation } from "./obligations.js";
import { parseGameDate } from "./gameDate.js";

/**
 * Applies one event's payload onto the projection tables. Always called inside the
 * same transaction as the event's insert (docs/adr/0001-hybrid-event-log-with-projections.md).
 */
export async function applyProjection(db, event) {
  const { type, settlement, payload } = event;

  switch (type) {
    case "ResourceChanged":
      await applyResourceChanged(db, event);
      break;
    case "BuildingConstructed":
      await applyBuildingConstructed(db, settlement, payload);
      break;
    case "BuildingRemoved":
      await applyBuildingRemoved(db, settlement, payload);
      break;
    case "BuildingAmended":
      await applyBuildingAmended(db, settlement, payload);
      break;
    case "CalendarAdvanced":
      await applyCalendarAdvanced(db, payload);
      break;
    case "DeityAmended":
      await applyDeityAmended(db, payload);
      break;
    case "LocationAmended":
      await applyLocationAmended(db, payload);
      break;
    case "ObligationAmended":
      await applyObligationAmended(db, payload);
      break;
    case "DMRuling":
      break; // no state change by construction (validate.js enforces this)
    default:
      throw new Error(`applyProjection: unknown event type ${type}`);
  }
}

async function applyResourceChanged(db, event) {
  const { payload } = event;
  for (const [name, delta] of Object.entries(payload.changes || {})) {
    const row = await db.prepare("SELECT * FROM resource_totals WHERE name = ?").get(name);
    if (!row) continue; // unknown resource: already surfaced as a warning, nothing to update
    await db.prepare("UPDATE resource_totals SET value = value + ? WHERE grp = ? AND name = ?")
      .run(delta, row.grp, name);
  }

  if (payload.obligationId) {
    const obligation = await db.prepare("SELECT * FROM obligations WHERE id = ?").get(payload.obligationId);
    if (obligation) {
      const paid = -1 * (payload.changes?.[obligation.repayment_resource] ?? 0);
      if (paid > 0) {
        const remaining = Math.max(0, obligation.amount_remaining - paid);
        await db.prepare("UPDATE obligations SET amount_remaining = ?, satisfied = ? WHERE id = ?")
          .run(remaining, remaining <= 0 ? 1 : 0, obligation.id);
      }
    }
  }

  if (payload.newObligation) {
    await createObligation(db, {
      description: payload.newObligation.description,
      originalResources: payload.changes,
      repaymentResource: payload.newObligation.repaymentResource,
      amountTotal: payload.newObligation.amountTotal,
      dueGameDate: payload.newObligation.dueGameDate,
      createdByEventId: event.id,
    });
  }
}

async function applyBuildingConstructed(db, settlement, payload) {
  const count = payload.count ?? 1;
  await db.prepare(`
    INSERT INTO settlement_buildings (settlement, building, display_name, count, detail)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (settlement, building) DO UPDATE SET
      count = count + excluded.count,
      display_name = COALESCE(excluded.display_name, settlement_buildings.display_name),
      detail = COALESCE(excluded.detail, settlement_buildings.detail)
  `).run(settlement, payload.building, payload.displayName ?? null, count, payload.detail ?? null);
}

async function applyBuildingRemoved(db, settlement, payload) {
  const count = payload.count ?? 1;
  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE settlement = ? AND building = ?")
    .get(settlement, payload.building);
  if (!row) return; // already surfaced as a warning
  const next = row.count - count;
  if (next <= 0) {
    await db.prepare("DELETE FROM settlement_buildings WHERE id = ?").run(row.id);
  } else {
    await db.prepare("UPDATE settlement_buildings SET count = ? WHERE id = ?").run(next, row.id);
  }
}

async function applyBuildingAmended(db, settlement, payload) {
  const row = await db.prepare("SELECT * FROM settlement_buildings WHERE settlement = ? AND building = ?")
    .get(settlement, payload.building);
  if (!row) return; // already surfaced as a warning

  const changes = payload.changes ?? {};
  const displayName = changes.displayName !== undefined ? changes.displayName : row.display_name;
  const detail = changes.detail !== undefined ? changes.detail : row.detail;
  await db.prepare("UPDATE settlement_buildings SET display_name = ?, detail = ? WHERE id = ?")
    .run(displayName, detail, row.id);
}

async function applyCalendarAdvanced(db, payload) {
  await db.prepare(`
    INSERT INTO calendar_state (id, year, year_label, month, day, note)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      year = excluded.year,
      year_label = excluded.year_label,
      month = excluded.month,
      day = excluded.day,
      note = excluded.note
  `).run(payload.year, payload.yearLabel ?? null, payload.month, payload.day, payload.note ?? null);
}

async function applyDeityAmended(db, payload) {
  const existing = await db.prepare("SELECT * FROM deities WHERE name = ?").get(payload.name);
  const changes = payload.changes ?? {};
  const merged = {
    title: (changes.title !== undefined ? changes.title : existing?.title) ?? null,
    alignment: (changes.alignment !== undefined ? changes.alignment : existing?.alignment) ?? null,
    confirmed: (changes.confirmed !== undefined ? (changes.confirmed ? 1 : 0) : existing?.confirmed) ?? 0,
    note: (changes.note !== undefined ? changes.note : existing?.note) ?? null,
  };
  await db.prepare(`
    INSERT INTO deities (name, title, alignment, confirmed, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET
      title = excluded.title, alignment = excluded.alignment,
      confirmed = excluded.confirmed, note = excluded.note
  `).run(payload.name, merged.title, merged.alignment, merged.confirmed, merged.note);
}

async function applyLocationAmended(db, payload) {
  const existing = await db.prepare("SELECT * FROM kingdoms WHERE name = ?").get(payload.name);
  const changes = payload.changes ?? {};
  const merged = {
    capital: (changes.capital !== undefined ? changes.capital : existing?.capital) ?? null,
    note: (changes.note !== undefined ? changes.note : existing?.note) ?? null,
  };
  await db.prepare(`
    INSERT INTO kingdoms (name, capital, note)
    VALUES (?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET
      capital = excluded.capital, note = excluded.note
  `).run(payload.name, merged.capital, merged.note);
}

async function applyObligationAmended(db, payload) {
  const existing = await db.prepare("SELECT * FROM obligations WHERE id = ?").get(payload.obligationId);
  if (!existing) return; // already surfaced as a warning

  const changes = payload.changes ?? {};
  const description = changes.description !== undefined ? changes.description : existing.description;
  let dueRaw = existing.due_game_date_raw;
  let dueSort = existing.due_game_date_sort;
  if (changes.dueGameDate !== undefined) {
    dueRaw = changes.dueGameDate;
    dueSort = changes.dueGameDate ? parseGameDate(changes.dueGameDate).sortKey : null;
  }
  // `satisfied` lets a DM cancel/forgive an obligation directly -- the only "delete" this app
  // offers for campaign state (CONTEXT.md/ADR-0013): it stops showing as active without erasing
  // the row or the resources the original loan already granted, same as BuildingRemoved doesn't
  // refund a building's construction cost.
  const satisfied = changes.satisfied !== undefined ? (changes.satisfied ? 1 : 0) : existing.satisfied;
  await db.prepare("UPDATE obligations SET description = ?, due_game_date_raw = ?, due_game_date_sort = ?, satisfied = ? WHERE id = ?")
    .run(description, dueRaw, dueSort, satisfied, payload.obligationId);
}
