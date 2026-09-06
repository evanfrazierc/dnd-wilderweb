/** Read helpers for projections (current campaign state), shaped to match the old data/*.json
 * files. Reference-data reads live in server/db/reference.js instead -- CONTEXT.md's
 * Projection and Reference data are different lifecycles, so they get different modules. */

import { computeAnnualIncomeUpkeep } from "./annualIncome.js";

export async function getProjection(db, resource) {
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

async function readStats(db) {
  const totals = await db.prepare("SELECT * FROM resource_totals").all();
  const defs = await db.prepare("SELECT * FROM resource_definitions").all();
  const byGroup = (grp) => Object.fromEntries(totals.filter((r) => r.grp === grp).map((r) => [r.name, r.value]));
  const descByGroup = (grp) => Object.fromEntries(defs.filter((r) => r.grp === grp).map((r) => [r.name, r.description]));
  const metaRow = await db.prepare("SELECT value FROM campaign_meta WHERE key = 'stats_meta'").get();
  const meta = metaRow ? JSON.parse(metaRow.value) : {};
  return {
    ...meta,
    annualIncomeUpkeep: await computeAnnualIncomeUpkeep(db),
    resources: byGroup("resources"),
    resourceDescriptions: descByGroup("resources"),
    assets: byGroup("assets"),
    assetDescriptions: descByGroup("assets"),
    society: byGroup("society"),
    societyDescriptions: descByGroup("society"),
  };
}

async function readSettlements(db) {
  const rows = await db.prepare("SELECT * FROM settlement_buildings ORDER BY region, building").all();
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

async function readCalendar(db) {
  const state = await db.prepare("SELECT * FROM calendar_state WHERE id = 1").get();
  const months = await db.prepare("SELECT * FROM calendar_months ORDER BY number").all();
  const monthName = state ? months.find((m) => m.number === state.month)?.name : null;
  const metaRow = await db.prepare("SELECT value FROM campaign_meta WHERE key = 'calendar_meta'").get();
  const meta = metaRow ? JSON.parse(metaRow.value) : {};
  return {
    ...meta,
    currentDate: state
      ? { year: state.year, yearLabel: state.year_label, month: state.month, monthName, day: state.day, note: state.note }
      : null,
    months: months.map((m) => ({ number: m.number, name: m.name, season: m.season, holidays: JSON.parse(m.holidays) })),
  };
}

async function readDeities(db) {
  const rows = await db.prepare("SELECT * FROM deities ORDER BY name").all();
  return rows.map((d) => ({
    name: d.name,
    title: d.title,
    alignment: d.alignment,
    confirmed: !!d.confirmed,
    note: d.note ?? undefined,
  }));
}

async function readLocations(db) {
  const row = await db.prepare("SELECT * FROM locations_state WHERE id = 1").get();
  return row ? JSON.parse(row.data) : {};
}
