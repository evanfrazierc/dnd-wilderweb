/**
 * Diffs the replayed resource_totals projection against a stats.json-shaped snapshot.
 * Used by scripts/migrate.js's report, split out so the comparison itself is testable
 * without running the whole migration (Q10: surface mismatches, don't hide them).
 */
export function diffResourceTotals(db, statsSnapshot) {
  const rows = db.prepare("SELECT * FROM resource_totals ORDER BY grp, name").all();
  return rows.map((row) => {
    const snapshot = statsSnapshot[row.grp]?.[row.name];
    return { grp: row.grp, name: row.name, replayed: row.value, snapshot, mismatch: snapshot !== row.value };
  });
}
