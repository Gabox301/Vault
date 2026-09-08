// Vault — views/dashboard.js

import { emit } from '../core/events.js';
import { state } from '../core/store.js';
import { copyCommand, copyText, flashCopyButton } from '../services/clipboard.js';
import { loadCopyHistory, recordCopy } from '../services/copy-history.js';
import { vaultApi } from '../services/vault-api.js';
import { showAlert } from '../ui/confirm-modal.js';
import {
  debounce,
  getAdaptivePageSize,
  getOrCreatePaginationEl,
  paginate,
  renderPagination,
} from '../ui/pagination.js';
import { showToast } from '../ui/toast.js';

// paginación por lista (clave = id del contenedor)
const dashboardPages = new Map();

function getDashboardPage(id) {
  return dashboardPages.get(id) ?? 0;
}
function setDashboardPage(id, page) {
  dashboardPages.set(id, page);
}

function getDashboardPageSize() {
  return getAdaptivePageSize({ min: 5, max: 8 });
}
let lastDashboardPageSize = getDashboardPageSize();
const onDashboardResize = debounce(() => {
  const newSize = getDashboardPageSize();
  if (newSize === lastDashboardPageSize) return;
  lastDashboardPageSize = newSize;
  // clamp páginas existentes
  for (const [id, page] of dashboardPages.entries()) {
    const el = document.getElementById(id.replace('-pagination', '-list'));
    // estimar totalPages según lista actual es complejo aquí; solo clamp al re-render
    // renderDashboard recalculará con nuevo tamaño
  }
  if (document.getElementById('view-dashboard')?.classList.contains('active')) {
    renderDashboard();
  }
}, 180);
window.addEventListener('resize', onDashboardResize);

export function renderDashboard() {
  const total = state.commands.length;
  const favs = state.commands.filter((c) => c.favorite);
  const orphans = state.commands.filter((c) => !c.groupId);
  const groupCount = state.groups.length;

  const statsEl = document.getElementById('dashboard-stats');
  if (statsEl) {
    const cards = [
      { label: 'Comandos', value: total, tone: 'success' },
      { label: 'Favoritos', value: favs.length, tone: 'warning' },
      { label: 'Grupos', value: groupCount, tone: 'accent' },
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
    { allowCopyOnly: true, paginationId: 'recent-copies-pagination' },
  );

  renderQuickList(
    document.getElementById('favorites-list'),
    favs,
    '0 favoritos — marcá comandos en la vista Comandos',
    { allowCopyOnly: true, showStar: true, paginationId: 'favorites-pagination' },
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
      renderOrphanList(document.getElementById('orphans-list'), orphans);
    }
  }
  // limpiar paginación huérfanos si se ocultó
  if (!orphans.length) {
    const pag = document.getElementById('orphans-pagination');
    if (pag) pag.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------
// Orphans: 1 botón "Asignar grupo" con desplegable mínimo (sin form completo)
// ---------------------------------------------------------------------

let activeOrphanPicker = null;
let activeOrphanAnchor = null;

function closeOrphanPicker() {
  if (activeOrphanPicker) {
    activeOrphanPicker.remove();
    activeOrphanPicker = null;
    activeOrphanAnchor = null;
    document.removeEventListener('mousedown', onOrphanPickerOutside);
    document.removeEventListener('keydown', onOrphanPickerKey);
    window.removeEventListener('resize', onOrphanPickerReposition);
    window.removeEventListener('scroll', onOrphanPickerScroll, true);
  }
}

function onOrphanPickerOutside(e) {
  if (!activeOrphanPicker) return;
  if (activeOrphanPicker.contains(e.target)) return;
  // si el click fue en el botón que lo abrió, lo maneja el propio botón
  if (e.target.closest?.('.orphan-assign-btn')) return;
  closeOrphanPicker();
}

function onOrphanPickerKey(e) {
  if (e.key === 'Escape') closeOrphanPicker();
}

function onOrphanPickerScroll(e) {
  if (!activeOrphanPicker || !activeOrphanAnchor) return;
  // Scroll dentro del propio menú: no cerrar, no reposicionar
  if (e.target === activeOrphanPicker || activeOrphanPicker.contains(e.target)) return;
  // Scroll del contenido/página: reposicionar, no cerrar (como hace custom-select)
  positionOrphanPicker(activeOrphanPicker, activeOrphanAnchor);
}

function onOrphanPickerReposition() {
  if (!activeOrphanPicker || !activeOrphanAnchor) return;
  positionOrphanPicker(activeOrphanPicker, activeOrphanAnchor);
}

function positionOrphanPicker(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const menuW = Math.min(260, window.innerWidth - 16);
  menu.style.width = `${menuW}px`;
  menu.style.left = `${Math.round(Math.min(rect.left, window.innerWidth - menuW - 8))}px`;
  // medir alto (el menú ya está en DOM)
  const h = menu.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const openUp = spaceBelow < h + 8 && rect.top > spaceBelow;
  menu.style.top = openUp ? `${Math.round(rect.top - h - 6)}px` : `${Math.round(rect.bottom + 6)}px`;
  menu.classList.add('is-fixed');
}

function openOrphanPicker(anchorBtn, cmd) {
  closeOrphanPicker();
  if (!state.groups.length) {
    showAlert('No hay grupos creados. Creá un grupo primero en la vista Grupos.');
    return;
  }
  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu is-fixed orphan-picker';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', `Asignar grupo a "${cmd.name}"`);
  state.groups.forEach((g) => {
    const li = document.createElement('li');
    li.className = 'custom-select-option';
    li.setAttribute('role', 'option');
    li.textContent = g.name;
    li.addEventListener('click', async () => {
      closeOrphanPicker();
      anchorBtn.disabled = true;
      const prev = anchorBtn.textContent;
      try {
        await vaultApi.updateCommand(cmd.id, {
          name: cmd.name,
          description: cmd.description || '',
          command: cmd.command,
          favorite: !!cmd.favorite,
          groupId: g.id,
        });
        showToast(`Asignado a ${g.name} → "${cmd.name}"`, 'success');
        emit('data:changed', { reason: 'assign-group' });
      } catch (err) {
        await showAlert(`No se pudo asignar el grupo: ${err}`);
        anchorBtn.disabled = false;
        anchorBtn.textContent = prev;
      }
    });
    menu.appendChild(li);
  });
  document.body.appendChild(menu);
  activeOrphanPicker = menu;
  activeOrphanAnchor = anchorBtn;
  positionOrphanPicker(menu, anchorBtn);
  // cerrar al hacer click fuera / Esc; scroll reposiciona
  setTimeout(() => {
    document.addEventListener('mousedown', onOrphanPickerOutside);
    document.addEventListener('keydown', onOrphanPickerKey);
    window.addEventListener('resize', onOrphanPickerReposition);
    window.addEventListener('scroll', onOrphanPickerScroll, true);
  }, 0);
}

function renderOrphanList(container, orphans) {
  if (!container) return;
  const pageSize = getDashboardPageSize();
  lastDashboardPageSize = pageSize;
  const paginationId = 'orphans-pagination';
  const paginationEl = getOrCreatePaginationEl(container, paginationId);
  const { pageItems, totalPages, currentPage } = paginate(orphans, getDashboardPage(paginationId), pageSize);
  // clampear página si cambió la lista
  if (currentPage !== getDashboardPage(paginationId)) setDashboardPage(paginationId, currentPage);

  container.innerHTML = '';
  if (!orphans.length) {
    if (paginationEl) paginationEl.classList.add('hidden');
    return;
  }
  const tpl = document.getElementById('tpl-quick-row');
  pageItems.forEach((item) => {
    const live = state.commands.find((c) => c.id === item.id) || item;
    const displayName = live.name || live.command || '';
    const cmdText = live.command || '';
    let row;
    if (tpl) {
      const clone = tpl.content.cloneNode(true);
      row = clone.querySelector('.quick-row');
      const nameEl = row.querySelector('.command-name');
      const nameText = row.querySelector('.command-name-text');
      const cmdEl = row.querySelector('.command-cmd');
      // ocultar desc si existiera
      const descEl = row.querySelector('.command-desc');
      if (descEl) descEl.remove();
      nameText.textContent = displayName;
      if (displayName) nameEl.setAttribute('data-tooltip', displayName);
      else nameEl.removeAttribute('data-tooltip');
      cmdEl.textContent = cmdText;
      if (cmdText) cmdEl.setAttribute('data-tooltip', cmdText);
      else cmdEl.removeAttribute('data-tooltip');
      // reemplazar acciones: solo 1 botón Asignar grupo
      const actions = row.querySelector('.row-actions');
      actions.innerHTML = '';
      const assignBtn = document.createElement('button');
      assignBtn.type = 'button';
      assignBtn.className = 'btn primary small orphan-assign-btn';
      assignBtn.textContent = 'Asignar grupo';
      assignBtn.setAttribute('aria-haspopup', 'listbox');
      assignBtn.setAttribute('aria-expanded', 'false');
      assignBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = activeOrphanPicker && document.body.contains(activeOrphanPicker);
        if (isOpen) {
          closeOrphanPicker();
          assignBtn.setAttribute('aria-expanded', 'false');
        } else {
          assignBtn.setAttribute('aria-expanded', 'true');
          openOrphanPicker(assignBtn, live);
          // cerrar al re-seleccionar mismo botón
          const origClose = closeOrphanPicker;
          const wrappedClose = () => {
            assignBtn.setAttribute('aria-expanded', 'false');
            origClose();
            // restaurar
            closeOrphanPicker = origClose;
          };
          // monkey-patch temporal para reset aria
          const tmp = closeOrphanPicker;
          closeOrphanPicker = () => {
            assignBtn.setAttribute('aria-expanded', 'false');
            tmp();
            closeOrphanPicker = tmp;
          };
        }
      });
      actions.appendChild(assignBtn);
    } else {
      row = document.createElement('div');
      row.className = 'quick-row';
      row.textContent = displayName;
    }
    container.appendChild(row);
  });

  renderPagination(paginationEl, totalPages, currentPage, (p) => {
    setDashboardPage(paginationId, p);
    renderOrphanList(container, orphans);
  });
}

/**
 * Lista compacta del panel — ahora usa <template id="tpl-quick-row">.
 */
export function renderQuickList(container, items, emptyText, opts = {}) {
  if (!container) return;
  const paginationId = opts.paginationId || null;
  const pageSize = getDashboardPageSize();
  if (paginationId) lastDashboardPageSize = pageSize;
  const paginationEl = paginationId ? getOrCreatePaginationEl(container, paginationId) : null;
  let page = paginationId ? getDashboardPage(paginationId) : 0;
  const paginated = paginationId
    ? paginate(items, page, pageSize)
    : { pageItems: items, totalPages: 0, currentPage: 0 };
  if (paginationId && page !== paginated.currentPage) {
    page = paginated.currentPage;
    setDashboardPage(paginationId, page);
  }
  const displayItems = paginated.pageItems;

  container.innerHTML = '';
  if (!items.length) {
    if (emptyText) container.innerHTML = `<div class="empty-hint log-style">${emptyText}</div>`;
    if (paginationEl) paginationEl.classList.add('hidden');
    return;
  }

  const tpl = document.getElementById('tpl-quick-row');
  let openCommandEditorRef = null;

  displayItems.forEach((item) => {
    const displayName = item.name || item.command || '';
    const cmdText = item.command || '';

    let row;
    if (tpl) {
      const clone = tpl.content.cloneNode(true);
      row = clone.querySelector('.quick-row');
      const nameEl = row.querySelector('.command-name');
      const nameText = row.querySelector('.command-name-text');
      const cmdEl = row.querySelector('.command-cmd');

      // Nombre + comando: texto completo, CSS hace ellipsis según ancho
      nameText.textContent = displayName;
      if (displayName) nameEl.setAttribute('data-tooltip', displayName);
      else nameEl.removeAttribute('data-tooltip');

      if (opts.showStar) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.setAttribute('aria-hidden', 'true');
        nameEl.insertBefore(star, nameText);
        nameEl.insertBefore(document.createTextNode(' '), nameText);
      }

      // Comando
      cmdEl.textContent = cmdText;
      if (cmdText) cmdEl.setAttribute('data-tooltip', cmdText);
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

  if (paginationEl) {
    renderPagination(paginationEl, paginated.totalPages, paginated.currentPage, (p) => {
      setDashboardPage(paginationId, p);
      renderQuickList(container, items, emptyText, opts);
    });
  }
}
