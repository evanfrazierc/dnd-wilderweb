export const SEASON_HEX = {
  Spring: "#7fae6c",
  Summer: "#d0a23a",
  Autumn: "#c17a3f",
  Winter: "#7fa0b0",
};

export function seasonColor(season) {
  return SEASON_HEX[season] || "#a99a83";
}

// A hand-picked palette (not random) so holiday colors stay legible against the parchment
// theme in both light and dark. Stable per name via a simple string hash, so the same
// holiday always gets the same color across every month/year it appears in, not a fresh
// random one per render.
const HOLIDAY_PALETTE = [
  "#c0693f", "#6b8e4e", "#b08a3e", "#5b7fa6", "#9a5b8f",
  "#4f9b8f", "#a65b6b", "#7a8c3a", "#8a6b9a", "#3f8f7a",
];

export function holidayColor(name) {
  if (!name) return "#a99a83";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return HOLIDAY_PALETTE[hash % HOLIDAY_PALETTE.length];
}

export function seasonIcon(season) {
  return season || "Sparkle";
}

export function currentMonth(calendar) {
  if (!calendar) return null;
  return calendar.months.find((m) => m.number === calendar.currentDate.month) || null;
}

export function formatDate(calendar) {
  if (!calendar) return "";
  const d = calendar.currentDate;
  return `${d.monthName} ${d.day}, ${d.year}`;
}
