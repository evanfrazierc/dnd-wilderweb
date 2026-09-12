/**
 * Best-effort outbound Discord notifications for campaign events
 * (docs/adr/0006-discord-webhook-and-paste-parse.md). Never blocks or fails the event
 * write: if DISCORD_WEBHOOK_URL isn't set, or the webhook call itself fails, the event
 * is still saved -- server/index.js surfaces the outcome in the response so the client
 * can tell the DM, but the save itself always succeeds regardless (same "never blocks"
 * spirit as docs/adr/0005-validation-warns-not-blocks.md).
 *
 * Posting is opt-in per event (the DM ticks a "Post to Discord" box when saving), not
 * automatic for every write -- see CONTEXT.md and the client's useEventSubmit.js.
 */

const EVENT_TITLE = {
  ResourceChanged: "Resource Change",
  BuildingConstructed: "Building Constructed",
  BuildingRemoved: "Building Removed",
  CalendarAdvanced: "Calendar Advanced",
  DeityAmended: "Deity Amended",
  LocationAmended: "Locations Updated",
  ObligationAmended: "Obligation Amended",
  DMRuling: "DM Ruling",
  UnitRaised: "Unit Raised",
  UnitLost: "Unit Lost",
};

const EVENT_COLOR = {
  ResourceChanged: 0xb8862f,
  BuildingConstructed: 0x3f6b52,
  BuildingRemoved: 0x8a4b2b,
  CalendarAdvanced: 0x4a6fa5,
  DeityAmended: 0x7a4b8a,
  LocationAmended: 0x4a6fa5,
  ObligationAmended: 0x7a7160,
  DMRuling: 0x7a7160,
  UnitRaised: 0x8a3f3f,
  UnitLost: 0x5a2b2b,
};

function formatChanges(changes) {
  const entries = Object.entries(changes || {});
  if (entries.length === 0) return null;
  return entries.map(([name, delta]) => `${delta >= 0 ? "+" : ""}${delta} ${name}`).join(", ");
}

function eventFields(event) {
  const { type, payload } = event;
  const fields = [];

  if (event.region) fields.push({ name: "Region", value: event.region, inline: true });

  switch (type) {
    case "ResourceChanged": {
      const changes = formatChanges(payload.changes);
      if (changes) fields.push({ name: "Changes", value: changes });
      break;
    }
    case "BuildingConstructed":
    case "BuildingRemoved": {
      const label = payload.displayName ? `${payload.displayName} (${payload.building})` : payload.building;
      fields.push({ name: "Building", value: label, inline: true });
      if (payload.count > 1) fields.push({ name: "Count", value: String(payload.count), inline: true });
      if (payload.detail) fields.push({ name: "Detail", value: payload.detail });
      break;
    }
    case "CalendarAdvanced":
      fields.push({ name: "New Date", value: `Year ${payload.year}, Month ${payload.month}, Day ${payload.day}` });
      break;
    case "DeityAmended": {
      fields.push({ name: "Deity", value: payload.name, inline: true });
      const changes = Object.entries(payload.changes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      if (changes) fields.push({ name: "Changes", value: changes });
      break;
    }
    case "LocationAmended": {
      fields.push({ name: "Kingdom", value: payload.name, inline: true });
      const changes = Object.entries(payload.changes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      if (changes) fields.push({ name: "Changes", value: changes });
      break;
    }
    case "ObligationAmended": {
      fields.push({ name: "Obligation", value: `#${payload.obligationId}`, inline: true });
      const changes = Object.entries(payload.changes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      if (changes) fields.push({ name: "Changes", value: changes });
      break;
    }
    case "UnitRaised":
    case "UnitLost": {
      fields.push({ name: "Unit", value: payload.unit, inline: true });
      if (payload.count > 1) fields.push({ name: "Count", value: String(payload.count), inline: true });
      if (payload.detail) fields.push({ name: "Detail", value: payload.detail });
      break;
    }
    case "DMRuling":
      break; // note-only by construction -- the note below is the summary
  }

  if (event.note) fields.push({ name: "Note", value: event.note });
  if (event.actor) fields.push({ name: "Posted by", value: event.actor, inline: true });

  return fields;
}

/** Pure and exported for testing -- the network call in notifyDiscord is the only impure part. */
export function buildEmbed(event) {
  return {
    title: EVENT_TITLE[event.type] || event.type,
    color: EVENT_COLOR[event.type] ?? 0xb8862f,
    fields: eventFields(event),
    footer: { text: event.gameDate },
  };
}

/** Returns { ok: true, skipped: true } with no network call when no webhook is configured,
 * { ok: true } on a successful post, or { ok: false, error } on any failure -- never throws. */
export async function notifyDiscord(event) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { ok: true, skipped: true };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [buildEmbed(event)] }),
    });
    if (!res.ok) return { ok: false, error: `Discord webhook returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
