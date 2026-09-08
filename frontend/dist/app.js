// Vault — app.js (entry point, ES module)
// Orquestador delgado: solo wiring + lifecycle. Toda la lógica vive en módulos.
// Mantiene "vanilla JS, sin build step" usando ES modules nativos del browser.

import { on } from './js/core/events.js';
import { setState } from './js/core/store.js';
import { vaultApi } from './js/services/vault-api.js';
import { wireAutosizeFields } from './js/ui/autosize.js';
import { wireConfirmModal } from './js/ui/confirm-modal.js';
import { wireGroupSelect } from './js/ui/custom-select.js';
import { wireNav } from './js/ui/navigation.js';
import { wirePalette } from './js/ui/palette.js';
import { wireTooltip } from './js/ui/tooltip.js';
import { renderCommandsView, wireCommandEditor } from './js/views/commands.js';
import { renderDashboard } from './js/views/dashboard.js';
import { renderGroupsView, wireGroupEditor, wireGroupViewer } from './js/views/groups.js';

// ---------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  wireNav();
  wirePalette();
  wireCommandEditor();
  wireGroupEditor();
  wireGroupViewer();
  wireConfirmModal();
  wireGroupSelect();
  wireTooltip();
  wireAutosizeFields();
  // Flujo reactivo centralizado: reemplaza los `await refreshAll()` dispersos
  // del monolito por un único canal. 'copy' solo refresca el panel (no requiere
  // round-trip al backend); cualquier mutación real recarga todo.
  on('data:changed', (e) => {
    const reason = e.detail?.reason;
    if (reason === 'copy') {
      renderDashboard();
      return;
    }
    void refreshAll();
  });
  await refreshAll();
});

async function refreshAll() {
  await Promise.all([loadCommands(), loadGroups()]);
  renderDashboard();
  renderCommandsView();
  renderGroupsView();
}

async function loadCommands() {
  const cmds = (await vaultApi.getCommands()) || [];
  setState({ commands: cmds });
}

async function loadGroups() {
  const groups = (await vaultApi.getGroups()) || [];
  setState({ groups });
}
