import Icon from "./Icon.jsx";

export default function WarningsList({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="warning-list">
      <strong>
        <Icon name="Unrest" size={13} /> {warnings.length === 1 ? "Warning" : `${warnings.length} warnings`}
      </strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
