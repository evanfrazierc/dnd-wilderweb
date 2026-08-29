import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGameDate } from "../../server/db/gameDate.js";

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
