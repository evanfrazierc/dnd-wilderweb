/** Read helpers for projections and reference tables, shaped to match the old data/*.json files. */

export function getProjection(db, resource) {
  switch (resource) {
    case "stats":
      return readStats(db);
    case "settlements":
      return readSettlements(db);
    case "calendar":
      return readCalendar(db);
    case "deities":
      return readDeities(db);
    case "locations":
      return readLocations(db);
    default:
      return null;
  }
}

function readStats(db) {
  const totals = db.prepare("SELECT * FROM resource_totals").all();
  const defs = db.prepare("SELECT * FROM resource_definitions").all();
  const byGroup = (grp) => Object.fromEntries(totals.filter((r) => r.grp === grp).map((r) => [r.name, r.value]));
  const descByGroup = (grp) => Object.fromEntries(defs.filter((r) => r.grp === grp).map((r) => [r.name, r.description]));
  const metaRow = db.prepare("SELECT value FROM campaign_meta WHERE key = 'stats_meta'").get();
  const meta = metaRow ? JSON.parse(metaRow.value) : {};
  return {
    ...meta,
    resources: byGroup("resources"),
    resourceDescriptions: descByGroup("resources"),
    assets: byGroup("assets"),
    assetDescriptions: descByGroup("assets"),
    society: byGroup("society"),
    societyDescriptions: descByGroup("society"),
  };
}

function readSettlements(db) {
  const rows = db.prepare("SELECT * FROM settlement_buildings ORDER BY region, building").all();
  const byRegion = new Map();
  for (const row of rows) {
    if (!byRegion.has(row.region)) byRegion.set(row.region, []);
    byRegion.get(row.region).push({
      name: row.building,
      displayName: row.display_name ?? undefined,
      count: row.count,
      detail: row.detail ?? undefined,
    });
  }
  return Array.from(byRegion.entries()).map(([region, buildings]) => ({ region, buildings }));
}

function readCalendar(db) {
  const state = db.prepare("SELECT * FROM calendar_state WHERE id = 1").get();
  const months = db.prepare("SELECT * FROM calendar_months ORDER BY number").all();
  return {
    currentDate: state
      ? { year: state.year, yearLabel: state.year_label, month: state.month, day: state.day, note: state.note }
      : null,
    months: months.map((m) => ({ number: m.number, name: m.name, season: m.season, holidays: JSON.parse(m.holidays) })),
  };
}

function readDeities(db) {
  return db.prepare("SELECT * FROM deities ORDER BY name").all().map((d) => ({
    name: d.name,
    title: d.title,
    alignment: d.alignment,
    confirmed: !!d.confirmed,
    note: d.note ?? undefined,
  }));
}

function readLocations(db) {
  const row = db.prepare("SELECT * FROM locations_state WHERE id = 1").get();
  return row ? JSON.parse(row.data) : {};
}

export function getReference(db, resource) {
  switch (resource) {
    case "buildings":
      return db.prepare("SELECT * FROM building_catalog ORDER BY name").all().map((b) => ({
        name: b.name,
        category: b.category,
        effect: b.effect,
        cost: JSON.parse(b.cost),
        costNote: b.cost_note ?? undefined,
        upkeep: b.upkeep ?? undefined,
        buildTime: b.build_time ?? undefined,
        requires: JSON.parse(b.requires),
      }));
    case "introduction": {
      const row = db.prepare("SELECT value FROM campaign_meta WHERE key = 'introduction'").get();
      return row ? JSON.parse(row.value) : null;
    }
    default:
      return null;
  }
}
