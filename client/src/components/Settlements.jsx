import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";

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
    annualEffectText: costToText(b.annualEffect),
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
    annualEffect: parseCostText(r.annualEffectText),
  };
}

// Reference data (CONTEXT.md): edited directly, no event history.
function BuildingCatalogEditor({ catalog, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(catalog.map(toRow));
  const { save, status } = useReferenceSave("buildings", onSaved);

  function field(i, key, value) {
    set([i], { ...draft[i], [key]: value });
  }

  function addRow() {
    addItem([], () => toRow({}));
  }

  function removeRow(i) {
    removeItem([], i);
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
        list of prerequisite building names. Annual effect is the same format (negative values
        for upkeep, e.g. "Wealth: 1, Food: -1") -- only set it for a flat, guaranteed,
        per-building yearly effect; leave it blank for anything dice-based, population-scaled,
        or player-invoked. It feeds the Dashboard's Annual Income &amp; Upkeep total (ADR-0009).
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
          <label style={{ flex: "1 1 10rem" }}>Annual effect<br /><input value={r.annualEffectText} onChange={(e) => field(i, "annualEffectText", e.target.value)} style={{ width: "100%" }} /></label>
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

function AddBuildingForm({ buildingCatalog, onAdd, postToDiscord, setPostToDiscord }) {
  // Defaults to picking from the catalog (a real <select>, not a datalist -- datalist
  // suggestions are never enforced, so a typo used to slip through as a brand-new,
  // uncatalogued building with no warning until after the save). A building not yet in the
  // catalog is still possible -- the DM can record it as a deliberate exception (ADR-0005) --
  // but it's now an explicit toggle rather than whatever a stray keystroke happens to produce.
  const [customName, setCustomName] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [detail, setDetail] = useState("");
  const [gameDate, setGameDate] = useState("");

  // Gates the Discord toggle so it isn't permanently visible on an untouched form.
  const dirty = Boolean(name.trim() || displayName.trim() || detail.trim() || gameDate.trim());

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

  function toggleCustomName() {
    setCustomName(!customName);
    setName("");
  }

  return (
    <form onSubmit={submit} className="add-building-form">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "1 1 auto" }}>
        {customName ? (
          <input
            placeholder="Building name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <select value={name} onChange={(e) => setName(e.target.value)}>
            <option value="" disabled>Building name…</option>
            {buildingCatalog.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-sm" onClick={toggleCustomName} style={{ alignSelf: "flex-start" }}>
          {customName ? "Use the building catalog instead" : "+ Not in the catalog"}
        </button>
      </div>
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
      {dirty && <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />}
      <button className="btn" type="submit">
        <Icon name="Plus" size={14} />
        Add
      </button>
    </form>
  );
}

// Its own useEventSubmit (and so its own postToDiscord decision) rather than sharing the
// page-level one used for adding buildings -- removal is a separate save action and the DM
// should be able to decide on it independently.
function RemoveBuildingControl({ regionName, building, label, onRemoved }) {
  const [confirming, setConfirming] = useState(false);
  const [gameDate, setGameDate] = useState("");
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    setConfirming(false);
    setGameDate("");
    onRemoved();
  });

  function confirmRemoval() {
    if (!gameDate.trim()) return;
    submit({
      type: "BuildingRemoved",
      gameDate: gameDate.trim(),
      region: regionName,
      note: "Removed via the Settlements view",
      payload: { building, count: 1 },
    });
  }

  if (!confirming) {
    return (
      <button className="btn btn-icon btn-danger" onClick={() => setConfirming(true)} aria-label={`Remove ${label}`}>
        <Icon name="Trash" size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", width: "100%", marginTop: "0.4rem" }}>
      <input
        value={gameDate}
        onChange={(e) => setGameDate(e.target.value)}
        placeholder="Game date this was removed/lost"
        style={{ flex: "1 1 10rem", fontSize: "0.8rem" }}
        autoFocus
      />
      <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
      <button className="btn btn-sm btn-danger" onClick={confirmRemoval} disabled={!gameDate.trim()}>
        Confirm
      </button>
      <button className="btn btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />
    </div>
  );
}

function toRegionRow(r) {
  return { id: r.id, name: r.name || "", description: r.description || "", kingdom: r.kingdom || "" };
}
function fromRegionRow(r) {
  return { id: r.id, name: r.name.trim(), description: r.description.trim() || null, kingdom: r.kingdom || null };
}

// Reference data (CONTEXT.md, ADR-0008): edited directly, no event history. Renaming
// cascades server-side to every building currently in that region; removing one is refused
// while it still has buildings. `kingdom` (ADR-0010) is an optional link to a Codex Locations
// kingdom by name -- unclaimed frontier stays unassigned.
function RegionsEditor({ regions, kingdomNames, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(regions.map(toRegionRow));
  const { save, status } = useReferenceSave("regions", onSaved);

  function field(i, key, value) {
    set([i], { ...draft[i], [key]: value });
  }

  function addRow() {
    addItem([], () => ({ id: null, name: "", description: "", kingdom: "" }));
  }

  function removeRow(i) {
    removeItem([], i);
  }

  function saveRegions() {
    save(draft.filter((r) => r.name.trim()).map(fromRegionRow));
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="MapPin" size={17} />
        </span>
        <h3>Manage regions</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Renaming a region updates every building currently built there. Removing one is
        refused while it still has buildings -- move or remove them first.
      </p>
      {draft.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 10rem" }}>Name<br /><input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "2 1 14rem" }}>Description<br /><input value={r.description} onChange={(e) => field(i, "description", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>
            Kingdom<br />
            <select value={r.kingdom} onChange={(e) => field(i, "kingdom", e.target.value)} style={{ width: "100%" }}>
              <option value="">— unclaimed —</option>
              {kingdomNames.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addRow}>
          <Icon name="Plus" size={14} />
          Add region
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveRegions}>Save regions</button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Edit an already-built building's display name/detail, or move it to another region.
// Its own useEventSubmit, same as RemoveBuildingControl -- kept as a separate control since
// editing/moving is non-destructive and Remove is deliberately kept distinct. No Discord
// option here (unlike most save actions): renaming/moving a building is correcting or
// tidying existing data, not something new happening in the campaign, so postToDiscord is
// forced off rather than left to the DM's per-save choice.
function EditBuildingControl({ regionName, building, label, regions, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState(building.displayName || "");
  const [detail, setDetail] = useState(building.detail || "");
  const [targetRegion, setTargetRegion] = useState(regionName);
  const [gameDate, setGameDate] = useState("");
  const { submit, status, warnings } = useEventSubmit(() => {
    setExpanded(false);
    setGameDate("");
    onChanged();
  });

  const moving = targetRegion !== regionName;
  const nameChanged = displayName.trim() !== (building.displayName || "");
  const detailChanged = detail.trim() !== (building.detail || "");
  const dirty = moving || nameChanged || detailChanged;

  async function save() {
    if (!gameDate.trim()) return;
    if (moving) {
      // A move is a BuildingRemoved from the old region immediately followed by a
      // BuildingConstructed in the new one, carrying displayName/detail across -- preserves
      // full history with the existing event types rather than a third "moved" type
      // (CONTEXT.md's BuildingAmended entry / ADR-0004's precedent).
      await submit({
        type: "BuildingRemoved",
        gameDate: gameDate.trim(),
        region: regionName,
        note: `Moved to ${targetRegion}`,
        payload: { building: building.name, count: building.count },
        postToDiscord: false,
      });
      await submit({
        type: "BuildingConstructed",
        gameDate: gameDate.trim(),
        region: targetRegion,
        note: `Moved from ${regionName}`,
        payload: {
          building: building.name,
          displayName: displayName.trim() || undefined,
          detail: detail.trim() || undefined,
          count: building.count,
        },
        postToDiscord: false,
      });
    } else {
      const changes = {};
      if (nameChanged) changes.displayName = displayName.trim() || null;
      if (detailChanged) changes.detail = detail.trim() || null;
      await submit({
        type: "BuildingAmended",
        gameDate: gameDate.trim(),
        region: regionName,
        note: "Edited via the Settlements view",
        payload: { building: building.name, changes },
        postToDiscord: false,
      });
    }
  }

  if (!expanded) {
    return (
      <button className="btn btn-icon" onClick={() => setExpanded(true)} aria-label={`Edit ${label}`}>
        <Icon name="Codex" size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", width: "100%", marginTop: "0.4rem" }}>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="In-fiction name"
        style={{ flex: "1 1 8rem", fontSize: "0.8rem" }}
      />
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Detail"
        style={{ flex: "1 1 8rem", fontSize: "0.8rem" }}
      />
      <select value={targetRegion} onChange={(e) => setTargetRegion(e.target.value)} style={{ fontSize: "0.8rem" }}>
        {regions.map((r) => (
          <option key={r.name} value={r.name}>{r.name}</option>
        ))}
      </select>
      {dirty && (
        <input
          value={gameDate}
          onChange={(e) => setGameDate(e.target.value)}
          placeholder="Game date"
          style={{ flex: "0 0 7rem", fontSize: "0.8rem" }}
        />
      )}
      {dirty && (
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!gameDate.trim()}>
          Save
        </button>
      )}
      <button className="btn btn-sm" onClick={() => setExpanded(false)}>Cancel</button>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />
    </div>
  );
}

export default function Settlements() {
  const [settlements, setSettlements] = useState(null);
  const [buildingCatalog, setBuildingCatalog] = useState([]);
  const [regions, setRegions] = useState([]);
  const [kingdomNames, setKingdomNames] = useState([]);
  const [showCatalogEditor, setShowCatalogEditor] = useState(false);
  const [showRegionsEditor, setShowRegionsEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([
      getProjection("settlements"),
      getReference("buildings"),
      getReference("regions"),
      getProjection("locations"),
    ]).then(([s, b, r, locations]) => {
      setSettlements(s);
      setBuildingCatalog(b);
      setRegions(r);
      setKingdomNames(locations.kingdoms.map((k) => k.name));
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(load);

  function addBuilding(regionName, { building, displayName, detail, gameDate }) {
    submit({
      type: "BuildingConstructed",
      gameDate,
      region: regionName,
      note: `Constructed via the Settlements view`,
      payload: { building, displayName, detail, count: 1 },
    });
  }

  function catalogEntry(name) {
    return buildingCatalog.find((b) => b.name.toLowerCase() === name.toLowerCase());
  }

  if (error) return <div className="error-box">Failed to load settlements: {error}</div>;
  if (!settlements) return <div className="loading">Loading settlements…</div>;

  // One card per known region (ADR-0008), not just regions that already have a building --
  // that's what makes adding a brand-new, currently-empty settlement possible at all.
  const settlementsByRegion = new Map(settlements.map((s) => [s.region, s.buildings]));
  const mergedRegions = regions.map((r) => ({
    region: r.name,
    kingdom: r.kingdom,
    buildings: settlementsByRegion.get(r.name) ?? [],
  }));
  const totalBuildings = mergedRegions.reduce((sum, r) => sum + r.buildings.length, 0);

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
            {mergedRegions.length} regions
          </span>
          <span className="pill">{totalBuildings} buildings</span>
          <button className="btn btn-sm" onClick={() => setShowRegionsEditor(!showRegionsEditor)}>
            {showRegionsEditor ? "Hide" : "Manage"} regions
          </button>
          <button className="btn btn-sm" onClick={() => setShowCatalogEditor(!showCatalogEditor)}>
            {showCatalogEditor ? "Hide" : "Manage"} building catalog
          </button>
        </div>
      </div>
      {showRegionsEditor && <RegionsEditor regions={regions} kingdomNames={kingdomNames} onSaved={load} />}
      {showCatalogEditor && <BuildingCatalogEditor catalog={buildingCatalog} onSaved={load} />}

      <p className="text-dim hero-note">
        Adding or removing a building here logs it as a BuildingConstructed / BuildingRemoved event
        on the Timeline.
      </p>
      {status && (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>
        </div>
      )}
      <WarningsList warnings={warnings} />

      <div className="grid grid-2" style={{ marginTop: "1.25rem" }}>
        {mergedRegions.map((region) => (
          <div className="card region-card" key={region.region}>
            <div className="region-card-head">
              <span className="icon-badge">
                <Icon name="MapPin" size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{region.region}</h3>
                <span className="text-faint" style={{ fontSize: "0.76rem" }}>
                  {region.kingdom || "Unclaimed"}
                </span>
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
                  <div className="building-row" key={building.name} title={catalog ? catalog.effect : undefined} style={{ flexWrap: "wrap" }}>
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
                    <EditBuildingControl
                      regionName={region.region}
                      building={building}
                      label={label}
                      regions={regions}
                      onChanged={load}
                    />
                    <RemoveBuildingControl
                      regionName={region.region}
                      building={building.name}
                      label={label}
                      onRemoved={load}
                    />
                  </div>
                );
              })}
            </div>
            <AddBuildingForm
              buildingCatalog={buildingCatalog}
              onAdd={(b) => addBuilding(region.region, b)}
              postToDiscord={postToDiscord}
              setPostToDiscord={setPostToDiscord}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
