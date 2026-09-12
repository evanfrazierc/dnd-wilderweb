import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGameDate, ordinalSuffix, isCanonicalGameDate, canonicalizeGameDate } from "../../server/db/gameDate.js";

test("ordinalSuffix handles the 11th/12th/13th exceptions", () => {
  assert.equal(ordinalSuffix(1), "st");
  assert.equal(ordinalSuffix(2), "nd");
  assert.equal(ordinalSuffix(3), "rd");
  assert.equal(ordinalSuffix(4), "th");
  assert.equal(ordinalSuffix(11), "th");
  assert.equal(ordinalSuffix(12), "th");
  assert.equal(ordinalSuffix(13), "th");
  assert.equal(ordinalSuffix(21), "st");
  assert.equal(ordinalSuffix(22), "nd");
  assert.equal(ordinalSuffix(23), "rd");
});

test("parseGameDate reports hasDay so a day that was never on record isn't invented when reformatting", () => {
  assert.equal(parseGameDate("Month 3, 15th, 1225").hasDay, true);
  assert.equal(parseGameDate("Month 6, 1225").hasDay, false);
  assert.equal(parseGameDate("Pelorune (1) 16, 1225").hasDay, true);
  assert.equal(parseGameDate("Pelorune (1), 1226").hasDay, false);
  assert.equal(parseGameDate("1226").hasDay, false);
  assert.equal(parseGameDate("Month 6 to Month 12, 1226").hasDay, false);
});

test("parses '<Month> (<n>) <day>, <year>'", () => {
  const r = parseGameDate("Pelorune (1) 16, 1225");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1225, month: 1, day: 16 });
});

test("parses '<Month> (<n>), <year>' with no day", () => {
  const r = parseGameDate("Pelorune (1), 1226");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1226, month: 1, day: 1 });
});

test("parses 'Month <n>, <ordinal day>, <year>'", () => {
  const r = parseGameDate("Month 3, 15th, 1225");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1225, month: 3, day: 15 });
});

test("parses '<Name> (<n>), <ordinal day>, <year>' -- what GameDatePicker produces once it knows month names", () => {
  const r = parseGameDate("Erastus (2), 9th, 1227");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1227, month: 2, day: 9 });
});

test("parses 'Month <n>, <year>' with no day", () => {
  const r = parseGameDate("Month 6, 1225");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1225, month: 6, day: 1 });
});

test("parses a bare year", () => {
  const r = parseGameDate("1226");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1226, month: 1, day: 1 });
});

test("parses a month range by its first month", () => {
  const r = parseGameDate("Month 6 to Month 12, 1226");
  assert.equal(r.matched, true);
  assert.deepEqual({ year: r.year, month: r.month, day: r.day }, { year: 1226, month: 6, day: 1 });
});

test("falls back gracefully on unrecognized text, still extracting a year if present", () => {
  const r = parseGameDate("sometime around the harvest, 1226");
  assert.equal(r.matched, false);
  assert.equal(r.year, 1226);
});

test("sortKey orders dates chronologically regardless of source format", () => {
  const early = parseGameDate("Pelorune (1) 16, 1225");
  const mid = parseGameDate("Month 6, 1225");
  const late = parseGameDate("Pelorune (1), 1226");
  assert.ok(early.sortKey < mid.sortKey);
  assert.ok(mid.sortKey < late.sortKey);
});

// docs/adr/0016: the stricter gate for new writes, layered on top of parseGameDate's
// permissive parsing.
test("isCanonicalGameDate accepts only 'MonthName (N), Dth, YYYY'", () => {
  assert.equal(isCanonicalGameDate("Erastus (2), 9th, 1227"), true);
  assert.equal(isCanonicalGameDate("Pelorune (1), 1st, 1225"), true);
  assert.equal(isCanonicalGameDate("Month 2, 9th, 1227"), false); // no real month name
  assert.equal(isCanonicalGameDate("Erastus (2), 1227"), false); // no day
  assert.equal(isCanonicalGameDate("Erastus (2) 9th, 1227"), false); // missing comma before day
  assert.equal(isCanonicalGameDate("1226"), false); // bare year
  assert.equal(isCanonicalGameDate("Month 6 to Month 12, 1226"), false); // range
  assert.equal(isCanonicalGameDate("Erastus (2), 3th, 1227"), false); // wrong ordinal suffix
  assert.equal(isCanonicalGameDate("Erastus (13), 1st, 1227"), false); // month out of range
  assert.equal(isCanonicalGameDate(""), false);
  assert.equal(isCanonicalGameDate(null), false);
});

test("canonicalizeGameDate re-serializes a recognized date, defaulting a missing day to 1", () => {
  const monthNames = new Map([[1, "Pelorune"], [2, "Erastus"], [6, "Meloron"]]);
  assert.equal(canonicalizeGameDate("Month 2, 3th, 1227", monthNames), "Erastus (2), 3rd, 1227");
  assert.equal(canonicalizeGameDate("Pelorune (1), 1226", monthNames), "Pelorune (1), 1st, 1226");
  assert.equal(canonicalizeGameDate("Erastus (2), 9th, 1227", monthNames), "Erastus (2), 9th, 1227"); // already canonical
  assert.equal(canonicalizeGameDate("Month 6 to Month 12, 1226", monthNames), "Meloron (6), 1st, 1226"); // range -> first month
});

test("canonicalizeGameDate refuses to guess a month: bare years and unknown months return null", () => {
  const monthNames = new Map([[1, "Pelorune"]]);
  assert.equal(canonicalizeGameDate("1226", monthNames), null); // no month recorded at all
  assert.equal(canonicalizeGameDate("Month 6, 1226", monthNames), null); // month 6 not in this campaign's calendar
  assert.equal(canonicalizeGameDate("sometime around the harvest, 1226", monthNames), null); // unparseable
});
