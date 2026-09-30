// Impostazioni: cartella dati (anche al primo avvio), aggiornamenti, cestino, corvo e avvio con Windows.
import { S } from '../state.js';
import { mascot } from '../mascot.js';
import { api, render, reload, run, toast } from '../core.js';
import { flush } from './task.js';

export const actions = {
  'setup-mode': (el) => { S.ui.setupMode = el.dataset.value; S.ui.setupError = null; render(); },
  'choose-folder': () => run(async () => {
    const d = await api.chooseFolder(S.ui.setupDir || S.config.dataDir || S.config.suggested);
    if (d) {
      S.ui.setupDir = S.ui.setupMode === 'new' && !/Taccuino$/i.test(d) ? d + '\\Taccuino' : d;
      render();
    }
  }),
  'setup-start': () => run(async () => {
    const dir = (document.getElementById('setup-dir')?.value || '').trim();
    try { await api.setDataDir(dir, S.ui.setupMode); } catch (err) { S.ui.setupError = err.message; render(); return; }
    S.ui.setupError = null;
    S.ui.setupDir = null;
    S.config = await api.getConfig();
    S.view = { name: 'tasks' };
    await reload();
    mascot.react('welcome');
  }),
  'change-folder': () => {
    S.ui.setupDir = S.data.dir;
    S.ui.setupMode = 'open';
    S.view = { name: 'setup' };
    render();
  },
  'open-data-folder': () => run(() => api.openDataFolder()),
  'update-check': () => run(async () => {
    S.ui.update = { stato: 'controllo' };
    render();
    try {
      const versione = await api.checkUpdate();
      if (!versione) {
        S.ui.update = null;
        render();
        toast(`Hai già l'ultima versione (${S.config.version})`);
        return;
      }
      S.ui.update = { stato: 'scarico', versione, percento: 0 };
      render();
      await api.downloadUpdate();
      S.ui.update.stato = 'pronto';
      render();
    } catch (err) { S.ui.update = null; render(); throw err; }
  }),
  'update-install': () => run(async () => { await flush(); await api.installUpdate(); }),
  'trash-restore': (el) => run(async () => {
    await api.restoreTrash(el.dataset.id);
    await reload();
    toast('Ripristinato dal Cestino');
  }),
  'trash-delete': (el) => run(async () => {
    await api.deleteTrash(el.dataset.id);
    S.ui.confirm = null;
    await reload();
    toast('Eliminato per sempre');
  }),
  'trash-empty': () => run(async () => {
    await api.emptyTrash();
    S.ui.confirm = null;
    await reload();
    toast('Cestino svuotato');
  })
};

export const changes = {
  'mascot-visible': (el) => { mascot.setPrefs({ visible: el.checked }); render(); },
  'mascot-reduced': (el) => { mascot.setPrefs({ reduced: el.checked }); render(); },
  'open-at-login': (el) => run(async () => { await api.setOpenAtLogin(el.checked); S.config.openAtLogin = el.checked; })
};

export const inputs = {
  'setup-dir': (el) => { S.ui.setupDir = el.value; }
};
