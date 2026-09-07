import { useEffect, useState } from "react";
import { getProjection, getReference, getObligations } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";

const RESOURCE_GROUPS = ["resources", "assets", "society"];

// Reference data (CONTEXT.md): edited directly, no event history. Adding an entry here
// seeds a zero-value resource_totals row (server/db/reference.js); removing one is
// refused server-side while its current value is nonzero.
function ResourceDefinitionsEditor({ definitions, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(definitions);
  const { save, status } = useReferenceSave("resourceDefinitions", onSaved);

  function field(i, key, value) {
    set([i], { ...draft[i], [key]: value });
  }

  function addRow() {
    addItem([], () => ({ grp: "resources", name: "", description: "" }));
  }

  function removeRow(i) {
    removeItem([], i);
  }

  function saveDefinitions() {
    save(
      draft
        .filter((r) => r.name.trim())
        .map((r) => ({ grp: r.grp, name: r.name.trim(), description: r.description?.trim() || null })),
    );
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Codex" size={17} />
        </span>
        <h3>Manage resources</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Adding a resource starts it at 0; removing one is refused while its current value
        isn't 0 -- zero it out with a resource change first.
      </p>
      {draft.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "0 0 8rem" }}>
            Group
            <br />
            <select value={r.grp} onChange={(e) => field(i, "grp", e.target.value)} style={{ width: "100%" }}>
              {RESOURCE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label style={{ flex: "1 1 8rem" }}>
            Name
            <br />
            <input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ flex: "2 1 14rem" }}>
            Description
            <br />
            <input value={r.description || ""} onChange={(e) => field(i, "description", e.target.value)} style={{ width: "100%" }} />
          </label>
          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addRow}>
          <Icon name="Plus" size={14} />
          Add resource
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveDefinitions}>Save resources</button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function StatGroup({ title, icon, values, descriptions, onChange }) {
  return (
    <div className="card stat-group">
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name={icon} size={18} />
        </span>
        <h3>{title}</h3>
      </div>
      {Object.entries(values).map(([key, value]) => {
        return (
          <div className="stat-row" key={key}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="stat-label" title={descriptions?.[key] || ""}>
                <Icon name={key} size={15} />
                <span className="name">{key}</span>
              </span>
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

// What's owed, what's been paid, and the repayment resource all stay strictly governed by
// the ResourceChanged events that created and are settling this obligation (CONTEXT.md) --
// only description and due date are correctable here, as their own ObligationAmended event
// (ADR-0013), same "amend a first-class thing after the fact" shape as DeityCard/KingdomCard.
function ObligationCard({ obligation, onSaved }) {
  const [draft, setDraft] = useState({ description: obligation.description });
  // Compared against instead of `obligation` directly so dirty state clears the instant this
  // card's own save resolves, not the page-level refetch's round trip (same fix as
  // KingdomCard/DeityCard -- see docs/adr/0011).
  const [baseline, setBaseline] = useState(draft);
  const [newDueDate, setNewDueDate] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(onSaved);

  const dirty = draft.description !== baseline.description || newDueDate !== null;

  function save() {
    if (!isCompleteGameDate(gameDate)) return;
    const changes = {};
    if (draft.description !== baseline.description) changes.description = draft.description.trim();
    if (isCompleteGameDate(newDueDate)) changes.dueGameDate = formatGameDate(newDueDate);
    if (Object.keys(changes).length === 0) return;
    // No Discord option: a correction, not campaign news, matching DeityAmended/LocationAmended.
    submit({
      type: "ObligationAmended",
      gameDate: formatGameDate(gameDate),
      note: "Amended via the Dashboard",
      payload: { obligationId: obligation.id, changes },
      postToDiscord: false,
    }).then(() => {
      setBaseline(draft);
      setNewDueDate(null);
      setGameDate(null);
    });
  }

  const pct = obligation.amountTotal > 0
    ? Math.min(100, ((obligation.amountTotal - obligation.amountRemaining) / obligation.amountTotal) * 100)
    : 0;

  return (
    <div className="card" key={obligation.id}>
      <div className="stat-group-head">
        <span className={`icon-badge sm ${obligation.satisfied ? "good" : ""}`}>
          <Icon name={obligation.repaymentResource} size={16} />
        </span>
        <input
          value={draft.description}
          onChange={(e) => setDraft({ description: e.target.value })}
          style={{
            flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "0.1rem 0",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.95rem", color: "var(--parchment)",
          }}
        />
      </div>
      <div className="meter good" style={{ marginTop: "0.4rem" }}>
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className="text-faint" style={{ fontSize: "0.78rem", marginTop: "0.35rem" }}>
        {obligation.amountTotal - obligation.amountRemaining} / {obligation.amountTotal} {obligation.repaymentResource} repaid
        {obligation.dueGameDate && ` · due ${obligation.dueGameDate}`}
        {obligation.satisfied && " · settled"}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <span className="text-faint" style={{ fontSize: "0.76rem" }}>Change due date:</span>
        <GameDatePicker value={newDueDate} onChange={setNewDueDate} autoDefault={false} allowClear />
      </div>
      {dirty && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <GameDatePicker value={gameDate} onChange={setGameDate} />
          <button className="btn btn-sm btn-primary" onClick={save} disabled={!isCompleteGameDate(gameDate)}>
            Save
          </button>
          {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
        </div>
      )}
      <WarningsList warnings={warnings} />
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
  const [gameDate, setGameDate] = useState(null);
  const [note, setNote] = useState("");
  const [definitions, setDefinitions] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [showResourceEditor, setShowResourceEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return getProjection("stats").then((s) => {
      setStats(s);
      setDraft(s);
    });
  }

  function loadDefinitions() {
    return getReference("resourceDefinitions").then(setDefinitions);
  }

  function loadObligations() {
    return getObligations({ satisfied: false }).then(setObligations);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadDefinitions().catch((e) => setError(e.message));
    loadObligations().catch((e) => setError(e.message));
  }, []);

  function onDefinitionsSaved() {
    loadDefinitions();
    load();
  }

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
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
      gameDate: isCompleteGameDate(gameDate) ? formatGameDate(gameDate) : stats.asOf,
      note: note.trim() || undefined,
      payload: { changes },
    });
  }

  if (error) return <div className="error-box">Failed to load stats: {error}</div>;
  if (!stats || !draft) return <div className="loading">Loading kingdom stats…</div>;

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
          <button className="btn btn-sm" onClick={() => setShowResourceEditor(!showResourceEditor)}>
            {showResourceEditor ? "Hide" : "Manage"} resources
          </button>
        </div>
      </div>
      {stats.asOfNote && <p className="text-dim hero-note">{stats.asOfNote}</p>}

      {showResourceEditor && definitions && (
        <ResourceDefinitionsEditor definitions={definitions} onSaved={onDefinitionsSaved} />
      )}

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
            <label style={{ flex: "0 0 auto" }}>
              Game date
              <br />
              <GameDatePicker value={gameDate} onChange={setGameDate} />
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
            <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </div>
          <WarningsList warnings={warnings} />
        </div>
      )}

      {obligations.length > 0 && (
        <>
          <div className="section-header">
            <h3>Loan Repayment</h3>
            <div className="rule" />
          </div>
          <div className="grid grid-2 ledger-grid">
            {obligations.map((o) => (
              <ObligationCard key={o.id} obligation={o} onSaved={loadObligations} />
            ))}
          </div>
        </>
      )}

      {stats.annualIncomeUpkeep && (
        <>
          <div className="section-header">
            <h3>Annual Income &amp; Upkeep</h3>
            <div className="rule" />
          </div>
          <p className="text-dim" style={{ fontSize: "0.82rem" }}>
            Computed from currently-built buildings' known annual effects. Excludes anything
            dice-based, player-invoked, or population-scaled (e.g. a Mill's farm bonus, or
            Population/Guard food consumption). Edit a building's annual effect in the
            catalog to include more.
          </p>
          {stats.annualIncomeUpkeep.lines.length === 0 ? (
            <div className="empty-state">No buildings with a known annual effect yet.</div>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}
