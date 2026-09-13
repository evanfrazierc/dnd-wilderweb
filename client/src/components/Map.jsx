import { useEffect, useState } from "react";
import { getProjection, uploadMap } from "../api.js";
import Icon from "./Icon.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";

// A MapUpdated event carrying the raw file as the request body, not a JSON payload through
// useEventSubmit (docs/adr/0018) -- so this owns a small local status/warnings pattern instead
// of reusing that hook, which is specifically shaped around postEvent's JSON body.
export default function Map() {
  const [map, setMap] = useState(undefined); // undefined = loading, null = none uploaded yet
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  function load() {
    return getProjection("map").then(setMap).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  function submit(e) {
    e.preventDefault();
    if (!file || !isCompleteGameDate(gameDate)) return;
    setStatus("Uploading...");
    uploadMap(file, { gameDate: formatGameDate(gameDate), note: note.trim() || undefined })
      .then(() => {
        setStatus("Saved.");
        setFile(null);
        setNote("");
        setGameDate(null);
        e.target.reset();
        window.dispatchEvent(new CustomEvent("wilderweb:event-saved"));
        return load();
      })
      .catch((err) => setStatus(`Error: ${err.message}`));
  }

  if (error) return <div className="error-box">Failed to load the map: {error}</div>;

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Wilderlands</span>
          <h2>Map</h2>
        </div>
      </div>

      <p className="text-dim hero-note">
        Uploading a new image logs it as a MapUpdated event on the Timeline -- past versions
        aren't discarded, just not browsable here yet.
      </p>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        {map === undefined ? (
          <div className="loading">Loading…</div>
        ) : map === null ? (
          <div className="empty-state">No map uploaded yet.</div>
        ) : (
          <>
            <img src={map.imageDataUri} alt="Current campaign map" style={{ maxWidth: "100%", borderRadius: "8px" }} />
            <div className="text-faint" style={{ marginTop: "0.6rem", fontSize: "0.82rem" }}>
              As of {map.gameDate}
              {map.note && ` — ${map.note}`}
            </div>
          </>
        )}
      </div>

      <form onSubmit={submit} className="card add-building-form" style={{ marginTop: "1.25rem" }}>
        <div className="stat-group-head" style={{ width: "100%" }}>
          <span className="icon-badge">
            <Icon name="MapPin" size={17} />
          </span>
          <h3>Upload a new version</h3>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0] ?? null)}
          style={{ flex: "1 1 auto" }}
        />
        <input
          placeholder="Note (optional) — what got revealed this session?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: "1 1 auto" }}
        />
        <GameDatePicker value={gameDate} onChange={setGameDate} />
        <button className="btn btn-primary" type="submit" disabled={!file || !isCompleteGameDate(gameDate)}>
          <Icon name="Plus" size={14} />
          Upload
        </button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </form>
    </div>
  );
}
