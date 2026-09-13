# The map's image lives outside the event it belongs to, attached in a follow-up step

A DM-uploaded map image (the world map with only explored regions revealed, updated after each
session) needed a home. Two things about it don't fit the pattern every other event follows:

1. **It's large** (campaign screenshots already floating around this project run 6-7MB) and
   **binary**, where every existing event's `payload` is a small JSON fact.
2. **Production has no persistent disk** to save an uploaded file to (ADR-0007's whole reason for
   moving off a local SQLite file to Turso was Render's free tier offering none) -- the database
   is the only durable store this app has, so the image has to end up there.

## Decision

**`MapUpdated`** is a new event type, but its `payload` carries nothing about the image itself --
just `note`/`gameDate`/`actor` like any event. The image bytes live in a new `map_versions` table
(`event_id` primary key referencing `events`, `image_data BLOB`, `mime_type`), the same reason
`settlement_buildings`/`garrison_units` exist alongside `BuildingConstructed`/`UnitRaised` rather
than embedding a building's or unit's full record in every event: `GET /api/events` (Timeline,
StatusBar's every-page poll) would otherwise return a multi-MB blob inline the moment anyone had
ever uploaded a map, whether or not the current page has anything to do with it.

**The upload is one HTTP request but two database writes, not one transaction.** `POST /api/map`
takes the raw image as its body (`express.raw()`, not JSON/base64 -- no new dependency, and no
~33% base64 inflation on top of an already-multi-MB file) with `gameDate`/`note`/`actor` as query
params. The route: (1) calls `createEvent` exactly like any other event, through the same
validation/warnings path; (2) on success, inserts into `map_versions`. Step 2 is deliberately
outside `createEvent`'s own transaction (departing from ADR-0001's normal event+projection
atomicity) because the image arrives as the request's raw body, not as part of the JSON payload
`createEvent` already validates -- there's no single payload object to hand to one transaction.
The failure mode this accepts: if step 2 fails after step 1 succeeds, the result is an orphaned
`MapUpdated` event with no image attached. Recoverable by uploading again; for a two-person
campaign tracker, an occasional confusing Timeline entry is a fine trade against the alternative
(rearchitecting `createEvent` to accept an out-of-band binary attachment generically, for the one
event type that needs it).

**Never posted to Discord.** Every other campaign-news event embeds its facts directly in the
webhook JSON; an image would need a URL Discord can fetch on its own. This app has no public,
unauthenticated route -- `SITE_PASSWORD`'s Basic Auth gate (`server/index.js`) sits in front of
every route, including reads. Standing up an unauthenticated image endpoint just for Discord's
sake is more than this is worth right now, so `MapUpdated` simply never offers the option, the
same outcome `BuildingAmended`/`DeityAmended` reach for editorial reasons, here for a technical
one.

**"Current" map is a query, not a stored pointer.** `getCurrentMap` (`server/db/mapVersions.js`)
joins `map_versions` to `events` and takes the one with the latest `game_date_sort`. No
`map_state` singleton table shadowing it, unlike `calendar_state` -- a calendar's current date is
genuinely a distinct fact from any one `CalendarAdvanced` event (payload has year/month/day, not
"is this now current"), where the map's current version really is just "whichever upload is
dated latest," nothing to separately track.

## What's out of scope for now

Browsing *past* map versions has no dedicated UI -- every `MapUpdated` event still shows up in
the Timeline with its date and note, so the history isn't lost, just not gallery-browsable yet.
