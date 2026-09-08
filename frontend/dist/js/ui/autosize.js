// Vault — ui/autosize.js

function autosizeTextarea(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, 220);
  el.style.height = `${Math.max(next, 38)}px`;
}

export function wireAutosizeFields() {
  const ids = ['ed-description', 'ed-command', 'gr-description'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => autosizeTextarea(el));
  });
}

export function refreshAutosizeIn(root) {
  (root || document).querySelectorAll('textarea').forEach((el) => autosizeTextarea(el));
}
