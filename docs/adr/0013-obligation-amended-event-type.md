# ObligationAmended: a 9th event type, and how the CHECK constraint migrated

Obligations had no way to correct themselves after creation -- `server/db/obligations.js` only
ever exposed `createObligation`, and later `ResourceChanged` events could pay one down but never
touch its `description` or `due_game_date`. A DM noticed the one real obligation in the database
still literally said "(history.json id 49)" in its description, migrated verbatim from the
original JSON import with no way to fix it short of editing the database directly.

## A new event type, not a variant of an existing one

ADR-0004 says don't grow the taxonomy for a variant of an existing type -- but correcting a
debt's terms isn't a variant of anything already in the taxonomy. Buildings, Deities, and
Kingdoms each got their own `*Amended` type for exactly this "fix a static field on an existing
first-class thing" need; Obligation is equally first-class (CONTEXT.md) and was the one entity
that hadn't caught up. `ObligationAmended`'s `payload` is `{obligationId, changes}`, mirroring
`DeityAmended`/`LocationAmended` down to the merge-partial-changes-onto-existing projection logic.

**Deliberately narrow**: `changes` can only touch `description` and `dueGameDate`. `amountTotal`,
`amountRemaining`, and `repaymentResource` stay entirely governed by the `ResourceChanged` events
that created the obligation and are paying it down -- letting this event touch them would mean
two different mechanisms could both claim to say what's owed, and retroactively changing a total
after partial payment raises questions (does the remaining balance shrink or grow?) with no
answer that's obviously right. Not worth the ambiguity for a feature request that only asked for
clerical corrections.

## The CHECK constraint migration

`events.type`'s `CHECK (type IN (...))` list lives in `schema.sql`, but `CREATE TABLE IF NOT
EXISTS` can't retroactively widen a CHECK constraint on a table that already exists -- this
project's local dev database, and production once deployed, both already have an `events` table
built from the 8-value list. SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`; the only way to
change one is the standard rebuild: create a new table with the desired constraint, copy every
row across, drop the old table, rename the new one into place, recreate its indexes (dropped
along with the old table). `ensureObligationAmendedEventType` (`server/db/connection.js`) does
exactly this, gated on inspecting the live table's own `sqlite_master` CREATE-TABLE text rather
than a version counter -- so it's a safe no-op forever after the one time each database actually
needs it, and runs automatically the next time each database's server boots (local immediately,
production on its next deploy). Foreign keys are held off for the swap since `obligations
.created_by_event_id` points at this table and `DROP TABLE` isn't the kind of change `ON
DELETE`/`ON UPDATE` actions are meant to intercept.

This is the first time an event type has been added since the original schema; the same
rebuild-and-swap technique is the template for the next one.
