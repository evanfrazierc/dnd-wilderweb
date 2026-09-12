# Every gameDate/dueGameDate must be canonically formatted, enforced at write time

Until now `createEvent` accepted any string at all for `gameDate` (and `createObligation` for
`dueGameDate`) -- `parseGameDate` (`server/db/gameDate.js`) is deliberately best-effort and never
throws, so a bare year, a typo, or empty text all got written straight into the event log. A
separate, later pass (`ensureConsistentDateFormatting`, `server/db/connection.js`) re-serializes
whatever it finds on every DB boot, but that's cleanup after the fact, not a gate -- and it
explicitly declines to touch a bare year (nothing to build a real date from) or, until now, a
month range.

Migrating `wilderlands-discord-export.txt` (`.scratch/discord-seed/`) surfaced how much this
gap could accumulate: 52 of 99 events came out of that migration with a bare-year or range
`gameDate` at one point, some from genuine source ambiguity, several from a placeholder this
migration script fell back to rather than because the DM never recorded a real date. Cross-
referencing the discord export by hand recovered a real date for all but a handful, and the
gap itself was worth closing structurally, not just for this one import.

## Decision

`gameDate` (every event) and `dueGameDate` (`ResourceChanged.payload.newObligation.dueGameDate`,
`ObligationAmended.payload.changes.dueGameDate`) must match exactly one shape from here on:
`"MonthName (N), <day><suffix>, <year>"` -- e.g. `"Erastus (2), 9th, 1227"`. This is already what
`GameDatePicker`/`formatGameDate` (`client/src/lib/gameDate.js`) always produce, so no UI flow
that already uses the picker is affected; this closes the gap for anything that bypasses it
(direct API calls, migration scripts, hand-authored fixtures).

Enforced in `validateShape` (`server/db/validate.js`, via `isCanonicalGameDate`,
`server/db/gameDate.js`) -- **blocking**, a 400, not a `checkWarnings` warning. This looks like it
cuts against ADR-0005 ("validation warns, never blocks"), but it doesn't: ADR-0005 is about
whether the *in-game state* an event describes is plausible (a resource going negative, a
prerequisite missing) -- the DM's authority over what happened at the table. A malformed date
string isn't a fact about the campaign the DM might deliberately want on record; it's the same
kind of structural defect `validateShape` already blocks on (`payload.building` missing, an empty
`changes` object). `createObligation` (`server/db/obligations.js`) gets the same check directly,
since migration scripts call it without going through `createEvent`/`validateShape` at all.

`canonicalizeGameDate` (`server/db/gameDate.js`) re-serializes any string `parseGameDate`
recognizes into this shape, given a month-name lookup -- shared by `ensureConsistentDateFormatting`
(cleaning up existing rows) and `scripts/migrate.js` (canonicalizing `history.json`'s day-precise
entries before they ever reach `createEvent`, so the migration doesn't fail its own new gate).

**A day the source never recorded becomes day 1** -- an explicit, uniformly-applied placeholder,
not a claim that anything happened specifically on the 1st. Documented per call site (a code
comment, or a `note` on the event/obligation) wherever it's used, so "day 1" reads as "unknown,
not sourced" rather than a fabricated fact. This is a deliberate, smaller assumption than the one
thing that's still refused outright: **a bare year, with no month recorded at all, is never
auto-completed to a specific month.** Guessing a day within a known month is a small, uniform,
clearly-flagged gap-fill; guessing a month that was never written down anywhere is fabricating a
fact, not filling a placeholder. A bare year (or a month number the campaign's calendar doesn't
name) still fails `isCanonicalGameDate` and has to be resolved by a human, the way
`scripts/migrate.js`'s `SETTLEMENT_BUILD_DATES` table and `data/history.json` ids 33-36 were --
by reading the source and picking the most defensible real date, not by a generic rule.

## What changes

- `server/db/gameDate.js`: adds `isCanonicalGameDate` (the gate) and `canonicalizeGameDate` (the
  re-serializer, given a month-name map). `parseGameDate` itself is unchanged and stays lenient
  -- it still has to make sense of every shape already sitting in the database.
- `server/db/validate.js`: `validateShape` now takes `gameDate` and blocks on a non-canonical one
  for every event type, plus `newObligation.dueGameDate` and `ObligationAmended`'s
  `changes.dueGameDate` specifically.
- `server/db/obligations.js`: `createObligation` throws on a non-canonical `dueGameDate` as a
  second gate, since it has a caller (`scripts/migrate.js`) outside `createEvent`.
- `server/db/connection.js`: `ensureConsistentDateFormatting` now delegates its re-serialization
  to the shared `canonicalizeGameDate` instead of a local duplicate, and as a result now also
  normalizes a month-range date (it used to leave that one shape alone).
- `scripts/migrate.js`: every date it writes is now canonical at the source -- real month names
  (via a `calendar.json`-derived lookup) instead of a bare `"Month N"`, per-building construction
  dates recovered from the discord export instead of a single placeholder, `data/history.json`
  ids 33/34/35/36 hand-corrected with the most defensible date the source supports (see the
  script's own comments and `.scratch/discord-seed/findings.md`).
- Test fixtures across `test/db/events.test.js`, `test/db/obligations.test.js`, and
  `test/server/events.test.js` updated to use canonical dates -- these were exercising unrelated
  behavior and used bare years/`"Month N"` as minimal shorthand, which the new gate now rejects.

## What doesn't change

`parseGameDate` stays best-effort and permissive -- it's still the thing that has to make sense
of every date already on record, canonical or not. Nothing here retroactively rewrites existing
rows beyond what `ensureConsistentDateFormatting` already did (a display re-serialization, never
a change to what date is actually represented) plus the specific, hand-researched corrections to
`data/history.json` described above.
