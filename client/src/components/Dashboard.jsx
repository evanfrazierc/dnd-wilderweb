import { useEffect, useState } from "react";
import { getProjection, getReference, getObligations, getObligation } from "../api.js";
import { useEventSubmit } from "../lib/useEventSubmit.js";
import { useReferenceSave } from "../lib/useReferenceSave.js";
import { useDraft } from "../lib/useDraft.js";
import Icon from "./Icon.jsx";
import WarningsList from "./WarningsList.jsx";
import PostToDiscordToggle from "./PostToDiscordToggle.jsx";
import GameDatePicker from "./GameDatePicker.jsx";
import { formatGameDate, isCompleteGameDate } from "../lib/gameDate.js";
import { parseChanges } from "../lib/parseChanges.js";

const RESOURCE_GROUPS = ["resources", "assets", "society"];

// Reference data (CONTEXT.md): edited directly, no event history. Adding an entry here
// seeds a zero-value resource_totals row (server/db/reference.js); removing one is
// refused server-side while its current value is nonzero.
function ResourceDefinitionsEditor({ definitions, onSaved }) {
  const { draft, dirty, set, addItem, removeItem } = useDraft(definitions);
  const { save, status } = useReferenceSave("resourceDefinitions", onSaved);

  function field(i, key, value) {
    set([i], { ...draft[i], [key]: value });
  }

  function addRow() {
    addItem([], () => ({ grp: "resources", name: "", description: "" }));
  }

  function removeRow(i) {
    removeItem([], i);
  }

  function saveDefinitions() {
    save(
      draft
        .filter((r) => r.name.trim())
        .map((r) => ({ grp: r.grp, name: r.name.trim(), description: r.description?.trim() || null })),
    );
  }

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name="Codex" size={17} />
        </span>
        <h3>Manage resources</h3>
      </div>
      <p className="text-faint" style={{ fontSize: "0.8rem" }}>
        Adding a resource starts it at 0; removing one is refused while its current value
        isn't 0 -- zero it out with a resource change first.
      </p>
      {draft.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "0 0 8rem" }}>
            Group
            <br />
            <select value={r.grp} onChange={(e) => field(i, "grp", e.target.value)} style={{ width: "100%" }}>
              {RESOURCE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label style={{ flex: "1 1 8rem" }}>
            Name
            <br />
            <input value={r.name} onChange={(e) => field(i, "name", e.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ flex: "2 1 14rem" }}>
            Description
            <br />
            <input value={r.description || ""} onChange={(e) => field(i, "description", e.target.value)} style={{ width: "100%" }} />
          </label>
          <button className="btn btn-sm btn-danger" onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn btn-sm" onClick={addRow}>
          <Icon name="Plus" size={14} />
          Add resource
        </button>
        {dirty && (
          <>
            <button className="btn btn-primary" onClick={saveDefinitions}>Save resources</button>
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function StatGroup({ title, icon, values, descriptions, onChange }) {
  return (
    <div className="card stat-group">
      <div className="stat-group-head">
        <span className="icon-badge">
          <Icon name={icon} size={18} />
        </span>
        <h3>{title}</h3>
      </div>
      {Object.entries(values).map(([key, value]) => {
        return (
          <div className="stat-row" key={key}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="stat-label" title={descriptions?.[key] || ""}>
                <Icon name={key} size={15} />
                <span className="name">{key}</span>
              </span>
            </div>
            <span className="stat-value">
              <button
                className="btn stepper"
                onClick={() => onChange(key, value - 1)}
                aria-label={`Decrease ${key}`}
              >
                −
              </button>
              <input
                type="number"
                value={value}
                onChange={(e) => onChange(key, Number(e.target.value))}
              />
              <button
                className="btn stepper"
                onClick={() => onChange(key, value + 1)}
                aria-label={`Increase ${key}`}
              >
                +
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Pay down an obligation with an actual resource transfer -- a ResourceChanged event carrying
// both the delta and obligationId (server/db/projections.js's applyResourceChanged), the same
// mechanism Timeline's "Settles an obligation" dropdown uses. This is the only thing that
// moves amountRemaining: CONTEXT.md's Obligation entry is explicit that what's owed and paid
// stays strictly a function of ResourceChanged events, never ObligationAmended (which only
// corrects description/dueGameDate/satisfied). Campaign news like any other resource change,
// so -- unlike Edit/Remove -- this keeps the normal Discord toggle.
function RepayObligationControl({ obligation, label, expanded, onExpand, onCollapse, onRepaid }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    setAmount("");
    setNote("");
    setGameDate(null);
    onRepaid();
  });

  const ready = Boolean(amount !== "" && Number(amount) > 0 && isCompleteGameDate(gameDate));

  function submitRepay() {
    if (!ready) return;
    submit({
      type: "ResourceChanged",
      gameDate: formatGameDate(gameDate),
      note: note.trim() || undefined,
      payload: {
        changes: { [obligation.repaymentResource]: -Number(amount) },
        obligationId: obligation.id,
      },
    });
  }

  if (!expanded) {
    return (
      <button className="btn btn-icon" onClick={onExpand} aria-label={`Repay ${label}`}>
        <Icon name="Scroll" size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
      <label className="text-faint" style={{ fontSize: "0.76rem", display: "block" }}>
        Repay ({obligation.repaymentResource}, up to {obligation.amountRemaining})
        <input
          type="number"
          min="1"
          max={obligation.amountRemaining}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          style={{ width: "100%", marginTop: "0.25rem" }}
        />
      </label>
      <label className="text-faint" style={{ fontSize: "0.76rem", display: "block" }}>
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", marginTop: "0.25rem" }}
        />
      </label>
      <div>
        <GameDatePicker value={gameDate} onChange={setGameDate} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-sm btn-primary" onClick={submitRepay} disabled={!ready}>
          Repay
        </button>
        <button className="btn btn-sm" onClick={onCollapse}>Cancel</button>
        <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </div>
  );
}

// Edit an obligation's description/due date. Its own useEventSubmit, same as Settlements'
// EditBuildingControl -- and, like that control, no Discord option: a correction, not
// campaign news (CONTEXT.md/ADR-0013). Mirrors EditBuildingControl's collapsed-icon-button
// shape so loans look and behave like every other modifiable entity on the site.
//
// `expanded`/`onExpand`/`onCollapse` are owned by ObligationRow (rather than local state) so
// it can keep this mutually exclusive with RepayObligationControl/RemoveObligationControl --
// with more than one able to expand independently, a building-row-width GameDatePicker plus a
// second one for "when did this edit happen" left the other controls' collapsed icons stranded
// on their own line below Save/Cancel on a narrow screen.
function EditObligationControl({ obligation, label, expanded, onExpand, onCollapse, onChanged }) {
  const [description, setDescription] = useState(obligation.description);
  const [newDueDate, setNewDueDate] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(() => {
    setGameDate(null);
    setNewDueDate(null);
    onChanged();
  });

  const descChanged = description.trim() !== obligation.description;
  const dueChanged = isCompleteGameDate(newDueDate);
  const dirty = descChanged || dueChanged;

  function save() {
    if (!isCompleteGameDate(gameDate)) return;
    const changes = {};
    if (descChanged) changes.description = description.trim();
    if (dueChanged) changes.dueGameDate = formatGameDate(newDueDate);
    if (Object.keys(changes).length === 0) return;
    submit({
      type: "ObligationAmended",
      gameDate: formatGameDate(gameDate),
      note: "Amended via the Dashboard",
      payload: { obligationId: obligation.id, changes },
      postToDiscord: false,
    });
  }

  if (!expanded) {
    return (
      <button className="btn btn-icon" onClick={onExpand} aria-label={`Edit ${label}`}>
        <Icon name="Codex" size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        style={{ width: "100%", fontSize: "0.8rem" }}
      />
      {/* Each date picker gets its own labeled, full-width row rather than sharing a line
          with the description/buttons -- a picker plus its clear button is wide enough on
          its own to crowd a mobile card when squeezed alongside anything else. */}
      <label className="text-faint" style={{ fontSize: "0.76rem", display: "block" }}>
        Due date
        <div style={{ marginTop: "0.25rem" }}>
          <GameDatePicker value={newDueDate} onChange={setNewDueDate} autoDefault={false} allowClear />
        </div>
      </label>
      {dirty && (
        <label className="text-faint" style={{ fontSize: "0.76rem", display: "block" }}>
          Recorded on
          <div style={{ marginTop: "0.25rem" }}>
            <GameDatePicker value={gameDate} onChange={setGameDate} />
          </div>
        </label>
      )}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        {dirty && (
          <button className="btn btn-sm btn-primary" onClick={save} disabled={!isCompleteGameDate(gameDate)}>
            Save
          </button>
        )}
        <button className="btn btn-sm" onClick={onCollapse}>Cancel</button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </div>
  );
}

// "Delete" an obligation. This app never hard-deletes campaign state (CONTEXT.md); forgiving
// a loan sets `satisfied` via the same ObligationAmended event the edit control uses, which
// drops it off this list (loaded with satisfied: false) without erasing the row or the
// resources it already granted -- same non-destructive shape as BuildingRemoved.
function RemoveObligationControl({ obligation, label, confirming, onConfirmStart, onCancel, onRemoved }) {
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings } = useEventSubmit(() => {
    setGameDate(null);
    onRemoved();
  });

  function confirmForgive() {
    if (!isCompleteGameDate(gameDate)) return;
    submit({
      type: "ObligationAmended",
      gameDate: formatGameDate(gameDate),
      note: "Forgiven via the Dashboard",
      payload: { obligationId: obligation.id, changes: { satisfied: true } },
      postToDiscord: false,
    });
  }

  if (!confirming) {
    return (
      <button className="btn btn-icon btn-danger" onClick={onConfirmStart} aria-label={`Forgive ${label}`}>
        <Icon name="Trash" size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
      <GameDatePicker value={gameDate} onChange={setGameDate} />
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-sm btn-danger" onClick={confirmForgive} disabled={!isCompleteGameDate(gameDate)}>
          Confirm forgiveness
        </button>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </div>
  );
}

function resourcesText(resources) {
  return Object.entries(resources || {}).map(([name, amount]) => `${amount} ${name}`).join(", ");
}

// GET /api/obligations/:id (server/index.js) returns originalResources, the creating event,
// and every settling event -- listObligations (what loads the summary row) doesn't carry any
// of that, so each row fetches its own detail separately rather than the list endpoint growing
// to carry every obligation's full history whether or not it's currently visible.
function ObligationDetails({ obligationId }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getObligation(obligationId).then(setDetail).catch((e) => setError(e.message));
  }, [obligationId]);

  if (error) return <p className="text-faint" style={{ fontSize: "0.8rem" }}>Failed to load details: {error}</p>;
  if (!detail) return <p className="text-faint" style={{ fontSize: "0.8rem" }}>Loading…</p>;

  const borrowed = resourcesText(detail.originalResources);

  return (
    <div style={{ width: "100%", marginTop: "0.5rem", fontSize: "0.82rem" }}>
      {borrowed && (
        <div className="text-faint">
          Borrowed: {borrowed}
          {detail.creatingEvent && ` on ${detail.creatingEvent.gameDate}`}
        </div>
      )}
      {detail.settlingEvents.length === 0 ? (
        <div className="text-faint" style={{ marginTop: "0.3rem" }}>No repayments logged yet.</div>
      ) : (
        <div style={{ marginTop: "0.3rem" }}>
          <div className="text-faint">Repayment history:</div>
          {detail.settlingEvents.map((e) => (
            <div key={e.id} className="text-faint" style={{ paddingLeft: "0.6rem" }}>
              {e.gameDate}: {-e.payload.changes[detail.repaymentResource]} {detail.repaymentResource}
              {e.note ? ` — ${e.note}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A plain wrapping .building-name div, not the always-visible single-line <input> this
// replaced -- that input couldn't wrap, which is what was clipping loan titles on mobile.
function ObligationRow({ obligation, onChanged }) {
  const [action, setAction] = useState(null); // null | "repay" | "edit" | "remove" -- see EditObligationControl's comment
  const pct = obligation.amountTotal > 0
    ? Math.min(100, ((obligation.amountTotal - obligation.amountRemaining) / obligation.amountTotal) * 100)
    : 0;
  const label = obligation.description;

  return (
    <div className="building-row" style={{ flexWrap: "wrap" }}>
      <span className={`icon-badge sm ${obligation.satisfied ? "good" : ""}`}>
        <Icon name={obligation.repaymentResource} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="building-name">{obligation.description}</div>
        <div className="meter good" style={{ marginTop: "0.3rem" }}>
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="text-faint building-detail">
          {obligation.amountTotal - obligation.amountRemaining} / {obligation.amountTotal} {obligation.repaymentResource} repaid
          {obligation.dueGameDate && ` · due ${obligation.dueGameDate}`}
          {obligation.satisfied && " · settled"}
        </div>
      </div>
      {(action === null || action === "repay") && obligation.amountRemaining > 0 && (
        <RepayObligationControl
          obligation={obligation}
          label={label}
          expanded={action === "repay"}
          onExpand={() => setAction("repay")}
          onCollapse={() => setAction(null)}
          onRepaid={() => {
            setAction(null);
            onChanged();
          }}
        />
      )}
      {(action === null || action === "edit") && (
        <EditObligationControl
          obligation={obligation}
          label={label}
          expanded={action === "edit"}
          onExpand={() => setAction("edit")}
          onCollapse={() => setAction(null)}
          onChanged={() => {
            setAction(null);
            onChanged();
          }}
        />
      )}
      {(action === null || action === "remove") && (
        <RemoveObligationControl
          obligation={obligation}
          label={label}
          confirming={action === "remove"}
          onConfirmStart={() => setAction("remove")}
          onCancel={() => setAction(null)}
          onRemoved={() => {
            setAction(null);
            onChanged();
          }}
        />
      )}
      <ObligationDetails obligationId={obligation.id} />
    </div>
  );
}

// Collapsed "+ Add loan" affordance, mirroring Settlements' AddBuildingForm. A loan is a
// ResourceChanged event carrying payload.newObligation (CONTEXT.md's Obligation entry: "the
// loan is the ResourceChanged event that creates the Obligation") -- no new server-side
// mechanism, just a dedicated entry point for the one Timeline's general-purpose form already
// supports as a bundled checkbox.
function AddLoanForm({ knownResourceNames, onAdded }) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [repaymentResource, setRepaymentResource] = useState("");
  const [amountTotal, setAmountTotal] = useState("");
  const [dueDate, setDueDate] = useState(null);
  const [changesText, setChangesText] = useState("");
  const [note, setNote] = useState("");
  const [gameDate, setGameDate] = useState(null);
  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    setDescription("");
    setRepaymentResource("");
    setAmountTotal("");
    setDueDate(null);
    setChangesText("");
    setNote("");
    setGameDate(null);
    setExpanded(false);
    onAdded();
  });

  const changes = parseChanges(changesText);
  const hasChanges = Object.keys(changes).length > 0;
  const unknownNames = knownResourceNames
    ? Object.keys(changes).filter((name) => !knownResourceNames.has(name))
    : [];
  // A loan is a ResourceChanged event (CONTEXT.md's Obligation entry) -- like Timeline's
  // equivalent checkbox, it needs at least one resource actually changing hands, not just a
  // debt recorded in the abstract (server/db/validate.js rejects an empty payload.changes).
  const ready = Boolean(
    description.trim() && repaymentResource.trim() && amountTotal !== "" && isCompleteGameDate(gameDate) && hasChanges,
  );

  function submitForm(e) {
    e.preventDefault();
    if (!ready) return;
    submit({
      type: "ResourceChanged",
      gameDate: formatGameDate(gameDate),
      note: note.trim() || undefined,
      payload: {
        changes,
        newObligation: {
          description: description.trim(),
          repaymentResource: repaymentResource.trim(),
          amountTotal: Number(amountTotal),
          dueGameDate: isCompleteGameDate(dueDate) ? formatGameDate(dueDate) : undefined,
        },
      },
    });
  }

  function cancel() {
    setDescription("");
    setRepaymentResource("");
    setAmountTotal("");
    setDueDate(null);
    setChangesText("");
    setNote("");
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <div className="add-building-form">
        <button type="button" className="btn btn-sm" onClick={() => setExpanded(true)}>
          <Icon name="Plus" size={14} />
          Add loan
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submitForm} className="add-building-form" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ flex: "2 1 14rem" }}
          autoFocus
        />
        <input
          placeholder="Repayment resource"
          value={repaymentResource}
          onChange={(e) => setRepaymentResource(e.target.value)}
          style={{ flex: "1 1 8rem" }}
        />
        <input
          type="number"
          placeholder="Amount owed"
          value={amountTotal}
          onChange={(e) => setAmountTotal(e.target.value)}
          style={{ flex: "1 1 8rem" }}
        />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "center" }}>
        <span className="text-faint" style={{ fontSize: "0.76rem" }}>Due date (optional):</span>
        <GameDatePicker value={dueDate} onChange={setDueDate} autoDefault={false} allowClear />
      </div>
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        Resources received
        <input
          value={changesText}
          onChange={(e) => setChangesText(e.target.value)}
          placeholder="e.g. +50 Wealth -- what the loan actually paid out"
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
        warnings={unknownNames.map((name) => `"${name}" isn't a known resource -- check spelling, or add it via Manage resources above`)}
      />
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <GameDatePicker value={gameDate} onChange={setGameDate} />
        <button className="btn btn-sm btn-primary" type="submit" disabled={!ready}>
          <Icon name="Plus" size={14} />
          Add loan
        </button>
        <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
        <button type="button" className="btn btn-sm" onClick={cancel}>Cancel</button>
        {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
      </div>
      <WarningsList warnings={warnings} />
    </form>
  );
}

function diffChanges(loaded, draft) {
  const changes = {};
  for (const group of ["resources", "assets", "society"]) {
    for (const key of Object.keys(draft[group] || {})) {
      const delta = draft[group][key] - loaded[group][key];
      if (delta !== 0) changes[key] = delta;
    }
  }
  return changes;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [draft, setDraft] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const [note, setNote] = useState("");
  const [definitions, setDefinitions] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [showResourceEditor, setShowResourceEditor] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    return getProjection("stats").then((s) => {
      setStats(s);
      setDraft(s);
    });
  }

  function loadDefinitions() {
    return getReference("resourceDefinitions").then(setDefinitions);
  }

  function loadObligations() {
    return getObligations({ satisfied: false }).then(setObligations);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    loadDefinitions().catch((e) => setError(e.message));
    loadObligations().catch((e) => setError(e.message));
  }, []);

  function onDefinitionsSaved() {
    loadDefinitions();
    load();
  }

  const { submit, status, warnings, postToDiscord, setPostToDiscord } = useEventSubmit(() => {
    load();
    setNote("");
  });

  function updateGroup(group, key, value) {
    if (Number.isNaN(value)) return;
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  }

  const dirty = stats && draft && JSON.stringify(diffChanges(stats, draft)) !== "{}";

  async function save() {
    // `stats.asOf` is real-world display metadata carried over from the original JSON import
    // (server/db/read.js's stats_meta, shown as the "As of ..." pill below) -- not a valid
    // in-fiction date. Falling back to it here once silently stored one as an event's
    // gameDate, which parseGameDate then read as a bare future year, permanently sorting
    // that event ahead of everything else. Require a real picked date instead, same as every
    // other save button in the app.
    if (!isCompleteGameDate(gameDate)) return;
    const changes = diffChanges(stats, draft);
    await submit({
      type: "ResourceChanged",
      gameDate: formatGameDate(gameDate),
      note: note.trim() || undefined,
      payload: { changes },
    });
  }

  function discardDraft() {
    setDraft(stats);
    setGameDate(null);
    setNote("");
  }

  if (error) return <div className="error-box">Failed to load stats: {error}</div>;
  if (!stats || !draft) return <div className="loading">Loading kingdom stats…</div>;

  const knownResourceNames = new Set([
    ...Object.keys(stats.resources),
    ...Object.keys(stats.assets),
    ...Object.keys(stats.society),
  ]);

  return (
    <div className="fade-in">
      <div className="page-header hero-header">
        <div>
          <span className="eyebrow">Kingdom Dashboard</span>
          <h2>{stats.settlement}</h2>
        </div>
        <div className="hero-meta">
          <span className="pill accent">
            <Icon name="Calendar" size={13} />
            As of {stats.asOf}
          </span>
          <button className="btn btn-sm" onClick={() => setShowResourceEditor(!showResourceEditor)}>
            {showResourceEditor ? "Hide" : "Manage"} resources
          </button>
        </div>
      </div>
      {showResourceEditor && definitions && (
        <ResourceDefinitionsEditor definitions={definitions} onSaved={onDefinitionsSaved} />
      )}

      <div className="section-title-row">
        <span className="text-faint" style={{ fontSize: "0.82rem" }}>
          Adjust values below, then commit them to the record as a resource change.
        </span>
      </div>

      <div className="grid grid-3">
        <StatGroup
          title="Resources"
          icon="Resources"
          values={draft.resources}
          descriptions={stats.resourceDescriptions}
          onChange={(k, v) => updateGroup("resources", k, v)}
        />
        <StatGroup
          title="Assets"
          icon="Main Settlement"
          values={draft.assets}
          descriptions={stats.assetDescriptions}
          onChange={(k, v) => updateGroup("assets", k, v)}
        />
        <StatGroup
          title="Society"
          icon="Loyalty"
          values={draft.society}
          descriptions={stats.societyDescriptions}
          onChange={(k, v) => updateGroup("society", k, v)}
        />
      </div>

      {dirty && (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <div className="stat-group-head">
            <span className="icon-badge">
              <Icon name="Scroll" size={17} />
            </span>
            <h3>Record this change</h3>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ flex: "0 0 auto" }}>
              Game date
              <br />
              <GameDatePicker value={gameDate} onChange={setGameDate} />
            </label>
            <label style={{ flex: "2 1 16rem" }}>
              Note
              <br />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened"
                style={{ width: "100%" }}
              />
            </label>
            <button className="btn btn-primary" onClick={save} disabled={!isCompleteGameDate(gameDate)}>
              <Icon name="Scroll" size={14} />
              Save changes
            </button>
            <button type="button" className="btn" onClick={discardDraft}>
              Cancel
            </button>
            <PostToDiscordToggle checked={postToDiscord} onChange={setPostToDiscord} />
            {status && <span className={`pill ${status.startsWith("Error") ? "bad" : "good"}`}>{status}</span>}
          </div>
          <WarningsList warnings={warnings} />
        </div>
      )}

      <div className="section-header">
        <h3>Loan Repayment</h3>
        <div className="rule" />
      </div>
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        {obligations.length === 0 && (
          <div className="empty-state" style={{ padding: "1.25rem" }}>
            The kingdom is debt-free.
          </div>
        )}
        <div className="building-list">
          {obligations.map((o) => (
            <ObligationRow key={o.id} obligation={o} onChanged={() => { load(); loadObligations(); }} />
          ))}
        </div>
        <AddLoanForm knownResourceNames={knownResourceNames} onAdded={() => { load(); loadObligations(); }} />
      </div>

      {stats.annualIncomeUpkeep && (
        <>
          <div className="section-header">
            <h3>Annual Income &amp; Upkeep</h3>
            <div className="rule" />
          </div>
          <p className="text-dim" style={{ fontSize: "0.82rem" }}>
            Computed from currently-built buildings' known annual effects and the garrison's
            unit upkeep. Excludes anything dice-based, player-invoked, or population-scaled
            (e.g. a Mill's farm bonus, or Population's own food consumption). Edit a building's
            annual effect, or a unit's upkeep, in its catalog to include more.
          </p>
          {stats.annualIncomeUpkeep.lines.length === 0 ? (
            <div className="empty-state">No buildings or units with a known annual effect yet.</div>
          ) : (
          <div className="grid grid-2 ledger-grid">
            {stats.annualIncomeUpkeep.lines.map((line) => (
              <div key={line.resource} className="card ledger-line">
                <span className={`icon-badge sm ${line.net >= 0 ? "good" : "bad"}`}>
                  <Icon name={line.resource} size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stat-label">
                    <span className="name">{line.resource}</span>
                  </div>
                  {line.breakdown.map((b, i) => (
                    <div key={i} className="text-faint" style={{ fontSize: "0.78rem" }}>
                      {b}
                    </div>
                  ))}
                </div>
                <div className={line.net >= 0 ? "stat-delta-pos" : "stat-delta-neg"}>
                  <Icon name={line.net >= 0 ? "ArrowUp" : "ArrowDown"} size={14} />
                  {line.net >= 0 ? "+" : ""}
                  {line.net}
                </div>
              </div>
            ))}
          </div>
          )}
        </>
      )}
    </div>
  );
}
