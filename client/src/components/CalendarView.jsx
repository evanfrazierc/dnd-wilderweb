import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";

function MonthCard({ month, isCurrent, currentDay }) {
  const holidaysByDay = Object.fromEntries(month.holidays.map((h) => [h.day, h]));
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="card" style={{ borderColor: isCurrent ? "var(--accent)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h4>
          {month.number}. {month.name}
        </h4>
        <span className="pill">{month.season}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "3px",
          marginTop: "0.5rem",
        }}
      >
        {days.map((day) => {
          const holiday = holidaysByDay[day];
          const isToday = isCurrent && day === currentDay;
          return (
            <div
              key={day}
              title={holiday ? `${holiday.name} (${holiday.deity} holy day)` : undefined}
              style={{
                aspectRatio: "1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                fontSize: "0.7rem",
                background: isToday
                  ? "var(--accent)"
                  : holiday
                  ? "var(--bg-elevated)"
                  : "transparent",
                border: holiday ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: isToday ? "#1a1410" : holiday ? "var(--accent-strong)" : "var(--text-dim)",
                fontWeight: isToday || holiday ? 700 : 400,
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
      {month.holidays.length > 0 && (
        <div className="tag-row">
          {[...new Set(month.holidays.map((h) => h.name))].map((name) => (
            <span key={name} className="pill">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarView() {
  const [calendar, setCalendar] = useState(null);
  const [draftDate, setDraftDate] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    getResource("calendar")
      .then((c) => {
        setCalendar(c);
        setDraftDate(c.currentDate);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function saveDate() {
    setStatus("Saving...");
    try {
      const monthEntry = calendar.months.find((m) => m.number === Number(draftDate.month));
      const updated = {
        ...calendar,
        currentDate: {
          ...draftDate,
          month: Number(draftDate.month),
          day: Number(draftDate.day),
          year: Number(draftDate.year),
          monthName: monthEntry?.name || draftDate.monthName,
        },
      };
      await putResource("calendar", updated);
      setCalendar(updated);
      setDraftDate(updated.currentDate);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  if (error) return <div className="error-box">Failed to load calendar: {error}</div>;
  if (!calendar) return <div className="loading">Loading calendar…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Continental Calendar — {calendar.era}</h2>
        <p className="pill">
          {calendar.currentDate.monthName} {calendar.currentDate.day}, {calendar.currentDate.year}{" "}
          ({calendar.currentDate.yearLabel})
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3>Set current date</h3>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Year{" "}
            <input
              type="number"
              value={draftDate.year}
              onChange={(e) => setDraftDate({ ...draftDate, year: e.target.value })}
              style={{ width: "5rem" }}
            />
          </label>
          <label>
            Month{" "}
            <select
              value={draftDate.month}
              onChange={(e) => setDraftDate({ ...draftDate, month: e.target.value })}
            >
              {calendar.months.map((m) => (
                <option key={m.number} value={m.number}>
                  {m.number}. {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Day{" "}
            <input
              type="number"
              min="1"
              max="30"
              value={draftDate.day}
              onChange={(e) => setDraftDate({ ...draftDate, day: e.target.value })}
              style={{ width: "4rem" }}
            />
          </label>
          <button className="btn btn-primary" onClick={saveDate}>
            Save
          </button>
          {status && <span className="pill">{status}</span>}
        </div>
      </div>

      <div className="grid grid-3">
        {calendar.months.map((month) => (
          <MonthCard
            key={month.number}
            month={month}
            isCurrent={month.number === calendar.currentDate.month}
            currentDay={calendar.currentDate.day}
          />
        ))}
      </div>
    </div>
  );
}
