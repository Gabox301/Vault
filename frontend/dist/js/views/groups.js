// Vault — views/groups.js — ahora usa <template>

import { emit } from '../core/events.js';
import { setState, state } from '../core/store.js';
import { copyCommand } from '../services/clipboard.js';
import { vaultApi } from '../services/vault-api.js';
import { refreshAutosizeIn } from '../ui/autosize.js';
import { showAlert, showConfirm } from '../ui/confirm-modal.js';
import { showToast } from '../ui/toast.js';
import { commandsInGroup } from '../utils/groups.js';
import { truncate } from '../utils/html.js';

// ---------------------------------------------------------------------
// Listado de grupos
// ---------------------------------------------------------------------

export function renderGroupsView() {
  const container = document.getElementById('groups-list');
  if (!container) return;
  container.innerHTML = '';
  if (!state.groups.length) {
    container.innerHTML = '<div class="empty-hint log-style">0 grupos — creá uno para organizar tus comandos</div>';
    return;
  }

  const tpl = document.getElementById('tpl-group-row');

  state.groups.forEach((g) => {
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

      nameText.textContent = truncate(g.name, 40);
      if (String(g.name).length > 40) nameEl.setAttribute('data-tooltip', g.name);

      const displayCmd = countLabel + (g.description ? ' · ' + truncate(g.description, descMax) : '');
      cmdEl.textContent = displayCmd;
      const threshold = countLabel.length + (g.description ? 3 + descMax : 0) + 1;
      if (fullCmdLine.length > threshold) cmdEl.setAttribute('data-tooltip', fullCmdLine);
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
  container.innerHTML = '';
  if (!cmds.length) {
    container.innerHTML = '<div class="empty-hint log-style">este grupo no tiene comandos</div>';
  } else {
    const tpl = document.getElementById('tpl-quick-row');
    cmds.forEach((cmd) => {
      const isFav = !!cmd.favorite;
      let row;
      if (tpl) {
        const clone = tpl.content.cloneNode(true);
        row = clone.querySelector('.quick-row');
        const nameEl = row.querySelector('.command-name');
        const nameText = row.querySelector('.command-name-text');
        const cmdEl = row.querySelector('.command-cmd');
        const descEl = row.querySelector('.command-desc');

        nameText.textContent = truncate(cmd.name, 40);
        if (String(cmd.name).length > 40) nameEl.setAttribute('data-tooltip', cmd.name);
        if (isFav) {
          const star = document.createElement('span');
          star.className = 'star';
          star.textContent = '★';
          nameEl.insertBefore(star, nameText);
        }
        cmdEl.textContent = truncate(cmd.command, 64);
        if (String(cmd.command).length > 64) cmdEl.setAttribute('data-tooltip', cmd.command);
        if (cmd.description) {
          descEl.textContent = truncate(cmd.description, 48);
          if (String(cmd.description).length > 48) descEl.setAttribute('data-tooltip', cmd.description);
          descEl.classList.remove('hidden');
        }
        // Ocultar botón Editar en viewer, mantener solo Copiar
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
  }
  const overlay = document.getElementById('group-viewer-overlay');
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}
