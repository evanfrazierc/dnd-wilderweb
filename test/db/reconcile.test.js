import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../server/db/connection.js";
import { diffResourceTotals } from "../../server/db/reconcile.js";

function freshDb() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Wood', -13)").run();
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('resources', 'Food', 2)").run();
  db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES ('society', 'Piety', 1)").run();
  return db;
}

test("flags a resource where the replayed total disagrees with the snapshot", () => {
  const db = freshDb();
  const diff = diffResourceTotals(db, { resources: { Wood: 12, Food: 2 }, society: { Piety: 1 } });

  const wood = diff.find((d) => d.name === "Wood");
  assert.equal(wood.mismatch, true);
  assert.deepEqual({ replayed: wood.replayed, snapshot: wood.snapshot }, { replayed: -13, snapshot: 12 });
});

test("does not flag a resource where replay and snapshot agree", () => {
  const db = freshDb();
  const diff = diffResourceTotals(db, { resources: { Wood: 12, Food: 2 }, society: { Piety: 1 } });

  assert.equal(diff.find((d) => d.name === "Food").mismatch, false);
  assert.equal(diff.find((d) => d.name === "Piety").mismatch, false);
});

test("a name missing from the snapshot is reported as a mismatch, not silently skipped", () => {
  const db = freshDb();
  const diff = diffResourceTotals(db, { resources: {}, society: { Piety: 1 } });

  const wood = diff.find((d) => d.name === "Wood");
  assert.equal(wood.mismatch, true);
  assert.equal(wood.snapshot, undefined);
});
