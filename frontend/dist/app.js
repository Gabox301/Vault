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
  wireConfirmModal();
  wireGroupSelect();
  wireTooltip();
  wireAutosizeFields();
  // Tema fijo: neumorphism
  document.documentElement.setAttribute('data-theme', 'neumorphism');
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

async function copyCommand(cmd) {
  const ok = await copyText(cmd.command);
  if (ok) {
    recordCopy(cmd);
    renderDashboard();
  }
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
  const input = document.getElementById('palette-input');
  overlay.classList.remove('hidden');
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function closePalette() {
  document.getElementById('palette-overlay').classList.add('hidden');
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
    row.innerHTML = `<span data-tooltip="${escapeHtml(cmd.name)}">${cmd.favorite ? '★ ' : '▶ '}${escapeHtml(truncate(cmd.name, 36))}</span><span class="cmd" data-tooltip="${escapeHtml(cmd.command)}">${escapeHtml(truncate(cmd.command, 40))}</span>`;
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
    'Aún no has copiado ningún comando. Usa Copiar en Comandos o Ctrl K.',
    { allowCopyOnly: true },
  );

  // Favoritos compactos (solo copiar)
  renderQuickList(
    document.getElementById('favorites-list'),
    favs,
    'Aún no hay favoritos. Márcalos en la vista Comandos.',
    { allowCopyOnly: true, showStar: true },
  );

  // Huérfanos
  const orphansPanel = document.getElementById('orphans-panel');
  if (orphansPanel) {
    if (!orphans.length) {
      orphansPanel.classList.add('hidden');
    } else {
      orphansPanel.classList.remove('hidden');
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
    if (emptyText) container.innerHTML = `<div class="empty-hint">${emptyText}</div>`;
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
        <span class="command-name" data-tooltip="${escapeHtml(displayName)}">${star}<span class="command-name-text">${escapeHtml(truncate(displayName, 28))}</span></span>
        <span class="command-cmd" data-tooltip="${escapeHtml(item.command || '')}">${escapeHtml(truncate(item.command, 36))}</span>
      </div>
      <div class="row-actions">
        <button class="btn copy-btn small quick-copy">Copiar</button>
        ${opts.showEdit && item.id != null ? '<button class="btn edit-btn small quick-edit">Editar</button>' : ''}
      </div>`;
    row.querySelector('.quick-copy').addEventListener('click', async () => {
      // Prefer live command object if still in state
      const live = item.id != null ? state.commands.find((c) => c.id === item.id) : null;
      if (live) await copyCommand(live);
      else {
        const ok = await copyText(item.command);
        if (ok) {
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
  renderCommandList(document.getElementById('commands-list'), state.commands, 'Aún no hay comandos. Crea el primero.');
}

function renderCommandList(container, commands, emptyText) {
  container.innerHTML = '';
  if (!commands.length) {
    container.innerHTML = `<div class="empty-hint">${emptyText}</div>`;
    return;
  }
  commands.forEach((cmd) => {
    const row = document.createElement('div');
    row.className = 'command-row';
    const group = formatGroupBadges(commandGroupNames(cmd));
    const nameTitle = escapeHtml(cmd.name || '');
    const cmdTitle = escapeHtml(cmd.command || '');
    const descTitle = escapeHtml(cmd.description || '');
    row.innerHTML = `
      <div class="command-main">
        <span class="command-name" data-tooltip="${nameTitle}">${cmd.favorite ? '<span class="star">★</span>' : ''}<span class="command-name-text">${escapeHtml(truncate(cmd.name, 48))}</span></span>
        <span class="command-cmd" data-tooltip="${cmdTitle}">${escapeHtml(truncate(cmd.command, 72))}</span>
        ${cmd.description ? `<span class="command-desc" data-tooltip="${descTitle}">${escapeHtml(truncate(cmd.description, 64))}</span>` : ''}
        ${group}
      </div>
      <div class="row-actions">
        <button class="btn fav-btn small">${cmd.favorite ? 'Quitar favorito' : 'Marcar favorito'}</button>
        <button class="btn copy-btn small">Copiar</button>
        <button class="btn edit-btn small">Editar</button>
        <button class="btn danger small del-btn">Eliminar</button>
      </div>`;
    row.querySelector('.fav-btn').addEventListener('click', async () => {
      await App().ToggleFavorite(cmd.id);
      showToast(cmd.favorite ? 'Quitado de favoritos.' : 'Marcado como favorito.', 'info');
      await refreshAll();
    });
    row.querySelector('.copy-btn').addEventListener('click', () => copyCommand(cmd));
    row.querySelector('.edit-btn').addEventListener('click', () => openCommandEditor(cmd));
    row.querySelector('.del-btn').addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar este comando?', { danger: true });
      if (!ok) return;
      await App().DeleteCommand(cmd.id);
      showToast('Comando eliminado.', 'danger');
      await refreshAll();
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
// Custom select (grupo) — estilo neumorphism, sin <select> nativo
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
  try {
    const wasEditing = !!state.editingCommandId;
    if (wasEditing) {
      await App().UpdateCommand(state.editingCommandId, input);
    } else {
      await App().CreateCommand(input);
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
    container.innerHTML = '<div class="empty-hint">Aún no hay grupos. Crea uno para organizar tus comandos.</div>';
    return;
  }
  state.groups.forEach((g) => {
    const count = state.commands.filter((c) => c.groupId === g.id).length;
    const row = document.createElement('div');
    row.className = 'project-row';
    const descPart = g.description ? ' · ' + truncate(g.description, 40) : '';
    row.innerHTML = `
      <div class="command-main">
        <span class="command-name" data-tooltip="${escapeHtml(g.name)}"><span class="command-name-text">${escapeHtml(truncate(g.name, 40))}</span></span>
        <span class="command-cmd" data-tooltip="${escapeHtml(count + (count === 1 ? ' comando' : ' comandos') + (g.description ? ' · ' + g.description : ''))}">${count} ${count === 1 ? 'comando' : 'comandos'}${g.description ? ' · ' + escapeHtml(truncate(g.description, 40)) : ''}</span>
      </div>
      <div class="row-actions">
        <button class="btn edit-btn small">Editar</button>
        <button class="btn danger small del-btn">Eliminar</button>
      </div>`;
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
  try {
    const wasEditing = !!state.editingGroupId;
    if (wasEditing) {
      await App().UpdateGroup(state.editingGroupId, input);
    } else {
      await App().CreateGroup(input);
    }
    closeGroupEditor();
    showToast(wasEditing ? 'Grupo actualizado.' : 'Grupo creado.', 'success');
    await refreshAll();
  } catch (err) {
    await showAlert(`No se pudo guardar el grupo: ${err}`);
  }
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
    return `<span class="command-group" data-tooltip="${escapeHtml(names[0])}">${first}</span>`;
  }
  const extra = names.length - 1;
  const allTitle = escapeHtml(names.join(', '));
  return `<span class="command-groups" data-tooltip="${allTitle}">
    <span class="command-group">${first}</span>
    <span class="command-group command-group-extra">+${extra} grupo${extra === 1 ? '' : 's'}</span>
  </span>`;
}
