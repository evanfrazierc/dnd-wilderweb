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

**CalendarAdvanced**:
An event recording the current in-game date moving forward.

**DeityAmended**:
An event recording a change to a deity's confirmed status, title, or alignment.

**LocationAmended**:
An event recording a kingdom, county, settlement, or region added or edited on the world map.

**DMRuling**:
An event recording a DM clarification or correction with no resource or state delta. Always carries a note; never carries `changes`. Distinguishes a deliberate no-op ruling from a `ResourceChanged` with an empty delta, which today are indistinguishable and shouldn't be.

### Supporting concepts

**Actor**:
The name attributed to whoever performed an event — the DM or a named player. A free-text label for now, not a full user account.

**Region**:
The place an event is scoped to (e.g. Stirling Reach, Narlmarches). Optional: set on region-scoped events like `BuildingConstructed`, null on global ones like `CalendarAdvanced`.

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
