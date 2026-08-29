import { parseGameDate } from "./gameDate.js";

/**
 * Structural checks: is this a well-formed event of its type at all. These reject
 * the write (400) -- they're about malformed requests, not in-game validity.
 */
export function validateShape(type, { note, region, payload }) {
  const errors = [];

  switch (type) {
    case "ResourceChanged": {
      if (!payload || typeof payload.changes !== "object" || payload.changes === null) {
        errors.push("ResourceChanged requires payload.changes (an object of resource -> delta)");
      } else if (Object.keys(payload.changes).length === 0 && !payload.counterparty) {
        errors.push("ResourceChanged requires at least one non-zero entry in payload.changes");
      }
      break;
    }
    case "BuildingConstructed":
    case "BuildingRemoved": {
      if (!payload?.building) errors.push(`${type} requires payload.building`);
      if (!region) errors.push(`${type} requires a region`);
      break;
    }
    case "CalendarAdvanced": {
      if (!payload || typeof payload.year !== "number" || typeof payload.month !== "number" || typeof payload.day !== "number") {
        errors.push("CalendarAdvanced requires payload.year, payload.month, payload.day (numbers)");
      }
      break;
    }
    case "DeityAmended": {
      if (!payload?.name) errors.push("DeityAmended requires payload.name");
      break;
    }
    case "LocationAmended": {
      if (!payload || typeof payload.data !== "object" || payload.data === null) {
        errors.push("LocationAmended requires payload.data (the full updated locations document)");
      }
      if (!note || !note.trim()) {
        errors.push("LocationAmended requires a non-empty note describing what changed -- payload.data replaces the whole document, so the note is the only readable record of the change");
      }
      break;
    }
    case "DMRuling": {
      if (!note || !note.trim()) errors.push("DMRuling requires a non-empty note");
      if (payload && payload.changes && Object.keys(payload.changes).length > 0) {
        errors.push("DMRuling must not carry payload.changes -- use ResourceChanged instead");
      }
      break;
    }
    default:
      errors.push(`Unknown event type: ${type}`);
  }

  return errors;
}

/**
 * In-game validity checks: warns, never blocks (docs/adr/0005-validation-warns-not-blocks.md).
 * Returns a list of warning strings to store alongside the event.
 */
export function checkWarnings(db, type, { region, payload }) {
  const warnings = [];

  if (type === "ResourceChanged") {
    for (const [name, delta] of Object.entries(payload.changes || {})) {
      const row = findResourceRow(db, name);
      if (!row) {
        warnings.push(`Unknown resource name "${name}" -- not in resource_totals`);
        continue;
      }
      const next = row.value + delta;
      if (next < 0) {
        warnings.push(`${name} would go negative (${row.value} -> ${next})`);
      }
    }

    if (payload.obligationId) {
      const obligation = db.prepare("SELECT * FROM obligations WHERE id = ?").get(payload.obligationId);
      if (!obligation) {
        warnings.push(`References obligation #${payload.obligationId}, which does not exist`);
      } else {
        const paid = -1 * (payload.changes?.[obligation.repayment_resource] ?? 0);
        if (paid <= 0) {
          warnings.push(`References obligation #${payload.obligationId} but has no negative ${obligation.repayment_resource} delta -- this will not reduce its balance`);
        }
      }
    }
  }

  if (type === "BuildingConstructed") {
    const catalog = db.prepare("SELECT * FROM building_catalog WHERE name = ?").get(payload.building);
    if (!catalog) {
      warnings.push(`"${payload.building}" is not in the building catalog`);
    } else {
      const requires = JSON.parse(catalog.requires || "[]");
      for (const req of requires) {
        const present = db
          .prepare("SELECT 1 FROM settlement_buildings WHERE region = ? AND building = ?")
          .get(region, req);
        if (!present) {
          warnings.push(`"${payload.building}" requires "${req}", not yet built in ${region}`);
        }
      }
    }
  }

  if (type === "BuildingRemoved") {
    const present = db
      .prepare("SELECT count FROM settlement_buildings WHERE region = ? AND building = ?")
      .get(region, payload.building);
    if (!present || present.count < (payload.count ?? 1)) {
      warnings.push(`Removing more "${payload.building}" from ${region} than are recorded as built`);
    }
  }

  if (type === "CalendarAdvanced") {
    const current = db.prepare("SELECT * FROM calendar_state WHERE id = 1").get();
    if (current) {
      const next = parseGameDate(`Month ${payload.month}, ${payload.day}th, ${payload.year}`);
      const currentSort = parseGameDate(`Month ${current.month}, ${current.day}th, ${current.year}`);
      if (next.sortKey <= currentSort.sortKey) {
        warnings.push(`Calendar date is not moving forward (was year ${current.year} month ${current.month} day ${current.day})`);
      }
    }
  }

  return warnings;
}

function findResourceRow(db, name) {
  return db.prepare("SELECT * FROM resource_totals WHERE name = ?").get(name);
}
