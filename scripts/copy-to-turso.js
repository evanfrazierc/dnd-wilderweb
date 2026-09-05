#!/usr/bin/env node
// One-time cutover: copies every row out of the existing local data/campaign.db (still a
// plain node:sqlite file) into a fresh Turso database, table by table, preserving ids.
//
// This is deliberately NOT scripts/migrate.js run again -- migrate.js replays the
// data/*.json fixtures, which are a stale snapshot from before Phase 2 (see CLAUDE.md).
// The local campaign.db is the actual source of truth by now (real play has added events
// since that snapshot), so the only correct way to move it to Turso is a direct row copy.
// See docs/adr/0007-turso-for-hosting.md.
//
// Usage:
//   TURSO_DATABASE_URL=libsql://<db>.turso.io TURSO_AUTH_TOKEN=<token> node scripts/copy-to-turso.js
//
// Run this once, against a brand-new empty Turso database, before pointing the deployed
// server at it. Refuses to run against a Turso database that already has events, so it
// can't be run twice by accident.

import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openRemoteDb } from "../server/db/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = process.env.WILDERWEB_DB_PATH || path.join(__dirname, "..", "data", "campaign.db");

// Order matters: obligations.created_by_event_id references events, so events must land first.
const TABLES = [
  "resource_definitions",
  "calendar_months",
  "building_catalog",
  "campaign_meta",
  "resource_totals",
  "events",
  "obligations",
  "settlement_buildings",
  "calendar_state",
  "deities",
  "locations_state",
];

async function main() {
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
  if (!TURSO_DATABASE_URL) {
    console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) to the target Turso database first.");
    process.exit(1);
  }

  const local = new DatabaseSync(localDbPath);
  const remote = await openRemoteDb({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

  const existingEventCount = (await remote.prepare("SELECT COUNT(*) c FROM events").get()).c;
  if (existingEventCount > 0) {
    console.error(
      `The Turso database at ${TURSO_DATABASE_URL} already has ${existingEventCount} event(s).\n` +
      "Refusing to copy into a non-empty database -- point this at a fresh Turso database instead.",
    );
    process.exit(1);
  }

  for (const table of TABLES) {
    const rows = local.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) {
      console.log(`${table}: nothing to copy`);
      continue;
    }
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const insert = remote.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
    for (const row of rows) {
      await insert.run(...columns.map((c) => row[c]));
    }
    console.log(`${table}: copied ${rows.length} row(s)`);
  }

  local.close();
  console.log(`\nDone. ${localDbPath} has been copied to ${TURSO_DATABASE_URL}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
