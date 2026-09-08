# "Settlement" reverted back to "Region"

ADR-0014 retired "Region" in favor of "Settlement," reasoning that the party's Settlements page
and most of its own DM-facing text already said "settlement," so Region was the odd one out.

That held until the DM looked at the concept itself rather than the page's own label for it: not
every one of these is a settled place. Unclaimed wilderness frontier -- a stretch of the
Narlmarches with no name and no buildings yet -- is exactly as buildable as Stirling Reach, and
calling an empty hex a "Settlement" reads wrong the moment someone actually thinks about what the
word means. Asked directly, the DM chose to revert to Region: "I've decided it makes more sense
to call them 'Regions' because not all of them are technically Settlements." See the chat log for
the full exchange.

This is the second time this concept's name has flipped (ADR-0008 chose Region; ADR-0014 chose
Settlement; this reverts to Region again), which is exactly the kind of churn ADR-0008 warned
against creating a *second* word for the same concept to avoid. It's captured here anyway,
plainly, rather than pretending the flip didn't happen -- the glossary and the database migration
history both keep the full chain.

## What changes

Precisely ADR-0014's changes, in reverse:

- **Database**: the `settlements` table is renamed back to `regions`; `events.settlement` becomes
  `events.region`; `settlement_buildings.settlement` becomes `settlement_buildings.region` (that
  table's own name never changed in either direction -- only its column). Applied by
  `ensureRegionRename` (`server/db/connection.js`), a plain `ALTER TABLE ... RENAME`, gated on
  the old name (`settlements`) still existing.

  `ensureSettlementRename` (ADR-0014's own migration) is **not** called anymore, and its
  definition now carries a long comment explaining why: once `schema.sql` went back to creating
  a `regions` table on every boot, that function's own gate -- "does a table named `regions`
  exist" -- stopped being able to tell a genuine still-unmigrated database apart from
  `schema.sql`'s own bootstrap having just created today's normal, current table a moment
  earlier in the same `initSchema` call. Calling it unconditionally, as before, would rename the
  real, live `regions` table away to `settlements` on every single boot, immediately undone by
  `ensureRegionRename` running right after it -- a wasteful and fragile round-trip rather than
  the safe no-op it was designed to be, caught by a test built specifically to simulate a real
  post-ADR-0014 database rather than the already-reverted shape every other test fixture
  produces. `ensureRegionRename` alone is sufficient: a database that never went through
  ADR-0014 at all is already in the target shape (a safe no-op), and a real post-ADR-0014
  database is exactly what it converts.
- **API**: `/api/reference/settlements` becomes `/api/reference/regions` again; every event's
  `settlement` field becomes `region` again (`POST`/`GET /api/events`, every event object's
  shape). `GET /api/projections/settlements` (the building-list projection) is unaffected, same
  as it was unaffected by ADR-0014 -- it was never the entity being renamed.
- **Server functions**: `readSettlementCatalog`/`replaceSettlementCatalog` become
  `readRegions`/`replaceRegions` again -- simpler names are safe again now that "Region" doesn't
  collide with `read.js`'s existing `readSettlements` projection function the way "Settlement"
  did. `ensureSettlementsSeeded` becomes `ensureRegionsSeeded`; `migrateKingdomPlacesToSettlements`
  becomes `migrateKingdomPlacesToRegions`.
- **Client**: Settlements.jsx's `SettlementCatalogEditor` becomes `RegionsEditor` ("Manage
  regions," not "Manage settlements") again; Codex's "Wilderlands Settlements" panel becomes
  "Wilderlands Regions" again. The page title picks back up the "Settlements & Regions" hybrid
  ADR-0014 had dropped, since there are two names in play on that page again: the page itself
  (never renamed) and the entity it manages (Region, again).
- **CONTEXT.md**: the Settlement glossary entry is renamed back to Region, with both prior names
  -- "Settlement" now `_Avoid_` again -- and both ADRs cross-referenced in the entry itself, so a
  future reader finds the full history in one place rather than having to reconstruct it from two
  separate ADRs.

## What doesn't change

Everything ADR-0008 established about the concept -- first-class reference data with a stable id
separate from its mutable name, deletion refused while it still has buildings, optional Kingdom
claim (ADR-0010) -- is unchanged by this ADR just as it was unchanged by ADR-0014. Both ADRs rename
the concept; neither touches what the concept is or how it behaves.

The `data/*.json` export files follow the same reversal the next time `npm run export` runs
(`data/settlementCatalog.json` becomes `data/regions.json` again) -- that requires production
(Turso) credentials this environment doesn't have, so it's on the DM to run after this deploys.
`scripts/migrate.js` was updated for consistency the same way ADR-0014 updated it, despite being
long since spent (`npm run migrate` refuses to re-run against a completed database).
