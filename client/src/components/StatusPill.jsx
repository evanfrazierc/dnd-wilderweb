// One place for the "Saving.../Saved./Error: ..." pill duplicated across every save form
// (see useEventSubmit.js's own note on shared save-form furniture) -- also the one place
// its entrance motion lives, so every save in the app acknowledges itself the same way
// without 20+ call sites each needing their own animation class.
export default function StatusPill({ status }) {
  if (!status) return null;
  return (
    <span className={`pill status-pill ${status.startsWith("Error") ? "bad" : "good"}`}>
      {status}
    </span>
  );
}
