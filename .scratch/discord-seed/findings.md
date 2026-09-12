# Discord export reconciliation

Source: `wilderlands-discord-export.txt` -> `.scratch/discord-seed/messages.json` (117 messages,
15 channels). Compared against the current `data/*.json` / database, channel by channel.

## Already captured -- do not reimport

- **stats-bookkeeping** (26 msgs) + **build-orders** (10 msgs): `data/history.json`'s 49 entries
  are a hand transcription of exactly these two channels (each entry even records its source
  `channel`). Replaying them again would double every resource delta.
- **loan** (1 msg): the Merchant Guild loan is `history.json` id 49 / `obligations.json` id 1.
- **religions** (1 msg): `data/deities.json` already has all 9 named deities plus 8 more inferred
  from the calendar's holy days -- one entry (`Melora`) even has the note "not yet listed in the
  religions channel", so this cross-referencing already happened.
- **locations** (1 msg): the 4 kingdoms (Casdenia/capital Casdenor, Galderoy, Ravenstone/capital
  Ravenstone, Tremund) match `data/locations.json` exactly. `Olen's Rest` is already a Region
  (`data/regions.json` id 10) assigned to Kingdom of Casdenia.
- **calendar** (1 msg): `data/calendar.json`'s `currentDate.note` literally says `Marked in the
  calendar channel as "You are here"` -- already transcribed, including all 12 months' holidays.
- **construction** (2 msgs): the 45-building catalog matches `data/buildings.json` exactly; the
  "CURRENT BUILDINGS" per-region list matches the already-migrated `BuildingConstructed` events.
- **introduction** (1 msg): matches `data/introduction.json`.
- **current-stats** (1 msg, posted 7/4/2026): an earlier resource snapshot, superseded by later
  `stats-bookkeeping` entries already in the ledger (`Wealth 25` there vs. `11` now checks out --
  Month 6-12 1226 market exchanges and the loan paydown happened after this snapshot was posted).

## Drafted (see `draft-events.json`)

- **diplomatic-ties** (1 msg): Casdenia (Sovereign/vassal, with Arnestal/Carthrun/Hornstead
  sub-relations) and Ravenstone (Rival) have no `note` set on their Kingdom records yet. Drafted
  as two `LocationAmended` events.

## No home in the current schema -- flagging, not drafting

- **diplomatic-ties**'s "Boar King: Rival" -- not a registered Kingdom, and CONTEXT.md defines
  Kingdom narrowly as "a realm on the world map." Creating one for a rival faction/individual is
  a judgment call, not mine to make silently. Options: skip it, fold it into a Kingdom's note as
  a rival-faction mention, or treat it as a genuinely new Kingdom -- your call.
- **garrison** (1 msg): unit costs/rules and current counts (Militia 3, Troop 1, their upkeep).
  Nothing in the tracked resource/asset/society list represents military units -- would need a
  new domain concept, not just new data.
- **discussion-and-planning**'s council seat assignments (Captain of the Guard -- Kaelen, etc.):
  no current concept for this either.
- **adventure-discussion**: the Charter of the Wilderlands (a founding legal document) and the
  Countess's gifted cloaks (an item with a mechanical effect) -- lore/inventory, no current home.
- **note-sharing** (8 msgs) and the rest of **adventure-discussion**: session narrative recaps.
  `DMRuling` is scoped to "a DM clarification or correction" (CONTEXT.md), and even migrate.js's
  broader "no resource changes -> DMRuling" precedent was only ever applied to the DM's own
  curated `history.json` entries, not full player-written session recaps. Treating these as
  `DMRuling` events would stretch the type past what it's for.
- **general** (38 msgs): pure scheduling logistics ("Tuesday the 12th?"). No game-state value.

## Recommendation

Review `draft-events.json` (2 events) and, if it looks right, I can post them through
`POST /api/events` the normal way. Everything else above either needs no action or needs a
decision about extending the domain model before there's anything to draft.
