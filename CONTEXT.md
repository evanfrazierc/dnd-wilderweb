# Wilderweb

A campaign tracker for a D&D hexcrawl/kingdom-building game. The domain is the campaign's evolving state — resources, buildings, calendar, world map, lore — and the history of how it got there.

## Language

### Events

**Event**:
An immutable record of something that happened to campaign state. Events are the authoritative history; current values are a projection kept in sync with them, not a separately-maintained record.
_Avoid_: log entry, record, transaction (too generic)

**ResourceChanged**:
An event recording a delta to one or more resource, asset, or society values (Wood, Stone, Diplomacy, etc.). Covers ordinary income/expenses as well as trades — a trade is a `ResourceChanged` that names a counterparty, not a distinct event type.
_Avoid_: TradeExecuted (considered and rejected as a separate type)

**BuildingConstructed** / **BuildingRemoved**:
An event recording a building added to or removed from a region's settlement, referencing the building catalog.

**BuildingAmended**:
An event recording a change to an already-built building's `displayName` or `detail` -- not its count, and not which region it's in. Moving a building to another region is a `BuildingRemoved` from the old region immediately followed by a `BuildingConstructed` in the new one (carrying the display name/detail across), rather than a third meaning bolted onto this type or a dedicated "moved" event (see ADR-0004: don't grow the taxonomy for a variant of an existing type).

**CalendarAdvanced**:
An event recording the current in-game date moving forward.

**DeityAmended**:
An event recording a change to a deity's confirmed status, title, or alignment.

**LocationAmended**:
An event recording a Kingdom created or amended -- `payload` is `{name, changes}`, scoped to one kingdom, mirroring `DeityAmended` (ADR-0011). Never posted to Discord: lore/worldbuilding upkeep, not campaign news, same reasoning as `DeityAmended`.

**DMRuling**:
An event recording a DM clarification or correction with no resource or state delta. Always carries a note; never carries `changes`. Distinguishes a deliberate no-op ruling from a `ResourceChanged` with an empty delta, which today are indistinguishable and shouldn't be.

### Supporting concepts

**Actor**:
The name attributed to whoever performed an event — the DM or a named player. A free-text label for now, not a full user account.

**Region**:
The place a building can be built, and the scope an event like `BuildingConstructed` is attributed to (e.g. Stirling Reach, Narlmarches); null on global events like `CalendarAdvanced`. First-class reference data (ADR-0008) -- its own name and description in `server/db/reference.js`'s `regions` resource, not a free-text label. Renaming cascades to every building currently in it; deleting one is refused while it still has buildings (mirroring how removing a resource definition is refused while its value is nonzero). The Codex Locations tab's "Wilderlands Regions" panel displays this same table read-only (ADR-0008) -- it used to keep its own frozen copy (`locations_state`'s `wilderlandsRegions`), which drifted out of sync with edits made on the Settlements page; there is now exactly one list, editable only from Settlements' "Manage regions." A region can optionally be assigned straight to a Kingdom (ADR-0010) -- a plain name reference, since a region is wilderness claimed (or not) by a kingdom rather than a settled place within it.
_Avoid_: conflating with a Kingdom's named places -- a Region is wilderness/frontier tracked for building construction; a named place is a settled, civilized point (a city, a landmark) a kingdom can claim.

**Kingdom**:
A realm on the world map: a name, an optional capital, freeform notes (rumors, plans -- especially useful before there's anything concrete), and a flat list of named places (cities, landmarks) it contains. Campaign state, event-sourced like a Deity (`LocationAmended`, ADR-0011) rather than reference data, because a kingdom's facts are discovered/established during play, not static rules. Name-keyed, not a stable id -- same tradeoff as Deity, acceptable because there's no rename-kingdom feature yet to cause drift. A Region can optionally be claimed by a Kingdom (ADR-0010); a Kingdom's named places are a separate, flatter concept from Regions -- see Region's `_Avoid_` note.
_Avoid_: County, settlement (both retired -- ADR-0010 dropped per-county settlement lists, ADR-0011 dropped the county layer entirely once it was down to one real county across five kingdoms)

**Obligation**:
A tracked debt: resources owed, a due date, and a running balance that decreases as later events settle it. First-class and queryable, not narrative text on the originating event, because players need to see repayment progress over time.
_Avoid_: loan (the loan is the `ResourceChanged` event that creates the Obligation; the Obligation is the ongoing thing it creates)

**Projection**:
The current-state tables (current resource totals, current buildings per region, etc.), derived from and updated transactionally alongside the event log. Not recomputed by full replay on every read.

**Campaign state**:
Data with event history: resources/assets/society totals, buildings built per region, the current in-game date, deities, locations.
_Avoid_: conflating with Reference data

**Reference data**:
Static rules/lore content, edited directly with no event history: the building catalog, the campaign introduction, the calendar's month and holiday definitions.
