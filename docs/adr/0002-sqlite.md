# SQLite as the campaign database

The site is self-hosted for a single DM with no existing server infrastructure. SQLite gives transactions and queryable history — the actual gap in the current JSON-file design — without adding a database server to operate. Postgres was considered and rejected as unnecessary operational weight for this scale.
