import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";
import Icon from "./Icon.jsx";
import { seasonColor } from "../lib/campaign.js";

function MonthCard({ month, isCurrent, currentDay }) {
  const holidaysByDay = Object.fromEntries(month.holidays.map((h) => [h.day, h]));
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const color = seasonColor(month.season);

  return (
    <div
      className={`card month-card${isCurrent ? " current" : ""}`}
      style={{ "--season-color": color }}
    >
      <div className="month-card-head">
        <h4>
          <span className="text-faint">{month.number.toString().padStart(2, "0")}</span> {month.name}
        </h4>
        <span className="season-tag" style={{ "--season-color": color }}>
          <Icon name={month.season} size={12} />
          {month.season}
        </span>
      </div>
      <div className="day-grid">
        {days.map((day) => {
          const holiday = holidaysByDay[day];
          const isToday = isCurrent && day === currentDay;
          return (
            <div
              key={day}
              className={`day-cell${isToday ? " today" : ""}${holiday ? " holiday" : ""}`}
              title={holiday ? `${holiday.name} (${holiday.deity} holy day)` : undefined}
            >
              {day}
              {holiday && <span className="day-dot" />}
            </div>
          );
        })}
      </div>
      {month.holidays.length > 0 && (
        <div className="tag-row">
          {[...new Set(month.holidays.map((h) => h.name))].map((name) => (
            <span key={name} className="pill">
              <Icon name="Piety" size={11} />
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

  const currentSeason = calendar.months.find((m) => m.number === calendar.currentDate.month)?.season;

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">{calendar.era}</span>
          <h2>
            {calendar.currentDate.monthName} {calendar.currentDate.day}, {calendar.currentDate.year}
          </h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">{calendar.currentDate.yearLabel}</span>
          {currentSeason && (
            <span className="season-tag" style={{ "--season-color": seasonColor(currentSeason) }}>
              <Icon name={currentSeason} size={13} />
              {currentSeason}
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.75rem" }}>
        <div className="stat-group-head">
          <span className="icon-badge">
            <Icon name="Calendar" size={17} />
          </span>
          <h3>Set current date</h3>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Year
            <br />
            <input
              type="number"
              value={draftDate.year}
              onChange={(e) => setDraftDate({ ...draftDate, year: e.target.value })}
              style={{ width: "5.5rem" }}
            />
          </label>
          <label>
            Month
            <br />
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
            Day
            <br />
            <input
              type="number"
              min="1"
              max="30"
              value={draftDate.day}
              onChange={(e) => setDraftDate({ ...draftDate, day: e.target.value })}
              style={{ width: "4.5rem" }}
            />
          </label>
          <button className="btn btn-primary" onClick={saveDate} style={{ alignSelf: "flex-end" }}>
            Save
          </button>
          {status && (
            <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`} style={{ alignSelf: "flex-end" }}>
              {status}
            </span>
          )}
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
