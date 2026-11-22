import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { createEvent } from "../../server/db/events.js";
import { getProjection } from "../../server/db/read.js";
import { REFERENCE_RESOURCES, ValidationError } from "../../server/db/reference.js";
import {
  DEFAULT_WEATHER_TABLES, rollWeather, rollWeatherForMonth, weatherTableErrors, writeWeatherTables,
} from "../../server/db/weather.js";

// Spring/Summer are seasons with tables; Sarenith deliberately has none, to pin down the
// "advance into a month the DM hasn't described yet" path.
async function freshDb() {
  const db = await openDb(":memory:");
  const insert = db.prepare("INSERT INTO calendar_months (number, name, season, holidays) VALUES (?, ?, ?, '[]')");
  await insert.run(1, "Pelorune", "Spring");
  await insert.run(2, "Erastus", "Spring");
  await insert.run(4, "Sarenith", null);
  return db;
}

const SPRING_DATE = { gameDate: "Pelorune (1), 1st, 1225", payload: { year: 1225, month: 1, day: 1 } };

test("rollWeather reads the table with the die, one outcome per face", () => {
  const table = DEFAULT_WEATHER_TABLES.Spring;
  // rng() in [0, 1) maps onto faces 1..6 -- check both ends and one middle face, since an
  // off-by-one here would silently bias the whole system.
  assert.deepEqual(rollWeather(table, () => 0), { roll: 1, condition: "Storm" });
  assert.deepEqual(rollWeather(table, () => 0.999), { roll: 6, condition: "Clear" });
  assert.deepEqual(rollWeather(table, () => 0.5), { roll: 4, condition: "Overcast" });
});

test("rollWeather covers every face of the default tables and nothing else", () => {
  for (const [season, table] of Object.entries(DEFAULT_WEATHER_TABLES)) {
    const seen = new Set();
    for (let face = 1; face <= 6; face += 1) {
      const { roll, condition } = rollWeather(table, () => (face - 1) / 6);
      assert.equal(roll, face, `${season} face ${face}`);
      assert.ok(table.includes(condition));
      seen.add(condition);
    }
    assert.ok(seen.size > 1, `${season} should have more than one possible outcome`);
  }
});

test("rollWeatherForMonth rolls on the month's season, and rolls nothing for a season-less month", async () => {
  const db = await freshDb();

  const spring = await rollWeatherForMonth(db, 1);
  assert.equal(spring.season, "Spring");
  assert.ok(DEFAULT_WEATHER_TABLES.Spring.includes(spring.condition));
  assert.ok(spring.roll >= 1 && spring.roll <= 6);

  assert.equal(await rollWeatherForMonth(db, 4), null, "a month with no season has no weather");
  assert.equal(await rollWeatherForMonth(db, 99), null, "a month that isn't in the calendar has no weather");
});

test("CalendarAdvanced records a rolled condition in its own payload and projects it as current", async () => {
  const db = await freshDb();
  // A single-outcome table makes the roll deterministic without reaching into Math.random:
  // whatever face comes up, the condition is known, and the face is still recorded.
  await writeWeatherTables(db, { Spring: ["Mist", "Mist", "Mist", "Mist", "Mist", "Mist"] });

  const result = await createEvent(db, { type: "CalendarAdvanced", ...SPRING_DATE });
  assert.equal(result.ok, true);
  assert.equal(result.event.payload.weather.condition, "Mist");
  assert.equal(result.event.payload.weather.season, "Spring");
  assert.ok(result.event.payload.weather.roll >= 1 && result.event.payload.weather.roll <= 6);

  const calendar = await getProjection(db, "calendar");
  assert.deepEqual(calendar.currentDate.weather, {
    condition: "Mist",
    roll: result.event.payload.weather.roll,
  });
});

test("an explicit payload.weather is kept as-is rather than re-rolled, with no die recorded", async () => {
  const db = await freshDb();
  const result = await createEvent(db, {
    type: "CalendarAdvanced",
    ...SPRING_DATE,
    payload: { ...SPRING_DATE.payload, weather: { season: "Spring", condition: "Storm" } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.event.payload.weather, { season: "Spring", condition: "Storm" });

  const calendar = await getProjection(db, "calendar");
  assert.deepEqual(calendar.currentDate.weather, { condition: "Storm", roll: null });
});

test("CalendarAdvanced rejects a payload.weather with no condition", async () => {
  const db = await freshDb();
  for (const weather of [{}, { season: "Spring" }, { condition: "" }, { condition: "  " }]) {
    const result = await createEvent(db, {
      type: "CalendarAdvanced", ...SPRING_DATE, payload: { ...SPRING_DATE.payload, weather },
    });
    assert.equal(result.ok, false, `expected ${JSON.stringify(weather)} to be rejected`);
    assert.match(result.errors.join(), /weather/);
  }
});

test("advancing into a month with no season clears the previous date's weather", async () => {
  const db = await freshDb();
  await createEvent(db, { type: "CalendarAdvanced", ...SPRING_DATE });
  assert.ok((await getProjection(db, "calendar")).currentDate.weather);

  await createEvent(db, {
    type: "CalendarAdvanced",
    gameDate: "Sarenith (4), 1st, 1225",
    payload: { year: 1225, month: 4, day: 1 },
  });
  const calendar = await getProjection(db, "calendar");
  assert.equal(calendar.currentDate.weather, null, "stale weather must not read as today's");
});

test("the weather table round-trips through the calendarStructure reference resource", async () => {
  const db = await freshDb();
  const structure = await REFERENCE_RESOURCES.calendarStructure.read(db);
  assert.deepEqual(structure.weather, DEFAULT_WEATHER_TABLES, "an unedited campaign gets the defaults");

  const edited = { ...DEFAULT_WEATHER_TABLES, Spring: ["Storm", "Storm", "Rain", "Mist", " Clear ", "Clear"] };
  await REFERENCE_RESOURCES.calendarStructure.write(db, { ...structure, weather: edited });

  const saved = await REFERENCE_RESOURCES.calendarStructure.read(db);
  assert.deepEqual(saved.weather.Spring, ["Storm", "Storm", "Rain", "Mist", "Clear", "Clear"], "outcomes are trimmed");
  assert.deepEqual(saved.months.map((m) => m.name), ["Pelorune", "Erastus", "Sarenith"], "months survive a weather edit");
});

test("a calendarStructure write that omits weather leaves the stored table alone", async () => {
  const db = await freshDb();
  await writeWeatherTables(db, { Spring: ["Mist", "Mist", "Mist", "Mist", "Mist", "Mist"] });

  const { weather, ...withoutWeather } = await REFERENCE_RESOURCES.calendarStructure.read(db);
  await REFERENCE_RESOURCES.calendarStructure.write(db, withoutWeather);

  const saved = await REFERENCE_RESOURCES.calendarStructure.read(db);
  assert.deepEqual(saved.weather, { Spring: ["Mist", "Mist", "Mist", "Mist", "Mist", "Mist"] });
});

test("weatherTableErrors requires exactly six non-blank outcomes per season", () => {
  assert.deepEqual(weatherTableErrors(DEFAULT_WEATHER_TABLES), []);
  assert.match(weatherTableErrors({ Spring: ["Clear"] })[0], /exactly 6 outcomes/);
  assert.match(weatherTableErrors({ Spring: ["Clear", "Clear", "Clear", "Clear", "Clear", ""] })[0], /blank outcome/);
  assert.match(weatherTableErrors(["Clear"])[0], /season -> list of outcomes/);
  assert.match(weatherTableErrors(null)[0], /season -> list of outcomes/);
});

test("the reference write refuses a malformed weather table instead of storing it", async () => {
  const db = await freshDb();
  const structure = await REFERENCE_RESOURCES.calendarStructure.read(db);
  await assert.rejects(
    () => REFERENCE_RESOURCES.calendarStructure.write(db, { ...structure, weather: { Spring: ["Clear", "Rain"] } }),
    ValidationError,
  );
  const after = await REFERENCE_RESOURCES.calendarStructure.read(db);
  assert.deepEqual(after.weather, DEFAULT_WEATHER_TABLES, "the rejected write must not have landed");
});
