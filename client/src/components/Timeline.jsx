import { useEffect, useState } from "react";
import { getEvents, getObligations } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";

const EVENT_TYPES = [
  "ResourceChanged",
  "BuildingConstructed",
  "BuildingRemoved",
  "CalendarAdvanced",
  "DeityAmended",
  "LocationAmended",
  "DMRuling",
];

const TYPE_ICON = {
  ResourceChanged: "Scroll",
  BuildingConstructed: "Settlements",
  BuildingRemoved: "Trash",
  CalendarAdvanced: "Calendar",
  DeityAmended: "Piety",
  LocationAmended: "MapPin",
  DMRuling: "Codex",
};

function parseChanges(text) {
  const changes = {};
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^([+-]?\d+)\s+(\w+)$/);
      if (match) changes[match[2]] = Number(match[1]);
    });
  return changes;
}

function NewEntryForm({ obligations, onAdd }) {
  const [gameDate, setGameDate] = useState("");
  const [region, setRegion] = useState("");
  const [note, setNote] = useState("");
  const [changesText, setChangesText] = useState("");
  const [obligationId, setObligationId] = useState("");
  const { submit, status, warnings } = useEventSubmit(onAdd);

  const changes = parseChanges(changesText);
  const hasChanges = Object.keys(changes).length > 0;

  function submitForm(e) {
    e.preventDefault();
    if (!gameDate.trim() || !note.trim()) return;
    submit({
      type: hasChanges ? "ResourceChanged" : "DMRuling",
      gameDate: gameDate.trim(),
      region: region.trim() || undefined,
      note: note.trim(),
      payload: hasChanges
        ? { changes, obligationId: obligationId ? Number(obligationId) : undefined }
        : {},
    }).then(() => {
      setGameDate("");
      setRegion("");
      setNote("");
      setChangesText("");
      setObligationId("");
    });
  }

  return (
    <form onSubmit={submitForm} className="card" style={{ marginBottom: "1.75rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Plus" size={17} />
        </span>
        <h3>Log a new entry</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.78rem", marginTop: "-0.4rem" }}>
        With resource changes, this logs a ResourceChanged event. Without any, it logs a DMRuling
        (a note-only clarification). Other event types (construction, calendar, deities, locations)
        have their own views.
      </p>
      <div className="grid grid-2">
        <label>
          In-game date
          <input
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            placeholder="e.g. Month 4, 1227"
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Region (optional)
          <input value={region} onChange={(e) => setRegion(e.target.value)} style={{ width: "100%" }} />
        </label>
      </div>
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Resource changes
        <input
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
          placeholder="e.g. -1 Wood, +1 Wealth"
          style={{ width: "100%" }}
        />
      </label>
      {hasChanges && obligations.length > 0 && (
        <label style={{ display: "block", marginTop: "0.6rem" }}>
          Settles an obligation (optional)
          <select value={obligationId} onChange={(e) => setObligationId(e.target.value)} style={{ width: "100%" }}>
            <option value="">— none —</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.id} {o.description} ({o.amountRemaining}/{o.amountTotal} {o.repaymentResource} remaining)
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} rows={2} />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.85rem" }}>
        <button className="btn btn-primary" type="submit" disabled={!gameDate.trim() || !note.trim()}>
          <Icon name="Scroll" size={14} />
          Add entry
        </button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </form>
  );
}

function ObligationsPanel({ obligations }) {
  if (!obligations.length) return null;
  return (
    <div className="grid grid-2" style={{ marginBottom: "1.75rem" }}>
      {obligations.map((o) => {
        const pct = o.amountTotal > 0 ? Math.min(100, ((o.amountTotal - o.amountRemaining) / o.amountTotal) * 100) : 0;
        return (
          <div className="card" key={o.id}>
            <div className="stat-group-head">
              <span className={`icon-badge sm ${o.satisfied ? "good" : ""}`}>
                <Icon name={o.repaymentResource} size={16} />
              </span>
              <h3 style={{ fontSize: "0.95rem" }}>{o.description}</h3>
            </div>
            <div className="meter good" style={{ marginTop: "0.4rem" }}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="text-faint" style={{ fontSize: "0.78rem", marginTop: "0.35rem" }}>
              {o.amountTotal - o.amountRemaining} / {o.amountTotal} {o.repaymentResource} repaid
              {o.dueGameDate && ` · due ${o.dueGameDate}`}
              {o.satisfied && " · settled"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([
      getEvents({ type: typeFilter || undefined, region: regionFilter || undefined, limit: 500 }),
      getObligations(),
    ]).then(([e, o]) => {
      setEvents(e);
      setObligations(o);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, regionFilter]);

  if (error) return <div className="error-box">Failed to load the timeline: {error}</div>;
  if (!events) return <div className="loading">Loading the timeline…</div>;

  const newestFirst = [...events].reverse();

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Chronicle</span>
          <h2>Campaign Timeline</h2>
        </div>
        <span className="pill accent">
          <Icon name="Scroll" size={13} />
          {events.length} events
        </span>
      </div>

      <ObligationsPanel obligations={obligations.filter((o) => !o.satisfied)} />

      <NewEntryForm obligations={obligations.filter((o) => !o.satisfied)} onAdd={load} />

      <div className="section-title-row">
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            placeholder="Filter by region"
            style={{ width: "12rem" }}
          />
        </div>
      </div>

      {newestFirst.length === 0 ? (
        <div className="empty-state">No entries logged yet.</div>
      ) : (
        <div className="timeline">
          {newestFirst.map((entry) => (
            <div className="timeline-entry" key={entry.id}>
              <div className="timeline-marker" />
              <div className="card timeline-card">
                <div className="section-title-row">
                  <div>
                    <span className="icon-badge sm" style={{ marginRight: "0.4rem" }}>
                      <Icon name={TYPE_ICON[entry.type] || "Scroll"} size={13} />
                    </span>
                    <span className="pill accent">{entry.gameDate}</span>{" "}
                    <span className="pill">{entry.type}</span>{" "}
                    {entry.region && <span className="pill">{entry.region}</span>}
                    {entry.actor && <span className="pill">{entry.actor}</span>}
                  </div>
                  <span className="text-faint" style={{ fontSize: "0.78rem" }}>
                    posted {entry.postedAt}
                  </span>
                </div>
                {Object.keys(entry.payload?.changes || {}).length > 0 && (
                  <div className="tag-row">
                    {Object.entries(entry.payload.changes).map(([res, val]) => (
                      <span key={res} className={`pill ${val >= 0 ? "good" : "bad"}`}>
                        <Icon name={res} size={12} />
                        {val >= 0 ? "+" : ""}
                        {val} {res}
                      </span>
                    ))}
                  </div>
                )}
                {entry.note && <p className="text-dim" style={{ marginTop: "0.6rem", fontSize: "0.88rem" }}>{entry.note}</p>}
                <WarningsList warnings={entry.warnings} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
