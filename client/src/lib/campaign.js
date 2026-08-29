export const SEASON_HEX = {
  Spring: "#7fae6c",
  Summer: "#d0a23a",
  Autumn: "#c17a3f",
  Winter: "#7fa0b0",
};

export function seasonColor(season) {
  return SEASON_HEX[season] || "#a99a83";
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
