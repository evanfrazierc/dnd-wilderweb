// One human-readable line per event, favoring what actually happened (a resource delta, a
// building, a unit, which fields changed) over the raw type name -- shared by StatusBar's
// "latest entry" badge and Timeline's event list, so the two never drift apart on how an
// event reads.

// "+3 Wealth, -1 Wood" -- omits zero deltas (a ResourceChanged with a counterparty and a net
// wash of 0 is still meaningful, but has nothing to list here).
function changesSummary(changes) {
  const entries = Object.entries(changes || {}).filter(([, delta]) => delta !== 0);
  if (entries.length === 0) return null;
  return entries.map(([name, delta]) => `${delta > 0 ? "+" : ""}${delta} ${name}`).join(", ");
}

// "confirmed, title" -- which fields payload.changes actually touched, for the *Amended
// types below (DeityAmended/LocationAmended), which otherwise only name *what* was amended,
// not what about it changed.
function changedFieldsSummary(changes) {
  const keys = Object.keys(changes || {});
  return keys.length ? ` (${keys.join(", ")})` : "";
}

function countPrefix(count) {
  return count > 1 ? `${count}x ` : "";
}

export function summarizeEvent(event) {
  const { type, payload, region, note } = event;
  switch (type) {
    case "ResourceChanged": {
      const changes = changesSummary(payload?.changes);
      if (payload?.newObligation) {
        return `New loan: ${payload.newObligation.description}${changes ? ` (${changes})` : ""}`;
      }
      if (payload?.obligationId && changes) return `Loan repayment: ${changes}`;
      return changes || note || "Resource change";
    }
    case "BuildingConstructed": {
      const label = payload?.displayName || payload?.building;
      return `Built ${countPrefix(payload?.count)}${label}${region ? ` in ${region}` : ""}`;
    }
    case "BuildingRemoved":
      return `Removed ${countPrefix(payload?.count)}${payload?.building}${region ? ` from ${region}` : ""}`;
    case "BuildingAmended":
      return `Edited ${payload?.building}${region ? ` in ${region}` : ""}${changedFieldsSummary(payload?.changes)}`;
    case "CalendarAdvanced":
      return `Advanced to ${event.gameDate}`;
    case "DeityAmended":
      return `Updated ${payload?.name}${changedFieldsSummary(payload?.changes)}`;
    case "LocationAmended":
      return `Updated ${payload?.name}${changedFieldsSummary(payload?.changes)}`;
    case "ObligationAmended":
      if (payload?.changes?.satisfied === true) return "Loan forgiven";
      if (payload?.changes?.satisfied === false) return "Loan reinstated";
      if (payload?.changes?.description) return `Loan updated: ${payload.changes.description}`;
      if (payload?.changes?.dueGameDate) return "Loan due date updated";
      return "Loan updated";
    case "UnitRaised":
      return `Raised ${countPrefix(payload?.count)}${payload?.unit}`;
    case "UnitLost":
      return `Lost ${countPrefix(payload?.count)}${payload?.unit}`;
    case "DMRuling":
      return note || "DM ruling";
    default:
      return note || type;
  }
}
