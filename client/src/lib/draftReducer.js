/**
 * Framework-free draft state logic behind useDraft.js. Every reference-data editor
 * (resource definitions, building catalog, calendar structure, introduction) reduces to the
 * same three operations on a JSON-shaped draft, addressed by a path of object keys / array
 * indices: replace a value, append to an array, remove from an array. `path: []` addresses
 * the draft itself, so this covers both a bare array draft (e.g. the building catalog) and
 * an object draft with a nested array field (e.g. the calendar's `months`) without either
 * shape needing special-casing.
 *
 * Kept dependency-free (no React) so it's testable with plain node:test, like the rest of
 * this repo -- see test/client/draftReducer.test.js.
 */

function getAt(target, path) {
  return path.reduce((node, key) => node[key], target);
}

function setAt(target, path, value) {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (Array.isArray(target)) {
    const copy = target.slice();
    copy[key] = setAt(copy[key], rest, value);
    return copy;
  }
  return { ...target, [key]: setAt(target[key], rest, value) };
}

export function draftReducer(state, action) {
  switch (action.type) {
    case "set":
      return setAt(state, action.path, action.value);
    case "addItem": {
      const list = action.path.length === 0 ? state : getAt(state, action.path);
      return setAt(state, action.path, [...list, action.factory()]);
    }
    case "removeItem": {
      const list = action.path.length === 0 ? state : getAt(state, action.path);
      return setAt(state, action.path, list.filter((_, i) => i !== action.index));
    }
    case "reset":
      return action.value;
    default:
      throw new Error(`draftReducer: unknown action type "${action.type}"`);
  }
}

export function isDirty(draft, initial) {
  return JSON.stringify(draft) !== JSON.stringify(initial);
}
