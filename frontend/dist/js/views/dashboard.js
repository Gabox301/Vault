// Vault — views/dashboard.js

import { state } from '../core/store.js';
import { copyCommand, copyText, flashCopyButton } from '../services/clipboard.js';
import { loadCopyHistory, recordCopy } from '../services/copy-history.js';
import { truncate } from '../utils/html.js';

export function renderDashboard() {
  const total = state.commands.length;
  const favs = state.commands.filter((c) => c.favorite);
  const orphans = state.commands.filter((c) => !c.groupId);
  const groupCount = state.groups.length;

  const statsEl = document.getElementById('dashboard-stats');
  if (statsEl) {
    const cards = [
      { label: 'Comandos', value: total, tone: 'accent' },
      { label: 'Favoritos', value: favs.length, tone: 'warning' },
      { label: 'Grupos', value: groupCount, tone: 'info' },
      { label: 'Sin grupo', value: orphans.length, tone: orphans.length ? 'danger' : 'muted' },
    ];
    statsEl.innerHTML = cards
      .map(
        (c) => `
      <div class="stat-card stat-${c.tone}">
        <span class="stat-value">${c.value}</span>
        <span class="stat-label">${c.label}</span>
      </div>`,
      )
      .join('');
  }

  renderQuickList(
    document.getElementById('recent-copies-list'),
    loadCopyHistory().map((h) => ({ name: h.name, command: h.command, id: h.id })),
    'historial vacío — copiá un comando con Ctrl K o el botón Copiar',
    { allowCopyOnly: true },
  );

  renderQuickList(
    document.getElementById('favorites-list'),
    favs,
    '0 favoritos — marcá comandos en la vista Comandos',
    { allowCopyOnly: true, showStar: true },
  );

  const orphansPanel = document.getElementById('orphans-panel');
  if (orphansPanel) {
    if (!orphans.length) {
      orphansPanel.classList.add('hidden');
    } else {
      orphansPanel.classList.remove('hidden');
      const hint = orphansPanel.querySelector('.panel-hint');
      if (hint) {
        hint.classList.add('log-style');
        hint.textContent = `${orphans.length} comando${orphans.length === 1 ? '' : 's'} sin asignar — asignalos a un grupo`;
      }
      renderQuickList(document.getElementById('orphans-list'), orphans, '', {
        allowCopyOnly: true,
        showEdit: true,
      });
    }
  }
}

/**
 * Lista compacta del panel — ahora usa <template id="tpl-quick-row">.
 */
export function renderQuickList(container, items, emptyText, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) {
    if (emptyText) container.innerHTML = `<div class="empty-hint log-style">${emptyText}</div>`;
    return;
  }

  const tpl = document.getElementById('tpl-quick-row');
  let openCommandEditorRef = null;

  items.forEach((item) => {
    const displayName = item.name || item.command || '';
    const cmdText = item.command || '';

    let row;
    if (tpl) {
      const clone = tpl.content.cloneNode(true);
      row = clone.querySelector('.quick-row');
      const nameEl = row.querySelector('.command-name');
      const nameText = row.querySelector('.command-name-text');
      const cmdEl = row.querySelector('.command-cmd');

      // Nombre (28)
      nameText.textContent = truncate(displayName, 28);
      if (displayName.length > 28) nameEl.setAttribute('data-tooltip', displayName);
      else nameEl.removeAttribute('data-tooltip');

      if (opts.showStar) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.setAttribute('aria-hidden', 'true');
        nameEl.insertBefore(star, nameText);
        // leading space like before: add text node
        nameEl.insertBefore(document.createTextNode(' '), nameText);
      }

      // Comando (36)
      cmdEl.textContent = truncate(cmdText, 36);
      if (cmdText.length > 36) cmdEl.setAttribute('data-tooltip', cmdText);
      else cmdEl.removeAttribute('data-tooltip');

      // Botón Editar
      const editBtn = row.querySelector('.quick-edit');
      if (opts.showEdit && item.id != null) editBtn.classList.remove('hidden');
      else editBtn?.remove();
    } else {
      // Fallback legacy (sin template)
      row = document.createElement('div');
      row.className = 'quick-row';
      row.innerHTML = `<div class="command-main"><span class="command-name"><span class="command-name-text"></span></span><span class="command-cmd"></span></div><div class="row-actions"><button class="btn copy-btn small quick-copy">Copiar</button></div>`;
    }

    row.querySelector('.quick-copy').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const live = item.id != null ? state.commands.find((c) => c.id === item.id) : null;
      if (live) await copyCommand(live, btn);
      else {
        const ok = await copyText(item.command);
        if (ok) {
          flashCopyButton(btn);
          recordCopy(item);
          renderDashboard();
        }
      }
    });

    const editBtn = row.querySelector('.quick-edit');
    if (editBtn && !editBtn.classList.contains('hidden')) {
      editBtn.addEventListener('click', async () => {
        if (!openCommandEditorRef) {
          const mod = await import('./commands.js');
          openCommandEditorRef = mod.openCommandEditor;
        }
        const live = state.commands.find((c) => c.id === item.id);
        if (live) openCommandEditorRef(live);
      });
    }

    container.appendChild(row);
  });
}
