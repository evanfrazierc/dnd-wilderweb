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
  return `${month}, ${value.day}th, ${value.year}`;
}

export function isCompleteGameDate(value) {
  return Boolean(value)
    && Number.isFinite(value.year)
    && Number.isFinite(value.month)
    && Number.isFinite(value.day);
}
