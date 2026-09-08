// Vault — services/vault-api.js
// Single boundary for every backend call. The rest of the app never imports
// `getApp()` directly — it goes through here. Easy to swap or mock.

import { getApp } from '../core/bridge.js';

function app() {
  const a = getApp();
  if (!a) throw new Error('Wails bridge no disponible');
  return a;
}

export const vaultApi = {
  getCommands: () => app().GetCommands(),
  getGroups: () => app().GetGroups(),
  createCommand: (input) => app().CreateCommand(input),
  updateCommand: (id, input) => app().UpdateCommand(id, input),
  deleteCommand: (id) => app().DeleteCommand(id),
  toggleFavorite: (id) => app().ToggleFavorite(id),
  createGroup: (input) => app().CreateGroup(input),
  updateGroup: (id, input) => app().UpdateGroup(id, input),
  deleteGroup: (id) => app().DeleteGroup(id),
};
