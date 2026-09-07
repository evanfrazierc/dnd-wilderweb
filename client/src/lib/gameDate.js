// 3 -> "rd", 11 -> "th" (not "st"), 21 -> "st". The parser (server/db/gameDate.js) accepts any
// of st/nd/rd/th interchangeably, but always writing "th" produced grammatically wrong dates
// ("3th", "21th") that stood out once the rest of the format was made consistent.
function ordinalSuffix(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// Canonical format for a game date built from the picker's {year, month, day} shape --
// matches what CalendarView's "Advance the calendar" form already produced, which
// server/db/gameDate.js's parser recognizes ("Month 3, 15th, 1225"). GameDatePicker attaches
// `monthName` (the campaign's own name for that month, e.g. "Erastus") once its calendar
// structure has loaded, in which case this uses it instead -- "Erastus (2), 9th, 1227",
// also parser-recognized -- so newly-saved events read the same way the calendar header and
// the picker's own month dropdown already do, rather than a bare "Month N" nothing else in
// the app shows.
export function formatGameDate(value) {
  const month = value.monthName ? `${value.monthName} (${value.month})` : `Month ${value.month}`;
  return `${month}, ${value.day}${ordinalSuffix(value.day)}, ${value.year}`;
}

export function isCompleteGameDate(value) {
  return Boolean(value)
    && Number.isFinite(value.year)
    && Number.isFinite(value.month)
    && Number.isFinite(value.day);
}
