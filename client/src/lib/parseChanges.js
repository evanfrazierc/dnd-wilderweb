// Shared by Timeline's "log a new entry" resource-changes field and Dashboard's "add a loan"
// form -- both accept the same free-text "-1 Wood, +2 Wealth" syntax for a resource delta map.
export function parseChanges(text) {
  const changes = {};
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^([+-]?\d+)\s+(\w+)$/);
      if (match) changes[match[2]] = Number(match[1]);
    });
  return changes;
}
