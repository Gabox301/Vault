// Vault — ui/tooltip.js
// Custom tooltip that only shows when content is actually truncated.

import { elementIsTruncated } from '../utils/html.js';

let tooltipHideTimer = null;

export function wireTooltip() {
  const tip = document.getElementById('app-tooltip');
  if (!tip) return;
  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      if (!elementIsTruncated(el)) return;
      showAppTooltip(el, text);
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const related = e.relatedTarget;
      if (related && el.contains(related)) return;
      hideAppTooltip();
    },
    true,
  );
  document.addEventListener('scroll', () => hideAppTooltip(), true);
  window.addEventListener('blur', () => hideAppTooltip());
}

function showAppTooltip(anchor, text) {
  const tip = document.getElementById('app-tooltip');
  if (!tip) return;
  clearTimeout(tooltipHideTimer);
  tip.textContent = text;
  tip.classList.remove('hidden');
  tip.style.left = '0px';
  tip.style.top = '0px';
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
  let top = rect.top - th - 8;
  if (top < pad) top = rect.bottom + 8;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  requestAnimationFrame(() => tip.classList.add('is-visible'));
}

function hideAppTooltip() {
  const tip = document.getElementById('app-tooltip');
  if (!tip) return;
  tip.classList.remove('is-visible');
  clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    tip.classList.add('hidden');
    tip.textContent = '';
  }, 120);
}
