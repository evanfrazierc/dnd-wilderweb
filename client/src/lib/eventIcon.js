// Shared by Timeline's event list and StatusBar's "latest entry" badge so an event type's
// icon stays the same everywhere it's shown. BuildingAmended has no dedicated Timeline form
// (it's Settlements-only -- see App.jsx's architecture notes) but its events still turn up in
// the log StatusBar reads, so it's included here even though it's absent from Timeline's own
// EVENT_TYPES filter list.
export const EVENT_ICON = {
  ResourceChanged: "Scroll",
  BuildingConstructed: "Settlements",
  BuildingRemoved: "Trash",
  BuildingAmended: "Codex",
  CalendarAdvanced: "Calendar",
  DeityAmended: "Piety",
  LocationAmended: "MapPin",
  ObligationAmended: "Wealth",
  DMRuling: "Codex",
};
