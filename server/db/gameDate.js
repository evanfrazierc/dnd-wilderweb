const ORDINAL_DAY = "(\\d{1,2})(?:st|nd|rd|th)?";

const PATTERNS = [
  // "Month 6 to Month 12, 1226" -- a range; sort by the first month, day 1.
  { re: new RegExp(`^Month\\s+(\\d{1,2})\\s+to\\s+Month\\s+\\d{1,2},\\s*(\\d+)$`, "i"),
    extract: (m) => ({ month: Number(m[1]), day: 1, year: Number(m[2]) }) },
  // "Month 3, 15th, 1225"
  { re: new RegExp(`^Month\\s+(\\d{1,2}),\\s*${ORDINAL_DAY},\\s*(\\d+)$`, "i"),
    extract: (m) => ({ month: Number(m[1]), day: Number(m[2]), year: Number(m[3]) }) },
  // "Month 6, 1225"
  { re: /^Month\s+(\d{1,2}),\s*(\d+)$/i,
    extract: (m) => ({ month: Number(m[1]), day: 1, year: Number(m[2]) }) },
  // "Pelorune (1) 16, 1225"
  { re: /^([A-Za-z']+)\s*\((\d{1,2})\)\s*(\d{1,2}),\s*(\d+)$/,
    extract: (m) => ({ month: Number(m[2]), day: Number(m[3]), year: Number(m[4]) }) },
  // "Pelorune (1), 1226" (no day)
  { re: /^([A-Za-z']+)\s*\((\d{1,2})\),\s*(\d+)$/,
    extract: (m) => ({ month: Number(m[2]), day: 1, year: Number(m[3]) }) },
  // bare year: "1226"
  { re: /^(\d+)$/,
    extract: (m) => ({ month: 1, day: 1, year: Number(m[1]) }) },
];

/**
 * Best-effort parse of the freeform gameDate strings in history.json into a sortable
 * key. Every entry keeps its original raw string for display regardless of whether
 * parsing succeeds (Q15 / CONTEXT.md: gameDate is the timeline's primary sort key).
 */
export function parseGameDate(raw, { daysPerMonth = 30 } = {}) {
  const trimmed = String(raw ?? "").trim();

  for (const { re, extract } of PATTERNS) {
    const m = trimmed.match(re);
    if (!m) continue;
    const { year, month, day } = extract(m);
    return {
      year,
      month,
      day,
      sortKey: sortKey(year, month, day, daysPerMonth),
      matched: true,
    };
  }

  const yearMatch = trimmed.match(/(\d{3,4})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  return { year, month: 1, day: 1, sortKey: sortKey(year, 1, 1, daysPerMonth), matched: false };
}

function sortKey(year, month, day, daysPerMonth) {
  return year * (daysPerMonth * 12) + (month - 1) * daysPerMonth + (day - 1);
}
