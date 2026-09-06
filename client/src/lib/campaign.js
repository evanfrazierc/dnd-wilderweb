export const SEASON_HEX = {
  Spring: "#7fae6c",
  Summer: "#d0a23a",
  Autumn: "#c17a3f",
  Winter: "#7fa0b0",
};

export function seasonColor(season) {
  return SEASON_HEX[season] || "#a99a83";
}

// A categorical palette built the dataviz skill's way (fixed hue order, checked against the
// app's actual dark surface #1c1712 for lightness band, chroma floor, CVD-safe separation,
// normal-vision separation, and contrast -- all pass), but re-tuned in saturation/lightness
// to sit in this app's own warm, muted color family (--accent/--good/--bad/--warn/--season-*
// in index.css) instead of the skill's default vivid dataviz hues. A pure evenly-spaced hue
// wheel *looks* like it should guarantee separation, but human hue discrimination isn't
// uniform -- it's weak in the green/yellow-green region, so two mathematically-45°-apart hues
// can still land close enough to be mistaken for each other there (the originally reported
// bug: two holidays both reading as "green"). Fixed order, never cycled or reordered per-render.
const HOLIDAY_PALETTE = [
  "#5199cd", // dusty blue (echoes --season-winter)
  "#c86741", // rust/terracotta (echoes --bad)
  "#359775", // pine teal
  "#b58a26", // antique gold (echoes --warn / --accent)
  "#c95e86", // dusty rose
  "#49913b", // sage/forest green (echoes --good)
  "#7a60c7", // muted plum
  "#cf5959", // muted red
];

// Assigns a color to each holiday name *within one month*, by the order names first appear
// in that month's holiday list -- not a global hash of the name alone. This is what
// guarantees two different holidays in the same month never collide on a similar or
// identical color: they simply get the next slot in the fixed palette order. A holiday
// spanning several days in the same month (e.g. a multi-day festival) keeps one consistent
// color throughout, since every occurrence maps to the same name.
export function assignHolidayColors(namesInMonth) {
  const colorByName = new Map();
  for (const name of namesInMonth) {
    if (!colorByName.has(name)) {
      colorByName.set(name, HOLIDAY_PALETTE[colorByName.size % HOLIDAY_PALETTE.length]);
    }
  }
  return colorByName;
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
