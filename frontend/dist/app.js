// Vault — Command Center (frontend, vanilla JS, no build step).
//
// La app NO ejecuta comandos: solo los guarda para recuperarlos y copiarlos
// rápidamente al portapapeles. Se comunica con el backend Go vía el puente
// de Wails:
//   window.go.wailsapp.App.<Metodo>(...)  -> métodos enlazados del backend
//   window.runtime.ClipboardSetText(...)  -> copiar texto al portapapeles

// Los bindings generados en frontend/wailsjs (ver App.js) exponen la App en
// el namespace del paquete Go que la define: `wailsapp`.
const App = () => window.go.wailsapp.App;
const Runtime = () => window.runtime;

const state = {
  commands: [],
  groups: [],
  paletteSelectedIndex: 0,
  paletteVisibleItems: [],
  editingCommandId: null,
  editingGroupId: null,
};

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
  await refreshAll();
});

async function refreshAll() {
  await Promise.all([loadCommands(), loadGroups()]);
  renderDashboard();
  renderCommandsView();
  renderGroupsView();
}

async function loadCommands() {
  state.commands = (await App().GetCommands()) || [];
}

async function loadGroups() {
  state.groups = (await App().GetGroups()) || [];
}

function groupName(id) {
  const g = state.groups.find((x) => x.id === id);
  return g ? g.name : '';
}

// ---------------------------------------------------------------------
// Portapapeles
// ---------------------------------------------------------------------

async function copyText(text) {
  try {
    if (Runtime().ClipboardSetText) {
      await Runtime().ClipboardSetText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    showToast('Comando copiado al portapapeles.', 'success');
    return true;
  } catch (err) {
    await showAlert(`No se pudo copiar el comando: ${err}`);
    return false;
  }
}

async function copyCommand(cmd, triggerBtn) {
  const ok = await copyText(cmd.command);
  if (ok) {
    if (triggerBtn) flashCopyButton(triggerBtn);
    recordCopy(cmd);
    renderDashboard();
  }
}

function flashCopyButton(btn) {
  if (!btn) return;
  btn.classList.add('is-copied');
  const prev = btn.textContent;
  btn.textContent = 'Copiado';
  clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => {
    btn.classList.remove('is-copied');
    btn.textContent = prev || 'Copiar';
  }, 650);
}

// ---------------------------------------------------------------------
// Historial de copias (panel)
// ---------------------------------------------------------------------

const COPY_HISTORY_KEY = 'vault-copy-history';
const COPY_HISTORY_MAX = 8;

function loadCopyHistory() {
  try {
    const raw = localStorage.getItem(COPY_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveCopyHistory(list) {
  localStorage.setItem(COPY_HISTORY_KEY, JSON.stringify(list.slice(0, COPY_HISTORY_MAX)));
}

function recordCopy(cmd) {
  if (!cmd || !cmd.command) return;
  const entry = {
    id: cmd.id ?? null,
    name: cmd.name || cmd.command,
    command: cmd.command,
    at: Date.now(),
  };
  // Deduplicar por texto del comando; el más reciente queda primero
  const filtered = loadCopyHistory().filter((x) => x.command !== entry.command);
  filtered.unshift(entry);
  saveCopyHistory(filtered);
}

/**
 * @param {string} message
 * @param {'success' | 'danger' | 'warning' | 'info'} [type='success']
 */
function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'toast-success', 'toast-danger', 'toast-warning', 'toast-info');
  el.classList.add(`toast-${type}`);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('toast-success', 'toast-danger', 'toast-warning', 'toast-info');
  }, 1800);
}

// ---------------------------------------------------------------------
// Alert / Confirm (reemplazo estilizado de alert()/confirm() nativos)
// ---------------------------------------------------------------------

let confirmResolver = null;

function wireConfirmModal() {
  const overlay = document.getElementById('confirm-overlay');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  okBtn.addEventListener('click', () => resolveConfirmModal(true));
  cancelBtn.addEventListener('click', () => resolveConfirmModal(false));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) resolveConfirmModal(false);
  });

  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveConfirmModal(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveConfirmModal(true);
    }
  });
}

function resolveConfirmModal(value) {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(value);
  }
}

function openConfirmModal({ message, danger = false, showCancel = false, okLabel = 'Aceptar' }) {
  const overlay = document.getElementById('confirm-overlay');
  const modal = overlay.querySelector('.confirm-modal');
  const icon = document.getElementById('confirm-icon');
  const cancelBtn = document.getElementById('confirm-cancel');
  const okBtn = document.getElementById('confirm-ok');

  document.getElementById('confirm-message').textContent = message;
  modal.classList.toggle('danger', danger);
  icon.textContent = danger ? '!' : 'i';
  cancelBtn.classList.toggle('hidden', !showCancel);
  okBtn.textContent = okLabel;
  // Mismo estilo destructivo que el botón Eliminar del listado
  okBtn.classList.toggle('primary', !danger);
  okBtn.classList.toggle('danger', danger);

  overlay.classList.remove('hidden');
  okBtn.focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

// Sustituye a `alert(mensaje)`. Se resuelve al pulsar Aceptar/Enter/Esc.
function showAlert(message) {
  return openConfirmModal({ message, showCancel: false, okLabel: 'Aceptar' });
}

// Sustituye a `confirm(mensaje)`. Devuelve true/false según la elección.
function showConfirm(message, { danger = false } = {}) {
  return openConfirmModal({
    message,
    danger,
    showCancel: true,
    okLabel: danger ? 'Eliminar' : 'Aceptar',
  });
}

// ---------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------

function wireNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
}

// ---------------------------------------------------------------------
// Command Palette (Ctrl/Cmd+K)
// ---------------------------------------------------------------------

function wirePalette() {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closePalette();
    }
  });

  document.getElementById('open-palette-btn').addEventListener('click', openPalette);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  input.addEventListener('input', () => renderPaletteResults(input.value));

  input.addEventListener('keydown', (e) => {
    const items = state.paletteVisibleItems;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.paletteSelectedIndex = Math.min(state.paletteSelectedIndex + 1, items.length - 1);
      highlightPaletteSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.paletteSelectedIndex = Math.max(state.paletteSelectedIndex - 1, 0);
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
  if (palette) {
    palette.classList.remove('palette-enter');
    void palette.offsetWidth; // reflow para reiniciar animación
    palette.classList.add('palette-enter');
  }
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function closePalette() {
  const overlay = document.getElementById('palette-overlay');
  const palette = overlay.querySelector('.palette');
  overlay.classList.add('hidden');
  if (palette) palette.classList.remove('palette-enter');
}

function renderPaletteResults(query) {
  const q = query.trim().toLowerCase();
  const results = document.getElementById('palette-results');

  const favorites = state.commands.filter((c) => c.favorite);

  let matches;
  if (q === '') {
    matches = null; // mostrar secciones curadas (favoritos / todos)
  } else {
    matches = state.commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q),
    );
  }

  results.innerHTML = '';
  state.paletteVisibleItems = [];
  state.paletteSelectedIndex = 0;

  if (matches) {
    appendPaletteSection(results, 'RESULTADOS', matches);
  } else {
    if (favorites.length) appendPaletteSection(results, 'FAVORITOS', favorites);
    appendPaletteSection(results, 'TODOS LOS COMANDOS', state.commands.slice(0, 8));
  }

  highlightPaletteSelection();
}

function appendPaletteSection(container, label, items) {
  if (!items.length) return;
  const sec = document.createElement('div');
  sec.className = 'palette-section-label';
  sec.textContent = label;
  container.appendChild(sec);

  items.forEach((cmd) => {
    const row = document.createElement('div');
    row.className = 'palette-item';
    row.innerHTML = `<span${tooltipAttr(cmd.name, 36)}>${cmd.favorite ? '★ ' : '▶ '}${escapeHtml(truncate(cmd.name, 36))}</span><span class="cmd"${tooltipAttr(cmd.command, 40)}>${escapeHtml(truncate(cmd.command, 40))}</span>`;
    row.addEventListener('click', () => {
      closePalette();
      copyCommand(cmd);
    });
    row.addEventListener('mouseenter', () => {
      state.paletteSelectedIndex = state.paletteVisibleItems.indexOf(cmd);
      highlightPaletteSelection();
    });
    container.appendChild(row);
    state.paletteVisibleItems.push(cmd);
  });
}

function highlightPaletteSelection() {
  const rows = document.querySelectorAll('#palette-results .palette-item');
  rows.forEach((r, i) => r.classList.toggle('selected', i === state.paletteSelectedIndex));
  rows[state.paletteSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------

function renderDashboard() {
  const total = state.commands.length;
  const favs = state.commands.filter((c) => c.favorite);
  const orphans = state.commands.filter((c) => !c.groupId);
  const groupCount = state.groups.length;

  // Resumen numérico
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

  // Últimos copiados (historial local)
  renderQuickList(
    document.getElementById('recent-copies-list'),
    loadCopyHistory().map((h) => ({
      name: h.name,
      command: h.command,
      id: h.id,
    })),
    'historial vacío — copiá un comando con Ctrl K o el botón Copiar',
    { allowCopyOnly: true },
  );

  // Favoritos compactos (solo copiar)
  renderQuickList(
    document.getElementById('favorites-list'),
    favs,
    '0 favoritos — marcá comandos en la vista Comandos',
    { allowCopyOnly: true, showStar: true },
  );

  // Huérfanos
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
      renderQuickList(document.getElementById('orphans-list'), orphans, '', { allowCopyOnly: true, showEdit: true });
    }
  }
}

/**
 * Lista compacta del panel: nombre + comando + acciones mínimas.
 * @param {HTMLElement} container
 * @param {Array} items
 * @param {string} emptyText
 * @param {{ allowCopyOnly?: boolean, showStar?: boolean, showEdit?: boolean }} opts
 */
function renderQuickList(container, items, emptyText, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!items.length) {
    if (emptyText) container.innerHTML = `<div class="empty-hint log-style">${emptyText}</div>`;
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'quick-row';
    const star = opts.showStar ? '<span class="star">★</span> ' : '';
    const displayName = item.name || item.command || '';
    // Truncado más agresivo: las cards del panel son más estrechas
    row.innerHTML = `
      <div class="command-main">
        <span class="command-name"${tooltipAttr(displayName, 28)}>${star}<span class="command-name-text">${escapeHtml(truncate(displayName, 28))}</span></span>
        <span class="command-cmd"${tooltipAttr(item.command || '', 36)}>${escapeHtml(truncate(item.command, 36))}</span>
      </div>
      <div class="row-actions">
        <button class="btn copy-btn small quick-copy">Copiar</button>
        ${opts.showEdit && item.id != null ? '<button class="btn edit-btn small quick-edit">Editar</button>' : ''}
      </div>`;
    row.querySelector('.quick-copy').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      // Prefer live command object if still in state
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
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const live = state.commands.find((c) => c.id === item.id);
        if (live) openCommandEditor(live);
      });
    }
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Vista: comandos
// ---------------------------------------------------------------------

function renderCommandsView() {
  renderCommandList(
    document.getElementById('commands-list'),
    state.commands,
    'ningún comando registrado — creá el primero con + Nuevo comando',
  );
}

function renderCommandList(container, commands, emptyText) {
  container.innerHTML = '';
  if (!commands.length) {
    container.innerHTML = `<div class="empty-hint log-style">${emptyText}</div>`;
    return;
  }
  commands.forEach((cmd) => {
    const row = document.createElement('div');
    row.className = 'command-row';
    row.dataset.commandId = String(cmd.id);
    const group = formatGroupBadges(commandGroupNames(cmd));
    const isFav = !!cmd.favorite;
    row.innerHTML = `
      <div class="command-main">
        <span class="command-name"${tooltipAttr(cmd.name, 48)}>${isFav ? '<span class="star">★</span>' : ''}<span class="command-name-text">${escapeHtml(truncate(cmd.name, 48))}</span></span>
        <span class="command-cmd"${tooltipAttr(cmd.command, 72)}>${escapeHtml(truncate(cmd.command, 72))}</span>
        ${cmd.description ? `<span class="command-desc"${tooltipAttr(cmd.description, 64)}>${escapeHtml(truncate(cmd.description, 64))}</span>` : ''}
        ${group}
      </div>
      <div class="row-actions">
        <button class="btn fav-btn small">${isFav ? 'Quitar favorito' : 'Marcar favorito'}</button>
        <button class="btn copy-btn small">Copiar</button>
        <button class="btn edit-btn small">Editar</button>
        <button class="btn danger small del-btn">Eliminar</button>
      </div>`;
    row.querySelector('.fav-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      const wasFav = !!cmd.favorite;
      const cmdId = cmd.id;
      btn.disabled = true;
      try {
        await App().ToggleFavorite(cmdId);
        // Actualizar estado local de inmediato para que el panel refleje el cambio
        const live = state.commands.find((c) => c.id === cmdId);
        if (live) live.favorite = !wasFav;
        showToast(wasFav ? 'Quitado de favoritos.' : 'Marcado como favorito.', 'info');
        if (!wasFav) btn.classList.add('is-favorited');
        await refreshAll();
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
    row.querySelector('.copy-btn').addEventListener('click', (e) => copyCommand(cmd, e.currentTarget));
    row.querySelector('.edit-btn').addEventListener('click', () => openCommandEditor(cmd));
    row.querySelector('.del-btn').addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este comando?', { danger: true });
      if (!ok) return;
      try {
        await App().DeleteCommand(cmd.id);
        showToast('Comando eliminado.', 'danger');
        await refreshAll();
      } catch (err) {
        await showAlert(`No se pudo eliminar el comando: ${err}`);
      }
    });
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Editor de comando
// ---------------------------------------------------------------------

function wireCommandEditor() {
  document
    .querySelectorAll('.new-command-btn')
    .forEach((btn) => btn.addEventListener('click', () => openCommandEditor(null)));
  document.getElementById('ed-cancel').addEventListener('click', closeCommandEditor);
  document.getElementById('command-editor-overlay').addEventListener('click', (e) => {
    // Ignorar el click residual tras elegir una opción del select (menú fixed
    // fuera del modal). Se consume aquí mismo: el flag se limpia justo cuando
    // se usa, no antes por un timer, así que da igual cuánto tarde el click
    // retargeteado en llegar.
    if (window.__vaultSelectJustPicked) {
      window.__vaultSelectJustPicked = false;
      return;
    }
    if (e.target.id === 'command-editor-overlay') closeCommandEditor();
  });
  document.getElementById('ed-save').addEventListener('click', saveCommandFromEditor);
}

function openCommandEditor(cmd) {
  window.__vaultSelectJustPicked = false;
  state.editingCommandId = cmd ? cmd.id : null;
  document.getElementById('editor-title').textContent = cmd ? 'Editar comando' : 'Nuevo comando';
  document.getElementById('ed-name').value = cmd?.name || '';
  document.getElementById('ed-description').value = cmd?.description || '';
  document.getElementById('ed-command').value = cmd?.command || '';
  document.getElementById('ed-favorite').checked = !!cmd?.favorite;

  populateGroupSelect(cmd?.groupId ?? null);

  document.getElementById('command-editor-overlay').classList.remove('hidden');
  refreshAutosizeIn(document.getElementById('command-editor-overlay'));
}

function closeCommandEditor() {
  closeGroupSelect();
  document.getElementById('command-editor-overlay').classList.add('hidden');
}

// ---------------------------------------------------------------------
// Custom select (grupo) — sin <select> nativo
// ---------------------------------------------------------------------

function populateGroupSelect(selectedId) {
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
    // pointerdown: selecciona y cierra. Flag evita que el click residual cierre el modal
    // (el menú es position:fixed y puede quedar fuera del cuadro del editor).
    li.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setGroupSelectValue(opt.value, opt.label);
      window.__vaultSelectJustPicked = true;
      closeGroupSelect();
      // El flag NO se resetea con un timer: el click "residual" (retargeteado
      // al overlay porque la opción ya está oculta cuando el navegador hace el
      // hit-test del mouseup) puede tardar más que un setTimeout(0) en llegar.
      // Se limpia al consumirlo en el listener de click del overlay.
    });
    menu.appendChild(li);
  });
}

function setGroupSelectValue(value, text) {
  document.getElementById('ed-group').value = value;
  document.getElementById('ed-group-label').textContent = text;
  document.querySelectorAll('#ed-group-menu .custom-select-option').forEach((el) => {
    const on = el.dataset.value === value;
    el.classList.toggle('is-selected', on);
    if (on) el.setAttribute('aria-selected', 'true');
    else el.removeAttribute('aria-selected');
  });
}

function positionGroupSelectMenu() {
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
  if (openUp) {
    menu.style.top = `${Math.round(rect.top - menuH - 6)}px`;
  } else {
    menu.style.top = `${Math.round(rect.bottom + 6)}px`;
  }
}

function openGroupSelect() {
  const trigger = document.getElementById('ed-group-trigger');
  const menu = document.getElementById('ed-group-menu');
  const wrap = document.getElementById('ed-group-select');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  wrap.classList.add('is-open');
  positionGroupSelectMenu();
}

function closeGroupSelect() {
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

function wireGroupSelect() {
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

  // Cerrar al pulsar fuera (mousedown para que coincida con la selección de opciones)
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
    (e) => {
      const menu = document.getElementById('ed-group-menu');
      if (!menu || menu.hidden) return;
      // Reposicionar si el scroll ocurre dentro del editor
      positionGroupSelectMenu();
    },
    true,
  );
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
    if (wasEditing) {
      await App().UpdateCommand(state.editingCommandId, input);
    } else {
      await App().CreateCommand(input);
    }
    // Confirmación momentánea en el botón antes de cerrar
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
    await refreshAll();
  } catch (err) {
    await showAlert(`No se pudo guardar el comando: ${err}`);
  }
}

// ---------------------------------------------------------------------
// Vista: grupos
// ---------------------------------------------------------------------

function renderGroupsView() {
  const container = document.getElementById('groups-list');
  container.innerHTML = '';
  if (!state.groups.length) {
    container.innerHTML = '<div class="empty-hint log-style">0 grupos — creá uno para organizar tus comandos</div>';
    return;
  }
  state.groups.forEach((g) => {
    const count = commandsInGroup(g.id).length;
    const row = document.createElement('div');
    row.className = 'project-row';
    const descPart = g.description ? ' · ' + truncate(g.description, 40) : '';
    const countLabel = `${count} ${count === 1 ? 'comando' : 'comandos'}`;
    const fullCmdLine = countLabel + (g.description ? ' · ' + g.description : '');
    // La línea de detalle se considera truncada si la descripción lo está o es muy larga en pantalla
    const descMax = 40;
    row.innerHTML = `
      <div class="command-main">
        <span class="command-name"${tooltipAttr(g.name, 40)}><span class="command-name-text">${escapeHtml(truncate(g.name, 40))}</span></span>
        <span class="command-cmd"${tooltipAttr(fullCmdLine, countLabel.length + (g.description ? 3 + descMax : 0) + 1)}">${countLabel}${g.description ? ' · ' + escapeHtml(truncate(g.description, descMax)) : ''}</span>
      </div>
      <div class="row-actions">
        <button class="btn view-btn small">Ver</button>
        <button class="btn edit-btn small">Editar</button>
        <button class="btn danger small del-btn">Eliminar</button>
      </div>`;
    row.querySelector('.view-btn').addEventListener('click', () => openGroupViewer(g));
    row.querySelector('.edit-btn').addEventListener('click', () => openGroupEditor(g));
    row.querySelector('.del-btn').addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este grupo? Sus comandos quedarán sin asignar.', {
        danger: true,
      });
      if (!ok) return;
      await App().DeleteGroup(g.id);
      showToast('Grupo eliminado.', 'danger');
      await refreshAll();
    });
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Editor de grupo
// ---------------------------------------------------------------------

function wireGroupEditor() {
  document.getElementById('new-group-btn').addEventListener('click', () => openGroupEditor(null));
  document.getElementById('gr-cancel').addEventListener('click', closeGroupEditor);
  document.getElementById('group-editor-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'group-editor-overlay') closeGroupEditor();
  });
  document.getElementById('gr-save').addEventListener('click', saveGroupFromEditor);
}

function openGroupEditor(group) {
  state.editingGroupId = group ? group.id : null;
  document.getElementById('group-editor-title').textContent = group ? 'Editar grupo' : 'Nuevo grupo';
  document.getElementById('gr-name').value = group?.name || '';
  document.getElementById('gr-description').value = group?.description || '';
  document.getElementById('group-editor-overlay').classList.remove('hidden');
  refreshAutosizeIn(document.getElementById('group-editor-overlay'));
  document.getElementById('gr-name').focus();
}

function closeGroupEditor() {
  document.getElementById('group-editor-overlay').classList.add('hidden');
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
    if (wasEditing) {
      await App().UpdateGroup(state.editingGroupId, input);
    } else {
      await App().CreateGroup(input);
    }
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
    await refreshAll();
  } catch (err) {
    await showAlert(`No se pudo guardar el grupo: ${err}`);
  }
}

// ---------------------------------------------------------------------
// Viewer de grupo (comandos del grupo)
// ---------------------------------------------------------------------

function wireGroupViewer() {
  document.getElementById('group-viewer-close').addEventListener('click', closeGroupViewer);
  document.getElementById('group-viewer-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'group-viewer-overlay') closeGroupViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGroupViewer();
  });
}

function closeGroupViewer() {
  document.getElementById('group-viewer-overlay').classList.add('hidden');
}

function openGroupViewer(group) {
  document.getElementById('group-viewer-title').textContent = group ? `Comandos · ${group.name}` : 'Comandos';
  const container = document.getElementById('group-viewer-list');
  const cmds = group ? commandsInGroup(group.id) : [];
  container.innerHTML = '';
  if (!cmds.length) {
    container.innerHTML = '<div class="empty-hint log-style">este grupo no tiene comandos</div>';
  } else {
    cmds.forEach((cmd) => {
      const row = document.createElement('div');
      row.className = 'quick-row';
      const isFav = !!cmd.favorite;
      row.innerHTML = `
        <div class="command-main">
          <span class="command-name"${tooltipAttr(cmd.name, 40)}>${isFav ? '<span class="star">★</span>' : ''}<span class="command-name-text">${escapeHtml(truncate(cmd.name, 40))}</span></span>
          <span class="command-cmd"${tooltipAttr(cmd.command, 64)}>${escapeHtml(truncate(cmd.command, 64))}</span>
          ${cmd.description ? `<span class="command-desc"${tooltipAttr(cmd.description, 48)}>${escapeHtml(truncate(cmd.description, 48))}</span>` : ''}
        </div>
        <div class="row-actions">
          <button class="btn copy-btn small viewer-copy">Copiar</button>
        </div>`;
      row.querySelector('.viewer-copy').addEventListener('click', (e) => copyCommand(cmd, e.currentTarget));
      container.appendChild(row);
    });
  }
  document.getElementById('group-viewer-overlay').classList.remove('hidden');
}

/** Comandos que pertenecen a un grupo (groupId único o groupIds[]). */
function commandsInGroup(groupId) {
  return state.commands.filter(
    (c) => c.groupId === groupId || (Array.isArray(c.groupIds) && c.groupIds.includes(groupId)),
  );
}

// ---------------------------------------------------------------------
// Tooltip propio
// ---------------------------------------------------------------------

let tooltipHideTimer = null;

function wireTooltip() {
  const tip = document.getElementById('app-tooltip');
  if (!tip) return;

  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      // Solo mostrar si el contenido está realmente truncado
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

function autosizeTextarea(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, 220);
  el.style.height = `${Math.max(next, 38)}px`;
}

function wireAutosizeFields() {
  const ids = ['ed-description', 'ed-command', 'gr-description'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => autosizeTextarea(el));
  });
}

function refreshAutosizeIn(root) {
  (root || document).querySelectorAll('textarea').forEach((el) => autosizeTextarea(el));
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function truncate(str, max) {
  const s = String(str ?? '');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

/**
 * Atributo data-tooltip solo si el texto supera max (está truncado).
 * @returns {string} '' o ' data-tooltip="..."'
 */
function tooltipAttr(fullText, max) {
  const s = String(fullText ?? '');
  if (s.length <= max) return '';
  return ` data-tooltip="${escapeHtml(s)}"`;
}

/**
 * Confirma truncado real en el DOM (ellipsis CSS o texto con … de truncate()).
 * Evita mostrar tooltip cuando el atributo quedó de más o el layout no corta.
 */
function elementIsTruncated(el) {
  if (!el) return false;
  const tip = el.getAttribute('data-tooltip');
  if (!tip) return false;
  // Overflow por CSS (text-overflow: ellipsis)
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const textNode = el.querySelector('.command-name-text') || el;
  const visible = (textNode.textContent || '').replace(/\s+/g, ' ').trim();
  if (visible.endsWith('…') || visible.endsWith('...')) return true;
  const cleanedVisible = visible.replace(/^[★▶❯]\s*/, '');
  if (tip.length > cleanedVisible.length) return true;
  return tip !== cleanedVisible && tip !== visible;
}

/** Nombres de grupo de un comando (soporta groupId único o groupIds[]). */
function commandGroupNames(cmd) {
  if (!cmd) return [];
  if (Array.isArray(cmd.groupIds) && cmd.groupIds.length) {
    return cmd.groupIds.map((id) => groupName(id)).filter(Boolean);
  }
  if (cmd.groupId) {
    const n = groupName(cmd.groupId);
    return n ? [n] : [];
  }
  return [];
}

/**
 * Badge(s) de grupo: si hay varios, muestra el primero truncado y "+N grupos".
 * @param {string[]} names
 * @param {number} [nameMax=18]
 */
function formatGroupBadges(names, nameMax = 18) {
  if (!names.length) return '';
  const first = escapeHtml(truncate(names[0], nameMax));
  if (names.length === 1) {
    // Solo tooltip si el nombre del grupo está truncado
    return `<span class="command-group"${tooltipAttr(names[0], nameMax)}>${first}</span>`;
  }
  // Varios grupos: el badge "+N" implica info oculta → siempre tooltip con la lista completa
  const extra = names.length - 1;
  const allTitle = escapeHtml(names.join(', '));
  return `<span class="command-groups" data-tooltip="${allTitle}">
    <span class="command-group">${first}</span>
    <span class="command-group command-group-extra">+${extra} grupo${extra === 1 ? '' : 's'}</span>
  </span>`;
}
