import { useEffect, useState } from "react";
import { getProjection } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";

function StatGroup({ title, icon, values, descriptions, onChange, gauge }) {
  return (
    <div className="card stat-group">
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name={icon} size={18} />
        </span>
        <h3>{title}</h3>
      </div>
      {Object.entries(values).map(([key, value]) => {
        const cap = gauge?.(key, value);
        return (
          <div className="stat-row" key={key}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="stat-label" title={descriptions?.[key] || ""}>
                <Icon name={key} size={15} />
                <span className="name">{key}</span>
              </span>
              {cap && (
                <div className={`meter ${cap.tone}`} style={{ marginTop: "0.35rem" }}>
                  <span style={{ width: `${cap.pct}%` }} />
                </div>
              )}
            </div>
            <span className="stat-value">
              <button
                className="btn stepper"
                onClick={() => onChange(key, value - 1)}
                aria-label={`Decrease ${key}`}
              >
                −
              </button>
              <input
                type="number"
                value={value}
                onChange={(e) => onChange(key, Number(e.target.value))}
              />
              <button
                className="btn stepper"
                onClick={() => onChange(key, value + 1)}
                aria-label={`Increase ${key}`}
              >
                +
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function diffChanges(loaded, draft) {
  const changes = {};
  for (const group of ["resources", "assets", "society"]) {
    for (const key of Object.keys(draft[group] || {})) {
      const delta = draft[group][key] - loaded[group][key];
      if (delta !== 0) changes[key] = delta;
    }
  }
  return changes;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [draft, setDraft] = useState(null);
  const [gameDate, setGameDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);

  function load() {
    return getProjection("stats").then((s) => {
      setStats(s);
      setDraft(s);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings } = useEventSubmit(() => {
    load();
    setNote("");
  });

  function updateGroup(group, key, value) {
    if (Number.isNaN(value)) return;
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  }

  const dirty = stats && draft && JSON.stringify(diffChanges(stats, draft)) !== "{}";

  async function save() {
    const changes = diffChanges(stats, draft);
    await submit({
      type: "ResourceChanged",
      gameDate: gameDate.trim() || stats.asOf,
      note: note.trim() || undefined,
      payload: { changes },
    });
  }

  if (error) return <div className="error-box">Failed to load stats: {error}</div>;
  if (!stats || !draft) return <div className="loading">Loading kingdom stats…</div>;

  const population = draft.assets?.Population ?? 0;

  function societyGauge(key, value) {
    if (key === "Unrest" || key === "Loyalty") {
      const max = Math.max(population, value, 1);
      const pct = Math.min(100, (value / max) * 100);
      const tone = key === "Unrest" ? (value >= population && value > 0 ? "bad" : "") : value >= population ? "good" : "bad";
      return { pct, tone };
    }
    return null;
  }

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">Kingdom Dashboard</span>
          <h2>{stats.settlement}</h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">
            <Icon name="Calendar" size={13} />
            As of {stats.asOf}
          </span>
        </div>
      </div>
      {stats.asOfNote && <p className="text-dim hero-note">{stats.asOfNote}</p>}

      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          Adjust values below, then commit them to the record as a resource change.
        </span>
      </div>

      <div className="grid grid-3">
        <StatGroup
          title="Resources"
          icon="Resources"
          values={draft.resources}
          descriptions={stats.resourceDescriptions}
          onChange={(k, v) => updateGroup("resources", k, v)}
        />
        <StatGroup
          title="Assets"
          icon="Main Settlement"
          values={draft.assets}
          descriptions={stats.assetDescriptions}
          onChange={(k, v) => updateGroup("assets", k, v)}
        />
        <StatGroup
          title="Society"
          icon="Loyalty"
          values={draft.society}
          descriptions={stats.societyDescriptions}
          onChange={(k, v) => updateGroup("society", k, v)}
          gauge={societyGauge}
        />
      </div>

      {dirty && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <div className="stat-group-head">
            <span className="icon-badge">
              <Icon name="Scroll" size={17} />
            </span>
            <h3>Record this change</h3>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 12rem" }}>
              Game date
              <br />
              <input
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                placeholder="e.g. Month 4, 1227"
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ flex: "2 1 16rem" }}>
              Note
              <br />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened"
                style={{ width: "100%" }}
              />
            </label>
            <button className="btn btn-primary" onClick={save}>
              <Icon name="Scroll" size={14} />
              Save changes
            </button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </div>
          <WarningsList warnings={warnings} />
        </div>
      )}

      {stats.annualIncomeUpkeep && (
        <>
          <div className="section-header">
            <h3>Annual Income &amp; Upkeep</h3>
            <div className="rule" />
            <span className="pill">as of {stats.annualIncomeUpkeep.asOf}</span>
          </div>
          {stats.annualIncomeUpkeep.note && <p className="text-dim">{stats.annualIncomeUpkeep.note}</p>}
          <div className="grid grid-2 ledger-grid">
            {stats.annualIncomeUpkeep.lines.map((line) => (
              <div key={line.resource} className="card ledger-line">
                <span className={`icon-badge sm ${line.net >= 0 ? "good" : "bad"}`}>
                  <Icon name={line.resource} size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stat-label">
                    <span className="name">{line.resource}</span>
                  </div>
                  {line.breakdown.map((b, i) => (
                    <div key={i} className="text-faint" style={{ fontSize: "0.78rem" }}>
                      {b}
                    </div>
                  ))}
                </div>
                <div className={line.net >= 0 ? "stat-delta-pos" : "stat-delta-neg"}>
                  <Icon name={line.net >= 0 ? "ArrowUp" : "ArrowDown"} size={14} />
                  {line.net >= 0 ? "+" : ""}
                  {line.net}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
