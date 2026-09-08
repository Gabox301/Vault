// Vault — core/store.js
// Centralized state + minimal pub/sub. Vanilla, no dependencies.
// All mutable state that was scattered across the monolith now lives here
// and notifies subscribers when it changes.

const _state = {
  commands: [],
  groups: [],
  paletteSelectedIndex: 0,
  paletteVisibleItems: [],
  editingCommandId: null,
  editingGroupId: null,
};

/**
 * Tiny event bus scoped to state changes.
 * @type {Map<string, Set<Function>>}
 */
const listeners = new Map();

export const state = _state;

/**
 * Subscribe to a state key change.
 * @param {string} key - e.g. 'commands' | 'groups' | '*'
 * @param {(payload: { key: string, value: unknown, prev: unknown }) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

function emit(key, value, prev) {
  const payload = { key, value, prev };
  listeners.get(key)?.forEach((fn) => fn(payload));
  if (key !== '*') listeners.get('*')?.forEach((fn) => fn(payload));
}

/**
 * Patch the store and emit per-key events.
 * @param {Partial<typeof _state>} patch
 */
export function setState(patch) {
  for (const [k, v] of Object.entries(patch)) {
    const prev = _state[k];
    if (prev === v) continue;
    _state[k] = v;
    emit(k, v, prev);
  }
}

/**
 * Helper: find group name by id (used by many views).
 * @param {number|string|null} id
 * @returns {string}
 */
export function groupName(id) {
  const g = _state.groups.find((x) => x.id === id);
  return g ? g.name : '';
}
