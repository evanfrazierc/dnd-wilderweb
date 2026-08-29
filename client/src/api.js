async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function getResource(resource) {
  return fetch(`/api/${resource}`).then(handle);
}

export function putResource(resource, value) {
  return fetch(`/api/${resource}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }).then(handle);
}

export function addHistoryEntry(entry) {
  return fetch(`/api/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).then(handle);
}

export function deleteHistoryEntry(id) {
  return fetch(`/api/history/${id}`, { method: "DELETE" }).then(handle);
}
