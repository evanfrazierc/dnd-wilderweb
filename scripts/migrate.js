#!/usr/bin/env node
// One-time migration: data/*.json -> data/campaign.db. See .scratch/campaign-database/spec.md.
//
// history.json's deltas are replayed from a zero baseline; the result is diffed against
// stats.json's current snapshot and reported, not silently reconciled (Q10 / this repo's
// design session: a mismatch is a real data bug worth surfacing, not papering over).

import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { openDb } from "../server/db/connection.js";
import { createEvent } from "../server/db/events.js";
import { createObligation } from "../server/db/obligations.js";
import { parseGameDate, canonicalizeGameDate, ordinalSuffix } from "../server/db/gameDate.js";
import { diffResourceTotals } from "../server/db/reconcile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = process.env.WILDERWEB_DB_PATH || path.join(dataDir, "campaign.db");
const force = process.argv.includes("--force");

async function readJson(name) {
  const raw = await readFile(path.join(dataDir, `${name}.json`), "utf-8");
  return JSON.parse(raw);
}

async function main() {
  if (existsSync(dbPath)) {
    const existing = await openDb(dbPath);
    const migratedAt = await existing.prepare("SELECT value FROM campaign_meta WHERE key = 'migrated_at'").get();
    existing.close();
    if (migratedAt) {
      // Once a migration has completed, the live app may have written real events into it.
      // Re-running (even with --force) would silently destroy those, so this refuses
      // unconditionally rather than trusting a flag (Q6).
      console.error(
        `${dbPath} already completed a migration at ${migratedAt.value}.\n` +
        "Re-running would destroy any events created since then through the live app.\n" +
        "If you're certain you want to start over, delete data/campaign.db manually first.",
      );
      process.exit(1);
    }
    if (!force) {
      console.error(`${dbPath} already exists (incomplete). Re-run with --force to wipe and re-migrate.`);
      process.exit(1);
    }
    await unlink(dbPath);
  }

  const db = await openDb(dbPath);
  const [calendar, deities, history, introduction, locations, buildings, settlements, stats] =
    await Promise.all([
      readJson("calendar"), readJson("deities"), readJson("history"), readJson("introduction"),
      readJson("locations"), readJson("buildings"), readJson("settlements"), readJson("stats"),
    ]);

  await seedReferenceData(db, { calendar, introduction, buildings, stats });
  await seedResourceBaseline(db, stats);

  // Every gameDate this script writes now has to be canonical (docs/adr/0016) -- built from the
  // campaign's real month names rather than a bare "Month N", same as the live app's
  // GameDatePicker always has.
  const monthNames = new Map(calendar.months.map((m) => [m.number, m.name]));

  const warningsSeen = [];
  await importHistory(db, history, monthNames, warningsSeen);
  await reconcileOpeningBalance(db, stats, monthNames, warningsSeen);
  await importSettlements(db, settlements, warningsSeen);
  await importCalendar(db, calendar, monthNames, warningsSeen);
  await importDeities(db, deities, warningsSeen);
  await importLocations(db, locations, warningsSeen);

  await db.prepare("INSERT INTO campaign_meta (key, value) VALUES ('migrated_at', ?)").run(new Date().toISOString());

  await report(db, stats, warningsSeen);
  db.close();
}

async function seedReferenceData(db, { calendar, introduction, buildings, stats }) {
  const insertBuilding = db.prepare(`
    INSERT INTO building_catalog (name, category, effect, cost, cost_note, upkeep, build_time, requires)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const b of buildings) {
    await insertBuilding.run(
      b.name, b.category ?? null, b.effect ?? null, JSON.stringify(b.cost ?? {}),
      b.costNote ?? null, b.upkeep ?? null, b.buildTime ?? null, JSON.stringify(b.requires ?? []),
    );
  }

  await db.prepare("INSERT INTO campaign_meta (key, value) VALUES ('introduction', ?)")
    .run(JSON.stringify(introduction));

  await db.prepare("INSERT INTO campaign_meta (key, value) VALUES ('stats_meta', ?)")
    .run(JSON.stringify({
      settlement: stats.settlement,
      asOf: stats.asOf,
      asOfNote: stats.asOfNote,
      annualIncomeUpkeep: stats.annualIncomeUpkeep,
    }));

  await db.prepare("INSERT INTO campaign_meta (key, value) VALUES ('calendar_meta', ?)")
    .run(JSON.stringify({ era: calendar.era, daysPerMonth: calendar.daysPerMonth }));

  const insertMonth = db.prepare(
    "INSERT INTO calendar_months (number, name, season, holidays) VALUES (?, ?, ?, ?)",
  );
  for (const m of calendar.months) {
    await insertMonth.run(m.number, m.name, m.season ?? null, JSON.stringify(m.holidays ?? []));
  }

  const insertDef = db.prepare(
    "INSERT INTO resource_definitions (grp, name, description) VALUES (?, ?, ?)",
  );
  for (const [grp, descKey] of [["resources", "resourceDescriptions"], ["assets", "assetDescriptions"], ["society", "societyDescriptions"]]) {
    for (const [name, description] of Object.entries(stats[descKey] ?? {})) {
      await insertDef.run(grp, name, description);
    }
  }
}

async function seedResourceBaseline(db, stats) {
  const insert = db.prepare("INSERT INTO resource_totals (grp, name, value) VALUES (?, ?, 0)");
  for (const grp of ["resources", "assets", "society"]) {
    for (const name of Object.keys(stats[grp] ?? {})) {
      await insert.run(grp, name);
    }
  }
}

// history.json id 49: a resource loan repayable in Wealth. See CONTEXT.md's Obligation entry.
const LOAN_TITLE = "Month 6 Loaned Resources";

async function importHistory(db, history, monthNames, warningsSeen) {
  for (const entry of history) {
    const gameDate = canonicalizeGameDate(entry.gameDate, monthNames);
    if (!gameDate) {
      throw new Error(`history.json entry ${entry.id} (${entry.title}): gameDate ${JSON.stringify(entry.gameDate)} can't be canonicalized (a bare year, or an unrecognized month) -- fix it by hand in data/history.json, the way ids 33-36 were.`);
    }
    const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;
    const type = hasChanges ? "ResourceChanged" : "DMRuling";
    const note = [entry.title, entry.note].filter(Boolean).join(" — ");
    const result = await createEvent(db, {
      type,
      gameDate,
      postedAt: entry.postedAt,
      actor: entry.postedBy ?? null,
      region: null,
      note,
      payload: hasChanges ? { changes: entry.changes } : {},
    });
    if (!result.ok) {
      throw new Error(`history.json entry ${entry.id} (${entry.title}) failed validation: ${result.errors.join("; ")}`);
    }
    if (result.warnings.length) warningsSeen.push({ source: `history#${entry.id}`, warnings: result.warnings });

    if (entry.title === LOAN_TITLE) {
      const due = parseGameDate(gameDate);
      await createObligation(db, {
        description: "Resource loan, repayable in Wealth (history.json id 49)",
        originalResources: entry.changes,
        repaymentResource: "Wealth",
        amountTotal: 50,
        dueGameDate: `${monthNames.get(due.month)} (${due.month}), ${due.day}${ordinalSuffix(due.day)}, ${due.year + 8}`,
        createdByEventId: result.event.id,
      });
    }
  }
}

// settlements.json is now an `npm run export` backup, not the original hand-authored file --
// `name` is already the catalog name and `displayName` is its own field (the app did that
// canonicalization itself, historically), so no alias lookup is needed here any more. (Kept
// finding this out the hard way: the old alias table below was keyed by in-fiction names like
// "Anora's Roost" that no longer appear as `b.name` anywhere in the current export, so every
// displayName silently came out null.)
//
// settlements.json also carries no per-building date any more -- it's the CURRENT aggregate
// state (one row per region+building, with a `count`), not a per-construction record. Real
// per-building dates recovered from wilderlands-discord-export.txt's build-orders/
// stats-bookkeeping channels (.scratch/discord-seed/findings.md has the reasoning): the date
// used is always when the resources were spent/ordered, matching how every other event in this
// migration is dated (not a later "constructs in"/"finished" completion date, which several of
// these buildings separately record in their own `note`). Where the source itself only gave a
// month (most of 1226's builds -- the DM's notation shifted from day-precise to month-only
// partway through), day 1 is used as an explicit placeholder, same convention as everywhere
// else (docs/adr/0016) -- flagged per-row below, not a recorded fact. The two Fishing Docks
// (Argent River, Lake Silverstep) can't be told apart from the two build orders that each
// mention one "Fishing Dock" with no region named -- resolved by elimination/context in the
// comments below, flagged as the least-certain entries in this table.
const SETTLEMENT_BUILD_DATES = {
  "Argent River|Bridge": "Pelorune (1), 16th, 1225",
  // Ambiguous: the 2nd of 2 "Fishing Dock" mentions, in the Month 6 1225 batch that's otherwise
  // entirely Stirling Reach buildings. Argent River (already bridge-connected since Month 1, and
  // later the site of a Shipyard) reads as the more likely "consolidate the home base" target of
  // that batch than Lake Silverstep, which the party had already flagged for its fishing back in
  // the very first scouting session (8/12/2025 note-sharing post) -- so it's assigned the
  // *earlier* of the two orders instead. Low confidence; correct this first if you know better.
  "Argent River|Fishing Dock": "Meloron (6), 1st, 1225",
  "Carthrun|Mine": "Meloron (6), 1st, 1226", // "in 1226", no month given -- see data/history.json id 36
  "Faerweald|Logging Camp": "Sarenith (4), 15th, 1225",
  "Faerweald|Mine": "Shelune (3), 1st, 1226", // "as of 3 1226" -- day is a placeholder
  "Lake Silverstep|Fishing Dock": "Erastus (2), 15th, 1225", // see Argent River|Fishing Dock above
  "Mettlewood|Farm": "Bahamund (5), 1st, 1226", // "as of 5 1226" -- day is a placeholder
  "Mettlewood|Homes": "Sarenith (4), 1st, 1226", // "as of 4 1226" -- day is a placeholder
  "Mettlewood|Logging Camp": "Bahamund (5), 1st, 1226", // "as of 5 1226" -- day is a placeholder
  "Narlmarches|Herbalist Hut": "Sarenith (4), 15th, 1225",
  "Narlmarches|Logging Camp": "Pelorune (1), 16th, 1225",
  "Narlmarches|Scout's Nest": "Bahamund (5), 1st, 1226", // "as of 5 1226" -- day is a placeholder
  "Old Hills|Prison": "Meloron (6), 1st, 1225",
  "Old Hills|Quarry": "Erastus (2), 15th, 1225",
  "Old Hills|Tower": "Pelorune (1), 16th, 1225",
  "Stirling Reach|Apothecary": "Erastus (2), 1st, 1226", // "as of 2 1226" -- day is a placeholder
  "Stirling Reach|Farm": "Pelorune (1), 16th, 1225", // earliest of the eventual 5
  "Stirling Reach|Market": "Erastus (2), 15th, 1225",
  "Stirling Reach|Mill": "Meloron (6), 1st, 1225",
  "Stirling Reach|Ranch": "Meloron (6), 1st, 1225",
  "Stirling Reach|Smithy": "Meloron (6), 1st, 1225",
  "Stirling Reach|Stables": "Meloron (6), 1st, 1225",
  "Stirling Reach|Stone Wall": "Meloron (6), 1st, 1225", // order date -- completes Month 6, Year 3 per its own note
  "Stirling Reach|Tavern": "Erastus (2), 15th, 1225",
  "Stirling Reach|Town Hall": "Pelorune (1), 16th, 1225",
  "Stirling Reach|Training Yard": "Desnus (12), 1st, 1226", // "on 12 1226" -- day is a placeholder
  "Wilderwood|Logging Camp": "Sarenith (4), 15th, 1225",
};

// Closes the gap between history.json's replayed deltas and stats.json's snapshot with one
// clearly-labeled, dated corrective event, rather than leaving resource_totals silently wrong
// or pretending the gap doesn't exist (Q1: keep the log's authoritative claim honest).
async function reconcileOpeningBalance(db, stats, monthNames, warningsSeen) {
  const diffs = (await diffResourceTotals(db, stats)).filter((d) => d.mismatch && d.snapshot !== undefined);
  if (diffs.length === 0) return;

  const earliest = (await db.prepare("SELECT MIN(game_date_sort) m FROM events").get()).m;
  const earliestEvent = await db.prepare("SELECT game_date_raw FROM events WHERE game_date_sort = ?").get(earliest);
  const before = parseGameDate(earliestEvent.game_date_raw);
  const day = Math.max(1, before.day - 1);
  const gameDate = `${monthNames.get(before.month)} (${before.month}), ${day}${ordinalSuffix(day)}, ${before.year}`;

  const result = await createEvent(db, {
    type: "ResourceChanged",
    gameDate,
    postedAt: new Date().toISOString().slice(0, 10),
    actor: "Migration",
    region: null,
    note: "Reconciliation adjustment: history.json's tracked deltas don't reconcile with stats.json's snapshot (an unlogged starting grant and/or transcription gaps). This one-time entry closes that gap so the database's totals match the last known-good snapshot; see .scratch/campaign-database/spec.md.",
    payload: { changes: Object.fromEntries(diffs.map((d) => [d.name, d.snapshot - d.replayed])) },
  });
  if (!result.ok) throw new Error(`Reconciliation event failed validation: ${result.errors.join("; ")}`);
  if (result.warnings.length) warningsSeen.push({ source: "reconciliation", warnings: result.warnings });
}

async function importSettlements(db, settlements, warningsSeen) {
  for (const region of settlements) {
    for (const b of region.buildings) {
      // Per-building date recovered from the discord export (SETTLEMENT_BUILD_DATES above);
      // CAMPAIGN_START_GAME_DATE only as a last resort for a building the source never
      // mentions building at all, which shouldn't currently happen -- every row in
      // settlements.json has an entry above.
      const gameDate = SETTLEMENT_BUILD_DATES[`${region.region}|${b.name}`] ?? CAMPAIGN_START_GAME_DATE;
      const result = await createEvent(db, {
        type: "BuildingConstructed",
        gameDate,
        postedAt: new Date().toISOString().slice(0, 10),
        actor: "Migration",
        region: region.region,
        note: "Imported from settlements.json; dated from wilderlands-discord-export.txt (.scratch/discord-seed/findings.md).",
        payload: {
          building: b.name,
          displayName: b.displayName ?? null,
          count: b.count ?? 1,
          detail: b.detail,
        },
      });
      if (!result.ok) throw new Error(`settlements.json ${region.region}/${b.name}: ${result.errors.join("; ")}`);
      if (result.warnings.length) warningsSeen.push({ source: `settlements#${region.region}/${b.name}`, warnings: result.warnings });
    }
  }
}

async function importCalendar(db, calendar, monthNames, warningsSeen) {
  const d = calendar.currentDate;
  const result = await createEvent(db, {
    type: "CalendarAdvanced",
    gameDate: `${monthNames.get(d.month)} (${d.month}), ${d.day}${ordinalSuffix(d.day)}, ${d.year}`,
    postedAt: new Date().toISOString().slice(0, 10),
    actor: "Migration",
    region: null,
    note: "Imported from calendar.json",
    payload: { year: d.year, yearLabel: d.yearLabel, month: d.month, day: d.day, note: d.note },
  });
  if (!result.ok) throw new Error(`calendar.json: ${result.errors.join("; ")}`);
  if (result.warnings.length) warningsSeen.push({ source: "calendar", warnings: result.warnings });
}

// No source date exists for lore/reference imports (deities, kingdoms) -- these are "known
// facts" posted once, not tied to a construction or session date. Anchored at the campaign's
// first game-month: the religions/locations/calendar channels were all posted (real-world)
// before the first Confirmed Build Order (Pelorune 16th, 1225), so in-fiction they predate any
// recorded play -- Pelorune (1) is as precise as that gets. Day 1 is a placeholder, not a
// recorded fact (docs/adr/0016).
const CAMPAIGN_START_GAME_DATE = "Pelorune (1), 1st, 1225";

async function importDeities(db, deities, warningsSeen) {
  for (const deity of deities) {
    const result = await createEvent(db, {
      type: "DeityAmended",
      gameDate: CAMPAIGN_START_GAME_DATE,
      postedAt: new Date().toISOString().slice(0, 10),
      actor: "Migration",
      region: null,
      note: "Imported from deities.json",
      payload: { name: deity.name, changes: { title: deity.title, alignment: deity.alignment, confirmed: deity.confirmed, note: deity.note } },
    });
    if (!result.ok) throw new Error(`deities.json ${deity.name}: ${result.errors.join("; ")}`);
    if (result.warnings.length) warningsSeen.push({ source: `deities#${deity.name}`, warnings: result.warnings });
  }
}

// locations.json is now `{ kingdoms: [...] }`, matching LocationAmended's current per-kingdom
// payload shape (`{name, changes}`, ADR-0011) rather than the whole-document replace this
// script originally wrote -- one event per kingdom.
async function importLocations(db, locations, warningsSeen) {
  for (const kingdom of locations.kingdoms ?? []) {
    const result = await createEvent(db, {
      type: "LocationAmended",
      gameDate: CAMPAIGN_START_GAME_DATE,
      postedAt: new Date().toISOString().slice(0, 10),
      actor: "Migration",
      region: null,
      note: "Imported from locations.json",
      payload: { name: kingdom.name, changes: { capital: kingdom.capital, note: kingdom.note } },
    });
    if (!result.ok) throw new Error(`locations.json ${kingdom.name}: ${result.errors.join("; ")}`);
    if (result.warnings.length) warningsSeen.push({ source: `locations#${kingdom.name}`, warnings: result.warnings });
  }
}

async function report(db, stats, warningsSeen) {
  console.log("\n--- Migration report ---\n");

  console.log("Replayed totals vs. stats.json snapshot (after the reconciliation adjustment, these should match):");
  for (const { grp, name, replayed, snapshot, mismatch } of await diffResourceTotals(db, stats)) {
    console.log(`  [${grp}] ${name}: replayed=${replayed} snapshot=${snapshot}${mismatch ? "  <-- MISMATCH" : ""}`);
  }

  if (warningsSeen.length) {
    console.log(
      "\nWarnings raised during replay (the 'would go negative' ones are artifacts of replaying\n" +
      "from a zero baseline before the reconciliation entry closes the gap above -- they're not\n" +
      "remaining problems, just an accurate record of what the books looked like at each step\n" +
      "without knowing the true starting balance):",
    );
    for (const { source, warnings } of warningsSeen) {
      for (const w of warnings) console.log(`  ${source}: ${w}`);
    }
  } else {
    console.log("\nNo warnings raised during replay.");
  }

  const eventCount = (await db.prepare("SELECT COUNT(*) c FROM events").get()).c;
  const obligationCount = (await db.prepare("SELECT COUNT(*) c FROM obligations").get()).c;
  console.log(`\nImported ${eventCount} events, ${obligationCount} obligation(s).`);
  console.log(`Database written to ${dbPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
