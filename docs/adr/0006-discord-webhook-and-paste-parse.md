# Discord: webhook out, paste-and-parse in, no bot for v1

Outbound notifications use a plain incoming webhook, not a bot, so there's no always-on gateway process to host. Inbound import is a manual paste-and-parse flow, not a bot reading channels automatically, so a human reviews every parsed draft before it's saved — the existing history already includes DM rulings that override the raw numbers, and automated ingestion would bypass exactly that judgment. Both are deliberately narrower than a full bot integration, which may be built later if the manual flow becomes a bottleneck.
