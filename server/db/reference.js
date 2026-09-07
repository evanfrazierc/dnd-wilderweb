/**
 * Reads and direct writes for reference data (CONTEXT.md: "edited directly with no event
 * history"). Unlike server/db/events.js, writes here don't validate in-game warnings or
 * record history -- they replace a whole reference collection/document atomically.
 *
 * REFERENCE_RESOURCES is the single source of truth for which reference resources exist
 * and how to read/write each one -- server/index.js's GET/PUT /api/reference/:resource
 * routes just index into this table instead of maintaining their own parallel lists.
 */

function requireFields(item, fields, label) {
  for (const f of fields) {
    if (item[f] === undefined || item[f] === null || item[f] === "") {
      throw new ValidationError(`${label} is missing required field "${f}"`);
    }
  }
}

export class ValidationError extends Error {}

export async function readBuildingCatalog(db) {
  const rows = await db.prepare("SELECT * FROM building_catalog ORDER BY name").all();
  return rows.map((b) => ({
    name: b.name,
    category: b.category,
    effect: b.effect,
    cost: JSON.parse(b.cost),
    costNote: b.cost_note ?? undefined,
    upkeep: b.upkeep ?? undefined,
    buildTime: b.build_time ?? undefined,
    requires: JSON.parse(b.requires),
    annualEffect: JSON.parse(b.annual_effect || "{}"),
  }));
}

export async function replaceBuildingCatalog(db, buildings) {
  const seen = new Set();
  for (const b of buildings) {
    requireFields(b, ["name"], "A building catalog entry");
    if (seen.has(b.name)) throw new ValidationError(`Duplicate building catalog entry: "${b.name}"`);
    seen.add(b.name);
  }

  return db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM building_catalog").run();
    const insert = tx.prepare(`
      INSERT INTO building_catalog (name, category, effect, cost, cost_note, upkeep, build_time, requires, annual_effect)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of buildings) {
      await insert.run(
        b.name, b.category ?? null, b.effect ?? null, JSON.stringify(b.cost ?? {}),
        b.costNote ?? null, b.upkeep ?? null, b.buildTime ?? null, JSON.stringify(b.requires ?? []),
        JSON.stringify(b.annualEffect ?? {}),
      );
    }
  });
}

const RESOURCE_GROUPS = new Set(["resources", "assets", "society"]);

export async function readResourceDefinitions(db) {
  const rows = await db.prepare("SELECT * FROM resource_definitions ORDER BY grp, name").all();
  return rows.map((r) => ({ grp: r.grp, name: r.name, description: r.description ?? undefined }));
}

export async function replaceResourceDefinitions(db, definitions) {
  const seen = new Set();
  for (const d of definitions) {
    requireFields(d, ["grp", "name"], "A resource definition");
    if (!RESOURCE_GROUPS.has(d.grp)) {
      throw new ValidationError(`Resource definition "${d.name}" has an unknown group "${d.grp}"`);
    }
    const key = `${d.grp}/${d.name}`;
    if (seen.has(key)) throw new ValidationError(`Duplicate resource definition: "${d.name}" (${d.grp})`);
    seen.add(key);
  }

  return db.transaction(async (tx) => {
    const existing = await tx.prepare("SELECT grp, name FROM resource_definitions").all();
    const existingKeys = new Set(existing.map((e) => `${e.grp}/${e.name}`));
    const incomingKeys = new Set(definitions.map((d) => `${d.grp}/${d.name}`));

    for (const e of existing) {
      const key = `${e.grp}/${e.name}`;
      if (incomingKeys.has(key)) continue;
      const total = await tx.prepare("SELECT value FROM resource_totals WHERE grp = ? AND name = ?").get(e.grp, e.name);
      if (total && total.value !== 0) {
        throw new ValidationError(
          `Cannot remove "${e.name}" (${e.grp}): it still has a nonzero value (${total.value}). ` +
          "Zero it out with a ResourceChanged event first.",
        );
      }
      await tx.prepare("DELETE FROM resource_definitions WHERE grp = ? AND name = ?").run(e.grp, e.name);
      await tx.prepare("DELETE FROM resource_totals WHERE grp = ? AND name = ?").run(e.grp, e.name);
    }

    for (const d of definitions) {
      const key = `${d.grp}/${d.name}`;
      if (existingKeys.has(key)) {
        await tx.prepare("UPDATE resource_definitions SET description = ? WHERE grp = ? AND name = ?")
          .run(d.description ?? null, d.grp, d.name);
      } else {
        await tx.prepare("INSERT INTO resource_definitions (grp, name, description) VALUES (?, ?, ?)")
          .run(d.grp, d.name, d.description ?? null);
        await tx.prepare("INSERT INTO resource_totals (grp, name, value) VALUES (?, ?, 0)")
          .run(d.grp, d.name);
      }
    }
  });
}

export async function readCalendarStructure(db) {
  const months = await db.prepare("SELECT * FROM calendar_months ORDER BY number").all();
  const metaRow = await db.prepare("SELECT value FROM campaign_meta WHERE key = 'calendar_meta'").get();
  const meta = metaRow ? JSON.parse(metaRow.value) : {};
  return {
    era: meta.era ?? undefined,
    daysPerMonth: meta.daysPerMonth ?? undefined,
    months: months.map((m) => ({ number: m.number, name: m.name, season: m.season, holidays: JSON.parse(m.holidays) })),
  };
}

export async function replaceCalendarStructure(db, { era, daysPerMonth, months }) {
  const seen = new Set();
  for (const m of months) {
    requireFields(m, ["number", "name"], "A calendar month");
    if (seen.has(m.number)) throw new ValidationError(`Duplicate calendar month number: ${m.number}`);
    seen.add(m.number);
  }

  return db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM calendar_months").run();
    const insert = tx.prepare(
      "INSERT INTO calendar_months (number, name, season, holidays) VALUES (?, ?, ?, ?)",
    );
    for (const m of months) {
      await insert.run(m.number, m.name, m.season ?? null, JSON.stringify(m.holidays ?? []));
    }
    await tx.prepare(`
      INSERT INTO campaign_meta (key, value) VALUES ('calendar_meta', ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify({ era: era ?? null, daysPerMonth: daysPerMonth ?? null }));
  });
}

export async function readIntroduction(db) {
  const row = await db.prepare("SELECT value FROM campaign_meta WHERE key = 'introduction'").get();
  return row ? JSON.parse(row.value) : null;
}

export async function replaceIntroduction(db, { postedBy, postedAt, paragraphs }) {
  if (!Array.isArray(paragraphs)) {
    throw new ValidationError("Introduction requires paragraphs (an array of strings)");
  }
  await db.prepare(`
    INSERT INTO campaign_meta (key, value) VALUES ('introduction', ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify({ postedBy: postedBy ?? null, postedAt: postedAt ?? null, paragraphs }));
}

/**
 * Settlements a building can be built in (docs/adr/0008; named "Settlement" rather than the
 * earlier "Region" per docs/adr/0014) -- first-class reference data rather than a free-text
 * label on settlement_buildings.settlement. Unlike the other reference resources,
 * replaceSettlements is NOT a generic wipe-and-reinsert: a rename needs to cascade to every
 * settlement_buildings row referencing the old name, which requires diffing by the
 * settlement's stable id (a name-keyed wipe-and-reinsert can't tell "renamed" from "deleted
 * then re-added under a new name").
 *
 * `kingdom` (docs/adr/0010) optionally names the Codex Locations kingdom that claims this
 * settlement -- a plain string, not a foreign key. Kingdoms are name-keyed (docs/adr/0011),
 * same as deities, so this still isn't a real foreign key relationship, but it does mean
 * this string is expected to match a `kingdoms.name` row when set.
 */
export async function readSettlementCatalog(db) {
  return db.prepare("SELECT id, name, description, kingdom FROM settlements ORDER BY name").all();
}

export async function replaceSettlementCatalog(db, settlements) {
  const seen = new Set();
  for (const s of settlements) {
    requireFields(s, ["name"], "A settlement");
    if (seen.has(s.name)) throw new ValidationError(`Duplicate settlement name: "${s.name}"`);
    seen.add(s.name);
  }

  return db.transaction(async (tx) => {
    const existing = await tx.prepare("SELECT id, name FROM settlements").all();
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const incomingIds = new Set(settlements.filter((s) => s.id != null).map((s) => s.id));

    for (const e of existing) {
      if (incomingIds.has(e.id)) continue;
      const count = await tx.prepare("SELECT COUNT(*) c FROM settlement_buildings WHERE settlement = ?").get(e.name);
      if (count.c > 0) {
        throw new ValidationError(
          `Cannot remove settlement "${e.name}": it still has ${count.c} building(s). ` +
          "Move or remove them first.",
        );
      }
      await tx.prepare("DELETE FROM settlements WHERE id = ?").run(e.id);
    }

    for (const s of settlements) {
      if (s.id != null && existingById.has(s.id)) {
        const old = existingById.get(s.id);
        await tx.prepare("UPDATE settlements SET name = ?, description = ?, kingdom = ? WHERE id = ?")
          .run(s.name, s.description ?? null, s.kingdom ?? null, s.id);
        if (old.name !== s.name) {
          await tx.prepare("UPDATE settlement_buildings SET settlement = ? WHERE settlement = ?").run(s.name, old.name);
        }
      } else {
        await tx.prepare("INSERT INTO settlements (name, description, kingdom) VALUES (?, ?, ?)")
          .run(s.name, s.description ?? null, s.kingdom ?? null);
      }
    }
  });
}

/** One-time, idempotent data bootstrap -- only runs while `settlements` is empty, so it never
 * clobbers a DM's edits. Seeds from the existing locations_state.wilderlandsRegions (already
 * has descriptions) unioned with any settlement_buildings.settlement values not already
 * covered. Called once from server/index.js's startup, not from connection.js -- this is a
 * data concern, not a schema-shape one, and tests build their own settlement data directly. */
export async function ensureSettlementsSeeded(db) {
  const { c } = await db.prepare("SELECT COUNT(*) c FROM settlements").get();
  if (c > 0) return;

  const seen = new Set();
  const seeds = [];

  const locationsRow = await db.prepare("SELECT data FROM locations_state WHERE id = 1").get();
  const wilderlandsRegions = locationsRow ? JSON.parse(locationsRow.data).wilderlandsRegions ?? [] : [];
  for (const r of wilderlandsRegions) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    seeds.push({ name: r.name, description: r.description ?? null });
  }

  const buildingSettlements = await db.prepare("SELECT DISTINCT settlement FROM settlement_buildings").all();
  for (const { settlement } of buildingSettlements) {
    if (seen.has(settlement)) continue;
    seen.add(settlement);
    seeds.push({ name: settlement, description: null });
  }

  if (seeds.length === 0) return;

  const insert = db.prepare("INSERT INTO settlements (name, description) VALUES (?, ?)");
  for (const s of seeds) {
    await insert.run(s.name, s.description);
  }
}

/** One-time, idempotent data bootstrap -- only runs while `kingdoms` is empty, so it never
 * clobbers a DM's edits. Seeds from the old locations_state document's kingdoms array
 * (docs/adr/0011), dropping the counties/settlements layers that document also carried --
 * a county's name/seat has no home in the new shape, and per-county settlement lists were
 * already retired in docs/adr/0010. Called once from server/index.js's startup, same as
 * ensureSettlementsSeeded -- tests build their own kingdom data directly. */
/** Shared by ensureKingdomsSeeded and migrateKingdomPlacesToSettlements (ADR-0012): creates
 * a Settlement named after each place, claimed by `kingdomName`, skipping any name that's
 * already a settlement (dedup, so re-running never creates duplicates). `type` becomes the
 * settlement's starting description -- there's nowhere else for it to go, and the DM can
 * refine it from Settlements' "Manage settlements" afterward. */
async function seedSettlementsFromPlaces(db, kingdomName, places) {
  for (const p of places) {
    if (!p?.name) continue;
    const existing = await db.prepare("SELECT id FROM settlements WHERE name = ?").get(p.name);
    if (existing) continue;
    await db.prepare("INSERT INTO settlements (name, description, kingdom) VALUES (?, ?, ?)")
      .run(p.name, p.type ?? null, kingdomName);
  }
}

export async function ensureKingdomsSeeded(db) {
  const { c } = await db.prepare("SELECT COUNT(*) c FROM kingdoms").get();
  if (c > 0) return;

  const locationsRow = await db.prepare("SELECT data FROM locations_state WHERE id = 1").get();
  const oldKingdoms = locationsRow ? JSON.parse(locationsRow.data).kingdoms ?? [] : [];
  if (oldKingdoms.length === 0) return;

  const insert = db.prepare("INSERT INTO kingdoms (name, capital, note) VALUES (?, ?, ?)");
  for (const k of oldKingdoms) {
    await insert.run(k.name, k.capital ?? null, k.note ?? null);
    await seedSettlementsFromPlaces(db, k.name, k.other ?? []);
  }
}

/** One-time migration (ADR-0012) for a database that already ran an earlier version of
 * ensureKingdomsSeeded (ADR-0011) and so has real data sitting in a `kingdoms.places` column
 * that schema.sql no longer creates. Not gated on a row count like the ensure* seeds --
 * "does this column still exist" is itself the gate, so it's a safe no-op forever after the
 * one database that needed it (this project's, local and production) has run it once. */
export async function migrateKingdomPlacesToSettlements(db) {
  const info = await db.prepare("PRAGMA table_info(kingdoms)").all();
  if (!info.some((col) => col.name === "places")) return;

  const rows = await db.prepare("SELECT name, places FROM kingdoms").all();
  for (const row of rows) {
    await seedSettlementsFromPlaces(db, row.name, JSON.parse(row.places || "[]"));
  }
}

/** Single source of truth for which reference resources exist and how to read/write each. */
export const REFERENCE_RESOURCES = {
  buildings: { read: readBuildingCatalog, write: replaceBuildingCatalog },
  introduction: { read: readIntroduction, write: replaceIntroduction },
  resourceDefinitions: { read: readResourceDefinitions, write: replaceResourceDefinitions },
  calendarStructure: { read: readCalendarStructure, write: replaceCalendarStructure },
  settlements: { read: readSettlementCatalog, write: replaceSettlementCatalog },
};
