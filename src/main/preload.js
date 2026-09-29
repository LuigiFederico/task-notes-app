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
  load: () => call('data:load'),
  saveTask: (t) => call('task:save', t),
  deleteTask: (id) => call('task:delete', id),
  saveProject: (p) => call('project:save', p),
  deleteProject: (codice) => call('project:delete', codice),
  saveCategory: (c) => call('category:save', c),
  deleteCategory: (id) => call('category:delete', id),
  saveTag: (catId, t) => call('tag:save', catId, t),
  deleteTag: (catId, id) => call('tag:delete', catId, id),
  mergeTag: (catId, from, to) => call('tag:merge', catId, from, to),
  onDataChanged: (fn) => ipcRenderer.on('data:changed', () => fn())
});
