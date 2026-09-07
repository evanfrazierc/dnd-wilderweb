-- Events: the append-only, authoritative history. See CONTEXT.md for the event taxonomy
-- and docs/adr/0001-hybrid-event-log-with-projections.md for why projections exist alongside it.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN (
    'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved', 'BuildingAmended',
    'CalendarAdvanced', 'DeityAmended', 'LocationAmended', 'DMRuling'
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
CREATE INDEX IF NOT EXISTS idx_events_region ON events (region);

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
-- mirroring DeityAmended's shape) rather than reference data -- a kingdom's capital,
-- notes, and named places are discovered/established facts during play, not static rules.
-- Name-keyed like deities, not a stable integer id like regions: there's no rename-kingdom
-- feature (docs/adr/0011), so the drift a rename would cause doesn't arise yet.
CREATE TABLE IF NOT EXISTS kingdoms (
  name TEXT PRIMARY KEY,
  capital TEXT,
  note TEXT, -- freeform flavor/rumors, especially useful before there's anything concrete
  places TEXT NOT NULL DEFAULT '[]' -- JSON array of {name, type} -- named settled places (cities, landmarks)
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

-- Regions a building can be built in -- first-class reference data (docs/adr/0008) rather
-- than a free-text label on settlement_buildings.region. A stable id separate from the
-- mutable name is what lets a rename cascade to every settlement_buildings row referencing
-- the old name (see replaceRegions in server/db/reference.js).
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
