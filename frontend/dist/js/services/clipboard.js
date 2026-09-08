// Vault — services/clipboard.js
// Clipboard abstraction + UX helpers (toast, button flash, history).

import { getRuntime } from '../core/bridge.js';
import { emit } from '../core/events.js';
import { showAlert } from '../ui/confirm-modal.js';
import { showToast } from '../ui/toast.js';
import { recordCopy } from './copy-history.js';

export async function copyText(text) {
  try {
    const rt = getRuntime();
    if (rt?.ClipboardSetText) {
      await rt.ClipboardSetText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    showToast('Comando copiado al portapapeles.', 'success');
    return true;
  } catch (err) {
    await showAlert(`No se pudo copiar el comando: ${err}`);
    return false;
  }
}

/**
 * Copies a command object and triggers global refresh.
 * @param {{ id?: number, command: string }} cmd
 * @param {HTMLButtonElement} [triggerBtn]
 */
export async function copyCommand(cmd, triggerBtn) {
  const ok = await copyText(cmd.command);
  if (ok) {
    if (triggerBtn) flashCopyButton(triggerBtn);
    recordCopy(cmd);
    emit('data:changed', { reason: 'copy' });
  }
}

export function flashCopyButton(btn) {
  if (!btn) return;
  btn.classList.add('is-copied');
  const prev = btn.textContent;
  btn.textContent = 'Copiado';
  clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => {
    btn.classList.remove('is-copied');
    btn.textContent = prev || 'Copiar';
  }, 650);
}
