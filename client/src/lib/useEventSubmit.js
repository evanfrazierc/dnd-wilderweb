import { useState } from "react";
import { postEvent } from "../api.js";

/**
 * Shared submit-an-event mechanism: posts, tracks status/warnings, and lets the
 * caller react to the created event. One place for the load/submit/status/warnings
 * shape that used to be duplicated per view (see the Phase 1 architecture review).
 *
 * Also owns the "Post to Discord" decision for this save (defaults on -- the DM opts
 * out per save rather than opting in, matching how they used to post everything
 * manually). Posting is best-effort server-side (server/discord.js): a failed post
 * never fails the save, it's just reported back in the status text.
 */
export function useEventSubmit(onSuccess) {
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [postToDiscord, setPostToDiscord] = useState(true);

  async function submit(event) {
    setStatus("Saving...");
    setWarnings([]);
    try {
      const result = await postEvent({ ...event, postToDiscord });
      setWarnings(result.warnings || []);
      const parts = [result.warnings?.length ? "Saved, with warnings." : "Saved."];
      if (postToDiscord) {
        if (result.discord?.ok === false) parts.push(`Discord post failed: ${result.discord.error}`);
        else if (result.discord?.skipped) parts.push("Discord not configured.");
        else parts.push("Posted to Discord.");
      }
      setStatus(parts.join(" "));
      onSuccess?.(result.event);
      return result;
    } catch (e) {
      setStatus(`Error: ${e.message}`);
      throw e;
    }
  }

  return { submit, status, warnings, postToDiscord, setPostToDiscord };
}
