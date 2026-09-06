export const SEASON_HEX = {
  Spring: "#7fae6c",
  Summer: "#d0a23a",
  Autumn: "#c17a3f",
  Winter: "#7fa0b0",
};

export function seasonColor(season) {
  return SEASON_HEX[season] || "#a99a83";
}

// The dataviz skill's validated categorical palette (dark-mode steps), not a hand-picked or
// generated-by-formula one. A pure evenly-spaced hue wheel *looks* like it should guarantee
// separation, but human hue discrimination isn't uniform -- it's weak in the green/yellow-green
// region, so two mathematically-45°-apart hues can still land close enough to be mistaken for
// each other there (this is exactly the bug reported: two holidays both read as "green").
// This 8-hue order is checked against the app's actual dark surface (#1c1712) for lightness
// band, chroma floor, CVD-safe separation, normal-vision separation, and contrast -- see
// dataviz skill references/palette.md and references/color-formula.md. Fixed order, never
// cycled or reordered per-render.
const HOLIDAY_PALETTE = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
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
