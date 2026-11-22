/**
 * The seasonal weather table and the d6 roll that reads from it (docs/adr/0020).
 *
 * Weather is rolled once, server-side, when a CalendarAdvanced event is created, and recorded
 * in that event's own payload -- so a date's weather is history like everything else here, not
 * something re-derived (and silently re-randomized) on every read.
 *
 * The table itself is reference data (CONTEXT.md: static rules, edited directly, no event
 * history). It travels as the `weather` field of the `calendarStructure` reference resource
 * rather than a resource of its own, because its keys are exactly the season names that same
 * resource's month rows assign -- renaming a season and retuning its weather is one edit.
 */

export const WEATHER_TABLE_SIZE = 6; // one outcome per face of a d6

/**
 * The campaign's starting table. Reads fall back to this rather than to "no weather at all",
 * so rolling works on a fresh database and on this campaign's existing one with no seeding
 * step -- a stored table only ever exists because the DM edited one.
 */
export const DEFAULT_WEATHER_TABLES = {
  Spring: ["Storm", "Rain", "Mist", "Overcast", "Clear", "Clear"],
  Summer: ["Rain", "Overcast", "Clear", "Clear", "Clear", "Heat"],
  Autumn: ["Storm", "Rain", "Mist", "Overcast", "Overcast", "Clear"],
  Winter: ["Blizzard", "Snow", "Snow", "Overcast", "Overcast", "Clear"],
};

export async function readWeatherTables(db) {
  const row = await db.prepare("SELECT value FROM campaign_meta WHERE key = 'weather_tables'").get();
  return row ? JSON.parse(row.value) : structuredClone(DEFAULT_WEATHER_TABLES);
}

export async function writeWeatherTables(db, tables) {
  await db.prepare(`
    INSERT INTO campaign_meta (key, value) VALUES ('weather_tables', ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(tables));
}

/** Structural problems with a weather-table document, as a list of messages (empty when it's
 * fine). Season names themselves are never checked against the month list: a table for a season
 * no month currently uses is harmless, and the DM may well write one before renaming the months
 * to match. */
export function weatherTableErrors(tables) {
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    return ["The weather table must be an object of season -> list of outcomes"];
  }

  const errors = [];
  for (const [season, outcomes] of Object.entries(tables)) {
    if (!Array.isArray(outcomes) || outcomes.length !== WEATHER_TABLE_SIZE) {
      errors.push(`"${season}" needs exactly ${WEATHER_TABLE_SIZE} outcomes, one per face of the d6`);
      continue;
    }
    if (outcomes.some((o) => typeof o !== "string" || !o.trim())) {
      errors.push(`"${season}" has a blank outcome; every face of the d6 needs a condition`);
    }
  }
  return errors;
}

/** Trims season names and outcomes, so a table saved from the editor's text inputs doesn't
 * carry stray whitespace into the event payloads that then quote it back. */
export function normalizeWeatherTables(tables) {
  return Object.fromEntries(
    Object.entries(tables).map(([season, outcomes]) => [season.trim(), outcomes.map((o) => o.trim())]),
  );
}

/** The table IS the die: six outcomes means a d6, which is the whole point of the shape the DM
 * wrote it in. A table of some other length (only reachable by editing the database by hand --
 * the reference write refuses anything but six) rolls a die of that size rather than indexing
 * off the end. `rng` is injectable for tests; nothing in the app passes it. */
export function rollWeather(table, rng = Math.random) {
  const roll = Math.floor(rng() * table.length) + 1;
  return { roll, condition: table[roll - 1] };
}

/** Rolls for whichever season the given month number falls in. Returns null -- no weather, not
 * an error -- when that month has no season assigned or its season has no table: a calendar the
 * DM hasn't finished describing still has to be able to advance (ADR-0005's spirit). */
export async function rollWeatherForMonth(db, month, rng) {
  const row = await db.prepare("SELECT season FROM calendar_months WHERE number = ?").get(month);
  const season = row?.season;
  if (!season) return null;

  const table = (await readWeatherTables(db))[season];
  if (!Array.isArray(table) || table.length === 0) return null;

  return { season, ...rollWeather(table, rng) };
}

/** CalendarAdvanced's payload with a rolled `weather` attached. An explicit payload.weather is
 * left exactly as it came in -- that's the DM hand-picking the day's weather, or a historical
 * event being re-imported -- so this never re-rolls what someone already decided. */
export async function withWeatherRoll(db, payload, rng) {
  if (payload.weather) return payload;
  const weather = await rollWeatherForMonth(db, payload.month, rng);
  return weather ? { ...payload, weather } : payload;
}
