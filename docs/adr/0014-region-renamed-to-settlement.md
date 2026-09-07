# "Region" retired in favor of "Settlement"

ADR-0008 chose "Region" as the canonical name for a place a building can be built, explicitly
rejecting "Settlement" as a second word for the same concept -- reasoning that the party's
Settlements page and "Settlement" both already meant the same underlying thing, so introducing
Region avoided a naming collision between the page and the entity it manages.

That reasoning held until the DM looked at the app and asked the reverse question: the page is
called Settlements, half its own labels already said "settlement" in DM-facing text (the
per-kingdom card's claimed-places list, for one), and "Region" only ever showed up in a handful
of button labels and panel titles that read as inconsistent with everything else. Asked directly
which name should win, the DM chose Settlement -- not because Region was wrong, but because
Settlement was already how the page, and the DM, referred to the concept in practice. See the
chat log for the full exchange.

## What changes

- **Database**: the `regions` table is renamed to `settlements`; `events.region` becomes
  `events.settlement`; `settlement_buildings.region` becomes `settlement_buildings.settlement`
  (that table's own name already said "settlement" -- only its column needed to follow). Applied
  by `ensureSettlementRename` (`server/db/connection.js`), a plain `ALTER TABLE ... RENAME`
  (SQLite/libSQL support this natively, including updating the index and UNIQUE-constraint
  definitions that reference the renamed columns), gated on the old name still existing so it's
  a safe no-op on a fresh database or an already-migrated one. Runs on every boot, same as the
  other one-time corrections in that file, so it applies to production (Turso) automatically on
  next deploy.
- **API**: `/api/reference/regions` becomes `/api/reference/settlements`, and every event's
  `region` field becomes `settlement` (`POST /api/events`'s body, `GET /api/events`'s `region`
  query param, and every event object's shape). This deliberately does **not** collide with the
  existing `GET /api/projections/settlements` (the settlement_buildings-derived building-list
  projection, unchanged) -- the two live under different route prefixes that already carry this
  distinction elsewhere (`/api/reference/buildings`, the static catalog, coexists the same way
  with the buildings baked into that same projection).
- **Server functions**: `readRegions`/`replaceRegions` become `readSettlementCatalog`/
  `replaceSettlementCatalog` (named for the catalog, not just "Settlements," to stay distinct
  from `read.js`'s existing `readSettlements` projection function -- same collision-avoidance
  reasoning as the API route). `ensureRegionsSeeded` becomes `ensureSettlementsSeeded`;
  `migrateKingdomPlacesToRegions` (ADR-0012) becomes `migrateKingdomPlacesToSettlements`.
- **Client**: Settlements.jsx's `RegionsEditor` becomes `SettlementCatalogEditor` ("Manage
  settlements," not "Manage regions"); Codex's "Wilderlands Regions" panel becomes "Wilderlands
  Settlements." The page's own title drops the old "Settlements & Regions" hybrid down to plain
  "Settlements" now that there's only one name to carry.
- **CONTEXT.md**: the Region glossary entry is renamed Settlement, with "Region" now the
  `_Avoid_` term (reversing ADR-0008's list).

## What doesn't change

Everything ADR-0008 established about the concept itself -- first-class reference data with a
stable id separate from its mutable name (so a rename cascades to every building in it),
deletion refused while it still has buildings, optional Kingdom claim (ADR-0010) -- is unchanged.
This ADR renames the concept; it doesn't touch what the concept is or how it behaves.

The `data/*.json` export files follow the same rename the next time `npm run export` runs
(`data/regions.json` becomes `data/settlementCatalog.json`, matching the server function name
above and avoiding the same collision with the existing `data/settlements.json` building-list
dump). `scripts/migrate.js`, the original one-time JSON-to-database import, is already spent
(`npm run migrate` refuses to re-run against a completed database) but was updated for
consistency rather than left to reference a field name nothing still produces.
