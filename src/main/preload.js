'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

contextBridge.exposeInMainWorld('api', {
  getConfig: () => call('config:get'),
  chooseFolder: (current) => call('config:chooseFolder', current),
  setDataDir: (dir, mode) => call('config:setDataDir', dir, mode),
  setOpenAtLogin: (on) => call('config:openAtLogin', on),
  openDataFolder: () => call('shell:openDataFolder'),
  checkUpdate: () => call('update:check'),
  downloadUpdate: () => call('update:download'),
  installUpdate: () => call('update:install'),
  onUpdateProgress: (fn) => ipcRenderer.on('update:progress', (_e, percent) => fn(percent)),
  load: () => call('data:load'),
  saveColumns: (list) => call('config:columns', list),
  saveTask: (t) => call('task:save', t),
  deleteTask: (id) => call('task:delete', id),
  saveNote: (n) => call('note:save', n),
  deleteNote: (id) => call('note:delete', id),
  saveProject: (p) => call('project:save', p),
  deleteProject: (codice) => call('project:delete', codice),
  saveCategory: (c) => call('category:save', c),
  deleteCategory: (id) => call('category:delete', id),
  saveTag: (catId, t) => call('tag:save', catId, t),
  deleteTag: (catId, id) => call('tag:delete', catId, id),
  mergeTag: (catId, from, to) => call('tag:merge', catId, from, to),
  restoreTrash: (id) => call('trash:restore', id),
  deleteTrash: (id) => call('trash:delete', id),
  emptyTrash: () => call('trash:empty'),
  onDataChanged: (fn) => ipcRenderer.on('data:changed', () => fn()),
  onBeforeClose: (fn) => ipcRenderer.on('app:before-close', () => fn()),
  closeOk: () => ipcRenderer.send('app:close-ok'),
  closeFail: () => ipcRenderer.send('app:close-fail')
});
