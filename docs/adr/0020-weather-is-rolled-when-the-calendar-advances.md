# ADR-0020: Weather is rolled server-side when the calendar advances

## Status

Accepted.

## Context

The campaign wanted automatic weather: each time the in-game date moves, roll a d6 and read a
per-season table (Spring/Summer/Autumn/Winter each weight the same conditions differently --
Spring can storm, Winter can blizzard, Summer can bake). Three questions had to be settled
before writing any of it.

**Who rolls.** The client could roll and send the result, since it already loads the calendar
structure and knows the season. But the die would then be whatever the browser said it was, and
the roll's inputs (which table, which season) would live on one side of the wire while the
record of the outcome lived on the other.

**Where the outcome lives.** Weather could be derived on read -- "today is Spring, so roll
something" -- which needs no storage at all. It would also mean the weather changed every time
anyone refreshed the Calendar page, and that last session's storm was unrecoverable. Weather is
a fact the table reacts to; it has to be as durable as every other campaign fact here.

**Whether the table is code or data.** The DM supplied four tables but described them as
"something like this," which is a strong hint they'll get retuned after a few sessions in play.

## Decision

`createEvent` rolls the weather itself, server-side, for `CalendarAdvanced` events only, and
writes the result into that event's own `payload.weather` as `{season, roll, condition}` --
the one place in this codebase where a stored payload gains a field the caller didn't send.
`calendar_state` projects it onto two last-write-wins columns (`weather`, `weather_roll`)
exactly like the date itself, so "today's weather" is a plain projection read (ADR-0001) and
"what was the weather that day" is a plain event read.

An explicit `payload.weather` on the way in is kept verbatim and never re-rolled. That's what
makes two things work: the DM overriding the die for a session they've already planned around
(the Calendar form's weather dropdown, which sends a condition and no `roll`), and any future
re-import of historical events not inventing new weather for dates that already happened.

The tables are reference data (CONTEXT.md), stored under `campaign_meta`'s `weather_tables`
key and edited from the Calendar page's existing "Manage calendar structure" panel. They ride
along as the `weather` field of the `calendarStructure` reference resource rather than becoming
a resource of their own, because the table's keys are exactly the season names that same
resource's month rows assign -- renaming a season and retuning its weather should be one save,
not two that can disagree. A read with nothing stored returns the DM's starting tables as
defaults, so rolling works on a fresh database with no seeding step.

A month with no season, or a season with no table, rolls nothing: the advance still saves and
the weather reads as absent rather than blocking the date change (ADR-0005's spirit -- an
unfinished calendar is a warning-shaped problem at most, not a wall).

## Consequences

- Weather is history. The Timeline shows the condition on the advance that rolled it, and the
  Discord embed announces it, which is the only way players learn what the sky is doing.
- A re-roll means a new `CalendarAdvanced` event, by construction. There is deliberately no
  "re-roll today's weather" button: events are immutable (CONTEXT.md), and the DM's escape
  hatch for an unwanted roll is to pick the condition they wanted instead.
- `weather_roll` is NULL for a hand-picked condition, which is how the UI knows not to show a
  die face that was never thrown.
- Advancing into a season-less month clears the previous date's weather rather than leaving it
  on screen looking current.
- The die is the table: a six-entry table is a d6. The reference write refuses any season whose
  list isn't exactly six entries, so the odds the DM wrote down are the odds they get.
