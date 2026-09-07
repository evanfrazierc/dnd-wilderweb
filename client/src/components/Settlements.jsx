import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";

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

// Collapsed to a single "+ Add building" affordance until clicked -- with up to 9
// settlements each rendering a full 5-field form, having them all permanently open meant
// a DM saw dozens of live fields at once just to add one building to one settlement
// (critique: /impeccable critique, 2026-09-07). Mirrors the collapsed-by-default
// pattern EditBuildingControl/RemoveBuildingControl already use for the same reason.
function AddBuildingForm({ buildingCatalog, onAdd, postToDiscord, setPostToDiscord }) {
  const [expanded, setExpanded] = useState(false);
  // Defaults to picking from the catalog (a real <select>, not a datalist -- datalist
  // suggestions are never enforced, so a typo used to slip through as a brand-new,
  // uncatalogued building with no warning until after the save). A building not yet in the
  // catalog is still possible -- the DM can record it as a deliberate exception (ADR-0005) --
  // but it's now an explicit toggle rather than whatever a stray keystroke happens to produce.
  const [customName, setCustomName] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [detail, setDetail] = useState("");
  const [gameDate, setGameDate] = useState(null);

  // Gates the Discord toggle so it isn't permanently visible on an untouched form.
  const dirty = Boolean(name.trim() || displayName.trim() || detail.trim());

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !isCompleteGameDate(gameDate)) return;
    onAdd({
      building: name.trim(),
      displayName: displayName.trim() || undefined,
      detail: detail.trim() || undefined,
      gameDate: formatGameDate(gameDate),
    });
    setName("");
    setDisplayName("");
    setDetail("");
    setExpanded(false);
  }

  function cancel() {
    setName("");
    setDisplayName("");
    setDetail("");
    setCustomName(false);
    setExpanded(false);
  }

  function toggleCustomName() {
    setCustomName(!customName);
    setName("");
  }

  if (!expanded) {
    return (
      <div className="add-building-form">
        <button type="button" className="btn btn-sm" onClick={() => setExpanded(true)}>
          <Icon name="Plus" size={14} />
          Add building
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="add-building-form">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "1 1 auto" }}>
        {customName ? (
          <input
            placeholder="Building name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <select value={name} onChange={(e) => setName(e.target.value)} autoFocus>
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
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      {dirty && <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />}
      <button className="btn" type="submit">
        <Icon name="Plus" size={14} />
        Add
      </button>
      <button type="button" className="btn btn-sm" onClick={cancel}>
        Cancel
      </button>
    </form>
  );
}

// Its own useEventSubmit (and so its own postToDiscord decision) rather than sharing the
// page-level one used for adding buildings -- removal is a separate save action and the DM
// should be able to decide on it independently.
function RemoveBuildingControl({ settlementName, building, label, onRemoved }) {
  const [confirming, setConfirming] = useState(false);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    setConfirming(false);
    setGameDate(null);
    onRemoved();
  });

  function confirmRemoval() {
    if (!isCompleteGameDate(gameDate)) return;
    submit({
      type: "BuildingRemoved",
      gameDate: formatGameDate(gameDate),
      settlement: settlementName,
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
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
      <button className="btn btn-sm btn-danger" onClick={confirmRemoval} disabled={!isCompleteGameDate(gameDate)}>
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

function toSettlementRow(s) {
  return { id: s.id, name: s.name || "", description: s.description || "", kingdom: s.kingdom || "" };
}
function fromSettlementRow(s) {
  return { id: s.id, name: s.name.trim(), description: s.description.trim() || null, kingdom: s.kingdom || null };
}

// Reference data (CONTEXT.md, ADR-0008): edited directly, no event history. Renaming
// cascades server-side to every building currently in that settlement; removing one is
// refused while it still has buildings. `kingdom` (ADR-0010) is an optional link to a Codex
// Locations kingdom by name -- unclaimed frontier stays unassigned.
function SettlementCatalogEditor({ settlementCatalog, kingdomNames, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(settlementCatalog.map(toSettlementRow));
  const { save, status } = useReferenceSave("settlements", onSaved);

  function field(i, key, value) {
    set([i], { ...draft[i], [key]: value });
  }

  function addRow() {
    addItem([], () => ({ id: null, name: "", description: "", kingdom: "" }));
  }

  function removeRow(i) {
    removeItem([], i);
  }

  function saveSettlements() {
    save(draft.filter((r) => r.name.trim()).map(fromSettlementRow));
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="MapPin" size={17} />
        </span>
        <h3>Manage settlements</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Renaming a settlement updates every building currently built there. Removing one is
        refused while it still has buildings -- move or remove them first.
      </p>
      {draft.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 10rem" }}>Name<br /><input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "2 1 14rem" }}>Description<br /><input value={r.description} onChange={(e) => field(i, "description", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>
            Kingdom<br />
            <select value={r.kingdom} onChange={(e) => field(i, "kingdom", e.target.value)} style={{ width: "100%" }}>
              <option value="">Unclaimed</option>
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
          Add settlement
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveSettlements}>Save settlements</button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Edit an already-built building's display name/detail, or move it to another settlement.
// Its own useEventSubmit, same as RemoveBuildingControl -- kept as a separate control since
// editing/moving is non-destructive and Remove is deliberately kept distinct. No Discord
// option here (unlike most save actions): renaming/moving a building is correcting or
// tidying existing data, not something new happening in the campaign, so postToDiscord is
// forced off rather than left to the DM's per-save choice.
function EditBuildingControl({ settlementName, building, label, settlementCatalog, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [displayName, setDisplayName] = useState(building.displayName || "");
  const [detail, setDetail] = useState(building.detail || "");
  const [targetSettlement, setTargetSettlement] = useState(settlementName);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(() => {
    setExpanded(false);
    setGameDate(null);
    onChanged();
  });

  const moving = targetSettlement !== settlementName;
  const nameChanged = displayName.trim() !== (building.displayName || "");
  const detailChanged = detail.trim() !== (building.detail || "");
  const dirty = moving || nameChanged || detailChanged;

  async function save() {
    if (!isCompleteGameDate(gameDate)) return;
    const formattedDate = formatGameDate(gameDate);
    if (moving) {
      // A move is a BuildingRemoved from the old settlement immediately followed by a
      // BuildingConstructed in the new one, carrying displayName/detail across -- preserves
      // full history with the existing event types rather than a third "moved" type
      // (CONTEXT.md's BuildingAmended entry / ADR-0004's precedent).
      await submit({
        type: "BuildingRemoved",
        gameDate: formattedDate,
        settlement: settlementName,
        note: `Moved to ${targetSettlement}`,
        payload: { building: building.name, count: building.count },
        postToDiscord: false,
      });
      await submit({
        type: "BuildingConstructed",
        gameDate: formattedDate,
        settlement: targetSettlement,
        note: `Moved from ${settlementName}`,
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
        gameDate: formattedDate,
        settlement: settlementName,
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
      <select value={targetSettlement} onChange={(e) => setTargetSettlement(e.target.value)} style={{ fontSize: "0.8rem" }}>
        {settlementCatalog.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>
      {dirty && <GameDatePicker value={gameDate} onChange={setGameDate} />}
      {dirty && (
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!isCompleteGameDate(gameDate)}>
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
  const [buildingsBySettlement, setBuildingsBySettlement] = useState(null);
  const [buildingCatalog, setBuildingCatalog] = useState([]);
  const [settlementCatalog, setSettlementCatalog] = useState([]);
  const [kingdomNames, setKingdomNames] = useState([]);
  const [showCatalogEditor, setShowCatalogEditor] = useState(false);
  const [showSettlementCatalogEditor, setShowSettlementCatalogEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([
      getProjection("settlements"),
      getReference("buildings"),
      getReference("settlements"),
      getProjection("locations"),
    ]).then(([s, b, settlements, locations]) => {
      setBuildingsBySettlement(s);
      setBuildingCatalog(b);
      setSettlementCatalog(settlements);
      setKingdomNames(locations.kingdoms.map((k) => k.name));
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(load);

  function addBuilding(settlementName, { building, displayName, detail, gameDate }) {
    submit({
      type: "BuildingConstructed",
      gameDate,
      settlement: settlementName,
      note: `Constructed via the Settlements view`,
      payload: { building, displayName, detail, count: 1 },
    });
  }

  function catalogEntry(name) {
    return buildingCatalog.find((b) => b.name.toLowerCase() === name.toLowerCase());
  }

  if (error) return <div className="error-box">Failed to load settlements: {error}</div>;
  if (!buildingsBySettlement) return <div className="loading">Loading settlements…</div>;

  // One card per known settlement (ADR-0008), not just settlements that already have a
  // building -- that's what makes adding a brand-new, currently-empty settlement possible at all.
  const buildingsByName = new Map(buildingsBySettlement.map((s) => [s.settlement, s.buildings]));
  const mergedSettlements = settlementCatalog.map((s) => ({
    name: s.name,
    kingdom: s.kingdom,
    buildings: buildingsByName.get(s.name) ?? [],
  }));
  const totalBuildings = mergedSettlements.reduce((sum, s) => sum + s.buildings.length, 0);

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Wilderlands</span>
          <h2>Settlements</h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">
            <Icon name="Settlements" size={13} />
            {mergedSettlements.length} settlements
          </span>
          <span className="pill">{totalBuildings} buildings</span>
          <button className="btn btn-sm" onClick={() => setShowSettlementCatalogEditor(!showSettlementCatalogEditor)}>
            {showSettlementCatalogEditor ? "Hide" : "Manage"} settlements
          </button>
          <button className="btn btn-sm" onClick={() => setShowCatalogEditor(!showCatalogEditor)}>
            {showCatalogEditor ? "Hide" : "Manage"} building catalog
          </button>
        </div>
      </div>
      {showSettlementCatalogEditor && (
        <SettlementCatalogEditor settlementCatalog={settlementCatalog} kingdomNames={kingdomNames} onSaved={load} />
      )}
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
        {mergedSettlements.map((settlement) => (
          <div className="card settlement-card" key={settlement.name}>
            <div className="settlement-card-head">
              <span className="icon-badge">
                <Icon name="MapPin" size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{settlement.name}</h3>
                <span className="text-faint" style={{ fontSize: "0.76rem" }}>
                  {settlement.kingdom || "Unclaimed"}
                </span>
              </div>
              <span className="pill">{settlement.buildings.length} buildings</span>
            </div>

            {settlement.buildings.length === 0 && (
              <div className="empty-state" style={{ padding: "1.25rem" }}>
                No buildings recorded yet.
              </div>
            )}

            <div className="building-list">
              {settlement.buildings.map((building) => {
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
                      settlementName={settlement.name}
                      building={building}
                      label={label}
                      settlementCatalog={settlementCatalog}
                      onChanged={load}
                    />
                    <RemoveBuildingControl
                      settlementName={settlement.name}
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
              onAdd={(b) => addBuilding(settlement.name, b)}
              postToDiscord={postToDiscord}
              setPostToDiscord={setPostToDiscord}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
