import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";

function parseCostText(text) {
  const cost = {};
  text.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const [name, amount] = part.split(":").map((s) => s.trim());
    if (name && amount !== undefined && !Number.isNaN(Number(amount))) cost[name] = Number(amount);
  });
  return cost;
}
function costToText(cost) {
  return Object.entries(cost || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
}
function parseListText(text) {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

function toRow(b) {
  return {
    name: b.name || "",
    category: b.category || "",
    effect: b.effect || "",
    costText: costToText(b.cost),
    costNote: b.costNote || "",
    upkeep: b.upkeep || "",
    buildTime: b.buildTime || "",
    requiresText: (b.requires || []).join(", "),
  };
}
function fromRow(r) {
  return {
    name: r.name.trim(),
    category: r.category.trim() || null,
    effect: r.effect.trim() || null,
    cost: parseCostText(r.costText),
    costNote: r.costNote.trim() || null,
    upkeep: r.upkeep.trim() || null,
    buildTime: r.buildTime.trim() || null,
    requires: parseListText(r.requiresText),
  };
}

// Reference data (CONTEXT.md): edited directly, no event history.
function BuildingCatalogEditor({ catalog, onSaved }) {
  const [draft, setDraft] = useState(catalog.map(toRow));
  const { save, status } = useReferenceSave("buildings", onSaved);

  const dirty = JSON.stringify(draft) !== JSON.stringify(catalog.map(toRow));

  function field(i, key, value) {
    setDraft(draft.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function addRow() {
    setDraft([...draft, toRow({})]);
  }

  function removeRow(i) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }

  function saveCatalog() {
    save(draft.filter((r) => r.name.trim()).map(fromRow));
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Codex" size={17} />
        </span>
        <h3>Manage building catalog</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Cost is a comma-separated list like "Wood: 10, Stone: 5". Requires is a comma-separated
        list of prerequisite building names.
      </p>
      {draft.map((r, i) => (
        <div key={i} className="card" style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 10rem" }}>Name<br /><input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 8rem" }}>Category<br /><input value={r.category} onChange={(e) => field(i, "category", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "2 1 14rem" }}>Effect<br /><input value={r.effect} onChange={(e) => field(i, "effect", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>Cost<br /><input value={r.costText} onChange={(e) => field(i, "costText", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 8rem" }}>Cost note<br /><input value={r.costNote} onChange={(e) => field(i, "costNote", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 6rem" }}>Upkeep<br /><input value={r.upkeep} onChange={(e) => field(i, "upkeep", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 6rem" }}>Build time<br /><input value={r.buildTime} onChange={(e) => field(i, "buildTime", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>Requires<br /><input value={r.requiresText} onChange={(e) => field(i, "requiresText", e.target.value)} style={{ width: "100%" }} /></label>
          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addRow}>
          <Icon name="Plus" size={14} />
          Add building
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveCatalog}>Save catalog</button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function AddBuildingForm({ buildingCatalog, onAdd }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [detail, setDetail] = useState("");
  const [gameDate, setGameDate] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !gameDate.trim()) return;
    onAdd({
      building: name.trim(),
      displayName: displayName.trim() || undefined,
      detail: detail.trim() || undefined,
      gameDate: gameDate.trim(),
    });
    setName("");
    setDisplayName("");
    setDetail("");
  }

  return (
    <form onSubmit={submit} className="add-building-form">
      <input
        list="building-catalog"
        placeholder="Building name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: "1 1 auto" }}
      />
      <datalist id="building-catalog">
        {buildingCatalog.map((b) => (
          <option key={b.name} value={b.name} />
        ))}
      </datalist>
      <input
        placeholder="In-fiction name (optional)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        style={{ flex: "1 1 auto" }}
      />
      <input
        placeholder="Detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        style={{ flex: "1 1 auto" }}
      />
      <input
        placeholder="Game date"
        value={gameDate}
        onChange={(e) => setGameDate(e.target.value)}
        style={{ flex: "1 1 8rem" }}
      />
      <button className="btn" type="submit">
        <Icon name="Plus" size={14} />
        Add
      </button>
    </form>
  );
}

export default function Settlements() {
  const [settlements, setSettlements] = useState(null);
  const [buildingCatalog, setBuildingCatalog] = useState([]);
  const [showCatalogEditor, setShowCatalogEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([getProjection("settlements"), getReference("buildings")]).then(([s, b]) => {
      setSettlements(s);
      setBuildingCatalog(b);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings } = useEventSubmit(load);

  function addBuilding(regionName, { building, displayName, detail, gameDate }) {
    submit({
      type: "BuildingConstructed",
      gameDate,
      region: regionName,
      note: `Constructed via the Settlements view`,
      payload: { building, displayName, detail, count: 1 },
    });
  }

  function removeBuilding(regionName, building) {
    const gameDate = window.prompt(`Game date this was removed/lost?`, "");
    if (!gameDate) return;
    submit({
      type: "BuildingRemoved",
      gameDate,
      region: regionName,
      note: `Removed via the Settlements view`,
      payload: { building, count: 1 },
    });
  }

  function catalogEntry(name) {
    return buildingCatalog.find((b) => b.name.toLowerCase() === name.toLowerCase());
  }

  if (error) return <div className="error-box">Failed to load settlements: {error}</div>;
  if (!settlements) return <div className="loading">Loading settlements…</div>;

  const totalBuildings = settlements.reduce((sum, r) => sum + r.buildings.length, 0);

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Wilderlands</span>
          <h2>Settlements &amp; Regions</h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">
            <Icon name="Settlements" size={13} />
            {settlements.length} regions
          </span>
          <span className="pill">{totalBuildings} buildings</span>
          <button className="btn btn-sm" onClick={() => setShowCatalogEditor(!showCatalogEditor)}>
            {showCatalogEditor ? "Hide" : "Manage"} building catalog
          </button>
        </div>
      </div>
      <p className="text-dim hero-note">
        Adding or removing a building here logs it as a BuildingConstructed / BuildingRemoved event
        on the Timeline.
      </p>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />

      {showCatalogEditor && <BuildingCatalogEditor catalog={buildingCatalog} onSaved={load} />}

      <div className="grid grid-2" style={{ marginTop: "1.25rem" }}>
        {settlements.map((region) => (
          <div className="card region-card" key={region.region}>
            <div className="region-card-head">
              <span className="icon-badge">
                <Icon name="MapPin" size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{region.region}</h3>
              </div>
              <span className="pill">{region.buildings.length} buildings</span>
            </div>

            {region.buildings.length === 0 && (
              <div className="empty-state" style={{ padding: "1.25rem" }}>
                No buildings recorded yet.
              </div>
            )}

            <div className="building-list">
              {region.buildings.map((building) => {
                const catalog = catalogEntry(building.name);
                const category = catalog?.category || "Main Settlement";
                const label = building.displayName || building.name;
                return (
                  <div className="building-row" key={building.name} title={catalog ? catalog.effect : undefined}>
                    <span className={`icon-badge sm building-cat-${category.replace(/\s+/g, "-")}`}>
                      <Icon name={category} size={14} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="building-name">
                        {label}
                        {building.displayName && <span className="text-faint"> ({building.name})</span>}
                        {building.count > 1 ? ` ×${building.count}` : ""}
                      </div>
                      {building.detail && <div className="text-faint building-detail">{building.detail}</div>}
                    </div>
                    <button
                      className="btn btn-icon btn-danger"
                      onClick={() => removeBuilding(region.region, building.name)}
                      aria-label={`Remove ${label}`}
                    >
                      <Icon name="Trash" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <AddBuildingForm
              buildingCatalog={buildingCatalog}
              onAdd={(b) => addBuilding(region.region, b)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
