// Paired with useEventSubmit.js's postToDiscord/setPostToDiscord -- one line per save form
// instead of a hand-rolled checkbox+label in each (see the architecture review's note on
// duplicated save-form furniture).
export default function PostToDiscordToggle({ checked, onChange }) {
  return (
    <label className="text-faint" style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Post to Discord
    </label>
  );
}
