/**
 * Direct writes to reference data (CONTEXT.md: "edited directly with no event history").
 * Unlike server/db/events.js, these don't validate in-game warnings or record history --
 * they replace a whole reference collection/document atomically.
 */

function requireFields(item, fields, label) {
  for (const f of fields) {
    if (item[f] === undefined || item[f] === null || item[f] === "") {
      throw new ValidationError(`${label} is missing required field "${f}"`);
    }
  }
}

export class ValidationError extends Error {}

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
      INSERT INTO building_catalog (name, category, effect, cost, cost_note, upkeep, build_time, requires)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of buildings) {
      await insert.run(
        b.name, b.category ?? null, b.effect ?? null, JSON.stringify(b.cost ?? {}),
        b.costNote ?? null, b.upkeep ?? null, b.buildTime ?? null, JSON.stringify(b.requires ?? []),
      );
    }
  });
}

const RESOURCE_GROUPS = new Set(["resources", "assets", "society"]);

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

export async function replaceIntroduction(db, { postedBy, postedAt, paragraphs }) {
  if (!Array.isArray(paragraphs)) {
    throw new ValidationError("Introduction requires paragraphs (an array of strings)");
  }
  await db.prepare(`
    INSERT INTO campaign_meta (key, value) VALUES ('introduction', ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify({ postedBy: postedBy ?? null, postedAt: postedAt ?? null, paragraphs }));
}
