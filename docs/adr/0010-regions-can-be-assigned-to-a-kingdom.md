# Regions can be assigned to a kingdom; per-county settlement lists retired

ADR-0008 made regions (CONTEXT.md's Region -- Stirling Reach, Narlmarches, the wilderness
areas buildings get built in) first-class, and deliberately kept them unrelated to the Codex
Locations tab's kingdom → county → settlement hierarchy (a city, a county seat -- named,
settled places on the world map). That separation turned out to be more than the domain
actually wanted: a region is frontier a kingdom can lay claim to, and the DM wants to record
that claim.

## Regions optionally reference a kingdom by name

`regions` gets a nullable `kingdom TEXT` column (`server/db/connection.js`'s
`ensureColumn`, same idempotent ALTER-TABLE-if-missing pattern as `building_catalog.annual_effect`).
It's a plain string naming a kingdom in `locations_state`'s document, not a foreign key --
kingdoms have no stable id of their own (they're objects in a JSON blob, keyed by name in the
UI same as regions were before ADR-0008 introduced stable ids), and there's no rename-kingdom
feature that could cause a stored reference to drift stale. If that ever changes, kingdoms
would need the same stable-id treatment ADR-0008 gave regions; not worth building ahead of
that need.

The assignment is direct to a kingdom, not through a county -- a region is unsettled
wilderness the party is carving a claim out of, not a village within one of a kingdom's
counties. Unassigned (`kingdom: null`) is a fully valid, permanent state: unclaimed frontier,
not a to-do.

Editing happens only from Settlements' "Manage regions" (a `<select>` of known kingdom names
per region row, alongside name/description). The Codex Locations tab's kingdom cards display
the regions assigned to them read-only, the same read-only relationship ADR-0008 already
established for the "Wilderlands Regions" panel.

## Per-county settlement lists are gone

Each kingdom's counties used to carry their own `settlements` array (e.g. County of
Arnestal's Village of Hornstead, Village of Belmore, ...), editable via an inline "add
settlement" form. Once a region can be assigned straight to a kingdom, that list stopped
earning its keep -- it was a second, disconnected way of answering "what's out there" that
didn't cross-reference the buildings/resources any of those places actually had. Removed:
the `SettlementAdder` component and `addSettlement` handler in `client/src/components/Codex.jsx`,
and the `settlements` field itself, stripped from each county the same way `wilderlandsRegions`
was dropped from the document in ADR-0008's amendment -- inert on already-saved documents
until the next `LocationAmended` edit, never read again after this change. Counties themselves
stay (name, seat) as the geographic subdivision of a kingdom; only their settlement sub-list
is gone.
