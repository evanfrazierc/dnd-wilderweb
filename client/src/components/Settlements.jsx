import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";

function AddBuildingForm({ buildingCatalog, onAdd }) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), detail: detail.trim() });
    setName("");
    setDetail("");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
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
        placeholder="Detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        style={{ flex: "1 1 auto" }}
      />
      <button className="btn" type="submit">
        Add
      </button>
    </form>
  );
}

export default function Settlements() {
  const [settlements, setSettlements] = useState(null);
  const [buildingCatalog, setBuildingCatalog] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([getResource("settlements"), getResource("buildings")])
      .then(([s, b]) => {
        setSettlements(s);
        setBuildingCatalog(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function persist(next) {
    setSettlements(next);
    setStatus("Saving...");
    try {
      await putResource("settlements", next);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  function addBuilding(regionName, building) {
    const next = settlements.map((r) =>
      r.region === regionName ? { ...r, buildings: [...r.buildings, building] } : r
    );
    persist(next);
  }

  function removeBuilding(regionName, index) {
    const next = settlements.map((r) =>
      r.region === regionName
        ? { ...r, buildings: r.buildings.filter((_, i) => i !== index) }
        : r
    );
    persist(next);
  }

  function catalogEntry(name) {
    return buildingCatalog.find((b) => b.name.toLowerCase() === name.toLowerCase());
  }

  if (error) return <div className="error-box">Failed to load settlements: {error}</div>;
  if (!settlements) return <div className="loading">Loading settlements…</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Settlements &amp; Regions</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Building lists reflect the last confirmed snapshot per region. Cross-check the History
          log for construction since then.
        </p>
        {status && <span className="pill">{status}</span>}
      </div>

      <div className="grid grid-2">
        {settlements.map((region) => (
          <div className="card" key={region.region}>
            <div className="section-title-row">
              <h3 style={{ margin: 0 }}>{region.region}</h3>
              <span className="pill">as of {region.asOf}</span>
            </div>
            {region.buildings.map((building, i) => {
              const catalog = catalogEntry(building.name);
              return (
                <div
                  className="stat-row"
                  key={`${building.name}-${i}`}
                  title={catalog ? catalog.effect : undefined}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {building.name}
                      {building.count ? ` ×${building.count}` : ""}
                    </div>
                    {building.detail && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
                        {building.detail}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={() => removeBuilding(region.region, i)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
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
