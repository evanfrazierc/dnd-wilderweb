import { useEffect, useState } from "react";
import { getResource, putResource } from "../api.js";

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
    <div className="card">
      <div className="section-title-row">
        <p className="pill">
          Posted by {intro.postedBy} on {intro.postedAt}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {status && <span className="pill">{status}</span>}
          <button className="btn" onClick={addParagraph}>
            Add paragraph
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
      {intro.paragraphs.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <textarea
            value={p}
            onChange={(e) => updateParagraph(i, e.target.value)}
            rows={3}
            style={{ flex: 1 }}
          />
          <button className="btn btn-danger" onClick={() => removeParagraph(i)}>
            Remove
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
    <div className="card">
      <div className="section-title-row">
        <span />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {status && <span className="pill">{status}</span>}
          <button className="btn" onClick={addDeity}>
            Add deity
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
      {deities.map((d, i) => (
        <div
          key={i}
          className="stat-row"
          style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}
        >
          <input value={d.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Name" />
          <input
            value={d.title || ""}
            onChange={(e) => update(i, "title", e.target.value)}
            placeholder="Title"
          />
          <select value={d.alignment} onChange={(e) => update(i, "alignment", e.target.value)}>
            <option>Good</option>
            <option>Evil</option>
            <option>Neutral</option>
            <option>Unknown</option>
          </select>
          <label style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>
            <input
              type="checkbox"
              checked={!!d.confirmed}
              onChange={(e) => update(i, "confirmed", e.target.checked)}
            />{" "}
            confirmed
          </label>
          <button className="btn btn-danger" onClick={() => removeDeity(i)}>
            Remove
          </button>
        </div>
      ))}
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
        <span />
        {status && <span className="pill">{status}</span>}
      </div>
      <div className="grid grid-2">
        {locations.kingdoms.map((kingdom) => (
          <div className="card" key={kingdom.name}>
            <h3>{kingdom.name}</h3>
            {kingdom.capital && <p className="pill">Capital: {kingdom.capital}</p>}
            {kingdom.counties.length === 0 && kingdom.other.length === 0 && (
              <p style={{ color: "var(--text-dim)" }}>{kingdom.note || "No locations posted yet."}</p>
            )}
            {kingdom.counties.map((county, ci) => (
              <div key={county.name} style={{ marginTop: "0.5rem" }}>
                <strong>{county.name}</strong>
                <span className="pill" style={{ marginLeft: "0.5rem" }}>
                  seat: {county.seat}
                </span>
                <ul>
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
              <div style={{ marginTop: "0.5rem" }}>
                <strong>Other</strong>
                <ul>
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

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Wilderlands Regions</h3>
        <div className="grid grid-3">
          {locations.wilderlandsRegions.map((r) => (
            <div key={r.name}>
              <strong>{r.name}</strong>
              <p style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Add a new kingdom</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input value={newKingdom} onChange={(e) => setNewKingdom(e.target.value)} placeholder="Kingdom name" />
          <button className="btn btn-primary" onClick={addKingdom}>
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
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New settlement"
        style={{ fontSize: "0.85rem" }}
      />
      <button
        className="btn"
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
  { key: "intro", label: "Introduction", Component: IntroductionTab },
  { key: "deities", label: "Deities", Component: DeitiesTab },
  { key: "locations", label: "Locations", Component: LocationsTab },
];

export default function Codex() {
  const [tab, setTab] = useState("intro");
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <div>
      <div className="page-header">
        <h2>Campaign Codex</h2>
        <div className="tag-row">
          {TABS.map((t) => (
            <button
              key={t.key}
              className="btn"
              style={
                t.key === tab
                  ? { borderColor: "var(--accent)", color: "var(--accent-strong)" }
                  : undefined
              }
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Active />
    </div>
  );
}
