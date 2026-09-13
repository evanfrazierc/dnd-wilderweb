-- Events: the append-only, authoritative history. See CONTEXT.md for the event taxonomy
-- and docs/adr/0001-hybrid-event-log-with-projections.md for why projections exist alongside it.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN (
    'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
    'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'ObligationAmended', 'DMRuling',
    'UnitRaised', 'UnitLost', 'MapUpdated'
  )),
  game_date_raw TEXT NOT NULL,
  game_date_sort INTEGER NOT NULL,
  posted_at TEXT NOT NULL,
  actor TEXT,
  region TEXT,
  note TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  warnings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_game_date_sort ON events (game_date_sort);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
-- idx_events_region is NOT created here: on a database that still has the pre-rename
-- `settlement` column (connection.js's ensureRegionRename hasn't run yet at this point in
-- initSchema), this statement would fail outright -- IF NOT EXISTS only guards the index's
-- own name, not whether the column it indexes currently exists. ensureRegionRename creates
-- it instead, unconditionally, after the column is guaranteed to be `region` (freshly
-- created that way, or just renamed).

-- Projections: current state, updated transactionally alongside the event that caused the change.
-- Never recomputed by replaying the full log on read (ADR-0001).

CREATE TABLE IF NOT EXISTS resource_totals (
  grp TEXT NOT NULL CHECK (grp IN ('resources', 'assets', 'society')),
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (grp, name)
);

CREATE TABLE IF NOT EXISTS settlement_buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  building TEXT NOT NULL, -- must match building_catalog.name
  display_name TEXT, -- optional in-fiction name, e.g. "Anora's Roost" for a Tower
  count INTEGER NOT NULL DEFAULT 1,
  detail TEXT,
  UNIQUE (region, building)
);

-- A Unit's current count (CONTEXT.md, docs/adr/0017): unlike settlement_buildings, this is one
-- kingdom-wide roster, not per-region -- the garrison isn't attributed to a specific settlement.
CREATE TABLE IF NOT EXISTS garrison_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL UNIQUE, -- must match unit_catalog.name
  count INTEGER NOT NULL DEFAULT 1,
  detail TEXT -- optional in-fiction note, e.g. "House Elmander guards"
);

-- One row per MapUpdated event (docs/adr/0018) -- the image itself, kept out of events.payload
-- for the same reason settlement_buildings/garrison_units live alongside their event types
-- rather than embedding everything in payload: a multi-MB image inline would bloat every
-- generic event-list fetch (Timeline, StatusBar) regardless of whether anyone's looking at the
-- map. "Current" is whichever row's event has the latest game_date_sort -- no separate pointer
-- table, since that's already exactly "latest by date" with nothing to aggregate.
CREATE TABLE IF NOT EXISTS map_versions (
  event_id INTEGER PRIMARY KEY REFERENCES events (id),
  image_data BLOB NOT NULL,
  mime_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  year INTEGER NOT NULL,
  year_label TEXT,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS deities (
  name TEXT PRIMARY KEY,
  title TEXT,
  alignment TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

-- Superseded by the `kingdoms` table below (docs/adr/0011) -- kept only because
-- ensureRegionsSeeded (server/db/reference.js) still reads its historical
-- wilderlandsRegions field on a from-scratch database. No longer written to.
CREATE TABLE IF NOT EXISTS locations_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{}'
);

-- A kingdom (CONTEXT.md): campaign state, event-sourced like deities (LocationAmended,
-- mirroring DeityAmended's shape) rather than reference data -- a kingdom's capital and
-- notes are discovered/established facts during play, not static rules. Name-keyed like
-- deities, not a stable integer id like regions: there's no rename-kingdom feature
-- (docs/adr/0011), so the drift a rename would cause doesn't arise yet. A kingdom's named
-- settlements are not its own data -- they're Regions that name this kingdom via
-- `regions.kingdom` (docs/adr/0010, docs/adr/0012).
CREATE TABLE IF NOT EXISTS kingdoms (
  name TEXT PRIMARY KEY,
  capital TEXT,
  note TEXT -- freeform flavor/rumors, especially useful before there's anything concrete
);

-- Obligations: a first-class tracked debt (CONTEXT.md), settled incrementally by
-- ResourceChanged events that reference it.
CREATE TABLE IF NOT EXISTS obligations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  original_resources TEXT NOT NULL DEFAULT '{}',
  repayment_resource TEXT NOT NULL,
  amount_total INTEGER NOT NULL,
  amount_remaining INTEGER NOT NULL,
  due_game_date_raw TEXT,
  due_game_date_sort INTEGER,
  created_by_event_id INTEGER REFERENCES events (id),
  satisfied INTEGER NOT NULL DEFAULT 0
);

-- Reference data: static rules/lore content, edited directly, no event history (CONTEXT.md).

CREATE TABLE IF NOT EXISTS building_catalog (
  name TEXT PRIMARY KEY,
  category TEXT,
  effect TEXT,
  cost TEXT NOT NULL DEFAULT '{}',
  cost_note TEXT,
  upkeep TEXT,
  build_time TEXT,
  requires TEXT NOT NULL DEFAULT '[]',
  -- {resourceName: signedIntDelta} per building per year, separate from the free-text
  -- effect/upkeep above. Only set for buildings whose effect is an unambiguous, dice-free,
  -- population-independent flat rate -- see docs/adr/0009. Added via connection.js's
  -- ALTER-TABLE-if-missing check, since this table predates the column (existing DBs
  -- already had building_catalog before this was added).
  annual_effect TEXT NOT NULL DEFAULT '{}'
);

-- A type of garrison unit (CONTEXT.md, docs/adr/0017) -- reference data structured like
-- building_catalog, since a Unit is the same kind of thing: a catalog-referenced entity with a
-- cost and building prerequisites.
CREATE TABLE IF NOT EXISTS unit_catalog (
  name TEXT PRIMARY KEY,
  cost TEXT NOT NULL DEFAULT '{}', -- {resourceName: amount} to raise one
  upkeep TEXT NOT NULL DEFAULT '{}', -- {resourceName: amount} per year, one unit
  combat_bonus INTEGER NOT NULL DEFAULT 0,
  requires TEXT NOT NULL DEFAULT '[]', -- building names, same shape as building_catalog.requires
  note TEXT
);

-- Regions a building can be built in -- first-class reference data (docs/adr/0008) rather
-- than a free-text label on settlement_buildings.region. A stable id separate from the
-- mutable name is what lets a rename cascade to every settlement_buildings row referencing
-- the old name (see replaceRegions in server/db/reference.js). Named "Region" rather than
-- "Settlement" (docs/adr/0015, reverting docs/adr/0014's brief rename) -- not every one of
-- these is a settled place; unclaimed wilderness frontier is just as buildable, and calling
-- an empty hex a "Settlement" reads wrong.
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  -- Optional: which Codex Locations kingdom (by name) claims this region, e.g. "Kingdom of
  -- Casdenia" (docs/adr/0010). NULL means unclaimed frontier. Referenced by name, not a
  -- foreign key, because kingdoms live inside locations_state's JSON document and have no
  -- stable id of their own -- acceptable since there's no rename-kingdom feature to cause
  -- drift (see ADR-0010).
  kingdom TEXT
);

CREATE TABLE IF NOT EXISTS resource_definitions (
  grp TEXT NOT NULL CHECK (grp IN ('resources', 'assets', 'society')),
  name TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (grp, name)
);

CREATE TABLE IF NOT EXISTS calendar_months (
  number INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT,
  holidays TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS campaign_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
