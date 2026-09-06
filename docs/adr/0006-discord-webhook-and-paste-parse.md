# Discord: webhook out, paste-and-parse in, no bot for v1

Outbound notifications use a plain incoming webhook, not a bot, so there's no always-on gateway process to host. Inbound import is a manual paste-and-parse flow, not a bot reading channels automatically, so a human reviews every parsed draft before it's saved — the existing history already includes DM rulings that override the raw numbers, and automated ingestion would bypass exactly that judgment. Both are deliberately narrower than a full bot integration, which may be built later if the manual flow becomes a bottleneck.

## Outbound webhook: implemented, per-save and DM-controlled

The outbound half is built (`server/discord.js`), but not as "notify automatically after every event" as originally sketched: the DM ticks a "Post to Discord" checkbox on each save (`client/src/lib/useEventSubmit.js`, defaulted on), and only that save's event gets posted. This was a deliberate choice once the tool moved to live, in-session use — the DM needed to be able to record a correction or a test value without it going out to the table. Posting is best-effort and never blocks the save (same spirit as ADR-0005): if `DISCORD_WEBHOOK_URL` isn't set, or the webhook call fails, the event is still saved and the client is told so (`"Discord not configured."` / `"Discord post failed: ..."`), never a hard error.

Scope is Campaign state events only (`ResourceChanged`, `BuildingConstructed`, `BuildingRemoved`, `CalendarAdvanced`, `DeityAmended`, `LocationAmended`, `DMRuling`) — Reference data edits (building catalog, resource definitions, calendar structure, introduction) have no "post to Discord" option, since they aren't things that happened in the campaign (CONTEXT.md's Campaign state vs. Reference data split).

Messages are Discord embeds, one per event type (`buildEmbed` in `server/discord.js`), not plain text — title and color keyed by event type, fields shaped to that type's payload (e.g. resource deltas for `ResourceChanged`, the building name for `BuildingConstructed`), plus the note/actor/region when present.

The inbound paste-and-parse half described above remains unimplemented.
