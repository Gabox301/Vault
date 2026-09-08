// Vault — core/bridge.js
// Thin facade over the Wails runtime. Centralizes access to window.go and
// window.runtime so the rest of the codebase never touches globals directly.
// This keeps a single seam to mock in tests and to handle missing bindings.
export function getApp() {
  return window.go?.wailsapp?.App;
}

export function getRuntime() {
  return window.runtime ?? null;
}
