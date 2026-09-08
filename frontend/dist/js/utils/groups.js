// Vault — utils/groups.js
// Group-related pure helpers. No DOM, no side effects.

import { groupName, state } from '../core/store.js';
import { escapeHtml, truncate } from './html.js';

/** @param {number|string} groupId */
export function commandsInGroup(groupId) {
  return state.commands.filter(
    (c) => c.groupId === groupId || (Array.isArray(c.groupIds) && c.groupIds.includes(groupId)),
  );
}

/** @param {object} cmd */
export function commandGroupNames(cmd) {
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
 * Render badge(s). If multiple groups: first badge + "+N grupos" con tooltip "Asignado a ...".
 * @param {string[]} names
 * @param {number} [nameMax=18]
 * @returns {string} HTML string (already escaped)
 */
export function formatGroupBadges(names, nameMax = 18) {
  if (!names.length) return '';
  const first = escapeHtml(truncate(names[0], nameMax));
  const tipSingle = escapeHtml(`Asignado a ${names[0]}`);
  if (names.length === 1) {
    return `<span class="command-group" data-tooltip="${tipSingle}">${first}</span>`;
  }
  const extra = names.length - 1;
  const allTitle = escapeHtml(`Asignado a ${names.join(', ')}`);
  return `<span class="command-groups" data-tooltip="${allTitle}">
    <span class="command-group">${first}</span>
    <span class="command-group command-group-extra">+${extra} grupo${extra === 1 ? '' : 's'}</span>
  </span>`;
}

/**
 * DOM version: append badges to a container (no innerHTML).
 * Tooltip siempre "Asignado a ..." para feedback claro (pide el panel).
 * @param {HTMLElement} container - e.g. .command-main
 * @param {string[]} names
 * @param {number} [nameMax=18]
 */
export function appendGroupBadges(container, names, nameMax = 18) {
  if (!container || !names.length) return;
  container.querySelectorAll('.command-group, .command-groups').forEach((el) => el.remove());
  if (names.length === 1) {
    const badge = document.createElement('span');
    badge.className = 'command-group';
    badge.textContent = truncate(names[0], nameMax);
    badge.setAttribute('data-tooltip', `Asignado a ${names[0]}`);
    container.appendChild(badge);
    return;
  }
  const wrap = document.createElement('span');
  wrap.className = 'command-groups';
  wrap.setAttribute('data-tooltip', `Asignado a ${names.join(', ')}`);
  const first = document.createElement('span');
  first.className = 'command-group';
  first.textContent = truncate(names[0], nameMax);
  const extra = document.createElement('span');
  extra.className = 'command-group command-group-extra';
  const n = names.length - 1;
  extra.textContent = `+${n} grupo${n === 1 ? '' : 's'}`;
  wrap.append(first, extra);
  container.appendChild(wrap);
}
