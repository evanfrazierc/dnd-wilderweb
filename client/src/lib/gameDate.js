// Canonical format for a game date built from the picker's {year, month, day} shape --
// matches what CalendarView's "Advance the calendar" form already produced, which
// server/db/gameDate.js's parser recognizes ("Month 3, 15th, 1225").
export function formatGameDate(value) {
  return `Month ${value.month}, ${value.day}th, ${value.year}`;
}

export function isCompleteGameDate(value) {
  return Boolean(value)
    && Number.isFinite(value.year)
    && Number.isFinite(value.month)
    && Number.isFinite(value.day);
}
