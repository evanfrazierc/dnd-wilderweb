import { useEffect, useState } from "react";
import { getResource, addHistoryEntry, deleteHistoryEntry } from "../api.js";
import Icon from "./Icon.jsx";

const RESOURCE_KEYS = [
  "Wood",
  "Food",
  "Stone",
  "Iron",
  "Wealth",
  "Horses",
  "Weapons",
  "Tools",
  "Population",
  "Medicine",
  "Ships",
  "Unrest",
  "Diplomacy",
  "Loyalty",
  "Piety",
  "Dread",
  "Intrigue",
];

function NewEntryForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [note, setNote] = useState("");
  const [changesText, setChangesText] = useState("");

  function parseChanges(text) {
    const changes = {};
    text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part) => {
        const match = part.match(/^([+-]?\d+)\s+(\w+)$/);
        if (match) {
          changes[match[2]] = Number(match[1]);
        }
      });
    return changes;
  }

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      gameDate: gameDate.trim(),
      note: note.trim(),
      postedAt: new Date().toISOString().slice(0, 10),
      channel: "manual",
      changes: parseChanges(changesText),
    });
    setTitle("");
    setGameDate("");
    setNote("");
    setChangesText("");
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: "1.75rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Plus" size={17} />
        </span>
        <h3>Log a new entry</h3>
      </div>
      <div className="grid grid-2">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          In-game date
          <input
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            placeholder="e.g. Month 4, 1227"
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Resource changes
        <input
          list="resource-keys"
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
          placeholder="e.g. -1 Wood, +1 Wealth"
          style={{ width: "100%" }}
        />
      </label>
      <datalist id="resource-keys">
        {RESOURCE_KEYS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%" }}
          rows={2}
        />
      </label>
      <button className="btn btn-primary" type="submit" style={{ marginTop: "0.85rem" }}>
        <Icon name="Scroll" size={14} />
        Add entry
      </button>
    </form>
  );
}

export default function History() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    getResource("history")
      .then((data) =>
        setEntries(
          [...data].sort((a, b) => (a.postedAt < b.postedAt ? -1 : a.postedAt > b.postedAt ? 1 : a.id - b.id))
        )
      )
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleAdd(entry) {
    await addHistoryEntry(entry);
    load();
  }

  async function handleDelete(id) {
    await deleteHistoryEntry(id);
    load();
  }

  if (error) return <div className="error-box">Failed to load history: {error}</div>;
  if (!entries) return <div className="loading">Loading history…</div>;

  const ordered = [...entries].reverse();

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Chronicle</span>
          <h2>Build Orders &amp; Bookkeeping History</h2>
        </div>
        <span className="pill accent">
          <Icon name="Scroll" size={13} />
          {entries.length} entries
        </span>
      </div>

      <NewEntryForm onAdd={handleAdd} />

      {ordered.length === 0 ? (
        <div className="empty-state">No entries logged yet.</div>
      ) : (
        <div className="timeline">
          {ordered.map((entry) => (
            <div className="timeline-entry" key={entry.id}>
              <div className="timeline-marker" />
              <div className="card timeline-card">
                <div className="section-title-row">
                  <div>
                    <strong>{entry.title}</strong>{" "}
                    {entry.gameDate && <span className="pill">{entry.gameDate}</span>}{" "}
                    {entry.channel && <span className="pill">#{entry.channel}</span>}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span className="text-faint" style={{ fontSize: "0.78rem" }}>
                      posted {entry.postedAt}
                    </span>
                    <button
                      className="btn btn-icon btn-danger"
                      onClick={() => handleDelete(entry.id)}
                      aria-label={`Delete ${entry.title}`}
                    >
                      <Icon name="Trash" size={14} />
                    </button>
                  </div>
                </div>
                {Object.keys(entry.changes || {}).length > 0 && (
                  <div className="tag-row">
                    {Object.entries(entry.changes).map(([res, val]) => (
                      <span key={res} className={`pill ${val >= 0 ? "good" : "bad"}`}>
                        <Icon name={res} size={12} />
                        {val >= 0 ? "+" : ""}
                        {val} {res}
                      </span>
                    ))}
                  </div>
                )}
                {entry.note && <p className="text-dim" style={{ marginTop: "0.6rem", fontSize: "0.88rem" }}>{entry.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
