/**
 * Applies one event's payload onto the projection tables. Always called inside the
 * same transaction as the event's insert (docs/adr/0001-hybrid-event-log-with-projections.md).
 */
export function applyProjection(db, event) {
  const { type, region, payload } = event;

  switch (type) {
    case "ResourceChanged":
      applyResourceChanged(db, event);
      break;
    case "BuildingConstructed":
      applyBuildingConstructed(db, region, payload);
      break;
    case "BuildingRemoved":
      applyBuildingRemoved(db, region, payload);
      break;
    case "CalendarAdvanced":
      applyCalendarAdvanced(db, payload);
      break;
    case "DeityAmended":
      applyDeityAmended(db, payload);
      break;
    case "LocationAmended":
      applyLocationAmended(db, payload);
      break;
    case "DMRuling":
      break; // no state change by construction (validate.js enforces this)
    default:
      throw new Error(`applyProjection: unknown event type ${type}`);
  }
}

function applyResourceChanged(db, event) {
  const { payload } = event;
  for (const [name, delta] of Object.entries(payload.changes || {})) {
    const row = db.prepare("SELECT * FROM resource_totals WHERE name = ?").get(name);
    if (!row) continue; // unknown resource: already surfaced as a warning, nothing to update
    db.prepare("UPDATE resource_totals SET value = value + ? WHERE grp = ? AND name = ?")
      .run(delta, row.grp, name);
  }

  if (payload.obligationId) {
    const obligation = db.prepare("SELECT * FROM obligations WHERE id = ?").get(payload.obligationId);
    if (obligation) {
      const paid = -1 * (payload.changes?.[obligation.repayment_resource] ?? 0);
      if (paid > 0) {
        const remaining = Math.max(0, obligation.amount_remaining - paid);
        db.prepare("UPDATE obligations SET amount_remaining = ?, satisfied = ? WHERE id = ?")
          .run(remaining, remaining <= 0 ? 1 : 0, obligation.id);
      }
    }
  }
}

function applyBuildingConstructed(db, region, payload) {
  const count = payload.count ?? 1;
  db.prepare(`
    INSERT INTO settlement_buildings (region, building, display_name, count, detail)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (region, building) DO UPDATE SET
      count = count + excluded.count,
      display_name = COALESCE(excluded.display_name, settlement_buildings.display_name),
      detail = COALESCE(excluded.detail, settlement_buildings.detail)
  `).run(region, payload.building, payload.displayName ?? null, count, payload.detail ?? null);
}

function applyBuildingRemoved(db, region, payload) {
  const count = payload.count ?? 1;
  const row = db.prepare("SELECT * FROM settlement_buildings WHERE region = ? AND building = ?")
    .get(region, payload.building);
  if (!row) return; // already surfaced as a warning
  const next = row.count - count;
  if (next <= 0) {
    db.prepare("DELETE FROM settlement_buildings WHERE id = ?").run(row.id);
  } else {
    db.prepare("UPDATE settlement_buildings SET count = ? WHERE id = ?").run(next, row.id);
  }
}

function applyCalendarAdvanced(db, payload) {
  db.prepare(`
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

function applyDeityAmended(db, payload) {
  const existing = db.prepare("SELECT * FROM deities WHERE name = ?").get(payload.name);
  const changes = payload.changes ?? {};
  const merged = {
    title: (changes.title !== undefined ? changes.title : existing?.title) ?? null,
    alignment: (changes.alignment !== undefined ? changes.alignment : existing?.alignment) ?? null,
    confirmed: (changes.confirmed !== undefined ? (changes.confirmed ? 1 : 0) : existing?.confirmed) ?? 0,
    note: (changes.note !== undefined ? changes.note : existing?.note) ?? null,
  };
  db.prepare(`
    INSERT INTO deities (name, title, alignment, confirmed, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET
      title = excluded.title, alignment = excluded.alignment,
      confirmed = excluded.confirmed, note = excluded.note
  `).run(payload.name, merged.title, merged.alignment, merged.confirmed, merged.note);
}

function applyLocationAmended(db, payload) {
  db.prepare(`
    INSERT INTO locations_state (id, data) VALUES (1, ?)
    ON CONFLICT (id) DO UPDATE SET data = excluded.data
  `).run(JSON.stringify(payload.data));
}
