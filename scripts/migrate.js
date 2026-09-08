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
import { parseGameDate } from "../server/db/gameDate.js";
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

  const warningsSeen = [];
  await importHistory(db, history, warningsSeen);
  await reconcileOpeningBalance(db, stats, warningsSeen);
  await importSettlements(db, settlements, warningsSeen);
  await importCalendar(db, calendar, warningsSeen);
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

async function importHistory(db, history, warningsSeen) {
  for (const entry of history) {
    const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;
    const type = hasChanges ? "ResourceChanged" : "DMRuling";
    const note = [entry.title, entry.note].filter(Boolean).join(" — ");
    const result = await createEvent(db, {
      type,
      gameDate: entry.gameDate,
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
      const due = parseGameDate(entry.gameDate);
      await createObligation(db, {
        description: "Resource loan, repayable in Wealth (history.json id 49)",
        originalResources: entry.changes,
        repaymentResource: "Wealth",
        amountTotal: 50,
        dueGameDate: `Month ${due.month}, ${due.day}th, ${due.year + 8}`,
        createdByEventId: result.event.id,
      });
    }
  }
}

// settlements.json uses in-fiction names that don't match the building catalog. Canonicalized
// here per the design session (Q2): the event's `building` is the catalog name (so prerequisite
// and catalog-lookup validation works), the in-fiction name is kept as `displayName`.
const BUILDING_ALIASES = {
  "Stone Walls": { building: "Stone Wall", displayName: null },
  "Village": { building: "Homes", displayName: "Village" },
  "Iron Mine": { building: "Mine", displayName: "Iron Mine" },
  "Stone Bridge": { building: "Bridge", displayName: "Stone Bridge" },
  "Anora's Roost": { building: "Tower", displayName: "Anora's Roost" },
};

// Closes the gap between history.json's replayed deltas and stats.json's snapshot with one
// clearly-labeled, dated corrective event, rather than leaving resource_totals silently wrong
// or pretending the gap doesn't exist (Q1: keep the log's authoritative claim honest).
async function reconcileOpeningBalance(db, stats, warningsSeen) {
  const diffs = (await diffResourceTotals(db, stats)).filter((d) => d.mismatch && d.snapshot !== undefined);
  if (diffs.length === 0) return;

  const earliest = (await db.prepare("SELECT MIN(game_date_sort) m FROM events").get()).m;
  const earliestEvent = await db.prepare("SELECT game_date_raw FROM events WHERE game_date_sort = ?").get(earliest);
  const before = parseGameDate(earliestEvent.game_date_raw);
  const gameDate = `Month ${before.month}, ${Math.max(1, before.day - 1)}th, ${before.year}`;

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
      const alias = BUILDING_ALIASES[b.name];
      const result = await createEvent(db, {
        type: "BuildingConstructed",
        gameDate: region.asOf,
        postedAt: region.asOf,
        actor: "Migration",
        region: region.region,
        note: `Imported from settlements.json (as of ${region.asOf})`,
        payload: {
          building: alias ? alias.building : b.name,
          displayName: alias ? alias.displayName : null,
          count: b.count ?? 1,
          detail: b.detail,
        },
      });
      if (!result.ok) throw new Error(`settlements.json ${region.region}/${b.name}: ${result.errors.join("; ")}`);
      if (result.warnings.length) warningsSeen.push({ source: `settlements#${region.region}/${b.name}`, warnings: result.warnings });
    }
  }
}

async function importCalendar(db, calendar, warningsSeen) {
  const d = calendar.currentDate;
  const result = await createEvent(db, {
    type: "CalendarAdvanced",
    gameDate: `Month ${d.month}, ${d.day}th, ${d.year}`,
    postedAt: new Date().toISOString().slice(0, 10),
    actor: "Migration",
    region: null,
    note: "Imported from calendar.json",
    payload: { year: d.year, yearLabel: d.yearLabel, month: d.month, day: d.day, note: d.note },
  });
  if (!result.ok) throw new Error(`calendar.json: ${result.errors.join("; ")}`);
  if (result.warnings.length) warningsSeen.push({ source: "calendar", warnings: result.warnings });
}

// No source date exists for lore/reference imports; anchored at the campaign's earliest
// known game-date (history.json's earliest entries are year 1225).
const CAMPAIGN_START_GAME_DATE = "1225";

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

async function importLocations(db, locations, warningsSeen) {
  const result = await createEvent(db, {
    type: "LocationAmended",
    gameDate: CAMPAIGN_START_GAME_DATE,
    postedAt: new Date().toISOString().slice(0, 10),
    actor: "Migration",
    region: null,
    note: "Imported from locations.json",
    payload: { data: locations },
  });
  if (!result.ok) throw new Error(`locations.json: ${result.errors.join("; ")}`);
  if (result.warnings.length) warningsSeen.push({ source: "locations", warnings: result.warnings });
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
