import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";
import Icon from "./Icon.jsx";

const ALIGNMENT_ICON = {
  Good: "AlignGood",
  Evil: "AlignEvil",
  Neutral: "AlignNeutral",
  Unknown: "AlignUnknown",
};

function IntroductionTab() {
  const [intro, setIntro] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getResource("introduction").then(setIntro);
  }, []);

  if (!intro) return <div className="loading">Loading…</div>;

  function updateParagraph(i, value) {
    const paragraphs = [...intro.paragraphs];
    paragraphs[i] = value;
    setIntro({ ...intro, paragraphs });
  }

  function addParagraph() {
    setIntro({ ...intro, paragraphs: [...intro.paragraphs, ""] });
  }

  function removeParagraph(i) {
    setIntro({ ...intro, paragraphs: intro.paragraphs.filter((_, idx) => idx !== i) });
  }

  async function save() {
    setStatus("Saving...");
    try {
      await putResource("introduction", intro);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  return (
    <div className="card parchment journal-page">
      <div className="section-title-row">
        <p className="pill" style={{ background: "rgba(36,28,18,0.08)", borderColor: "rgba(36,28,18,0.25)", color: "#5b4d34" }}>
          Posted by {intro.postedBy} on {intro.postedAt}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {status && <span className="pill accent">{status}</span>}
          <button className="btn" onClick={addParagraph}>
            <Icon name="Plus" size={14} />
            Add paragraph
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
      {intro.paragraphs.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <textarea
            value={p}
            onChange={(e) => updateParagraph(i, e.target.value)}
            rows={3}
            style={{ flex: 1, background: "rgba(36,28,18,0.05)", color: "var(--ink)", borderColor: "rgba(36,28,18,0.25)" }}
          />
          <button className="btn btn-danger" onClick={() => removeParagraph(i)}>
            <Icon name="Trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function DeitiesTab() {
  const [deities, setDeities] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getResource("deities").then(setDeities);
  }, []);

  if (!deities) return <div className="loading">Loading…</div>;

  function update(i, field, value) {
    const next = [...deities];
    next[i] = { ...next[i], [field]: value };
    setDeities(next);
  }

  function addDeity() {
    setDeities([...deities, { name: "New Deity", title: "", alignment: "Unknown", confirmed: false, note: "" }]);
  }

  function removeDeity(i) {
    setDeities(deities.filter((_, idx) => idx !== i));
  }

  async function save() {
    setStatus("Saving...");
    try {
      await putResource("deities", deities);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  return (
    <div>
      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          The pantheon known to the Wilderlands, confirmed and rumored alike.
        </span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {status && <span className="pill accent">{status}</span>}
          <button className="btn" onClick={addDeity}>
            <Icon name="Plus" size={14} />
            Add deity
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
      <div className="grid grid-3">
        {deities.map((d, i) => (
          <div key={i} className={`card deity-card${d.confirmed ? "" : " unconfirmed"}`}>
            <div className="deity-card-head">
              <span className={`icon-badge ${d.alignment === "Evil" ? "bad" : d.alignment === "Good" ? "good" : "muted"}`}>
                <Icon name={ALIGNMENT_ICON[d.alignment] || "AlignUnknown"} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  className="deity-name-input"
                  value={d.name}
                  onChange={(e) => update(i, "name", e.target.value)}
                  placeholder="Name"
                />
                <input
                  className="deity-title-input"
                  value={d.title || ""}
                  onChange={(e) => update(i, "title", e.target.value)}
                  placeholder="Title"
                />
              </div>
              <button className="btn btn-icon btn-danger" onClick={() => removeDeity(i)} aria-label={`Remove ${d.name}`}>
                <Icon name="Trash" size={13} />
              </button>
            </div>
            <div className="deity-card-foot">
              <select value={d.alignment} onChange={(e) => update(i, "alignment", e.target.value)}>
                <option>Good</option>
                <option>Evil</option>
                <option>Neutral</option>
                <option>Unknown</option>
              </select>
              <label className="text-faint" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <input
                  type="checkbox"
                  checked={!!d.confirmed}
                  onChange={(e) => update(i, "confirmed", e.target.checked)}
                />
                confirmed
              </label>
            </div>
            {d.note && <p className="text-faint" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>{d.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationsTab() {
  const [locations, setLocations] = useState(null);
  const [status, setStatus] = useState("");
  const [newKingdom, setNewKingdom] = useState("");

  useEffect(() => {
    getResource("locations").then(setLocations);
  }, []);

  if (!locations) return <div className="loading">Loading…</div>;

  async function save(next) {
    setLocations(next);
    setStatus("Saving...");
    try {
      await putResource("locations", next);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  }

  function addKingdom() {
    if (!newKingdom.trim()) return;
    save({
      ...locations,
      kingdoms: [
        ...locations.kingdoms,
        { name: newKingdom.trim(), capital: null, counties: [], other: [] },
      ],
    });
    setNewKingdom("");
  }

  function addSettlement(kingdomName, countyIndex, name) {
    if (!name.trim()) return;
    const kingdoms = locations.kingdoms.map((k) => {
      if (k.name !== kingdomName) return k;
      const counties = k.counties.map((c, i) =>
        i === countyIndex
          ? { ...c, settlements: [...c.settlements, { name: name.trim(), type: "Settlement" }] }
          : c
      );
      return { ...k, counties };
    });
    save({ ...locations, kingdoms });
  }

  return (
    <div>
      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          Known kingdoms, counties, and settlements across the map.
        </span>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <div className="grid grid-2">
        {locations.kingdoms.map((kingdom) => (
          <div className="card region-card" key={kingdom.name}>
            <div className="region-card-head">
              <span className="icon-badge">
                <Icon name="MapPin" size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{kingdom.name}</h3>
                {kingdom.capital && <span className="text-faint" style={{ fontSize: "0.76rem" }}>Capital: {kingdom.capital}</span>}
              </div>
            </div>
            {kingdom.counties.length === 0 && kingdom.other.length === 0 && (
              <p className="text-dim">{kingdom.note || "No locations posted yet."}</p>
            )}
            {kingdom.counties.map((county, ci) => (
              <div key={county.name} style={{ marginTop: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong>{county.name}</strong>
                  <span className="pill">seat: {county.seat}</span>
                </div>
                <ul className="location-list">
                  {county.settlements.map((s) => (
                    <li key={s.name}>
                      {s.name} <span className="pill">{s.type}</span>
                    </li>
                  ))}
                </ul>
                <SettlementAdder onAdd={(name) => addSettlement(kingdom.name, ci, name)} />
              </div>
            ))}
            {kingdom.other.length > 0 && (
              <div style={{ marginTop: "0.6rem" }}>
                <strong>Other</strong>
                <ul className="location-list">
                  {kingdom.other.map((o) => (
                    <li key={o.name}>
                      {o.name} <span className="pill">{o.type}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="section-header">
        <h3>Wilderlands Regions</h3>
        <div className="rule" />
      </div>
      <div className="card">
        <div className="grid grid-3">
          {locations.wilderlandsRegions.map((r) => (
            <div key={r.name}>
              <strong>{r.name}</strong>
              <p className="text-dim" style={{ fontSize: "0.88rem" }}>{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h3>Add a new kingdom</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={newKingdom} onChange={(e) => setNewKingdom(e.target.value)} placeholder="Kingdom name" />
          <button className="btn btn-primary" onClick={addKingdom}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function SettlementAdder({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New settlement"
        style={{ fontSize: "0.85rem" }}
      />
      <button
        className="btn btn-sm"
        onClick={() => {
          onAdd(name);
          setName("");
        }}
      >
        Add
      </button>
    </div>
  );
}

const TABS = [
  { key: "intro", label: "Introduction", icon: "Codex", Component: IntroductionTab },
  { key: "deities", label: "Deities", icon: "Piety", Component: DeitiesTab },
  { key: "locations", label: "Locations", icon: "MapPin", Component: LocationsTab },
];

export default function Codex() {
  const [tab, setTab] = useState("intro");
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">Lore &amp; Records</span>
          <h2>Campaign Codex</h2>
        </div>
      </div>
      <div className="book-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`book-tab${t.key === tab ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
