/**
 * Computes the Annual Income & Upkeep breakdown live from currently-built buildings'
 * `annual_effect` rates (see `building_catalog` in schema.sql), replacing the old
 * hand-written snapshot that went stale the moment a building changed. Only buildings with
 * a non-empty `annual_effect` contribute -- see docs/adr/0009 for what's deliberately
 * excluded (dice-gated effects, population-scaled effects, player-invoked actions) and why
 * that's a permanent scope boundary, not a bug.
 */
export async function computeAnnualIncomeUpkeep(db) {
  const catalog = await db.prepare("SELECT name, annual_effect FROM building_catalog").all();
  const rateByBuilding = new Map();
  for (const b of catalog) {
    const rate = JSON.parse(b.annual_effect || "{}");
    if (Object.keys(rate).length > 0) rateByBuilding.set(b.name, rate);
  }
  if (rateByBuilding.size === 0) return { lines: [] };

  const counts = await db.prepare("SELECT building, SUM(count) as count FROM settlement_buildings GROUP BY building").all();

  const totals = new Map();
  const contributions = new Map();
  for (const { building, count } of counts) {
    const rate = rateByBuilding.get(building);
    if (!rate) continue;
    for (const [resource, perBuilding] of Object.entries(rate)) {
      const delta = perBuilding * count;
      totals.set(resource, (totals.get(resource) ?? 0) + delta);
      if (!contributions.has(resource)) contributions.set(resource, []);
      contributions.get(resource).push({ building, count, delta });
    }
  }

  const lines = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, net]) => ({
      resource,
      net,
      breakdown: contributions.get(resource).map(
        ({ building, count, delta }) => `${delta >= 0 ? "+" : ""}${delta} (${count} × ${building})`,
      ),
    }));

  return { lines };
}
