# Trades are ResourceChanged events, not a distinct type

Trades were one of the four categories called out for history (resource changes, construction, trades, other actions), which made a distinct `TradeExecuted` type the obvious first guess. We rejected it: a trade is a `ResourceChanged` event that happens to name a counterparty, and splitting it out would mean growing the event taxonomy for every event that carries one extra attribute rather than absorbing it into the existing type.
