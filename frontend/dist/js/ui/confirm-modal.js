// Vault — ui/confirm-modal.js
// Replaces native alert()/confirm() with a styled single modal.
// One global resolver; the modal is reused for all callers.

let confirmResolver = null;

export function wireConfirmModal() {
  const overlay = document.getElementById('confirm-overlay');
  if (!overlay) return;
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  okBtn.addEventListener('click', () => resolveConfirmModal(true));
  cancelBtn.addEventListener('click', () => resolveConfirmModal(false));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) resolveConfirmModal(false);
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveConfirmModal(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveConfirmModal(true);
    }
  });
}

function resolveConfirmModal(value) {
  const overlay = document.getElementById('confirm-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(value);
  }
}

function openConfirmModal({ message, danger = false, showCancel = false, okLabel = 'Aceptar' }) {
  const overlay = document.getElementById('confirm-overlay');
  const modal = overlay.querySelector('.confirm-modal');
  const icon = document.getElementById('confirm-icon');
  const cancelBtn = document.getElementById('confirm-cancel');
  const okBtn = document.getElementById('confirm-ok');
  document.getElementById('confirm-message').textContent = message;
  modal.classList.toggle('danger', danger);
  icon.textContent = danger ? '!' : 'i';
  cancelBtn.classList.toggle('hidden', !showCancel);
  okBtn.textContent = okLabel;
  okBtn.classList.toggle('primary', !danger);
  okBtn.classList.toggle('danger', danger);
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  okBtn.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

export function showAlert(message) {
  return openConfirmModal({ message, showCancel: false, okLabel: 'Aceptar' });
}

export function showConfirm(message, { danger = false } = {}) {
  return openConfirmModal({
    message,
    danger,
    showCancel: true,
    okLabel: danger ? 'Eliminar' : 'Aceptar',
  });
}
