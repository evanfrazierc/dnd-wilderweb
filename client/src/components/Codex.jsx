import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";

const ALIGNMENT_ICON = {
  Good: "AlignGood",
  Evil: "AlignEvil",
  Neutral: "AlignNeutral",
  Unknown: "AlignUnknown",
};

// Reference data (CONTEXT.md): no event history, edited directly in the database.
// Read-only by default -- a DM editing a typo shouldn't have to look at a form full of
// textareas every time the campaign's players just want to read the introduction.
function IntroductionTab() {
  const [intro, setIntro] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const { draft, dirty, set, addItem, removeItem } = useDraft(intro);

  function load() {
    return getReference("introduction").then(setIntro);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { save, status } = useReferenceSave("introduction", () => {
    load();
    setEditing(false);
  });

  if (error) return <div className="error-box">Failed to load introduction: {error}</div>;
  if (!intro || !draft) return <div className="loading">Loading…</div>;

  function field(key, value) {
    set([key], value);
  }

  function setParagraph(i, value) {
    set(["paragraphs", i], value);
  }

  function addParagraph() {
    addItem(["paragraphs"], () => "");
  }

  function removeParagraph(i) {
    removeItem(["paragraphs"], i);
  }

  if (!editing) {
    return (
      <div className="card parchment journal-page">
        <div className="section-title-row">
          <span className="text-faint" style={{ fontSize: "0.82rem" }}>
            {intro.postedBy && `Posted by ${intro.postedBy}`}
            {intro.postedBy && intro.postedAt && " · "}
            {intro.postedAt}
          </span>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Icon name="Codex" size={14} />
            Edit
          </button>
        </div>
        {intro.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="card parchment journal-page">
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 10rem" }}>
          Posted by
          <br />
          <input value={draft.postedBy || ""} onChange={(e) => field("postedBy", e.target.value)} style={{ width: "100%" }} />
        </label>
        <label style={{ flex: "1 1 10rem" }}>
          Posted at
          <br />
          <input value={draft.postedAt || ""} onChange={(e) => field("postedAt", e.target.value)} style={{ width: "100%" }} />
        </label>
      </div>
      {draft.paragraphs.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.6rem" }}>
          <textarea
            value={p}
            onChange={(e) => setParagraph(i, e.target.value)}
            rows={3}
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm btn-danger" onClick={() => removeParagraph(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.6rem" }}>
        <button className="btn btn-sm" onClick={addParagraph}>
          <Icon name="Plus" size={14} />
          Add paragraph
        </button>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
        {dirty && <button className="btn btn-primary" onClick={() => save(draft)}>Save</button>}
        <button className="btn btn-sm" onClick={() => setEditing(false)}>Done editing</button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
    </div>
  );
}

function DeityCard({ deity, onSaved }) {
  const [draft, setDraft] = useState(deity);
  const [gameDate, setGameDate] = useState("");
  const { submit, status, warnings } = useEventSubmit(onSaved);

  function field(key, value) {
    setDraft({ ...draft, [key]: value });
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(deity);

  function save() {
    const changes = {};
    for (const key of ["title", "alignment", "confirmed", "note"]) {
      if (draft[key] !== deity[key]) changes[key] = draft[key];
    }
    if (Object.keys(changes).length === 0 || !gameDate.trim()) return;
    // No Discord option here: tweaking a deity's title/alignment/confirmation is lore
    // upkeep, not campaign news, unlike most other save actions in this app.
    submit({
      type: "DeityAmended",
      gameDate: gameDate.trim(),
      note: `Amended via the Codex`,
      payload: { name: deity.name, changes },
      postToDiscord: false,
    }).then(() => setGameDate(""));
  }

  return (
    <div className={`card deity-card${draft.confirmed ? "" : " unconfirmed"}`}>
      <div className="deity-card-head">
        <span className={`icon-badge ${draft.alignment === "Evil" ? "bad" : draft.alignment === "Good" ? "good" : "muted"}`}>
          <Icon name={ALIGNMENT_ICON[draft.alignment] || "AlignUnknown"} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="deity-name-input" style={{ fontWeight: 600 }}>{draft.name}</div>
          <input
            className="deity-title-input"
            value={draft.title || ""}
            onChange={(e) => field("title", e.target.value)}
            placeholder="Title"
          />
        </div>
      </div>
      <div className="deity-card-foot">
        <select value={draft.alignment} onChange={(e) => field("alignment", e.target.value)}>
          <option>Good</option>
          <option>Evil</option>
          <option>Neutral</option>
          <option>Unknown</option>
        </select>
        <label className="text-faint" style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input
            type="checkbox"
            checked={!!draft.confirmed}
            onChange={(e) => field("confirmed", e.target.checked)}
          />
          confirmed
        </label>
      </div>
      <textarea
        value={draft.note || ""}
        onChange={(e) => field("note", e.target.value)}
        placeholder="Note"
        rows={2}
        style={{ width: "100%", marginTop: "0.5rem", fontSize: "0.8rem" }}
      />
      {dirty && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <input
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            placeholder="Game date"
            style={{ width: "8rem", fontSize: "0.8rem" }}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!gameDate.trim()}>
            Save
          </button>
          {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
        </div>
      )}
      <WarningsList warnings={warnings} />
    </div>
  );
}

function NewDeityForm({ onAdded }) {
  const [name, setName] = useState("");
  const [gameDate, setGameDate] = useState("");
  const { submit, status, warnings } = useEventSubmit(() => {
    setName("");
    setGameDate("");
  });

  function submitForm(e) {
    e.preventDefault();
    if (!name.trim() || !gameDate.trim()) return;
    // No Discord option here, matching DeityCard -- lore upkeep, not campaign news.
    submit({
      type: "DeityAmended",
      gameDate: gameDate.trim(),
      note: "Added via the Codex",
      payload: { name: name.trim(), changes: { alignment: "Unknown", confirmed: false } },
      postToDiscord: false,
    }).then(() => onAdded());
  }

  return (
    <form onSubmit={submitForm} className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New deity's name" style={{ flex: 1 }} />
      <input value={gameDate} onChange={(e) => setGameDate(e.target.value)} placeholder="Game date" style={{ width: "8rem" }} />
      <button className="btn btn-primary" type="submit">
        <Icon name="Plus" size={14} />
        Add deity
      </button>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />
    </form>
  );
}

function DeitiesTab() {
  const [deities, setDeities] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    return getProjection("deities").then(setDeities);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">Failed to load deities: {error}</div>;
  if (!deities) return <div className="loading">Loading…</div>;

  return (
    <div>
      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          The pantheon known to the Wilderlands, confirmed and rumored alike. Each deity saves on
          its own as a DeityAmended event.
        </span>
      </div>
      <div className="grid grid-3" style={{ marginBottom: "1.25rem" }}>
        {deities.map((d) => (
          <DeityCard key={d.name} deity={d} onSaved={load} />
        ))}
      </div>
      <NewDeityForm onAdded={load} />
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

function LocationsTab() {
  const [locations, setLocations] = useState(null);
  const [draft, setDraft] = useState(null);
  const [regions, setRegions] = useState(null);
  const [note, setNote] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [newKingdom, setNewKingdom] = useState("");
  const [error, setError] = useState(null);

  // wilderlandsRegions used to live as its own frozen copy inside this document, kept in
  // sync with the Settlements page's regions table (CONTEXT.md's Region) only by convention
  // -- it drifted. Regions are shown here read-only, sourced live from that same table; the
  // kingdom/county/settlement hierarchy below is the unrelated concept this tab actually owns.
  function load() {
    return Promise.all([getProjection("locations"), getReference("regions")]).then(([data, regionsData]) => {
      // eslint-disable-next-line no-unused-vars
      const { wilderlandsRegions, ...rest } = data;
      setLocations(rest);
      setDraft(rest);
      setRegions(regionsData);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const { submit, status, warnings } = useEventSubmit(() => {
    load();
    setNote("");
    setGameDate("");
  });

  if (error) return <div className="error-box">Failed to load locations: {error}</div>;
  if (!locations || !draft || !regions) return <div className="loading">Loading…</div>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(locations);

  function addKingdom() {
    if (!newKingdom.trim()) return;
    setDraft({
      ...draft,
      kingdoms: [...draft.kingdoms, { name: newKingdom.trim(), capital: null, counties: [], other: [] }],
    });
    setNewKingdom("");
  }

  function addSettlement(kingdomName, countyIndex, name) {
    if (!name.trim()) return;
    const kingdoms = draft.kingdoms.map((k) => {
      if (k.name !== kingdomName) return k;
      const counties = k.counties.map((c, i) =>
        i === countyIndex
          ? { ...c, settlements: [...c.settlements, { name: name.trim(), type: "Settlement" }] }
          : c,
      );
      return { ...k, counties };
    });
    setDraft({ ...draft, kingdoms });
  }

  function save() {
    if (!note.trim() || !gameDate.trim()) return;
    // No Discord option here: LocationAmended replaces the whole document, so it can't tell
    // "a new settlement was founded" (news) apart from "fixed a typo" (not) -- not offered.
    submit({
      type: "LocationAmended",
      gameDate: gameDate.trim(),
      note: note.trim(),
      payload: { data: draft },
      postToDiscord: false,
    });
  }

  return (
    <div>
      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          Known kingdoms, counties, and settlements across the map.
        </span>
      </div>
      <div className="grid grid-2">
        {draft.kingdoms.map((kingdom) => (
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
      <p className="text-faint" style={{ fontSize: "0.78rem", marginTop: "-0.4rem" }}>
        Same regions the Settlements page tracks buildings by -- edit them there (Settlements
        → Manage regions), not here.
      </p>
      <div className="card">
        <div className="grid grid-3">
          {regions.map((r) => (
            <div key={r.id}>
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
          <button className="btn" onClick={addKingdom}>
            <Icon name="Plus" size={14} />
            Add
          </button>
        </div>
      </div>

      {dirty && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <div className="stat-group-head">
            <span className="icon-badge">
              <Icon name="Scroll" size={17} />
            </span>
            <h3>Record this change</h3>
          </div>
          <p className="text-faint" style={{ fontSize: "0.8rem" }}>
            This replaces the whole locations record, so a note describing what changed is required.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ flex: "0 0 8rem" }}>
              Game date
              <br />
              <input value={gameDate} onChange={(e) => setGameDate(e.target.value)} style={{ width: "100%" }} />
            </label>
            <label style={{ flex: "1 1 16rem" }}>
              Note
              <br />
              <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
            </label>
            <button className="btn btn-primary" onClick={save} disabled={!note.trim() || !gameDate.trim()}>
              Save
            </button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </div>
          <WarningsList warnings={warnings} />
        </div>
      )}
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
