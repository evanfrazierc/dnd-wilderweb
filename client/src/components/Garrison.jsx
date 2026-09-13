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

function toRow(u) {
  return {
    name: u.name || "",
    costText: costToText(u.cost),
    upkeepText: costToText(u.upkeep),
    combatBonus: u.combatBonus ?? 0,
    requiresText: (u.requires || []).join(", "),
    note: u.note || "",
  };
}
function fromRow(r) {
  return {
    name: r.name.trim(),
    cost: parseCostText(r.costText),
    upkeep: parseCostText(r.upkeepText),
    combatBonus: Number(r.combatBonus) || 0,
    requires: parseListText(r.requiresText),
    note: r.note.trim() || null,
  };
}

// Reference data (CONTEXT.md, docs/adr/0017): edited directly, no event history. Mirrors
// Settlements.jsx's BuildingCatalogEditor exactly -- a Unit is the same kind of thing as a
// Building (a catalog-referenced entity with a cost and prerequisites).
function UnitCatalogEditor({ catalog, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(catalog.map(toRow));
  const { save, status } = useReferenceSave("units", onSaved);

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
          <Icon name="Weapons" size={17} />
        </span>
        <h3>Manage unit catalog</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Cost and upkeep are comma-separated lists like "Food: 1, Weapons: 1". Requires is a
        comma-separated list of prerequisite building names (same meaning as the building
        catalog's Requires field).
      </p>
      {draft.map((r, i) => (
        <div key={i} className="card" style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 10rem" }}>Name<br /><input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>Cost<br /><input value={r.costText} onChange={(e) => field(i, "costText", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>Upkeep<br /><input value={r.upkeepText} onChange={(e) => field(i, "upkeepText", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "0 1 7rem" }}>Combat bonus<br /><input type="number" value={r.combatBonus} onChange={(e) => field(i, "combatBonus", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 10rem" }}>Requires<br /><input value={r.requiresText} onChange={(e) => field(i, "requiresText", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "2 1 14rem" }}>Note<br /><input value={r.note} onChange={(e) => field(i, "note", e.target.value)} style={{ width: "100%" }} /></label>
          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addRow}>
          <Icon name="Plus" size={14} />
          Add unit
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveCatalog}>Save catalog</button>
            <StatusPill status={status} />
          </>
        )}
      </div>
    </div>
  );
}

// Collapsed to a single "+ Raise unit" affordance until clicked, mirroring
// Settlements.jsx's AddBuildingForm for the same reason (a permanently-open form is a lot of
// live fields for one action).
function RaiseUnitForm({ unitCatalog, onRaise, postToDiscord, setPostToDiscord }) {
  const [expanded, setExpanded] = useState(false);
  const [customName, setCustomName] = useState(false);
  const [name, setName] = useState("");
  const [count, setCount] = useState("1");
  const [detail, setDetail] = useState("");
  const [gameDate, setGameDate] = useState(null);

  const dirty = Boolean(name.trim() || detail.trim());

  function submit(e) {
    e.preventDefault();
    if (!name.trim() || !isCompleteGameDate(gameDate)) return;
    onRaise({
      unit: name.trim(),
      count: Number(count) || 1,
      detail: detail.trim() || undefined,
      gameDate: formatGameDate(gameDate),
    });
    setName("");
    setCount("1");
    setDetail("");
    setExpanded(false);
  }

  function cancel() {
    setName("");
    setCount("1");
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
          Raise unit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="add-building-form">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "1 1 auto" }}>
        {customName ? (
          <input
            placeholder="Unit name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        ) : (
          <select value={name} onChange={(e) => setName(e.target.value)} autoFocus>
            <option value="" disabled>Unit name…</option>
            {unitCatalog.map((u) => (
              <option key={u.name} value={u.name}>{u.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-sm" onClick={toggleCustomName} style={{ alignSelf: "flex-start" }}>
          {customName ? "Use the unit catalog instead" : "+ Not in the catalog"}
        </button>
      </div>
      <input
        type="number"
        min="1"
        value={count}
        onChange={(e) => setCount(e.target.value)}
        style={{ width: "4.5rem" }}
      />
      <input
        placeholder="In-fiction note (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        style={{ flex: "1 1 auto" }}
      />
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      {dirty && <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />}
      <button className="btn" type="submit">
        <Icon name="Plus" size={14} />
        Raise
      </button>
      <button type="button" className="btn btn-sm" onClick={cancel}>
        Cancel
      </button>
    </form>
  );
}

// Its own useEventSubmit, mirroring Settlements.jsx's RemoveBuildingControl -- losing a unit is
// a separate save action the DM should be able to decide on independently.
function LoseUnitControl({ unit, label, onLost }) {
  const [confirming, setConfirming] = useState(false);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    setConfirming(false);
    setGameDate(null);
    onLost();
  });

  function confirmLoss() {
    if (!isCompleteGameDate(gameDate)) return;
    submit({
      type: "UnitLost",
      gameDate: formatGameDate(gameDate),
      note: "Removed via the Garrison view",
      payload: { unit: unit.name, count: 1 },
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
      <button className="btn btn-sm btn-danger" onClick={confirmLoss} disabled={!isCompleteGameDate(gameDate)}>
        Confirm loss
      </button>
      <button className="btn btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      <StatusPill status={status} />
      <WarningsList warnings={warnings} />
    </div>
  );
}

export default function Garrison() {
  const [garrison, setGarrison] = useState(null);
  const [unitCatalog, setUnitCatalog] = useState([]);
  const [showCatalogEditor, setShowCatalogEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([
      getProjection("garrison"),
      getReference("units"),
    ]).then(([g, u]) => {
      setGarrison(g);
      setUnitCatalog(u);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(load);

  function raiseUnit({ unit, count, detail, gameDate }) {
    submit({
      type: "UnitRaised",
      gameDate,
      note: "Raised via the Garrison view",
      payload: { unit, count, detail },
    });
  }

  function catalogEntry(name) {
    return unitCatalog.find((u) => u.name.toLowerCase() === name.toLowerCase());
  }

  if (error) return <div className="error-box">Failed to load the garrison: {error}</div>;
  if (!garrison) return <div className="loading">Loading garrison…</div>;

  const totalUnits = garrison.reduce((sum, u) => sum + u.count, 0);

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">Stirling Reach</span>
          <h2>Garrison</h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">
            <Icon name="Weapons" size={13} />
            {totalUnits} units
          </span>
          <button className="btn btn-sm" onClick={() => setShowCatalogEditor(!showCatalogEditor)}>
            {showCatalogEditor ? "Hide" : "Manage"} unit catalog
          </button>
        </div>
      </div>
      {showCatalogEditor && <UnitCatalogEditor catalog={unitCatalog} onSaved={load} />}

      <p className="text-dim hero-note">
        Raising or losing a unit here logs it as a UnitRaised / UnitLost event on the Timeline.
        A unit's cost isn't deducted automatically -- log the resource change separately, same
        as building a building.
      </p>
      {status && (
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <StatusPill status={status} />
        </div>
      )}
      <WarningsList warnings={warnings} />

      <div className="card region-card" style={{ marginTop: "1.25rem" }}>
        <div className="region-card-head">
          <span className="icon-badge">
            <Icon name="Weapons" size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0 }}>Current garrison</h3>
          </div>
          <span className="pill">{garrison.length} unit types</span>
        </div>

        {garrison.length === 0 && (
          <div className="empty-state" style={{ padding: "1.25rem" }}>
            No units mustered yet.
          </div>
        )}

        <div className="building-list">
          {garrison.map((unit) => {
            const catalog = catalogEntry(unit.name);
            return (
              <div className="building-row" key={unit.name} title={catalog?.note} style={{ flexWrap: "wrap" }}>
                <span className="icon-badge sm">
                  <Icon name="Weapons" size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="building-name">
                    {unit.name}
                    {unit.count > 1 ? ` ×${unit.count}` : ""}
                    {catalog ? ` (+${catalog.combatBonus} combat)` : ""}
                  </div>
                  {unit.detail && <div className="text-faint building-detail">{unit.detail}</div>}
                </div>
                <LoseUnitControl unit={unit} label={unit.name} onLost={load} />
              </div>
            );
          })}
        </div>

        <RaiseUnitForm
          unitCatalog={unitCatalog}
          onRaise={raiseUnit}
          postToDiscord={postToDiscord}
          setPostToDiscord={setPostToDiscord}
        />
      </div>
    </div>
  );
}
