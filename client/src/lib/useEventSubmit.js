import { useState } from "react";
import { postEvent } from "../api.js";

/**
 * Shared submit-an-event mechanism: posts, tracks status/warnings, and lets the
 * caller react to the created event. One place for the load/submit/status/warnings
 * shape that used to be duplicated per view (see the Phase 1 architecture review).
 */
export function useEventSubmit(onSuccess) {
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState([]);

  async function submit(event) {
    setStatus("Saving...");
    setWarnings([]);
    try {
      const result = await postEvent(event);
      setWarnings(result.warnings || []);
      setStatus(result.warnings?.length ? "Saved, with warnings." : "Saved.");
      onSuccess?.(result.event);
      return result;
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      throw e;
    }
  }

  return { submit, status, warnings };
}
