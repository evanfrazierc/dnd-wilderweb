import { useEffect } from "react";
import { useCalendarStructure } from "../lib/useCalendarStructure.js";

// Every "game date" field in this app names a day on the campaign's own fictional
// calendar, not the real-world Gregorian one -- so this drives its month list and
// days-per-month from the calendarStructure reference data instead of a native
// <input type="date">. `value` is {year, month, day} (plus whatever else the caller
// already keeps alongside it -- CalendarView's draftDate carries yearLabel/note too,
// which this preserves rather than clobbering).
//
// autoDefault (on by default) fills in today's campaign date the first time the
// structure loads for a still-empty value -- pass false for optional fields (an
// obligation's due date) that should start blank until the DM opts in.
export default function GameDatePicker({ value, onChange, autoDefault = true, allowClear = false, style }) {
  const { structure, currentDate } = useCalendarStructure();

  useEffect(() => {
    if (autoDefault && !value && currentDate) {
      onChange({ year: currentDate.year, month: currentDate.month, day: currentDate.day });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  if (!structure) {
    return <span className="text-faint" style={{ fontSize: "0.8rem" }}>Loading date…</span>;
  }

  function field(key, raw) {
    const num = raw === "" ? "" : Number(raw);
    if (Number.isNaN(num)) return;
    onChange({ ...value, [key]: num });
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", ...style }}>
      <select value={value?.month ?? ""} onChange={(e) => field("month", e.target.value)}>
        <option value="" disabled>Month…</option>
        {structure.months.map((m) => (
          <option key={m.number} value={m.number}>{m.number}. {m.name}</option>
        ))}
      </select>
      <input
        type="number"
        min="1"
        max={structure.daysPerMonth || 30}
        value={value?.day ?? ""}
        onChange={(e) => field("day", e.target.value)}
        placeholder="Day"
        style={{ width: "4rem" }}
      />
      <input
        type="number"
        value={value?.year ?? ""}
        onChange={(e) => field("year", e.target.value)}
        placeholder="Year"
        style={{ width: "5rem" }}
      />
      {allowClear && value && (
        <button type="button" className="btn btn-icon" onClick={() => onChange(null)} aria-label="Clear date">
          ×
        </button>
      )}
    </span>
  );
}
