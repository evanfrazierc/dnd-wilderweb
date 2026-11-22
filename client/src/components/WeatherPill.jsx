import Icon from "./Icon.jsx";
import { weatherColor } from "../lib/campaign.js";

/**
 * The current date's weather, as the same chip shape as the season tag it sits beside (see
 * .season-tag/.weather-tag in index.css) -- used by both the Calendar hero and the StatusBar,
 * so the two can't drift on how a condition reads.
 *
 * `weather` is the projection's `currentDate.weather`: { condition, roll }, or null on a date
 * advanced before weather existed or in a month with no season, in which case this renders
 * nothing rather than an empty chip. A null `roll` means the DM picked the condition by hand
 * (docs/adr/0020), so the die's face is only ever shown when a die was actually involved.
 */
export default function WeatherPill({ weather, size = 13 }) {
  if (!weather?.condition) return null;

  const { condition, roll } = weather;
  const title = roll != null
    ? `Rolled ${roll} on the season's weather table`
    : "Set by the DM, not rolled";

  return (
    <span className="weather-tag" style={{ "--season-color": weatherColor(condition) }} title={title}>
      <Icon name={condition} size={size} />
      {condition}
      {roll != null && <span className="weather-roll">{roll}</span>}
    </span>
  );
}
