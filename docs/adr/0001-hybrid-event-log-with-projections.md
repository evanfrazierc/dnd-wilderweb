# Event log with transactional projections, not full replay

Campaign state (resources, buildings, calendar, deities, locations) needs full history, not just current values. We're storing the event log as the authoritative record, but current-state tables are written transactionally alongside each event rather than recomputed by replaying the full log on every read. Full replay-based event sourcing was considered and rejected: it's more machinery than a single-DM hobby tracker needs, and a transactional projection gives the same auditability with simpler reads.
