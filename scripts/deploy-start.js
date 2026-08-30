#!/usr/bin/env node
// Railway's entrypoint (see railway.json). On a fresh persistent volume there's no
// data/campaign.db yet, so this seeds it from the checked-in data/*.json fixtures
// before serving -- the same one-time migration documented in CLAUDE.md, just run
// automatically instead of by hand over SSH. Once WILDERWEB_DB_PATH exists on the
// volume, later boots skip straight to the server.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dbPath = process.env.WILDERWEB_DB_PATH;

if (dbPath && !existsSync(dbPath)) {
  console.log(`No database found at ${dbPath}; running the one-time migration...`);
  const migrate = spawnSync(process.execPath, ["scripts/migrate.js"], { stdio: "inherit" });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);
}

const server = spawnSync(process.execPath, ["server/index.js"], { stdio: "inherit" });
process.exit(server.status ?? 0);
