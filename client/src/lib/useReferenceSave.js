import { useState } from "react";
import { putReference } from "../api.js";

/**
 * Reference-data counterpart to useEventSubmit.js: same status-string shape, but no
 * warnings, since direct writes don't run checkWarnings (CONTEXT.md: reference data is
 * "edited directly with no event history").
 */
export function useReferenceSave(resource, onSuccess) {
  const [status, setStatus] = useState("");

  async function save(data) {
    setStatus("Saving...");
    try {
      const result = await putReference(resource, data);
      setStatus("Saved.");
      onSuccess?.(result);
      return result;
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      throw e;
    }
  }

  return { save, status };
}
