import { useEffect, useState } from "react";
import { getProjection, getReference } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";

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
  if (!intro || !draft) return <div className="loading">Loading introduction…</div>;

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
      <div className="card">
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
    <div className="card">
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
  // This card's own "last known saved" snapshot -- compared against instead of the
  // `deity` prop directly, so dirty state clears the instant this card's own save
  // resolves rather than waiting on the page-level refetch's round trip (which,
  // since onSaved is shared by every deity card, would otherwise also risk
  // clobbering an in-progress edit on a sibling card that hasn't saved yet). Same
  // bug and fix as KingdomCard's -- see docs/adr/0011.
  const [baseline, setBaseline] = useState(deity);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(onSaved);

  function field(key, value) {
    setDraft({ ...draft, [key]: value });
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function save() {
    const changes = {};
    for (const key of ["title", "alignment", "confirmed", "note"]) {
      if (draft[key] !== baseline[key]) changes[key] = draft[key];
    }
    if (Object.keys(changes).length === 0 || !isCompleteGameDate(gameDate)) return;
    // No Discord option here: tweaking a deity's title/alignment/confirmation is lore
    // upkeep, not campaign news, unlike most other save actions in this app.
    submit({
      type: "DeityAmended",
      gameDate: formatGameDate(gameDate),
      note: `Amended via the Codex`,
      payload: { name: deity.name, changes },
      postToDiscord: false,
    }).then(() => {
      setBaseline(draft);
      setGameDate(null);
    });
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
          <GameDatePicker value={gameDate} onChange={setGameDate} />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!isCompleteGameDate(gameDate)}>
            Save
          </button>
          {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
        </div>
      )}
      <WarningsList warnings={warnings} />
    </div>
  );
}

// Collapsed to a single "+ Add deity" affordance until clicked -- consistent with
// Settlements' AddBuildingForm and LocationsTab's new-kingdom form, so "add a new X"
// on a page whose primary content is browsing/editing existing X follows one rule
// app-wide (critique: /impeccable critique, 2026-09-07).
function NewDeityForm({ onAdded }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(() => {
    setName("");
    setGameDate(null);
    setExpanded(false);
  });

  function submitForm(e) {
    e.preventDefault();
    if (!name.trim() || !isCompleteGameDate(gameDate)) return;
    // No Discord option here, matching DeityCard -- lore upkeep, not campaign news.
    submit({
      type: "DeityAmended",
      gameDate: formatGameDate(gameDate),
      note: "Added via the Codex",
      payload: { name: name.trim(), changes: { alignment: "Unknown", confirmed: false } },
      postToDiscord: false,
    }).then(() => onAdded());
  }

  if (!expanded) {
    return (
      <button className="btn btn-sm" onClick={() => setExpanded(true)}>
        <Icon name="Plus" size={14} />
        Add deity
      </button>
    );
  }

  return (
    <form onSubmit={submitForm} className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New deity's name"
        style={{ flex: 1 }}
        autoFocus
      />
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      <button className="btn btn-primary" type="submit">
        <Icon name="Plus" size={14} />
        Add deity
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setExpanded(false)}>
        Cancel
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
  if (!deities) return <div className="loading">Loading deities…</div>;

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

// One kingdom, saved independently as its own LocationAmended event (payload
// {name, changes}, mirroring DeityAmended -- docs/adr/0011). Note is a visible field even
// when empty, not hidden until dirty: a kingdom with nothing concrete yet is where a rumor
// or a plan belongs, and that's the whole point of surfacing it rather than burying it.
function KingdomCard({ kingdom, regions, onSaved }) {
  const [draft, setDraft] = useState(kingdom);
  // This card's own "last known saved" snapshot -- compared against instead of the
  // `kingdom` prop directly, so dirty state clears the instant this card's own save
  // resolves rather than waiting on the page-level refetch's round trip (which, since
  // onSaved is shared by every kingdom card, would otherwise also risk clobbering an
  // in-progress edit on a sibling card that hasn't saved yet).
  const [baseline, setBaseline] = useState(kingdom);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(onSaved);

  function field(key, value) {
    setDraft({ ...draft, [key]: value });
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function save() {
    if (!isCompleteGameDate(gameDate)) return;
    const changes = {};
    if (draft.capital !== baseline.capital) changes.capital = draft.capital?.trim() || null;
    if (draft.note !== baseline.note) changes.note = draft.note?.trim() || null;
    // No Discord option: lore/worldbuilding upkeep, not campaign news, matching DeityAmended.
    submit({
      type: "LocationAmended",
      gameDate: formatGameDate(gameDate),
      note: "Amended via the Codex",
      payload: { name: kingdom.name, changes },
      postToDiscord: false,
    }).then(() => {
      setBaseline(draft);
      setGameDate(null);
    });
  }

  // A kingdom's settlements are Regions that name it, not the kingdom's own data (ADR-0012)
  // -- adding one happens on Settlements, not here.
  const kingdomRegions = regions.filter((r) => r.kingdom === kingdom.name);

  return (
    <div className="card region-card">
      <div className="region-card-head">
        <span className="icon-badge">
          <Icon name="MapPin" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{kingdom.name}</h3>
          <input
            value={draft.capital || ""}
            onChange={(e) => field("capital", e.target.value)}
            placeholder="Capital (optional)"
            style={{ width: "100%", background: "transparent", border: "none", padding: "0.1rem 0", fontSize: "0.8rem" }}
          />
        </div>
      </div>
      <textarea
        value={draft.note || ""}
        onChange={(e) => field("note", e.target.value)}
        placeholder="Notes, rumors, plans for this kingdom…"
        rows={2}
        style={{ width: "100%", fontSize: "0.85rem" }}
      />
      <div style={{ marginTop: "0.6rem" }}>
        <strong style={{ fontSize: "0.85rem" }}>Settlements</strong>
        {kingdomRegions.length > 0 ? (
          <div className="tag-row">
            {kingdomRegions.map((r) => (
              <span key={r.id} className="pill">{r.name}</span>
            ))}
          </div>
        ) : (
          <p className="text-faint" style={{ fontSize: "0.78rem", margin: "0.3rem 0 0" }}>
            None claimed yet -- add or assign one from Settlements → Manage regions.
          </p>
        )}
      </div>
      {dirty && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem", flexWrap: "wrap" }}>
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

// Collapsed to a single "+ Add kingdom" affordance until clicked, matching NewDeityForm and
// Settlements' AddBuildingForm (critique: /impeccable critique, 2026-09-07).
function NewKingdomForm({ onAdded }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(() => {
    setName("");
    setGameDate(null);
    setExpanded(false);
  });

  function submitForm(e) {
    e.preventDefault();
    if (!name.trim() || !isCompleteGameDate(gameDate)) return;
    submit({
      type: "LocationAmended",
      gameDate: formatGameDate(gameDate),
      note: "Added via the Codex",
      payload: { name: name.trim(), changes: {} },
      postToDiscord: false,
    }).then(() => onAdded());
  }

  if (!expanded) {
    return (
      <button className="btn btn-sm" onClick={() => setExpanded(true)}>
        <Icon name="Plus" size={14} />
        Add kingdom
      </button>
    );
  }

  return (
    <form onSubmit={submitForm} className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kingdom name" style={{ flex: 1 }} autoFocus />
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      <button className="btn btn-primary" type="submit">
        <Icon name="Plus" size={14} />
        Add kingdom
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setExpanded(false)}>
        Cancel
      </button>
      {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      <WarningsList warnings={warnings} />
    </form>
  );
}

function LocationsTab() {
  const [kingdoms, setKingdoms] = useState(null);
  const [regions, setRegions] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([getProjection("locations"), getReference("regions")]).then(([data, regionsData]) => {
      setKingdoms(data.kingdoms);
      setRegions(regionsData);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">Failed to load locations: {error}</div>;
  if (!kingdoms || !regions) return <div className="loading">Loading locations…</div>;

  return (
    <div>
      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          Known kingdoms across the map -- capital, notable places, and rumors. Each kingdom
          saves on its own as a LocationAmended event.
        </span>
      </div>
      <div className="grid grid-2" style={{ marginBottom: "1.25rem" }}>
        {kingdoms.map((k) => (
          <KingdomCard key={k.name} kingdom={k} regions={regions} onSaved={load} />
        ))}
      </div>
      <NewKingdomForm onAdded={load} />

      <div className="section-header" style={{ marginTop: "1.75rem" }}>
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
