const ORDINAL_DAY = "(\\d{1,2})(?:st|nd|rd|th)?";

// `hasDay` distinguishes "no day was actually written" from parseGameDate's `day: 1` default
// for that case -- ensureConsistentDateFormatting (connection.js) needs to know which, so a
// reformat doesn't invent a day that was never on record.
const PATTERNS = [
  // "Month 6 to Month 12, 1226" -- a range; sort by the first month, day 1.
  { re: new RegExp(`^Month\\s+(\\d{1,2})\\s+to\\s+Month\\s+\\d{1,2},\\s*(\\d+)$`, "i"),
    extract: (m) => ({ month: Number(m[1]), day: 1, year: Number(m[2]), hasDay: false }) },
  // "Month 3, 15th, 1225"
  { re: new RegExp(`^Month\\s+(\\d{1,2}),\\s*${ORDINAL_DAY},\\s*(\\d+)$`, "i"),
    extract: (m) => ({ month: Number(m[1]), day: Number(m[2]), year: Number(m[3]), hasDay: true }) },
  // "Erastus (2), 9th, 1227" -- the named-month counterpart of the pattern above; what
  // GameDatePicker (client/src/lib/gameDate.js) produces once it knows the campaign's actual
  // month names, instead of always falling back to a bare "Month N".
  { re: new RegExp(`^([A-Za-z']+)\\s*\\((\\d{1,2})\\),\\s*${ORDINAL_DAY},\\s*(\\d+)$`, "i"),
    extract: (m) => ({ month: Number(m[2]), day: Number(m[3]), year: Number(m[4]), hasDay: true }) },
  // "Month 6, 1225"
  { re: /^Month\s+(\d{1,2}),\s*(\d+)$/i,
    extract: (m) => ({ month: Number(m[1]), day: 1, year: Number(m[2]), hasDay: false }) },
  // "Pelorune (1) 16, 1225"
  { re: /^([A-Za-z']+)\s*\((\d{1,2})\)\s*(\d{1,2}),\s*(\d+)$/,
    extract: (m) => ({ month: Number(m[2]), day: Number(m[3]), year: Number(m[4]), hasDay: true }) },
  // "Pelorune (1), 1226" (no day)
  { re: /^([A-Za-z']+)\s*\((\d{1,2})\),\s*(\d+)$/,
    extract: (m) => ({ month: Number(m[2]), day: 1, year: Number(m[3]), hasDay: false }) },
  // bare year: "1226"
  { re: /^(\d+)$/,
    extract: (m) => ({ month: 1, day: 1, year: Number(m[1]), hasDay: false }) },
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
    const { year, month, day, hasDay } = extract(m);
    return {
      year,
      month,
      day,
      hasDay,
      sortKey: sortKey(year, month, day, daysPerMonth),
      matched: true,
    };
  }

  const yearMatch = trimmed.match(/(\d{3,4})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  return { year, month: 1, day: 1, hasDay: false, sortKey: sortKey(year, 1, 1, daysPerMonth), matched: false };
}

function sortKey(year, month, day, daysPerMonth) {
  return year * (daysPerMonth * 12) + (month - 1) * daysPerMonth + (day - 1);
}

// 3 -> "rd", 11 -> "th" (not "st"), 21 -> "st".
export function ordinalSuffix(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// The one shape every gameDate/dueGameDate is required to have from here on (docs/adr/0016):
// a real month name, its number in parens, an ordinal day, and a year -- "Erastus (2), 9th,
// 1227". Exactly what formatGameDate (client/src/lib/gameDate.js) always produces and
// canonicalizeGameDate below always re-serializes to. parseGameDate above stays deliberately
// lenient (it still has to make sense of every shape already sitting in the database); this is
// the separate, stricter gate for what's allowed in going forward.
const CANONICAL_RE = /^[A-Za-z]+ \((\d{1,2})\), (\d{1,2})(st|nd|rd|th), (\d{3,4})$/;

export function isCanonicalGameDate(raw) {
  if (typeof raw !== "string") return false;
  const m = raw.match(CANONICAL_RE);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return ordinalSuffix(day) === m[3]; // rejects "3th" -- must be "3rd"
}

// Re-serializes any gameDate string parseGameDate recognizes into the canonical shape above,
// given a month-number -> month-name lookup (server/db/connection.js's getDb reads this from
// calendar_months; migrate.js has it from calendar.json). A day the source never recorded
// becomes day 1 -- parseGameDate already defaults it that way, and a placeholder day is a much
// smaller, uniformly-applied assumption than inventing a month would be. Returns null (leave
// the caller's own value alone) when there's a bigger gap than that to fabricate: a bare year
// (no month at all -- e.g. "1226"), text that doesn't parse, or a month number this campaign's
// calendar doesn't have a name for.
export function canonicalizeGameDate(raw, monthNames) {
  const trimmed = String(raw ?? "").trim();
  if (/^\d+$/.test(trimmed)) return null;
  const parsed = parseGameDate(raw);
  if (!parsed.matched) return null;
  const name = monthNames.get(parsed.month);
  if (!name) return null;
  return `${name} (${parsed.month}), ${parsed.day}${ordinalSuffix(parsed.day)}, ${parsed.year}`;
}
