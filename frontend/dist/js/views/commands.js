// Vault — views/commands.js — ahora usa <template>

import { emit } from '../core/events.js';
import { setState, state } from '../core/store.js';
import { copyCommand } from '../services/clipboard.js';
import { vaultApi } from '../services/vault-api.js';
import { refreshAutosizeIn } from '../ui/autosize.js';
import { showAlert, showConfirm } from '../ui/confirm-modal.js';
import { closeGroupSelect, populateGroupSelect } from '../ui/custom-select.js';
import {
  debounce,
  getAdaptivePageSize,
  getOrCreatePaginationEl,
  paginate,
  renderPagination,
} from '../ui/pagination.js';
import { showToast } from '../ui/toast.js';
import { appendGroupBadges, commandGroupNames } from '../utils/groups.js';

// ---------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------

let commandsPage = 0;
let lastCommandsPageSize = getAdaptivePageSize({ min: 5, max: 12 });

function getCommandsPageSize() {
  return getAdaptivePageSize({ min: 5, max: 12 });
}

const onCommandsResize = debounce(() => {
  const newSize = getCommandsPageSize();
  if (newSize === lastCommandsPageSize) return;
  // si cambia el tamaño, re-render con clamp
  const totalPages = Math.max(1, Math.ceil(state.commands.length / newSize));
  if (commandsPage >= totalPages) commandsPage = Math.max(0, totalPages - 1);
  // solo refrescar si la vista está activa
  if (document.getElementById('view-commands')?.classList.contains('active')) {
    renderCommandsView();
  } else {
    lastCommandsPageSize = newSize;
  }
}, 180);
window.addEventListener('resize', onCommandsResize);

export function renderCommandsView() {
  const pageSize = getCommandsPageSize();
  if (pageSize !== lastCommandsPageSize) {
    // al crecer el alto, puede que la página actual quede fuera
    lastCommandsPageSize = pageSize;
  }
  const totalPages = Math.max(1, Math.ceil(state.commands.length / pageSize));
  if (commandsPage >= totalPages) commandsPage = Math.max(0, totalPages - 1);
  renderCommandList(
    document.getElementById('commands-list'),
    state.commands,
    'ningún comando registrado — creá el primero con + Nuevo comando',
  );
}

function renderCommandList(container, commands, emptyText) {
  if (!container) return;
  const pageSize = getCommandsPageSize();
  lastCommandsPageSize = pageSize;
  const paginationEl = getOrCreatePaginationEl(container, 'commands-pagination');
  const { pageItems, totalPages, currentPage } = paginate(commands, commandsPage, pageSize);
  commandsPage = currentPage;
  container.innerHTML = '';
  if (!commands.length) {
    container.innerHTML = `<div class="empty-hint log-style">${emptyText}</div>`;
    if (paginationEl) paginationEl.classList.add('hidden');
    return;
  }
  const tpl = document.getElementById('tpl-command-row');
  pageItems.forEach((cmd) => {
    const names = commandGroupNames(cmd);
    const isFav = !!cmd.favorite;
    let row;
    if (tpl) {
      const clone = tpl.content.cloneNode(true);
      row = clone.querySelector('.command-row');
      row.dataset.commandId = String(cmd.id);
      const nameEl = row.querySelector('.command-name');
      const nameText = row.querySelector('.command-name-text');
      const cmdEl = row.querySelector('.command-cmd');
      const descEl = row.querySelector('.command-desc');
      const main = row.querySelector('.command-main');
      // Nombre: texto completo, CSS hace ellipsis según ancho
      nameText.textContent = cmd.name;
      nameEl.setAttribute('data-tooltip', cmd.name);
      if (isFav) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.setAttribute('aria-hidden', 'true');
        nameEl.insertBefore(star, nameText);
      }
      // Comando
      cmdEl.textContent = cmd.command;
      cmdEl.setAttribute('data-tooltip', cmd.command);
      // Descripción
      if (cmd.description) {
        descEl.textContent = cmd.description;
        descEl.setAttribute('data-tooltip', cmd.description);
        descEl.classList.remove('hidden');
      }
      // Badges (DOM, no innerHTML)
      appendGroupBadges(main, names);
      // Botón fav label
      const favBtn = row.querySelector('[data-action="fav"]');
      favBtn.textContent = isFav ? 'Quitar favorito' : 'Marcar favorito';
    } else {
      // Fallback sin template
      row = document.createElement('div');
      row.className = 'command-row';
      row.dataset.commandId = String(cmd.id);
      row.innerHTML = `fallback`;
    }
    // Eventos
    row.querySelector('[data-action="fav"]').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      const wasFav = !!cmd.favorite;
      const cmdId = cmd.id;
      btn.disabled = true;
      try {
        await vaultApi.toggleFavorite(cmdId);
        const live = state.commands.find((c) => c.id === cmdId);
        if (live) live.favorite = !wasFav;
        showToast(wasFav ? 'Quitado de favoritos.' : 'Marcado como favorito.', 'info');
        if (!wasFav) btn.classList.add('is-favorited');
        emit('data:changed', { reason: 'favorite' });
        if (!wasFav) {
          requestAnimationFrame(() => {
            const star = document.querySelector(
              `#commands-list .command-row[data-command-id="${CSS.escape(String(cmdId))}"] .star`,
            );
            if (star) star.classList.add('is-bounce');
          });
        }
      } catch (err) {
        await showAlert(`No se pudo actualizar el favorito: ${err}`);
      } finally {
        btn.disabled = false;
      }
    });
    row.querySelector('[data-action="copy"]').addEventListener('click', (e) => copyCommand(cmd, e.currentTarget));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openCommandEditor(cmd));
    row.querySelector('[data-action="del"]').addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este comando?', { danger: true });
      if (!ok) return;
      try {
        await vaultApi.deleteCommand(cmd.id);
        showToast('Comando eliminado.', 'danger');
        emit('data:changed', { reason: 'delete-command' });
      } catch (err) {
        await showAlert(`No se pudo eliminar el comando: ${err}`);
      }
    });
    container.appendChild(row);
  });
  renderPagination(paginationEl, totalPages, currentPage, (p) => {
    commandsPage = p;
    renderCommandList(container, commands, emptyText);
  });
}

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------

export function wireCommandEditor() {
  document
    .querySelectorAll('.new-command-btn')
    .forEach((btn) => btn.addEventListener('click', () => openCommandEditor(null)));
  document.getElementById('ed-cancel')?.addEventListener('click', closeCommandEditor);
  document.getElementById('command-editor-overlay')?.addEventListener('click', (e) => {
    if (window.__vaultSelectJustPicked) {
      window.__vaultSelectJustPicked = false;
      return;
    }
    if (e.target.id === 'command-editor-overlay') closeCommandEditor();
  });
  document.getElementById('ed-save')?.addEventListener('click', saveCommandFromEditor);
}

export function openCommandEditor(cmd) {
  window.__vaultSelectJustPicked = false;
  setState({ editingCommandId: cmd ? cmd.id : null });
  document.getElementById('editor-title').textContent = cmd ? 'Editar comando' : 'Nuevo comando';
  document.getElementById('ed-name').value = cmd?.name || '';
  document.getElementById('ed-description').value = cmd?.description || '';
  document.getElementById('ed-command').value = cmd?.command || '';
  document.getElementById('ed-favorite').checked = !!cmd?.favorite;
  populateGroupSelect(cmd?.groupId ?? null);
  const overlay = document.getElementById('command-editor-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  refreshAutosizeIn(overlay);
  document.getElementById('ed-name')?.focus();
}

export function closeCommandEditor() {
  closeGroupSelect();
  const overlay = document.getElementById('command-editor-overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

async function saveCommandFromEditor() {
  const groupValue = document.getElementById('ed-group').value;
  const input = {
    name: document.getElementById('ed-name').value.trim(),
    description: document.getElementById('ed-description').value.trim(),
    command: document.getElementById('ed-command').value.trim(),
    favorite: document.getElementById('ed-favorite').checked,
    groupId: groupValue ? Number(groupValue) : null,
  };
  if (!input.name || !input.command) {
    await showAlert('El nombre y el comando son obligatorios.');
    return;
  }
  const saveBtn = document.getElementById('ed-save');
  try {
    const wasEditing = !!state.editingCommandId;
    if (wasEditing) await vaultApi.updateCommand(state.editingCommandId, input);
    else await vaultApi.createCommand(input);
    if (saveBtn) {
      const prev = saveBtn.textContent;
      saveBtn.classList.add('is-saved');
      saveBtn.textContent = '✓ Guardado';
      await new Promise((r) => setTimeout(r, 520));
      saveBtn.classList.remove('is-saved');
      saveBtn.textContent = prev;
    }
    closeCommandEditor();
    showToast(wasEditing ? 'Comando actualizado.' : 'Comando creado.', 'success');
    emit('data:changed', { reason: 'save-command' });
  } catch (err) {
    await showAlert(`No se pudo guardar el comando: ${err}`);
  }
}
