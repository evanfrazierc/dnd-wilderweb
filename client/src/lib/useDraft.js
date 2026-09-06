import { useReducer, useState } from "react";
import { draftReducer, isDirty } from "./draftReducer.js";

/**
 * Replaces the hand-rolled "draft state + dirty diff + row add/remove" shape that used to be
 * copy-pasted into each reference-data editor (see architecture review: Dashboard's
 * ResourceDefinitionsEditor, Settlements' BuildingCatalogEditor, CalendarView's
 * CalendarStructureEditor, Codex's IntroductionTab). Save/status stay separate
 * (useReferenceSave.js) since this hook has no business knowing how a draft gets persisted.
 *
 * Resyncs the draft when `initial` changes (e.g. after a save reloads normalized data from
 * the server) by comparing content, not reference, since callers often pass a freshly derived
 * value on every render (e.g. `catalog.map(toRow)`) rather than a stable object identity.
 * Adjusting state directly during render (rather than in a useEffect) avoids a stale draft
 * being visible for one extra frame.
 */
export function useDraft(initial) {
  const [draft, dispatch] = useReducer(draftReducer, initial);
  const [syncedInitial, setSyncedInitial] = useState(initial);

  if (isDirty(initial, syncedInitial)) {
    setSyncedInitial(initial);
    dispatch({ type: "reset", value: initial });
  }

  return {
    draft,
    dirty: isDirty(draft, initial),
    set: (path, value) => dispatch({ type: "set", path, value }),
    addItem: (path, factory) => dispatch({ type: "addItem", path, factory }),
    removeItem: (path, index) => dispatch({ type: "removeItem", path, index }),
  };
}
