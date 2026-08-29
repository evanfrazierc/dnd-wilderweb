import { test } from "node:test";
import assert from "node:assert/strict";
import { rollEncounter, hexDistance } from "../src/wilderweb.js";

test("rollEncounter returns an entry from the terrain's table", () => {
  const result = rollEncounter("forest", () => 0);
  assert.equal(result, "wolves");
});

test("rollEncounter throws on unknown terrain", () => {
  assert.throws(() => rollEncounter("desert"), /Unknown terrain/);
});

test("hexDistance measures neighboring hexes as 1", () => {
  assert.equal(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 }), 1);
});

test("hexDistance measures a longer path", () => {
  assert.equal(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 }), 2);
});
