# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people: the DM (primary) and a co-DM/collaborator, both of whom make edits -- recording
resource changes, buildings, calendar advances, deity/location updates -- not just viewing.
Players in the Wilderweb tabletop campaign are not confirmed users of the app itself; they follow
campaign news through the Discord channel the app posts to (the per-save "Post to Discord"
toggle), not through the web app.

## Product Purpose

Tracks the evolving state of a Kingmaker-style D&D hexcrawl/kingdom-building campaign (resources,
buildings, the in-game calendar, deities, and world locations) as an event log rather than a
mutable spreadsheet, so every change has a "why" and a "when" attached to it, not just a "what."
Success is an accurate, auditable record the DMs can trust and update quickly during or between
sessions.

## Positioning

Not a generic campaign-tracker product -- a bespoke tool for one specific campaign (see Operating
Context). Its defining mechanism, event-sourcing with derived projections (ADR-0001) rather than
overwriting current-state fields directly, is what a simpler spreadsheet or Discord thread can't
offer: a real history of how the kingdom got to its current numbers, with warnings (not blocks) on
values that look wrong (ADR-0005).

## Operating Context

Used around tabletop sessions of the "Wilderweb" campaign -- a homebrew, Kingmaker-inspired
hexcrawl set in the Wilderlands, run out of the settlement Stirling Reach. The DMs update it as
things happen at the table (or from notes after), then optionally post a formatted summary to the
campaign's Discord server via a per-save "Post to Discord" toggle (ADR-0006) so players see
campaign news without needing the app themselves.

## Capabilities and Constraints

- No accounts/login (ADR-0003): "actor" is a free-text name, not an authenticated identity.
  Auditability was the goal, not access control.
- Two known writers today; if that changes, distinct write permissions would need real auth,
  which doesn't exist yet.
- Hosted on Render's free tier with a Turso (libSQL) database (ADR-0007) -- chosen for a
  persistent, always-on, no-credit-card option comfortably sized for "a two-person campaign
  tracker."
- Validation warns rather than blocks (ADR-0005): a DM correcting or recording an in-fiction
  exception (e.g. a building without its usual prerequisite) shouldn't be locked out of saving it.

## Brand Commitments

- Product name: "Wilderweb" / "Wilderweb Kingdom Tracker" (browser tab title).
- In-fiction names already committed by play: "the Wilderlands" (the party's home area), the
  settlement "Stirling Reach," the "Valusian Era" calendar era, and the deity/kingdom/settlement
  names already recorded in the Codex and Settlements data. These are existing campaign facts,
  not up for redesign.
- Built specifically for the Wilderweb campaign (confirmed) -- no requirement to keep it generic
  or reusable for a future, different campaign.

## Evidence on Hand

Real campaign data already lives in the database: about 100 recorded events, a populated building
catalog, 9+ settlements, a full deity pantheon, and a calendar structure with named months/holidays
(see the Settlements, Codex, and Calendar views). No testimonials, press, or marketing assets
exist or are needed -- this isn't a marketed product.

## Product Principles

1. History over overwrites: every campaign-state change is an event with a date and (often) a
   note attached, not a silent field update.
2. Warn, don't block: in-fiction validity checks (unmet prerequisites, negative resources)
   surface warnings, not hard failures -- a DM's judgment call outranks the app's.
3. Small and trusted, not access-controlled: two known DMs edit; scope stays small enough that
   free-text attribution is enough, not a login system.
4. Campaign news optionally reaches players via Discord, not by asking them to use the app.
5. Built for this one campaign: in-fiction names, structure, and lore can be assumed stable
   rather than treated as user-configurable.

## Accessibility & Inclusion

No specific requirement established; keep to reasonable defaults (contrast, keyboard/focus
behavior) rather than designing to a formal standard.
