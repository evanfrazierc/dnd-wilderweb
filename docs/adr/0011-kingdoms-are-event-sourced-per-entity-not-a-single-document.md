# Kingdoms are event-sourced, per-entity state -- not one whole-document blob

Since the original migration, every kingdom (and its counties and their settlement lists)
lived as one nested JSON document in `locations_state`, replaced wholesale by every
`LocationAmended` event (`payload.data`, the entire updated document). ADR-0008 and ADR-0010
already pulled Regions and per-county settlement lists out of that document because it kept
drifting and doing too much; what was left -- kingdoms, counties, and a handful of named
"other" places -- was the one remaining part of the app still using that shape, and it showed:
editing one kingdom's note meant re-saving every other kingdom's data too, and the DM had no
way to tell what actually changed from the event log (the note was the only readable diff).

An `/impeccable critique`-informed redesign (2026-09-07) confirmed the content itself was thin
(4 of 5 kingdoms were empty placeholders) and that the page is used for between-session
worldbuilding notes, not live-table lookup -- which argued for low-friction, per-kingdom
editing over preserving the old hierarchy.

## Kingdoms get their own table, event-sourced like Deities

```sql
CREATE TABLE kingdoms (
  name TEXT PRIMARY KEY,
  capital TEXT,
  note TEXT,
  places TEXT NOT NULL DEFAULT '[]' -- JSON array of {name, type}
);
```

`LocationAmended`'s payload changes shape to `{name, changes}`, scoped to one kingdom --
mirroring `DeityAmended` exactly, down to the projection's merge-partial-changes-onto-existing
logic (`applyLocationAmended` in `server/db/projections.js`). This was a deliberate choice to
extend an existing event type rather than mint a new one (ADR-0004's precedent: don't grow the
taxonomy for a variant of an existing type) -- `LocationAmended` already meant "a kingdom
changed," it just used to mean "the whole document changed instead."

**Name-keyed, not a stable integer id**, same tradeoff ADR-0010 already accepted for kingdoms
living in the JSON document: there's no rename-kingdom feature, so a name-keyed store can't yet
suffer the "renamed vs. deleted-and-recreated" ambiguity that made Regions need real stable ids
(ADR-0008). If a rename feature is ever added, `regions.kingdom`'s string references would need
the same cascade-on-rename treatment `replaceRegions` gives region renames -- not worth building
ahead of that need, same call ADR-0010 made.

## Counties are gone; "other" places become a flat `places` list

Each kingdom's counties (name + seat) and per-county settlement lists (already gutted by
ADR-0010) are dropped entirely, not migrated. Across five kingdoms there was exactly one real
county; the layer wasn't earning its keep. What remains of "named things in a kingdom" is the
old `other` array (name + type -- a landmark, a city), renamed `places` and promoted to the
kingdom's primary content alongside its capital and note.

## `note` becomes a real, visible feature

The old document already had an optional `note` per kingdom, but the client only ever rendered
it as an empty-state fallback message and gave no way to actually set one. It's now a first-class
field, shown even when blank ("between-session worldbuilding notes" was the confirmed primary
use case) -- exactly where a rumor or a plan for an unexplored kingdom belongs.

## `locations_state` is not dropped

`ensureRegionsSeeded` (ADR-0008) still reads `locations_state.data.wilderlandsRegions` on a
from-scratch database, so the table stays in `schema.sql`. A new, equally idempotent
`ensureKingdomsSeeded` reads the same row's `kingdoms` array once (gated on `kingdoms` being
empty) to carry existing kingdoms into the new table, dropping counties/settlements in the
process. After that one-time seed, nothing reads or writes `locations_state` for kingdoms
again -- it's inert leftover data, the same tolerance ADR-0008's amendment already established
for `wilderlandsRegions` sitting unused in the same document.
