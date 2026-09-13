# A Timeline entry's hidden flag is a direct update, not an event

Every mutation in this app so far goes through the event log -- correcting a building's display
name is a `BuildingAmended` event, forgiving a loan is an `ObligationAmended` event, even fixing a
typo in a deity's title is a `DeityAmended` event. Nothing has ever been changed in place. Adding
"hide this Timeline entry" as a feature raised the obvious question: does hiding/unhiding also
need its own event type, to stay consistent?

## Decision

No. `events.hidden` is a plain column, flipped directly by `PATCH /api/events/:id/hidden` (
`server/db/events.js`'s `setEventHidden`), not recorded as a new event referencing the one it
affects.

The distinction that matters: every existing event type describes a fact about the campaign --
what got built, what a deity's title is, what's owed on a loan. `hidden` isn't a campaign fact.
It doesn't change what happened, when, or what any projection shows; it only changes whether the
Timeline lists this entry by default. It's closer in kind to reference data (CONTEXT.md: "edited
directly, with no event history") than to campaign state, even though it lives on the one table
that's supposed to be append-only for everything else.

Making it an event instead would have created a stranger problem than the one it solved: an
`EntryHidden` event pointing at another event would itself show up in the Timeline, needing its
own visibility, and hiding *that* would need another event, and so on. The feature is meant to
declutter a personal view of history, not add to the history being decluttered.

## What this means in practice

- `listEvents` (`server/db/events.js`) filters `hidden = 0` unless `includeHidden: true` is
  passed -- hidden entries are excluded by default, not merely flagged, matching "hidden by
  default" rather than "hidden entries need an explicit filter to exclude."
- `includeHidden: true` shows *both* hidden and unhidden together (there's no hidden-only view) --
  Timeline's "Show hidden" toggle is additive, not a replacement filter.
- No reason/note field for why something was hidden. If that turns out to matter, it's a small
  addition to the same row, not a reason to revisit this decision.
- `StatusBar`'s "latest entry" badge is unaffected -- it's about what actually happened most
  recently, not about what the Timeline chooses to list by default.
