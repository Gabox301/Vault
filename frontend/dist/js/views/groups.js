// Vault — views/groups.js — ahora usa <template>

import { emit } from '../core/events.js';
import { setState, state } from '../core/store.js';
import { copyCommand } from '../services/clipboard.js';
import { vaultApi } from '../services/vault-api.js';
import { refreshAutosizeIn } from '../ui/autosize.js';
import { showAlert, showConfirm } from '../ui/confirm-modal.js';
import {
  debounce,
  getAdaptivePageSize,
  getOrCreatePaginationEl,
  paginate,
  renderPagination,
} from '../ui/pagination.js';
import { showToast } from '../ui/toast.js';
import { commandsInGroup } from '../utils/groups.js';

// ---------------------------------------------------------------------
// Listado de grupos
// ---------------------------------------------------------------------

let groupsPage = 0;
let viewerPage = 0;
let viewerGroupId = null;

function getGroupsPageSize() {
  return getAdaptivePageSize({ min: 7, max: 12 });
}

function getViewerPageSize() {
  return getAdaptivePageSize({ min: 5, max: 10 });
}

let lastGroupsPageSize = getGroupsPageSize();
let lastViewerPageSize = getViewerPageSize();

const onGroupsResize = debounce(() => {
  const newSize = getGroupsPageSize();
  if (newSize === lastGroupsPageSize) return;
  lastGroupsPageSize = newSize;
  const totalPages = Math.max(1, Math.ceil(state.groups.length / newSize));
  if (groupsPage >= totalPages) groupsPage = Math.max(0, totalPages - 1);
  if (document.getElementById('view-groups')?.classList.contains('active')) renderGroupsView();
}, 180);
window.addEventListener('resize', onGroupsResize);

const onViewerResize = debounce(() => {
  if (
    !document.getElementById('group-viewer-overlay') ||
    document.getElementById('group-viewer-overlay').classList.contains('hidden')
  )
    return;
  const newSize = getViewerPageSize();
  if (newSize === lastViewerPageSize) return;
  lastViewerPageSize = newSize;
  // re-render viewer con grupo actual
  const title = document.getElementById('group-viewer-title')?.textContent;
  // extraer grupo por id guardado
  const gid = viewerGroupId;
  const group = gid != null ? state.groups.find((g) => g.id === gid) : null;
  if (group) openGroupViewer(group);
}, 180);
window.addEventListener('resize', onViewerResize);

export function renderGroupsView() {
  const container = document.getElementById('groups-list');
  if (!container) return;
  const pageSize = getGroupsPageSize();
  lastGroupsPageSize = pageSize;
  const paginationEl = getOrCreatePaginationEl(container, 'groups-pagination');
  const { pageItems, totalPages, currentPage } = paginate(state.groups, groupsPage, pageSize);
  groupsPage = currentPage;
  container.innerHTML = '';
  if (!state.groups.length) {
    container.innerHTML = '<div class="empty-hint log-style">0 grupos — creá uno para organizar tus comandos</div>';
    if (paginationEl) paginationEl.classList.add('hidden');
    return;
  }
  const tpl = document.getElementById('tpl-group-row');
  pageItems.forEach((g) => {
    const count = commandsInGroup(g.id).length;
    const countLabel = `${count} ${count === 1 ? 'comando' : 'comandos'}`;
    const fullCmdLine = countLabel + (g.description ? ' · ' + g.description : '');
    const descMax = 40;
    let row;
    if (tpl) {
      const clone = tpl.content.cloneNode(true);
      row = clone.querySelector('.project-row');
      const nameEl = row.querySelector('.command-name');
      const nameText = row.querySelector('.command-name-text');
      const cmdEl = row.querySelector('.command-cmd');
      nameText.textContent = g.name;
      nameEl.setAttribute('data-tooltip', g.name);
      const displayCmd = countLabel + (g.description ? ' · ' + g.description : '');
      cmdEl.textContent = displayCmd;
      cmdEl.setAttribute('data-tooltip', fullCmdLine);
    } else {
      row = document.createElement('div');
      row.className = 'project-row';
      row.innerHTML = 'fallback';
    }
    row.querySelector('[data-action="view"]').addEventListener('click', () => openGroupViewer(g));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openGroupEditor(g));
    row.querySelector('[data-action="del"]').addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este grupo? Sus comandos quedarán sin asignar.', { danger: true });
      if (!ok) return;
      await vaultApi.deleteGroup(g.id);
      showToast('Grupo eliminado.', 'danger');
      emit('data:changed', { reason: 'delete-group' });
    });
    container.appendChild(row);
  });
  renderPagination(paginationEl, totalPages, currentPage, (p) => {
    groupsPage = p;
    renderGroupsView();
  });
}

// ---------------------------------------------------------------------
// Editor de grupo
// ---------------------------------------------------------------------

export function wireGroupEditor() {
  document.getElementById('new-group-btn')?.addEventListener('click', () => openGroupEditor(null));
  document.getElementById('gr-cancel')?.addEventListener('click', closeGroupEditor);
  document.getElementById('group-editor-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'group-editor-overlay') closeGroupEditor();
  });
  document.getElementById('gr-save')?.addEventListener('click', saveGroupFromEditor);
}

export function openGroupEditor(group) {
  setState({ editingGroupId: group ? group.id : null });
  document.getElementById('group-editor-title').textContent = group ? 'Editar grupo' : 'Nuevo grupo';
  document.getElementById('gr-name').value = group?.name || '';
  document.getElementById('gr-description').value = group?.description || '';
  const overlay = document.getElementById('group-editor-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  refreshAutosizeIn(overlay);
  document.getElementById('gr-name').focus();
}

export function closeGroupEditor() {
  const overlay = document.getElementById('group-editor-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

async function saveGroupFromEditor() {
  const input = {
    name: document.getElementById('gr-name').value.trim(),
    description: document.getElementById('gr-description').value.trim(),
  };
  if (!input.name) {
    await showAlert('El nombre es obligatorio.');
    return;
  }
  const saveBtn = document.getElementById('gr-save');
  try {
    const wasEditing = !!state.editingGroupId;
    if (wasEditing) await vaultApi.updateGroup(state.editingGroupId, input);
    else await vaultApi.createGroup(input);
    if (saveBtn) {
      const prev = saveBtn.textContent;
      saveBtn.classList.add('is-saved');
      saveBtn.textContent = '✓ Guardado';
      await new Promise((r) => setTimeout(r, 520));
      saveBtn.classList.remove('is-saved');
      saveBtn.textContent = prev;
    }
    closeGroupEditor();
    showToast(wasEditing ? 'Grupo actualizado.' : 'Grupo creado.', 'success');
    emit('data:changed', { reason: 'save-group' });
  } catch (err) {
    await showAlert(`No se pudo guardar el grupo: ${err}`);
  }
}

// ---------------------------------------------------------------------
// Viewer de grupo
// ---------------------------------------------------------------------

export function wireGroupViewer() {
  document.getElementById('group-viewer-close')?.addEventListener('click', closeGroupViewer);
  document.getElementById('group-viewer-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'group-viewer-overlay') closeGroupViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGroupViewer();
  });
}

export function closeGroupViewer() {
  const overlay = document.getElementById('group-viewer-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

export function openGroupViewer(group) {
  document.getElementById('group-viewer-title').textContent = group ? `Comandos · ${group.name}` : 'Comandos';
  const container = document.getElementById('group-viewer-list');
  if (!container) return;
  const cmds = group ? commandsInGroup(group.id) : [];
  // reset página si cambió el grupo
  if (viewerGroupId !== (group?.id ?? null)) {
    viewerGroupId = group?.id ?? null;
    viewerPage = 0;
  }
  const pageSize = getViewerPageSize();
  lastViewerPageSize = pageSize;
  const paginationEl = getOrCreatePaginationEl(container, 'group-viewer-pagination');
  const { pageItems, totalPages, currentPage } = paginate(cmds, viewerPage, pageSize);
  viewerPage = currentPage;
  container.innerHTML = '';
  if (!cmds.length) {
    container.innerHTML = '<div class="empty-hint log-style">este grupo no tiene comandos</div>';
    if (paginationEl) paginationEl.classList.add('hidden');
  } else {
    const tpl = document.getElementById('tpl-quick-row');
    pageItems.forEach((cmd) => {
      const isFav = !!cmd.favorite;
      let row;
      if (tpl) {
        const clone = tpl.content.cloneNode(true);
        row = clone.querySelector('.quick-row');
        const nameEl = row.querySelector('.command-name');
        const nameText = row.querySelector('.command-name-text');
        const cmdEl = row.querySelector('.command-cmd');
        const descEl = row.querySelector('.command-desc');
        nameText.textContent = cmd.name;
        nameEl.setAttribute('data-tooltip', cmd.name);
        if (isFav) {
          const star = document.createElement('span');
          star.className = 'star';
          star.textContent = '★';
          nameEl.insertBefore(star, nameText);
        }
        cmdEl.textContent = cmd.command;
        cmdEl.setAttribute('data-tooltip', cmd.command);
        if (cmd.description) {
          descEl.textContent = cmd.description;
          descEl.setAttribute('data-tooltip', cmd.description);
          descEl.classList.remove('hidden');
        }
        row.querySelector('.quick-edit')?.remove();
        row.querySelector('.quick-copy').classList.add('viewer-copy');
      } else {
        row = document.createElement('div');
        row.className = 'quick-row';
        row.innerHTML = 'fallback';
      }
      row
        .querySelector('.quick-copy, .viewer-copy')
        .addEventListener('click', (e) => copyCommand(cmd, e.currentTarget));
      container.appendChild(row);
    });
    renderPagination(paginationEl, totalPages, currentPage, (p) => {
      viewerPage = p;
      openGroupViewer(group);
    });
  }
  const overlay = document.getElementById('group-viewer-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}
