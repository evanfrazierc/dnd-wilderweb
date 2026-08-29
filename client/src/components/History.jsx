import { useEffect, useState } from "react";
import { getResource, addHistoryEntry, deleteHistoryEntry } from "../api.js";

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
    <form onSubmit={submit} className="card" style={{ marginBottom: "1.5rem" }}>
      <h3>Log a new entry</h3>
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
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        Resource changes
        <input
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
          placeholder="e.g. -1 Wood, +1 Wealth"
          style={{ width: "100%" }}
        />
      </label>
      <datalist>
        {RESOURCE_KEYS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        Note
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%" }}
          rows={2}
        />
      </label>
      <button className="btn btn-primary" type="submit" style={{ marginTop: "0.75rem" }}>
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

  return (
    <div>
      <div className="page-header">
        <h2>Build Orders &amp; Bookkeeping History</h2>
      </div>

      <NewEntryForm onAdd={handleAdd} />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[...entries].reverse().map((entry) => (
          <div className="card" key={entry.id}>
            <div className="section-title-row">
              <div>
                <strong>{entry.title}</strong>{" "}
                <span className="pill">{entry.gameDate}</span>{" "}
                {entry.channel && <span className="pill">#{entry.channel}</span>}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  posted {entry.postedAt}
                </span>
                <button className="btn btn-danger" onClick={() => handleDelete(entry.id)}>
                  Delete
                </button>
              </div>
            </div>
            {Object.keys(entry.changes || {}).length > 0 && (
              <div className="tag-row">
                {Object.entries(entry.changes).map(([res, val]) => (
                  <span key={res} className={val >= 0 ? "stat-delta-pos" : "stat-delta-neg"}>
                    {val >= 0 ? "+" : ""}
                    {val} {res}
                  </span>
                ))}
              </div>
            )}
            {entry.note && (
              <p style={{ marginTop: "0.5rem", color: "var(--text-dim)", fontSize: "0.9rem" }}>
                {entry.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
