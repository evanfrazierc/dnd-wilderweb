# Regions are first-class reference data, not a free-text label

Before this, "region" existed in two unlinked places: a free-text string on every `settlement_buildings` row, and a separate `wilderlandsRegions` list (with descriptions) inside the Codex Locations tab's `locations_state` document. The two happened to use the same names by convention, with nothing enforcing it -- renaming or deleting a settlement had no obvious place to do it correctly, since "the source of truth" was really two sources that could silently drift apart.

Regions are now a `regions` table (`server/db/reference.js`'s `regions` resource): a stable `id`, a mutable `name`, and a description. The stable id is what makes a rename possible at all -- a name-keyed store can't distinguish "renamed" from "deleted, then a different one added with a similar name," so `replaceRegions` diffs incoming rows against existing ones by `id` and cascades a name change onto every `settlement_buildings` row referencing the old name, in the same transaction. Deleting a region while it still has buildings is refused, the same way removing a resource definition is refused while its value is nonzero (`replaceResourceDefinitions`) -- move or remove the buildings first, then delete the now-empty region.

The Settlements page now renders one card per known region, not one per region that happens to already have a building -- that's what makes adding a brand-new settlement possible without going through a workaround (add a placeholder building just to make the region "exist").

The existing `wilderlandsRegions` list was seeded into the new table once (`ensureRegionsSeeded`, idempotent, only runs while `regions` is empty) and the Codex Locations tab no longer maintains its own separate copy.
