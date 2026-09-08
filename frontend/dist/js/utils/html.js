// Vault — utils/html.js
// Pure string helpers. No DOM side-effects. Fully testable offline.

export function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export function truncate(str, max) {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

/**
 * Render data-tooltip attribute only if text exceeds max (is visually truncated).
 * @returns {string} '' or ' data-tooltip="..."'
 */
export function tooltipAttr(fullText, max) {
  const s = String(fullText ?? '');
  if (s.length <= max) return '';
  return ` data-tooltip="${escapeHtml(s)}"`;
}

/**
 * DOM helper: set truncated text + tooltip in one go (no innerHTML).
 * @param {HTMLElement} el
 * @param {string} fullText
 * @param {number} max
 */
export function setTruncatedText(el, fullText, max) {
  if (!el) return;
  const full = String(fullText ?? '');
  el.textContent = truncate(full, max);
  if (full.length > max) el.setAttribute('data-tooltip', full);
  else el.removeAttribute('data-tooltip');
}

/**
 * Confirms real truncation in DOM (CSS ellipsis or JS truncate).
 * Avoids showing tooltip when layout does not actually clip.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function elementIsTruncated(el) {
  if (!el) return false;
  const tip = el.getAttribute('data-tooltip');
  if (!tip) return false;
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const textNode = el.querySelector('.command-name-text') || el;
  const visible = (textNode.textContent || '').replace(/\s+/g, ' ').trim();
  if (visible.endsWith('…') || visible.endsWith('...')) return true;
  const cleanedVisible = visible.replace(/^[★▶❯]\s*/, '');
  if (tip.length > cleanedVisible.length) return true;
  return tip !== cleanedVisible && tip !== visible;
}
