// Vault — ui/palette.js — ahora usa <template>

import { setState, state } from '../core/store.js';
import { copyCommand } from '../services/clipboard.js';
import { setResponsiveText } from '../utils/html.js';

export function wirePalette() {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');
  if (!overlay || !input) return;

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closePalette();
    }
  });

  document.getElementById('open-palette-btn')?.addEventListener('click', openPalette);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  input.addEventListener('input', () => renderPaletteResults(input.value));

  input.addEventListener('keydown', (e) => {
    const items = state.paletteVisibleItems;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setState({ paletteSelectedIndex: Math.min(state.paletteSelectedIndex + 1, items.length - 1) });
      highlightPaletteSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setState({ paletteSelectedIndex: Math.max(state.paletteSelectedIndex - 1, 0) });
      highlightPaletteSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = items[state.paletteSelectedIndex];
      if (cmd) {
        closePalette();
        copyCommand(cmd);
      }
    }
  });
}

function openPalette() {
  const overlay = document.getElementById('palette-overlay');
  const palette = overlay.querySelector('.palette');
  const input = document.getElementById('palette-input');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  input.setAttribute('aria-expanded', 'true');
  if (palette) {
    palette.classList.remove('palette-enter');
    void palette.offsetWidth;
    palette.classList.add('palette-enter');
  }
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function closePalette() {
  const overlay = document.getElementById('palette-overlay');
  const palette = overlay.querySelector('.palette');
  const input = document.getElementById('palette-input');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  input?.setAttribute('aria-expanded', 'false');
  if (palette) palette.classList.remove('palette-enter');
}

function renderPaletteResults(query) {
  const q = query.trim().toLowerCase();
  const results = document.getElementById('palette-results');

  const favorites = state.commands.filter((c) => c.favorite);

  let matches;
  if (q === '') {
    matches = null;
  } else {
    matches = state.commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q),
    );
  }

  results.innerHTML = '';
  const visible = [];

  if (matches) {
    appendPaletteSection(results, 'RESULTADOS', matches, visible);
  } else {
    if (favorites.length) appendPaletteSection(results, 'FAVORITOS', favorites, visible);
    appendPaletteSection(results, 'TODOS LOS COMANDOS', state.commands.slice(0, 8), visible);
  }

  setState({ paletteVisibleItems: visible, paletteSelectedIndex: 0 });
  highlightPaletteSelection();
}

function appendPaletteSection(container, label, items, visible) {
  if (!items.length) return;

  const sectionTpl = document.getElementById('tpl-palette-section');
  const itemTpl = document.getElementById('tpl-palette-item');

  if (sectionTpl) {
    const secClone = sectionTpl.content.cloneNode(true);
    const sec = secClone.querySelector('.palette-section-label');
    sec.textContent = label;
    container.appendChild(secClone);
  } else {
    const sec = document.createElement('div');
    sec.className = 'palette-section-label';
    sec.textContent = label;
    container.appendChild(sec);
  }

  items.forEach((cmd) => {
    visible.push(cmd);

    let row;
    if (itemTpl) {
      const clone = itemTpl.content.cloneNode(true);
      row = clone.querySelector('.palette-item');
      const nameEl = row.querySelector('.palette-item-name');
      const cmdEl = row.querySelector('.cmd');

      const prefix = cmd.favorite ? '★ ' : '▶ ';
      setResponsiveText(nameEl, prefix + cmd.name);
      setResponsiveText(cmdEl, cmd.command);
    } else {
      row = document.createElement('div');
      row.className = 'palette-item';
      row.textContent = `${cmd.favorite ? '★ ' : '▶ '}${truncate(cmd.name, 36)}`;
    }

    row.addEventListener('click', () => {
      closePalette();
      copyCommand(cmd);
    });
    row.addEventListener('mouseenter', () => {
      setState({ paletteSelectedIndex: visible.indexOf(cmd) });
      highlightPaletteSelection();
    });
    container.appendChild(row);
  });
}

function highlightPaletteSelection() {
  const rows = document.querySelectorAll('#palette-results .palette-item');
  rows.forEach((r, i) => {
    const on = i === state.paletteSelectedIndex;
    r.classList.toggle('selected', on);
    r.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  rows[state.paletteSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}
