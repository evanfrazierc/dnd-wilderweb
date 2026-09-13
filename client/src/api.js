async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error
      || (Array.isArray(body.errors) ? body.errors.join("; ") : null)
      || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

export function getProjection(resource) {
  return fetch(`/api/projections/${resource}`).then(handle);
}

export function getReference(resource) {
  return fetch(`/api/reference/${resource}`).then(handle);
}

export function getEvents(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/events${suffix}`).then(handle);
}

// Timeline visibility only, not a new event (docs/adr/0019).
export function setEventHidden(id, hidden) {
  return fetch(`/api/events/${id}/hidden`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden }),
  }).then(handle);
}

// Returns { event, warnings } on success. Warnings are informational, not errors --
// the write still succeeded (docs/adr/0005-validation-warns-not-blocks.md).
export function postEvent(event) {
  return fetch(`/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).then(handle);
}

export function getObligations(params = {}) {
  const qs = new URLSearchParams();
  if (params.satisfied != null) qs.set("satisfied", params.satisfied);
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/obligations${suffix}`).then(handle);
}

export function getObligation(id) {
  return fetch(`/api/obligations/${id}`).then(handle);
}

// Reference data is edited directly, with no event history (CONTEXT.md), so this
// replaces the whole collection/document in one call rather than posting an event.
export function putReference(resource, data) {
  return fetch(`/api/reference/${resource}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);
}

// A MapUpdated event carrying the raw file as its body, not JSON (docs/adr/0018) -- gameDate/
// note/actor travel as query params instead, since the body is the image itself. Returns
// { event, warnings } like postEvent, just without the postToDiscord option (never offered
// for this type -- see docs/adr/0018).
export function uploadMap(file, { gameDate, note, actor } = {}) {
  const qs = new URLSearchParams();
  if (gameDate) qs.set("gameDate", gameDate);
  if (note) qs.set("note", note);
  if (actor) qs.set("actor", actor);
  return fetch(`/api/map?${qs}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  }).then(handle);
}
