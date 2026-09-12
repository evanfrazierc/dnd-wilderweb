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

**ObligationAmended**:
An event correcting an existing Obligation's `description` or `dueGameDate`, or directly setting `satisfied` (a DM cancelling/forgiving a debt outside the normal repayment path -- the closest thing to "deleting" an Obligation this app offers; the row and its history stay, it just stops counting as active) -- `payload` is `{obligationId, changes}`, mirroring `DeityAmended`/`LocationAmended`. Does not touch `amountTotal`/`amountRemaining`/`repaymentResource`: those stay governed entirely by the `ResourceChanged` events that created and are paying down the debt, so this can't be used to retroactively change what was actually owed or paid. Never posted to Discord -- a correction, not campaign news.

**DMRuling**:
An event recording a DM clarification or correction with no resource or state delta. Always carries a note; never carries `changes`. Distinguishes a deliberate no-op ruling from a `ResourceChanged` with an empty delta, which today are indistinguishable and shouldn't be.

**UnitRaised** / **UnitLost**:
An event recording a Unit added to or removed from the garrison, referencing the unit catalog -- the same shape as `BuildingConstructed`/`BuildingRemoved`, except the garrison is one kingdom-wide roster rather than attributed to a region (ADR-0017). Upgrading a unit (Militia to Guard, a Troop gaining a mount) is a `UnitLost` for the old tier immediately followed by a `UnitRaised` for the new one, the same "no third meaning bolted onto an existing type" precedent `BuildingAmended` above already established for moving a building. A Unit's cost isn't auto-deducted from resources any more than a Building's is -- raising one is a record; the resource delta is a separate `ResourceChanged`.
_Avoid_: Adventurers as a tracked Unit (deliberately excluded, ADR-0017 -- they're a temporary, one-year hire, not a standing part of the garrison)

### Supporting concepts

**Actor**:
The name attributed to whoever performed an event — the DM or a named player. A free-text label for now, not a full user account.

**Region**:
A place a building can be built -- wilderness frontier and a kingdom's own named settlements (a city, a landmark) are the same concept, distinguished only by whether a Kingdom currently claims them, not by two different data shapes (ADR-0012). The scope an event like `BuildingConstructed` is attributed to (e.g. Stirling Reach, Narlmarches, or a kingdom's City of Arnestal); null on global events like `CalendarAdvanced`. First-class reference data (ADR-0008) -- its own name and description in `server/db/reference.js`'s `regions` resource, not a free-text label. Renaming cascades to every building currently in it; deleting one is refused while it still has buildings (mirroring how removing a resource definition is refused while its value is nonzero). The Codex Locations tab's "Wilderlands Regions" panel displays this same table read-only (ADR-0008) -- it used to keep its own frozen copy (`locations_state`'s `wilderlandsRegions`), which drifted out of sync with edits made on the Settlements page; there is now exactly one list, editable only from Settlements' "Manage regions." A region can optionally be assigned straight to a Kingdom (ADR-0010) -- a plain name reference. Called "Settlement" from ADR-0014 until ADR-0015 reversed that choice -- not every one of these is a settled place, so the name didn't fit after all; the underlying table, id, and cascade-on-rename behavior ADR-0008 established are unchanged, only the name.
_Avoid_: Settlement (the canonical name from ADR-0014 until ADR-0015 retired it again -- don't reintroduce it as a second word for the same concept)

**Kingdom**:
A realm on the world map: a name, an optional capital, and freeform notes (rumors, plans -- especially useful before there's anything concrete). Owns zero or more Regions by claim, not by containment -- a Kingdom does not carry its own list of places; ask the `regions` resource which ones name this Kingdom instead (ADR-0012 retired the flat `places` list ADR-0011 first introduced, once it was clear a kingdom's named settlements can have buildings the same way any Region can). Campaign state, event-sourced like a Deity (`LocationAmended`, ADR-0011) rather than reference data, because a kingdom's facts are discovered/established during play, not static rules. Name-keyed, not a stable id -- same tradeoff as Deity, acceptable because there's no rename-kingdom feature yet to cause drift.
_Avoid_: County, place (retired -- see ADR-0010, ADR-0011, ADR-0012); Settlement (used from ADR-0014 to ADR-0015, retired again)

**Obligation**:
A tracked debt: resources owed, a due date, and a running balance that decreases as later events settle it. First-class and queryable, not narrative text on the originating event, because players need to see repayment progress over time. Its description and due date can be corrected after the fact (`ObligationAmended`); what's owed and what's been paid cannot -- those stay strictly a function of the `ResourceChanged` events that created and are settling it.
_Avoid_: loan (the loan is the `ResourceChanged` event that creates the Obligation; the Obligation is the ongoing thing it creates)

**Projection**:
The current-state tables (current resource totals, current buildings per region, etc.), derived from and updated transactionally alongside the event log. Not recomputed by full replay on every read.

**Campaign state**:
Data with event history: resources/assets/society totals, buildings built per region, the garrison, the current in-game date, deities, locations.
_Avoid_: conflating with Reference data

**Reference data**:
Static rules/lore content, edited directly with no event history: the building catalog, the unit catalog, the campaign introduction, the calendar's month and holiday definitions.
