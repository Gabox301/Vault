// Vault — services/copy-history.js
// Persists last N copied commands in localStorage (UI feature, not backend data).

const COPY_HISTORY_KEY = 'vault-copy-history';
const COPY_HISTORY_MAX = 10;

export function loadCopyHistory() {
  try {
    const raw = localStorage.getItem(COPY_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveCopyHistory(list) {
  localStorage.setItem(COPY_HISTORY_KEY, JSON.stringify(list.slice(0, COPY_HISTORY_MAX)));
}

/** @param {{ id?: number, name?: string, command: string }} cmd */
export function recordCopy(cmd) {
  if (!cmd || !cmd.command) return;
  const entry = {
    id: cmd.id ?? null,
    name: cmd.name || cmd.command,
    command: cmd.command,
    at: Date.now(),
  };
  // Dedup by command text; most recent first
  const filtered = loadCopyHistory().filter((x) => x.command !== entry.command);
  filtered.unshift(entry);
  saveCopyHistory(filtered);
}
