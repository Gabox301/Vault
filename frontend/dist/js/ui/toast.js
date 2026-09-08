// Vault — ui/toast.js

/**
 * @param {string} message
 * @param {'success' | 'danger' | 'warning' | 'info'} [type='success']
 */
export function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'toast-success', 'toast-danger', 'toast-warning', 'toast-info');
  el.classList.add(`toast-${type}`);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('toast-success', 'toast-danger', 'toast-warning', 'toast-info');
  }, 1800);
}
