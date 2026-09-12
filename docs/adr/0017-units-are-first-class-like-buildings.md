# Units are first-class, catalog-backed, event-sourced -- like Buildings, not folded into ResourceChanged

The Discord export's `#garrison` channel (`.scratch/discord-seed/findings.md`) describes a real
mechanical subsystem -- Militia/Guard/Troop/Veteran/Knight, each with a cost, a yearly upkeep, a
combat bonus, and building prerequisites (Guard+ requires a Barracks) -- with zero representation
in the app. The obvious first question, same as it was for trades (ADR-0004): does this need new
event types at all, or is it just more deltas on `ResourceChanged`?

ADR-0004's answer for trades was no -- a trade is a `ResourceChanged` that happens to name a
counterparty, not a distinct concept, because growing the taxonomy for every event that carries
one extra attribute isn't worth it. Units fail that test in the opposite direction: a Unit
references a catalog (cost, prerequisites) the same way a Building does, and that catalog
reference is exactly what already justifies `BuildingConstructed`/`BuildingRemoved` being their
own types instead of `ResourceChanged` with a building name attached. Modeling unit counts as
just more named entries in `resource_totals` would lose the one thing that actually matters here:
prerequisite validation (raising a Guard with no Barracks built should warn, the same way
building a Mill with no Farm does).

## Decision

**Unit** (`unit_catalog`): reference data structured exactly like `building_catalog` -- cost,
upkeep, combat bonus, and building prerequisites (`requires`, same shape and meaning as
`building_catalog.requires`).

**UnitRaised** / **UnitLost** (new event types): mirror `BuildingConstructed`/`BuildingRemoved`
exactly -- same validation split (structural shape blocks, ADR-0005's warn-never-block for
prerequisites), same "cost isn't auto-deducted, the DM posts a parallel `ResourceChanged`"
pattern (confirmed by reading `applyBuildingConstructed`: it never touches `resource_totals`).
Projected into `garrison_units`.

**Not per-region.** The Discord "CURRENT UNITS" list is one roster, not broken out by
settlement, so `garrison_units` carries no region column and `UnitRaised`/`UnitLost` don't
require one (`region: null`, like `CalendarAdvanced`).

**Upgrading a unit is `UnitLost` (old tier) + `UnitRaised` (new tier), not a third event.** Same
precedent as moving a building between regions (`BuildingAmended`'s CONTEXT.md entry, citing
ADR-0004): don't grow the taxonomy for a variant of an existing type. This covers both a
Training-Yard tier upgrade (Militia to Guard) and a Stables mount (Troop to Mounted Troop).

**Mounted variants are separate catalog rows** ("Mounted Troop", "Mounted Veteran"), the same way
building variants (Silver/Gold Mine vs. Mine) are separate `building_catalog` rows rather than a
modifier system layered on top of one row. Their `requires` lists only the Stables building --
the fact that raising one really means converting an existing Troop/Veteran isn't something the
catalog gates on, it's just what the UnitLost+UnitRaised pair the DM posts already represents.

**Adventurers are excluded entirely.** The source describes them as temporary, one-year hires
("will explore or clear hexes and leave at the end of the year"), not a standing part of the
garrison -- there's nothing for a persistent catalog/roster entry to represent. Hiring one is a
plain `ResourceChanged`.

**No `UnitAmended` in this pass.** `BuildingAmended` exists to correct a `displayName`/`detail`
after the fact; garrison entries don't carry a `displayName` and the need hasn't come up yet.
Adding it later would be the same shape as `BuildingAmended` if it does.

The unit catalog is seeded on first boot (`ensureUnitCatalogSeeded`, gated on the table being
empty, same pattern as `ensureRegionsSeeded`) with the real values from the Discord export
rather than starting empty, so the DM doesn't have to retype seven catalog rows by hand.

## What changes

`server/db/schema.sql` (`unit_catalog`, `garrison_units` tables; `UnitRaised`/`UnitLost` added to
`events.type`'s `CHECK` constraint -- an already-existing `events` table needs the same
rebuild-and-swap `ensureObligationAmendedEventType` already established, since SQLite can't alter
a `CHECK` constraint in place); `server/db/validate.js`, `server/db/projections.js`,
`server/db/read.js`, `server/db/reference.js` all get Unit-shaped counterparts to their
Building-shaped functions; `server/discord.js` gets embed formatting; the client gets a new
Garrison page mirroring Settlements. `server/db/annualIncome.js`'s Dashboard total also sums the
garrison's upkeep alongside buildings' `annual_effect` (docs/adr/0009's amendment) -- `upkeep` is
stored as a plain positive magnitude ("upkeep 1 Food" per the source, same convention as `cost`),
negated at the point it's folded into the total rather than asking the catalog to store a
double-negative for what's always a deduction.

## What doesn't change

Nothing about how Buildings, resources, or any other event type work. The garrison is
deliberately the *only* piece of campaign state that isn't region-scoped among the catalog-backed
concepts -- that's a property of what a garrison actually is in this campaign (one roster), not a
new general rule about when region-scoping applies.
