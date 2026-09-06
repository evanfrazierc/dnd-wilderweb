#!/usr/bin/env node
// Dumps the database's current projections + reference data back to data/*.json,
// in the same shape as before the migration, so the repo keeps a git-diffable
// backup even though the database itself is the source of truth (ADR-0002 / Q7).
// Also writes data/events.json, a full dump of the event log.
//
// Reads through getDb(), so it targets whatever the live app targets: a local
// data/campaign.db by default, or the remote Turso database if TURSO_DATABASE_URL
// is set (see docs/adr/0007-turso-for-hosting.md) -- point it at production to pull
// a git-diffable backup of the hosted database.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { getDb } from "../server/db/connection.js";
import { getProjection } from "../server/db/read.js";
import { REFERENCE_RESOURCES } from "../server/db/reference.js";
import { listEvents } from "../server/db/events.js";
import { listObligations } from "../server/db/obligations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

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

  const db = await getDb();

  await writeJson("stats", await getProjection(db, "stats"));
  await writeJson("settlements", await getProjection(db, "settlements"));
  await writeJson("calendar", await getProjection(db, "calendar"));
  await writeJson("deities", await getProjection(db, "deities"));
  await writeJson("locations", await getProjection(db, "locations"));
  await writeJson("buildings", await REFERENCE_RESOURCES.buildings.read(db));
  await writeJson("introduction", await REFERENCE_RESOURCES.introduction.read(db));
  await writeJson("events", await listEvents(db, { limit: 100000 }));
  await writeJson("obligations", await listObligations(db));

  console.log(`Exported current state to ${dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
