# A kingdom's named places are Regions, not a separate list

ADR-0011 gave each kingdom a flat `places` array (`{name, type}` -- a landmark, a city) to
replace the old document's counties. Revisited immediately during the domain-modeling pass that
produced this ADR: does a place inside a kingdom (a city, a landmark) ever get buildings tracked
in it, the way Stirling Reach does? Confirmed yes -- a kingdom's own settlements are exactly as
buildable as any frontier region the party claims. That collapses `places` into something
already built and more capable: **Region** (ADR-0008), which already supports buildings,
a description, and being claimed by a Kingdom (ADR-0010).

Keeping `places` as a separate, parallel concept would have meant two different shapes for "a
named place on the map" -- one that can have buildings (Region) and one that can't (`places`) --
with no principled way to tell a DM which one a given name should be, and an inevitable later
migration once the first kingdom's landmark needed a building after all. Better to not build the
second shape at all.

## What changes

- `kingdoms.places` is dropped from `schema.sql` (new databases never create it). The one real
  entry that existed (Olen's Rest, a landmark in the Kingdom of Casdenia) is migrated into a real
  `regions` row (`kingdom: "Kingdom of Casdenia"`) by `migrateKingdomPlacesToRegions`
  (`server/db/reference.js`), idempotent and dedup-by-name like `ensureRegionsSeeded` --
  necessary because this runs against the already-deployed Turso database too, not just a fresh
  one.
- `LocationAmended`'s `changes` can now only touch `capital` and `note` -- a kingdom no longer
  owns place data to amend. Adding a new named place to a kingdom means creating a Region and
  assigning its `kingdom` from Settlements' "Manage regions" (already the only way to assign a
  region to a kingdom, per ADR-0010), not editing the kingdom itself.
- The Codex Locations tab's per-kingdom card drops its inline add/remove-place form entirely; the
  existing read-only "Regions claimed by this kingdom" tag row is now the only place a kingdom's
  settlements are shown, with a hint pointing at Settlements when a kingdom claims none yet.

## What doesn't change

Region stays reference data (no event history) and Kingdom stays event-sourced campaign state
(ADR-0011) -- this only removes the redundant place-tracking that had crept onto Kingdom, it
doesn't touch either type's underlying nature.
