#!/usr/bin/env node
// Dumps the database's current projections + reference data back to data/*.json,
// in the same shape as before the migration, so the repo keeps a git-diffable
// backup even though the database itself is the source of truth (ADR-0002 / Q7).
// Also writes data/events.json, a full dump of the event log.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { openDb } from "../server/db/connection.js";
import { getProjection, getReference } from "../server/db/read.js";
import { listEvents } from "../server/db/events.js";
import { listObligations } from "../server/db/obligations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "campaign.db");

async function writeJson(name, value) {
  await writeFile(path.join(dataDir, `${name}.json`), JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function main() {
  console.log(
    "This overwrites data/*.json with the database's current state.\n" +
    "Until Phase 2 switches the client onto the database, those files are what the\n" +
    "running app actually reads/writes -- don't run this against a DB you haven't\n" +
    "reconciled with the live data yet (see the migration report's MISMATCH lines).\n",
  );

  const db = openDb(dbPath);

  await writeJson("stats", getProjection(db, "stats"));
  await writeJson("settlements", getProjection(db, "settlements"));
  await writeJson("calendar", getProjection(db, "calendar"));
  await writeJson("deities", getProjection(db, "deities"));
  await writeJson("locations", getProjection(db, "locations"));
  await writeJson("buildings", getReference(db, "buildings"));
  await writeJson("introduction", getReference(db, "introduction"));
  await writeJson("events", listEvents(db, { limit: 100000 }));
  await writeJson("obligations", listObligations(db));

  db.close();
  console.log(`Exported current state to ${dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
