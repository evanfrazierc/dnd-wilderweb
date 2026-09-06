#!/usr/bin/env node
// One-time backfill: gives building_catalog entries a structured `annual_effect` rate
// (docs/adr/0009) for the buildings whose effect text is an unambiguous, dice-free,
// population-independent flat rate. Everything else in the catalog is deliberately left at
// its default '{}' -- see the ADR for why (dice-gated, population-scaled, or player-invoked
// effects aren't representable as a flat per-building rate, and this app won't guess at one).
//
// A plain UPDATE by name, not additive, so it's safe to run more than once -- pointless
// (not harmful) against a DB whose catalog doesn't have these exact building names.
//
// Usage: node scripts/seed-annual-effects.js
//   (respects TURSO_DATABASE_URL/TURSO_AUTH_TOKEN or WILDERWEB_DB_PATH, same as the app --
//   see server/db/connection.js's getDb)

import { getDb } from "../server/db/connection.js";

const RATES = {
  Tavern: { Wealth: 1, Food: -1 },
  Farm: { Food: 1 },
  "Hunting Grounds": { Food: 1 },
  "Logging Camp": { Wood: 1 },
  "Fishing Dock": { Food: 1 },
  Mine: { Iron: 1 },
  Quarry: { Stone: 1 },
  "Herbalist Hut": { Medicine: 1 },
  Apothecary: { Medicine: 1 },
  Ranch: { Horse: 1, Food: -2 },
  "Merchant Guild": { Wealth: 1 },
  Stables: { Food: -1 },
  Library: { Wealth: -1 },
  University: { Wealth: -1 },
  Barracks: { Wealth: -1 },
};

async function main() {
  const db = await getDb();
  let updated = 0;
  for (const [name, rate] of Object.entries(RATES)) {
    const result = await db.prepare("UPDATE building_catalog SET annual_effect = ? WHERE name = ?")
      .run(JSON.stringify(rate), name);
    if (result.changes > 0) {
      updated++;
      console.log(`${name}: ${JSON.stringify(rate)}`);
    } else {
      console.log(`${name}: not in the catalog, skipped`);
    }
  }
  console.log(`\nUpdated ${updated}/${Object.keys(RATES).length} buildings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
