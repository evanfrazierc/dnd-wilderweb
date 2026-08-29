-- Events: the append-only, authoritative history. See CONTEXT.md for the event taxonomy
-- and docs/adr/0001-hybrid-event-log-with-projections.md for why projections exist alongside it.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN (
    'ResourceChanged', 'BuildingConstructed', 'BuildingRemoved',
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

-- Locations is one nested document (kingdoms > counties > settlements, plus wilderlandsRegions);
-- kept as a single JSON blob projection rather than normalized, per the low change frequency
-- and complexity of the shape (see .scratch/campaign-database/spec.md).
CREATE TABLE IF NOT EXISTS locations_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{}'
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
  requires TEXT NOT NULL DEFAULT '[]'
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
