'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');

// Per sviluppo e test: TACCUINO_USERDATA sposta le impostazioni locali in un'altra cartella.
if (process.env.TACCUINO_USERDATA) app.setPath('userData', process.env.TACCUINO_USERDATA);

// Interfaccia in italiano anche per i controlli nativi (es. il selettore di date).
app.commandLine.appendSwitch('lang', 'it-IT');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
let win = null;
let store = null;
let watcher = null;
let watchTimer = null;
let closeOk = false;

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2));
}

function suggestedFolder() {
  const base = process.env.OneDriveCommercial || process.env.OneDrive || app.getPath('documents');
  return path.join(base, 'Taccuino');
}

// Ricarica l'interfaccia quando i file cambiano da fuori (es. sincronizzazione OneDrive da un altro PC).
function watch(dir) {
  if (watcher) { watcher.close(); watcher = null; }
  try {
    watcher = fs.watch(dir, { recursive: true }, (_evt, file) => {
      if (!file || /\.tmp-\d+$/.test(file)) return;
      if (store && Date.now() - store.lastWrite < 1500) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('data:changed'); }, 600);
    });
  } catch (err) { console.error('Impossibile osservare la cartella', err); }
}

async function openStore(dir, opts) {
  const s = new Store(dir);
  await s.init(opts);
  try { await s.purgeTrash(30); } catch (err) { console.error('Pulizia del cestino non riuscita', err); }
  store = s;
  watch(dir);
  return s;
}

function createWindow() {
  const cfg = readConfig();
  const bounds = cfg.window || { width: 1440, height: 900 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 1024,
    minHeight: 640,
    title: 'Taccuino',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icona.png'),
    backgroundColor: '#F6F5F1',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Link esterni nel browser, mai dentro l'app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.webContents.on('before-input-event', (_e, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });

  // Prima di chiudere, il renderer salva il campo in modifica. Se il salvataggio fallisce la finestra resta aperta.
  let closeTimer = null;
  win.on('close', (e) => {
    if (!closeOk) {
      e.preventDefault();
      win.webContents.send('app:before-close');
      clearTimeout(closeTimer);
      closeTimer = setTimeout(allowClose, 5000);  // renderer bloccato: chiudi comunque
      return;
    }
    const c = readConfig();
    c.maximized = win.isMaximized();
    if (!c.maximized) c.window = win.getBounds();
    writeConfig(c);
  });
  win.webContents.on('render-process-gone', allowClose);
  ipcMain.removeAllListeners('app:close-ok');
  ipcMain.removeAllListeners('app:close-fail');
  ipcMain.on('app:close-ok', allowClose);
  ipcMain.on('app:close-fail', () => clearTimeout(closeTimer));

  function allowClose() {
    clearTimeout(closeTimer);
    closeOk = true;
    if (win && !win.isDestroyed()) win.close();
  }
}

// Errori del file system in parole comprensibili. Gli errori dello Store (già in italiano) non hanno code.
const FS_ERRORS = {
  EPERM: 'Il file è bloccato, forse da OneDrive che lo sta sincronizzando. Riprova tra qualche secondo.',
  EBUSY: 'Il file è bloccato, forse da OneDrive che lo sta sincronizzando. Riprova tra qualche secondo.',
  EACCES: 'Taccuino non ha il permesso di scrivere nella cartella dati. Controlla i permessi della cartella.',
  ENOENT: 'Un file non si trova più: forse è stato spostato o eliminato da fuori. Premi F5 per ricaricare.',
  ENOSPC: 'Il disco è pieno: libera spazio e riprova.'
};
function errorMessage(err) {
  if (err && FS_ERRORS[err.code]) return `${FS_ERRORS[err.code]} (${err.code})`;
  return (err && err.message) || String(err);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: errorMessage(err) }; }
  });
}

function requireStore() { if (!store) throw new Error('Nessuna cartella dati aperta.'); return store; }

// Aggiornamenti da GitHub Releases, solo quando li si chiede dalle Impostazioni.
// Si aggiorna solo la copia installata con il Setup: lo zip e il portabile non hanno il programma di disinstallazione accanto.
function updateBlock() {
  if (!app.isPackaged) return 'Gli aggiornamenti funzionano solo nella versione installata, non in sviluppo.';
  if (!fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Taccuino.exe'))) return 'Questa copia di Taccuino non è installata (zip o versione portabile), quindi non si aggiorna da sola. Scarica e installa «Taccuino Setup» dalla pagina delle release.';
  return null;
}

let updater = null;
function getUpdater() {
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = false;
    updater.on('error', (err) => console.error('Aggiornamento non riuscito', err));
    updater.on('download-progress', (p) => { if (win && !win.isDestroyed()) win.webContents.send('update:progress', Math.floor(p.percent)); });
  }
  return updater;
}

// Gli errori di electron-updater possono contenere la risposta HTTP intera: basta la prima riga.
async function updateStep(what, fn) {
  try { return await fn(); } catch (err) { throw new Error(`${what} non riuscito: ${String(err.message || err).split('\n')[0]}`); }
}

handle('config:get', async () => {
  const cfg = readConfig();
  let ready = false;
  if (cfg.dataDir && fs.existsSync(cfg.dataDir) && (await Store.isDataFolder(cfg.dataDir))) {
    if (!store || store.dir !== cfg.dataDir) await openStore(cfg.dataDir);
    ready = true;
  }
  return { dataDir: cfg.dataDir || null, ready, suggested: suggestedFolder(), version: app.getVersion(), openAtLogin: app.getLoginItemSettings().openAtLogin, updateBlock: updateBlock() };
});

handle('config:chooseFolder', async (current) => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli la cartella dei dati', defaultPath: current || suggestedFolder(), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

handle('config:setDataDir', async (dir, mode) => {
  if (!dir) throw new Error('Indica una cartella.');
  dir = path.resolve(dir);
  const exists = await Store.isDataFolder(dir);
  if (mode === 'open' && !exists) throw new Error('In questa cartella non ci sono dati di Taccuino. Scegli "Crea una nuova cartella".');
  await openStore(dir, { withDefaultProject: !exists });
  const cfg = readConfig();
  cfg.dataDir = dir;
  writeConfig(cfg);
  return dir;
});

handle('config:openAtLogin', async (on) => { app.setLoginItemSettings({ openAtLogin: !!on }); return !!on; });
handle('shell:openDataFolder', async () => { await shell.openPath(requireStore().dir); return true; });

handle('update:check', () => updateStep('Controllo degli aggiornamenti', async () => {
  const r = await getUpdater().checkForUpdates();
  return r && r.isUpdateAvailable ? r.updateInfo.version : null;
}));
handle('update:download', () => updateStep('Scaricamento', async () => { await getUpdater().downloadUpdate(); return true; }));
// Il renderer ha già salvato il campo in modifica: la finestra può chiudersi subito. Il Setup gira in silenzio e riapre l'app.
handle('update:install', async () => { closeOk = true; getUpdater().quitAndInstall(true, true); return true; });

handle('data:load', async () => requireStore().loadAll());
handle('task:save', async (t) => requireStore().saveTask(t));
handle('task:delete', async (id) => requireStore().deleteTask(id));
handle('project:save', async (p) => requireStore().saveProject(p));
handle('project:delete', async (codice) => requireStore().deleteProject(codice));
handle('category:save', async (c) => requireStore().saveCategory(c));
handle('category:delete', async (id) => requireStore().deleteCategory(id));
handle('tag:save', async (catId, t) => requireStore().saveTag(catId, t));
handle('tag:delete', async (catId, id) => requireStore().deleteTag(catId, id));
handle('tag:merge', async (catId, from, to) => requireStore().mergeTag(catId, from, to));
handle('trash:restore', async (id) => requireStore().restoreTrash(id));
handle('trash:delete', async (id) => requireStore().deleteTrash(id));
handle('trash:empty', async () => requireStore().emptyTrash());

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId('it.miroglio.luigi.taccuino');
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
