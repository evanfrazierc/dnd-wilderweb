import { useEffect, useState } from "react";
import { getEvents, getObligations, getProjection } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";
import { parseChanges } from "../lib/parseChanges.js";
import { EVENT_ICON } from "../lib/eventIcon.js";

const EVENT_TYPES = [
  "ResourceChanged",
  "BuildingConstructed",
  "BuildingRemoved",
  "CalendarAdvanced",
  "DeityAmended",
  "LocationAmended",
  "ObligationAmended",
  "DMRuling",
];

function NewEntryForm({ obligations, knownResourceNames, onAdd }) {
  const [gameDate, setGameDate] = useState(null);
  const [settlement, setSettlement] = useState("");
  const [note, setNote] = useState("");
  const [changesText, setChangesText] = useState("");
  const [obligationId, setObligationId] = useState("");
  const [createsObligation, setCreatesObligation] = useState(false);
  const [obDescription, setObDescription] = useState("");
  const [obRepaymentResource, setObRepaymentResource] = useState("");
  const [obAmountTotal, setObAmountTotal] = useState("");
  const [obDueGameDate, setObDueGameDate] = useState(null);
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(onAdd);

  const changes = parseChanges(changesText);
  const hasChanges = Object.keys(changes).length > 0;
  // A resource name here is free text, unlike Dashboard's steppers or Settlements'
  // building catalog -- a typo used to be silently recorded to history and silently
  // dropped from resource_totals (server/db/projections.js), with the only feedback
  // being a warning shown *after* save. This surfaces the same check before submit,
  // without blocking it (ADR-0005: warn, don't block).
  const unknownNames = knownResourceNames
    ? Object.keys(changes).filter((name) => !knownResourceNames.has(name))
    : [];
  const newObligationReady = createsObligation && obDescription.trim() && obRepaymentResource.trim() && obAmountTotal !== "";

  function resetObligationFields() {
    setCreatesObligation(false);
    setObDescription("");
    setObRepaymentResource("");
    setObAmountTotal("");
    setObDueGameDate(null);
  }

  function submitForm(e) {
    e.preventDefault();
    if (!isCompleteGameDate(gameDate) || !note.trim()) return;
    if (createsObligation && !newObligationReady) return;
    submit({
      type: hasChanges ? "ResourceChanged" : "DMRuling",
      gameDate: formatGameDate(gameDate),
      settlement: settlement.trim() || undefined,
      note: note.trim(),
      payload: hasChanges
        ? {
            changes,
            obligationId: obligationId ? Number(obligationId) : undefined,
            newObligation: newObligationReady
              ? {
                  description: obDescription.trim(),
                  repaymentResource: obRepaymentResource.trim(),
                  amountTotal: Number(obAmountTotal),
                  dueGameDate: isCompleteGameDate(obDueGameDate) ? formatGameDate(obDueGameDate) : undefined,
                }
              : undefined,
          }
        : {},
      // DMRuling is a clarification/correction, not campaign news -- no Discord option for
      // it (unlike ResourceChanged, which shares this same form and checkbox).
      ...(hasChanges ? {} : { postToDiscord: false }),
    }).then(() => {
      setGameDate(null);
      setSettlement("");
      setNote("");
      setChangesText("");
      setObligationId("");
      resetObligationFields();
    });
  }

  return (
    <form onSubmit={submitForm} className="card" style={{ marginBottom: "1.75rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Plus" size={17} />
        </span>
        <h3>Log a new entry</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.78rem", marginTop: "-0.4rem" }}>
        With resource changes, this logs a ResourceChanged event. Without any, it logs a DMRuling
        (a note-only clarification). Other event types (construction, calendar, deities, locations)
        have their own views.
      </p>
      <div className="grid grid-2">
        <label>
          In-game date
          <br />
          <GameDatePicker value={gameDate} onChange={setGameDate} />
        </label>
        <label>
          Settlement (optional)
          <input value={settlement} onChange={(e) => setSettlement(e.target.value)} style={{ width: "100%" }} />
        </label>
      </div>
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Resource changes
        <input
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
          placeholder="e.g. -1 Wood, +1 Wealth"
          style={{ width: "100%" }}
        />
      </label>
      {hasChanges && (
        <div className="tag-row">
          {Object.entries(changes).map(([res, val]) => (
            <span key={res} className={`pill ${unknownNames.includes(res) ? "warn" : val >= 0 ? "good" : "bad"}`}>
              {!unknownNames.includes(res) && <Icon name={res} size={12} />}
              {val >= 0 ? "+" : ""}
              {val} {res}
            </span>
          ))}
        </div>
      )}
      <WarningsList
        warnings={unknownNames.map((name) => `Unknown resource name "${name}" -- not in resource_totals`)}
      />
      {hasChanges && obligations.length > 0 && (
        <label style={{ display: "block", marginTop: "0.6rem" }}>
          Settles an obligation (optional)
          <select value={obligationId} onChange={(e) => setObligationId(e.target.value)} style={{ width: "100%" }}>
            <option value="">None</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.id} {o.description} ({o.amountRemaining}/{o.amountTotal} {o.repaymentResource} remaining)
              </option>
            ))}
          </select>
        </label>
      )}
      {hasChanges && (
        <div style={{ marginTop: "0.6rem" }}>
          <label className="text-faint" style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input type="checkbox" checked={createsObligation} onChange={(e) => setCreatesObligation(e.target.checked)} />
            This also creates a new obligation (loan)
          </label>
          {createsObligation && (
            <div className="grid grid-2" style={{ marginTop: "0.4rem" }}>
              <label>
                Description
                <input value={obDescription} onChange={(e) => setObDescription(e.target.value)} style={{ width: "100%" }} />
              </label>
              <label>
                Repayment resource
                <input value={obRepaymentResource} onChange={(e) => setObRepaymentResource(e.target.value)} style={{ width: "100%" }} />
              </label>
              <label>
                Amount owed
                <input type="number" value={obAmountTotal} onChange={(e) => setObAmountTotal(e.target.value)} style={{ width: "100%" }} />
              </label>
              <label>
                Due date (optional)
                <br />
                <GameDatePicker value={obDueGameDate} onChange={setObDueGameDate} autoDefault={false} allowClear />
              </label>
            </div>
          )}
        </div>
      )}
      <label style={{ display: "block", marginTop: "0.6rem" }}>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} rows={2} />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.85rem" }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!isCompleteGameDate(gameDate) || !note.trim() || (createsObligation && !newObligationReady)}
        >
          <Icon name="Scroll" size={14} />
          Add entry
        </button>
        {hasChanges && <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />}
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </form>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [knownResourceNames, setKnownResourceNames] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [settlementFilter, setSettlementFilter] = useState("");
  const [sortMode, setSortMode] = useState("gameDate"); // "gameDate" | "recent"
  const [error, setError] = useState(null);

  function load() {
    return Promise.all([
      getEvents({ type: typeFilter || undefined, settlement: settlementFilter || undefined, limit: 500 }),
      getObligations(),
    ]).then(([e, o]) => {
      setEvents(e);
      setObligations(o);
    });
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, settlementFilter]);

  useEffect(() => {
    getProjection("stats")
      .then((stats) => {
        const names = [...Object.keys(stats.resources), ...Object.keys(stats.assets), ...Object.keys(stats.society)];
        setKnownResourceNames(new Set(names));
      })
      .catch(() => {});
  }, []);

  if (error) return <div className="error-box">Failed to load the timeline: {error}</div>;
  if (!events) return <div className="loading">Loading the timeline…</div>;

  // Default (game date) matches this page's own purpose -- a chronological Campaign Timeline
  // -- but a freeform in-fiction date string that fails to parse, or gets accidentally stored
  // as a real-world date (a since-fixed Dashboard bug did this to a handful of existing
  // events), sorts however that bad parse happens to land -- sometimes far in the "future",
  // permanently burying whatever was actually just saved below it. `id` is assigned in save
  // order and can't be corrupted this way, so it's the reliable fallback for "what did I just
  // do," independent of how any event's game date parsed.
  const newestFirst = sortMode === "recent"
    ? [...events].sort((a, b) => b.id - a.id)
    : [...events].reverse();

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">The Chronicle</span>
          <h2>Campaign Timeline</h2>
        </div>
        <span className="pill accent">
          <Icon name="Scroll" size={13} />
          {events.length} events
        </span>
      </div>

      <NewEntryForm
        obligations={obligations.filter((o) => !o.satisfied)}
        knownResourceNames={knownResourceNames}
        onAdd={load}
      />

      <div className="section-title-row">
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            value={settlementFilter}
            onChange={(e) => setSettlementFilter(e.target.value)}
            placeholder="Filter by settlement"
            style={{ width: "12rem" }}
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            title="A mis-parsed or corrupted game date can sort an entry out of chronological order -- switch to Recently added to find it regardless"
          >
            <option value="gameDate">Sort: game date</option>
            <option value="recent">Sort: recently added</option>
          </select>
        </div>
      </div>

      {newestFirst.length === 0 ? (
        <div className="empty-state">No entries logged yet.</div>
      ) : (
        <div className="timeline">
          {newestFirst.map((entry) => (
            <div className="timeline-entry" key={entry.id}>
              <div className="timeline-marker" />
              <div className="card timeline-card">
                <div className="section-title-row">
                  <div>
                    <span className="icon-badge sm" style={{ marginRight: "0.4rem" }}>
                      <Icon name={EVENT_ICON[entry.type] || "Scroll"} size={13} />
                    </span>
                    <span className="pill accent">{entry.gameDate}</span>{" "}
                    <span className="pill">{entry.type}</span>{" "}
                    {entry.settlement && <span className="pill">{entry.settlement}</span>}
                    {entry.actor && <span className="pill">{entry.actor}</span>}
                  </div>
                  <span className="text-faint" style={{ fontSize: "0.78rem" }}>
                    posted {entry.postedAt}
                  </span>
                </div>
                {entry.type === "ResourceChanged" && Object.keys(entry.payload?.changes || {}).length > 0 && (
                  <div className="tag-row">
                    {Object.entries(entry.payload.changes).map(([res, val]) => (
                      <span key={res} className={`pill ${val >= 0 ? "good" : "bad"}`}>
                        <Icon name={res} size={12} />
                        {val >= 0 ? "+" : ""}
                        {val} {res}
                      </span>
                    ))}
                  </div>
                )}
                {entry.note && <p className="text-dim" style={{ marginTop: "0.6rem", fontSize: "0.88rem" }}>{entry.note}</p>}
                <WarningsList warnings={entry.warnings} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
