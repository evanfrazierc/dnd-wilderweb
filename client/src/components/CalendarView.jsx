import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import StatusPill from "./StatusPill.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import WeatherPill from "./WeatherPill.jsx";
import { formatGameDate } from "../lib/gameDate.js";
import { seasonColor, weatherColor, assignHolidayColors } from "../lib/campaign.js";

function parseHolidaysText(text) {
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((part) => {
    const [day, name, deity] = part.split(":").map((s) => s.trim());
    return { day: Number(day), name: name || "", deity: deity || undefined };
  }).filter((h) => !Number.isNaN(h.day) && h.name);
}
function holidaysToText(holidays) {
  return (holidays || []).map((h) => [h.day, h.name, h.deity].filter((v) => v !== undefined).join(":")).join(", ");
}

function toMonthRow(m) {
  return { number: m.number, name: m.name || "", season: m.season || "", holidaysText: holidaysToText(m.holidays) };
}
function fromMonthRow(r) {
  return { number: Number(r.number), name: r.name.trim(), season: r.season.trim() || null, holidays: parseHolidaysText(r.holidaysText) };
}

// The d6 face numbers a weather table is read with -- 1-6 for the default six-outcome tables
// (server/db/weather.js), which the reference write enforces, so this is a fixed row of six.
const WEATHER_FACES = [1, 2, 3, 4, 5, 6];

// One editable row per season in the weather table (docs/adr/0020). The seasons come from the
// table itself rather than from the month rows above: a DM mid-rename has a table key the
// months don't mention yet (and vice versa), and dropping either side of that mismatch on the
// floor would quietly delete their work.
function WeatherTableEditor({ weather, onChange }) {
  const seasons = Object.keys(weather);

  function setOutcome(season, face, value) {
    const outcomes = [...weather[season]];
    outcomes[face - 1] = value;
    onChange({ ...weather, [season]: outcomes });
  }

  return (
    <div style={{ marginTop: "1.1rem", paddingTop: "0.9rem", borderTop: "1px solid var(--border-soft)" }}>
      <h4 style={{ margin: "0 0 0.15rem" }}>Weather table</h4>
      <p className="text-faint" style={{ fontSize: "0.8rem", marginTop: 0 }}>
        Advancing the calendar rolls a d6 and reads this row for the new date's season. Repeat an
        outcome to make it likelier.
      </p>
      {seasons.map((season) => (
        <div key={season} style={{ marginTop: "0.6rem" }}>
          <span className="season-tag" style={{ "--season-color": seasonColor(season) }}>
            <Icon name={season} size={12} />
            {season}
          </span>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
            {WEATHER_FACES.map((face) => (
              <label key={face} style={{ flex: "1 1 5.5rem", fontSize: "0.74rem" }}>
                <span className="text-faint">{face}</span>
                <input
                  value={weather[season][face - 1] ?? ""}
                  onChange={(e) => setOutcome(season, face, e.target.value)}
                  style={{ width: "100%", borderColor: weatherColor(weather[season][face - 1]) }}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Reference data (CONTEXT.md): edited directly, no event history.
function CalendarStructureEditor({ structure, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft({
    era: structure.era || "",
    daysPerMonth: structure.daysPerMonth ?? "",
    months: structure.months.map(toMonthRow),
    weather: structure.weather ?? {},
  });
  const { save, status } = useReferenceSave("calendarStructure", onSaved);

  function monthField(i, key, value) {
    set(["months", i], { ...draft.months[i], [key]: value });
  }

  function addMonth() {
    const nextNumber = Math.max(0, ...draft.months.map((m) => Number(m.number) || 0)) + 1;
    addItem(["months"], () => ({ number: nextNumber, name: "", season: "", holidaysText: "" }));
  }

  function removeMonth(i) {
    removeItem(["months"], i);
  }

  function saveStructure() {
    save({
      era: draft.era.trim() || null,
      daysPerMonth: draft.daysPerMonth === "" ? null : Number(draft.daysPerMonth),
      months: draft.months.map(fromMonthRow),
      weather: draft.weather,
    });
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Codex" size={17} />
        </span>
        <h3>Manage calendar structure</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Holidays are a comma-separated list like "1: New Year: Pelor, 15: Harvest".
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 10rem" }}>
          Era
          <br />
          <input value={draft.era} onChange={(e) => set(["era"], e.target.value)} style={{ width: "100%" }} />
        </label>
        <label style={{ flex: "0 0 8rem" }}>
          Days per month
          <br />
          <input
            type="number"
            value={draft.daysPerMonth}
            onChange={(e) => set(["daysPerMonth"], e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      {draft.months.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "0 0 4rem" }}>#<br /><input type="number" value={m.number} onChange={(e) => monthField(i, "number", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 8rem" }}>Name<br /><input value={m.name} onChange={(e) => monthField(i, "name", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 6rem" }}>Season<br /><input value={m.season} onChange={(e) => monthField(i, "season", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "2 1 14rem" }}>Holidays<br /><input value={m.holidaysText} onChange={(e) => monthField(i, "holidaysText", e.target.value)} style={{ width: "100%" }} /></label>
          <button className="btn btn-sm btn-danger" onClick={() => removeMonth(i)}>Remove</button>
        </div>
      ))}
      <WeatherTableEditor weather={draft.weather} onChange={(next) => set(["weather"], next)} />
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addMonth}>
          <Icon name="Plus" size={14} />
          Add month
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveStructure}>Save structure</button>
            <StatusPill status={status} />
          </>
        )}
      </div>
    </div>
  );
}

function MonthCard({ month, isCurrent, currentDay }) {
  const holidaysByDay = Object.fromEntries(month.holidays.map((h) => [h.day, h]));
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const color = seasonColor(month.season);
  const uniqueHolidayNames = [...new Set(month.holidays.map((h) => h.name))];
  const holidayColors = assignHolidayColors(uniqueHolidayNames);

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
              style={holiday ? { "--holiday-color": holidayColors.get(holiday.name) } : undefined}
              title={holiday ? `${holiday.name} (${holiday.deity} holy day)` : undefined}
            >
              {day}
              {holiday && <span className="day-dot" />}
            </div>
          );
        })}
      </div>
      {uniqueHolidayNames.length > 0 && (
        <div className="tag-row">
          {uniqueHolidayNames.map((name) => (
            <span key={name} className="pill holiday" style={{ "--holiday-color": holidayColors.get(name) }}>
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
  // "" = let the d6 decide (the normal path); anything else is the DM overriding the roll for
  // this one advance (docs/adr/0020).
  const [weatherChoice, setWeatherChoice] = useState("");
  const [structure, setStructure] = useState(null);
  const [showStructureEditor, setShowStructureEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return getProjection("calendar").then((c) => {
      setCalendar(c);
      setDraftDate(c.currentDate);
    });
  }

  function loadStructure() {
    return getReference("calendarStructure").then(setStructure);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadStructure().catch((e) => setError(e.message));
  }, []);

  function onStructureSaved() {
    loadStructure();
    load();
  }

  // The season of the date being *saved*, not the current one -- advancing from Winter into
  // Spring has to offer Spring's outcomes. Deduped for the menu: a table listing "Clear" twice
  // means a likelier outcome, not two entries to pick between.
  const draftSeason = draftDate ? calendar?.months.find((m) => m.number === draftDate.month)?.season : null;
  const draftSeasonOutcomes = [...new Set(structure?.weather?.[draftSeason] ?? [])];

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    load();
    setNote("");
    setWeatherChoice("");
  });

  async function saveDate() {
    await submit({
      type: "CalendarAdvanced",
      gameDate: formatGameDate(draftDate),
      note: note.trim() || undefined,
      payload: {
        year: draftDate.year,
        month: draftDate.month,
        day: draftDate.day,
        yearLabel: draftDate.yearLabel,
        note: draftDate.note,
        // Omitted on the normal path, which is what tells the server to roll for the new
        // date's season (docs/adr/0020); sent only when the DM overrode the die, with no
        // `roll`, since no die was thrown.
        weather: weatherChoice ? { season: draftSeason, condition: weatherChoice } : undefined,
      },
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
          <button className="btn btn-sm" onClick={() => setShowStructureEditor(!showStructureEditor)}>
            {showStructureEditor ? "Hide" : "Manage"} calendar structure
          </button>
          {currentSeason && (
            <span className="season-tag" style={{ "--season-color": seasonColor(currentSeason) }}>
              <Icon name={currentSeason} size={13} />
              {currentSeason}
            </span>
          )}
          <WeatherPill weather={calendar.currentDate.weather} />
        </div>
      </div>

      {showStructureEditor && structure && (
        <CalendarStructureEditor structure={structure} onSaved={onStructureSaved} />
      )}

      <div className="card" style={{ marginBottom: "1.75rem" }}>
        <div className="stat-group-head">
          <span className="icon-badge">
            <Icon name="Calendar" size={17} />
          </span>
          <h3>Advance the calendar</h3>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label>
            Date
            <br />
            <GameDatePicker value={draftDate} onChange={setDraftDate} />
          </label>
          <label style={{ flex: "1 1 12rem" }}>
            Note
            <br />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened"
              style={{ width: "100%" }}
            />
          </label>
          {draftSeasonOutcomes.length > 0 && (
            <label>
              Weather
              <br />
              <select
                value={weatherChoice}
                onChange={(e) => setWeatherChoice(e.target.value)}
                title={`Rolled from the ${draftSeason} table unless you pick one yourself`}
              >
                <option value="">Roll a d6 ({draftSeason})</option>
                {draftSeasonOutcomes.map((condition) => (
                  <option key={condition} value={condition}>{condition}</option>
                ))}
              </select>
            </label>
          )}
          <button className="btn btn-primary" onClick={saveDate}>
            Save
          </button>
          <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
          <StatusPill status={status} />
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
