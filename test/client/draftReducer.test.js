import { test } from "node:test";
import assert from "node:assert/strict";
import { draftReducer, isDirty } from "../../client/src/lib/draftReducer.js";

test("set replaces a value at a top-level path on an object draft", () => {
  const next = draftReducer({ era: "Old", months: [] }, { type: "set", path: ["era"], value: "New" });
  assert.deepEqual(next, { era: "New", months: [] });
});

test("set replaces a whole item in an array draft (root path)", () => {
  const next = draftReducer(
    [{ name: "Wood" }, { name: "Stone" }],
    { type: "set", path: [1], value: { name: "Iron" } },
  );
  assert.deepEqual(next, [{ name: "Wood" }, { name: "Iron" }]);
});

test("set replaces a bare-value item nested inside an object's array field", () => {
  const next = draftReducer(
    { paragraphs: ["a", "b"] },
    { type: "set", path: ["paragraphs", 1], value: "c" },
  );
  assert.deepEqual(next, { paragraphs: ["a", "c"] });
});

test("set replaces an object item nested inside an object's array field", () => {
  const next = draftReducer(
    { months: [{ number: 1, name: "Firstmonth" }] },
    { type: "set", path: ["months", 0], value: { number: 1, name: "Renamed" } },
  );
  assert.deepEqual(next, { months: [{ number: 1, name: "Renamed" }] });
});

test("set with an empty path replaces the entire draft", () => {
  const next = draftReducer({ old: true }, { type: "set", path: [], value: { fresh: true } });
  assert.deepEqual(next, { fresh: true });
});

test("addItem appends to an array draft at the root", () => {
  const next = draftReducer([{ name: "Wood" }], {
    type: "addItem",
    path: [],
    factory: () => ({ name: "Stone" }),
  });
  assert.deepEqual(next, [{ name: "Wood" }, { name: "Stone" }]);
});

test("addItem appends to a named array field", () => {
  const next = draftReducer({ era: "Old", months: [{ number: 1 }] }, {
    type: "addItem",
    path: ["months"],
    factory: () => ({ number: 2 }),
  });
  assert.deepEqual(next, { era: "Old", months: [{ number: 1 }, { number: 2 }] });
});

test("removeItem deletes from an array draft at the root", () => {
  const next = draftReducer([{ name: "Wood" }, { name: "Stone" }], {
    type: "removeItem",
    path: [],
    index: 0,
  });
  assert.deepEqual(next, [{ name: "Stone" }]);
});

test("removeItem deletes from a named array field, leaving sibling fields untouched", () => {
  const next = draftReducer({ era: "Old", months: [{ number: 1 }, { number: 2 }] }, {
    type: "removeItem",
    path: ["months"],
    index: 0,
  });
  assert.deepEqual(next, { era: "Old", months: [{ number: 2 }] });
});

test("reset replaces the draft outright", () => {
  const next = draftReducer({ stale: true }, { type: "reset", value: { fresh: true } });
  assert.deepEqual(next, { fresh: true });
});

test("does not mutate the original draft", () => {
  const original = { months: [{ number: 1 }] };
  draftReducer(original, { type: "addItem", path: ["months"], factory: () => ({ number: 2 }) });
  assert.deepEqual(original, { months: [{ number: 1 }] });
});

test("an unknown action type throws", () => {
  assert.throws(() => draftReducer({}, { type: "bogus" }), /unknown action type/);
});

test("isDirty is false for equal content even across different object identities", () => {
  assert.equal(isDirty([{ name: "Wood" }], [{ name: "Wood" }]), false);
});

test("isDirty is true when content differs", () => {
  assert.equal(isDirty([{ name: "Wood" }], [{ name: "Stone" }]), true);
});
