import { useEffect, useState } from "react";
import { getProjection, getEvents } from "../api.js";
import Icon from "./Icon.jsx";
import { currentMonth, formatDate, seasonColor } from "../lib/campaign.js";
import { EVENT_ICON } from "../lib/eventIcon.js";
import { summarizeEvent } from "../lib/eventSummary.js";

export default function StatusBar() {
  const [calendar, setCalendar] = useState(null);
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    function load() {
      getProjection("calendar").then(setCalendar).catch(() => {});
      getProjection("stats").then(setStats).catch(() => {});
      getEvents({ limit: 500 })
        // listEvents (server/db/events.js) orders by in-game date, not save time, so the
        // array's last element is whichever event has the latest *fictional* date -- often
        // not what was just saved (a backfilled correction, or any entry dated earlier than
        // an existing far-future one, would otherwise get stuck here permanently). `id` is
        // assigned in save order, so the highest id is the one actually most recently saved.
        .then((events) => {
          const mostRecent = events.reduce((latest, e) => (!latest || e.id > latest.id ? e : latest), null);
          setLatest(mostRecent);
        })
        .catch(() => {});
    }
    load();
    // Every save (any page, any event type) broadcasts this -- see useEventSubmit.js.
    // Without it, this header only ever reflected whatever was true when the app
    // first loaded, regardless of what got saved afterward.
    window.addEventListener("wilderweb:event-saved", load);
    return () => window.removeEventListener("wilderweb:event-saved", load);
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
          <div className="status-value">{calendar ? formatDate(calendar) : "-"}</div>
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
        <span className="pill bad unrest-alert" title="Unrest has reached the population count: rebellion risk">
          <Icon name="Unrest" size={13} />
          Unrest at threshold
        </span>
      )}

      {latest && (
        <div className="status-item status-recent" title={latest.note || latest.type}>
          <span className="icon-badge sm muted">
            <Icon name={EVENT_ICON[latest.type] || "Scroll"} size={14} />
          </span>
          <div>
            <div className="status-caption">Latest entry</div>
            <div className="status-value status-recent-title">{summarizeEvent(latest)}</div>
          </div>
        </div>
      )}
    </header>
  );
}
