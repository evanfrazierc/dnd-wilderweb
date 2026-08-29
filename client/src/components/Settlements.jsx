import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";

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
        </div>
      </div>
      <p className="text-dim hero-note">
        Adding or removing a building here logs it as a BuildingConstructed / BuildingRemoved event
        on the Timeline.
      </p>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />

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
