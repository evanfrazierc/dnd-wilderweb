/**
 * Computes the Annual Income & Upkeep breakdown live from currently-built buildings'
 * `annual_effect` rates (see `building_catalog` in schema.sql) plus the current garrison's
 * `unit_catalog.upkeep` rates (docs/adr/0017), replacing the old hand-written snapshot that
 * went stale the moment a building changed. Only buildings with a non-empty `annual_effect`
 * contribute -- see docs/adr/0009 for what's deliberately excluded (dice-gated effects,
 * population-scaled effects, player-invoked actions) and why that's a permanent scope
 * boundary, not a bug; the same exclusions apply to a unit's upkeep by the same reasoning.
 *
 * `annual_effect` is pre-signed (a building's own config decides income vs. upkeep), but
 * `unit_catalog.upkeep` is a plain positive magnitude -- "upkeep 1 Food" per the source, same
 * convention as `cost` -- so it's negated here rather than asking the catalog to store a
 * double-negative "-1 Food" for what's always a deduction.
 */
export async function computeAnnualIncomeUpkeep(db) {
  const totals = new Map();
  const contributions = new Map();

  function add(label, count, rate) {
    for (const [resource, delta] of Object.entries(rate)) {
      totals.set(resource, (totals.get(resource) ?? 0) + delta);
      if (!contributions.has(resource)) contributions.set(resource, []);
      contributions.get(resource).push({ label, count, delta });
    }
  }

  const catalog = await db.prepare("SELECT name, annual_effect FROM building_catalog").all();
  const rateByBuilding = new Map();
  for (const b of catalog) {
    const rate = JSON.parse(b.annual_effect || "{}");
    if (Object.keys(rate).length > 0) rateByBuilding.set(b.name, rate);
  }
  if (rateByBuilding.size > 0) {
    const counts = await db.prepare("SELECT building, SUM(count) as count FROM settlement_buildings GROUP BY building").all();
    for (const { building, count } of counts) {
      const rate = rateByBuilding.get(building);
      if (!rate) continue;
      add(building, count, Object.fromEntries(Object.entries(rate).map(([res, per]) => [res, per * count])));
    }
  }

  const unitCatalog = await db.prepare("SELECT name, upkeep FROM unit_catalog").all();
  const upkeepByUnit = new Map();
  for (const u of unitCatalog) {
    const upkeep = JSON.parse(u.upkeep || "{}");
    if (Object.keys(upkeep).length > 0) upkeepByUnit.set(u.name, upkeep);
  }
  if (upkeepByUnit.size > 0) {
    const garrison = await db.prepare("SELECT unit, count FROM garrison_units").all();
    for (const { unit, count } of garrison) {
      const upkeep = upkeepByUnit.get(unit);
      if (!upkeep) continue;
      add(unit, count, Object.fromEntries(Object.entries(upkeep).map(([res, per]) => [res, -per * count])));
    }
  }

  const lines = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, net]) => ({
      resource,
      net,
      breakdown: contributions.get(resource).map(
        ({ label, count, delta }) => `${delta >= 0 ? "+" : ""}${delta} (${count} × ${label})`,
      ),
    }));

  return { lines };
}
