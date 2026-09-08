// Vault — core/events.js
// App-level event bus for cross-cutting concerns (e.g. "data:changed").
// Decoupled from the store so features can react without direct imports.

const bus = new EventTarget();

/** @param {string} name */
/** @param {unknown} detail */
export function emit(name, detail) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * @param {string} name
 * @param {(e: CustomEvent) => void} handler
 * @returns {() => void}
 */
export function on(name, handler) {
  bus.addEventListener(name, handler);
  return () => bus.removeEventListener(name, handler);
}
