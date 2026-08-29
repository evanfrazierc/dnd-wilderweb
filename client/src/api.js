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
