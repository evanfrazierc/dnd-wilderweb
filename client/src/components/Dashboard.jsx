import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";

function StatGroup({ title, values, descriptions, onChange }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {Object.entries(values).map(([key, value]) => (
        <div className="stat-row" key={key} title={descriptions?.[key] || ""}>
          <span className="stat-label">{key}</span>
          <span className="stat-value">
            <button
              className="btn"
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
              className="btn"
              onClick={() => onChange(key, value + 1)}
              aria-label={`Increase ${key}`}
            >
              +
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    getResource("stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  function updateGroup(group, key, value) {
    setStats((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
    setDirty(true);
    setStatus("");
  }

  async function save() {
    setStatus("Saving...");
    try {
      await putResource("stats", stats);
      setDirty(false);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  if (error) return <div className="error-box">Failed to load stats: {error}</div>;
  if (!stats) return <div className="loading">Loading kingdom stats…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>{stats.settlement}</h2>
        <p className="pill">As of {stats.asOf}</p>
        {stats.asOfNote && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
            {stats.asOfNote}
          </p>
        )}
      </div>

      <div className="section-title-row">
        <span />
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {status && <span className="pill">{status}</span>}
          <button className="btn btn-primary" onClick={save} disabled={!dirty}>
            Save changes
          </button>
        </div>
      </div>

      <div className="grid grid-3">
        <StatGroup
          title="Resources"
          values={stats.resources}
          descriptions={stats.resourceDescriptions}
          onChange={(k, v) => updateGroup("resources", k, v)}
        />
        <StatGroup
          title="Assets"
          values={stats.assets}
          descriptions={stats.assetDescriptions}
          onChange={(k, v) => updateGroup("assets", k, v)}
        />
        <StatGroup
          title="Society"
          values={stats.society}
          descriptions={stats.societyDescriptions}
          onChange={(k, v) => updateGroup("society", k, v)}
        />
      </div>

      {stats.annualIncomeUpkeep && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3>Annual Income / Upkeep</h3>
          <p className="pill">As of {stats.annualIncomeUpkeep.asOf}</p>
          {stats.annualIncomeUpkeep.note && (
            <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>
              {stats.annualIncomeUpkeep.note}
            </p>
          )}
          <div className="grid grid-2" style={{ marginTop: "0.75rem" }}>
            {stats.annualIncomeUpkeep.lines.map((line) => (
              <div key={line.resource} className="stat-row">
                <span className="stat-label">{line.resource}</span>
                <div style={{ textAlign: "right" }}>
                  <div className={line.net >= 0 ? "stat-delta-pos" : "stat-delta-neg"}>
                    {line.net >= 0 ? "+" : ""}
                    {line.net}
                  </div>
                  {line.breakdown.map((b, i) => (
                    <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
