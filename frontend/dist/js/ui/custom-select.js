// Vault — ui/custom-select.js
// Custom select for the "Grupo" field in command editor (no native <select>).

import { state } from '../core/store.js';

export function populateGroupSelect(selectedId) {
  const hidden = document.getElementById('ed-group');
  const label = document.getElementById('ed-group-label');
  const menu = document.getElementById('ed-group-menu');

  const options = [{ value: '', label: '(ninguno)' }].concat(
    state.groups.map((g) => ({ value: String(g.id), label: g.name })),
  );

  const selected = options.find((o) => o.value === String(selectedId ?? '')) || options[0];
  hidden.value = selected.value;
  label.textContent = selected.label;

  menu.innerHTML = '';
  options.forEach((opt) => {
    const li = document.createElement('li');
    li.className = 'custom-select-option' + (opt.value === selected.value ? ' is-selected' : '');
    li.setAttribute('role', 'option');
    li.dataset.value = opt.value;
    li.textContent = opt.label;
    if (opt.value === selected.value) li.setAttribute('aria-selected', 'true');
    li.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setGroupSelectValue(opt.value, opt.label);
      window.__vaultSelectJustPicked = true;
      closeGroupSelect();
    });
    menu.appendChild(li);
  });
}

export function setGroupSelectValue(value, text) {
  document.getElementById('ed-group').value = value;
  document.getElementById('ed-group-label').textContent = text;
  document.querySelectorAll('#ed-group-menu .custom-select-option').forEach((el) => {
    const on = el.dataset.value === value;
    el.classList.toggle('is-selected', on);
    if (on) el.setAttribute('aria-selected', 'true');
    else el.removeAttribute('aria-selected');
  });
}

export function positionGroupSelectMenu() {
  const trigger = document.getElementById('ed-group-trigger');
  const menu = document.getElementById('ed-group-menu');
  if (!trigger || !menu || menu.hidden) return;
  const rect = trigger.getBoundingClientRect();
  const menuH = Math.min(menu.scrollHeight || 180, 220);
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const openUp = spaceBelow < menuH && rect.top > spaceBelow;
  menu.classList.add('is-fixed');
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.width = `${Math.round(rect.width)}px`;
  menu.style.right = 'auto';
  menu.style.top = openUp ? `${Math.round(rect.top - menuH - 6)}px` : `${Math.round(rect.bottom + 6)}px`;
}

export function openGroupSelect() {
  const trigger = document.getElementById('ed-group-trigger');
  const menu = document.getElementById('ed-group-menu');
  const wrap = document.getElementById('ed-group-select');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  wrap.classList.add('is-open');
  positionGroupSelectMenu();
}

export function closeGroupSelect() {
  const trigger = document.getElementById('ed-group-trigger');
  const menu = document.getElementById('ed-group-menu');
  const wrap = document.getElementById('ed-group-select');
  if (!menu) return;
  menu.hidden = true;
  menu.classList.remove('is-fixed');
  menu.style.left = '';
  menu.style.top = '';
  menu.style.width = '';
  menu.style.right = '';
  trigger?.setAttribute('aria-expanded', 'false');
  wrap?.classList.remove('is-open');
}

export function wireGroupSelect() {
  const trigger = document.getElementById('ed-group-trigger');
  const wrap = document.getElementById('ed-group-select');
  if (!trigger || !wrap) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById('ed-group-menu');
    if (menu.hidden) openGroupSelect();
    else closeGroupSelect();
  });

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('ed-group-menu');
    if (!menu || menu.hidden) return;
    if (wrap.contains(e.target) || menu.contains(e.target)) return;
    closeGroupSelect();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGroupSelect();
  });

  document.addEventListener(
    'scroll',
    () => {
      const menu = document.getElementById('ed-group-menu');
      if (!menu || menu.hidden) return;
      positionGroupSelectMenu();
    },
    true,
  );
}
