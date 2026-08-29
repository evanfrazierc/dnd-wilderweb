import { useEffect, useState } from "react";
import { getProjection } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
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
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);

  function load() {
    return getProjection("calendar").then((c) => {
      setCalendar(c);
      setDraftDate(c.currentDate);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings } = useEventSubmit(() => {
    load();
    setNote("");
  });

  async function saveDate() {
    const month = Number(draftDate.month);
    const day = Number(draftDate.day);
    const year = Number(draftDate.year);
    await submit({
      type: "CalendarAdvanced",
      gameDate: `Month ${month}, ${day}th, ${year}`,
      note: note.trim() || undefined,
      payload: { year, month, day, yearLabel: draftDate.yearLabel, note: draftDate.note },
    });
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
          <h3>Advance the calendar</h3>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
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
          <label style={{ flex: "1 1 12rem" }}>
            Note
            <br />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened this tick"
              style={{ width: "100%" }}
            />
          </label>
          <button className="btn btn-primary" onClick={saveDate}>
            Save
          </button>
          {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
        </div>
        <WarningsList warnings={warnings} />
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
