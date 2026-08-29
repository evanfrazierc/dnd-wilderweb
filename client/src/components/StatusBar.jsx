import { useEffect, useState } from "react";
import { getProjection, getEvents } from "../api.js";
import Icon from "./Icon.jsx";
import { currentMonth, formatDate, seasonColor } from "../lib/campaign.js";

export default function StatusBar() {
  const [calendar, setCalendar] = useState(null);
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    getProjection("calendar").then(setCalendar).catch(() => {});
    getProjection("stats").then(setStats).catch(() => {});
    getEvents({ limit: 500 })
      .then((events) => setLatest(events.at(-1) ?? null))
      .catch(() => {});
  }, []);

  const month = currentMonth(calendar);
  const season = month?.season;

  const unrest = stats?.society?.Unrest;
  const population = stats?.assets?.Population;
  const unrestHigh = typeof unrest === "number" && typeof population === "number" && unrest >= population && unrest > 0;

  return (
    <header className="status-bar">
      <div className="status-item status-date">
        <span className="icon-badge sm accent-tone">
          <Icon name="Calendar" size={15} />
        </span>
        <div>
          <div className="status-value">{calendar ? formatDate(calendar) : "—"}</div>
          <div className="status-caption">{calendar?.currentDate?.yearLabel}</div>
        </div>
      </div>

      {season && (
        <span className="season-tag" style={{ "--season-color": seasonColor(season) }}>
          <Icon name={season} size={13} />
          {season}
        </span>
      )}

      <div className="status-spacer" />

      {unrestHigh && (
        <span className="pill bad" title="Unrest has reached the population count — rebellion risk">
          <Icon name="Unrest" size={13} />
          Unrest at threshold
        </span>
      )}

      {latest && (
        <div className="status-item status-recent" title={latest.note || ""}>
          <span className="icon-badge sm muted">
            <Icon name="Scroll" size={14} />
          </span>
          <div>
            <div className="status-caption">Latest entry</div>
            <div className="status-value status-recent-title">{latest.note || latest.type}</div>
          </div>
        </div>
      )}
    </header>
  );
}
