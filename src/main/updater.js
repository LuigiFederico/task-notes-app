'use strict';
// Aggiornamenti da GitHub Releases, solo quando li si chiede dalle Impostazioni.
// Si aggiorna solo la copia installata con il Setup: lo zip e il portabile non hanno il programma di disinstallazione accanto.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Perché questa copia non si può aggiornare, oppure null. Il messaggio compare nelle Impostazioni al posto del pulsante.
function updateBlock() {
  if (!app.isPackaged) return 'Gli aggiornamenti funzionano solo nella versione installata, non in sviluppo.';
  if (!fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Taccuino.exe'))) return 'Questa copia di Taccuino non è installata (zip o versione portabile), quindi non si aggiorna da sola. Scarica e installa «Taccuino Setup» dalla pagina delle release.';
  return null;
}

let updater = null;
function getUpdater(getWin) {
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = false;
    updater.on('error', (err) => console.error('Aggiornamento non riuscito', err));
    updater.on('download-progress', (p) => {
      const win = getWin();
      if (win && !win.isDestroyed()) win.webContents.send('update:progress', Math.floor(p.percent));
    });
  }
  return updater;
}

// Gli errori di electron-updater possono contenere la risposta HTTP intera: basta la prima riga.
async function updateStep(what, fn) {
  try { return await fn(); } catch (err) { throw new Error(`${what} non riuscito: ${String(err.message || err).split('\n')[0]}`); }
}

// Registra i canali update:*. skipCloseCheck serve all'installazione: la finestra si chiude senza chiedere al renderer di salvare.
function registerUpdates(handle, getWin, skipCloseCheck) {
  handle('update:check', () => updateStep('Controllo degli aggiornamenti', async () => {
    const r = await getUpdater(getWin).checkForUpdates();
    return r && r.isUpdateAvailable ? r.updateInfo.version : null;
  }));
  handle('update:download', () => updateStep('Scaricamento', async () => { await getUpdater(getWin).downloadUpdate(); return true; }));
  // Il renderer ha già salvato il campo in modifica: la finestra può chiudersi subito. Il Setup gira in silenzio e riapre l'app.
  handle('update:install', async () => { skipCloseCheck(); getUpdater(getWin).quitAndInstall(true, true); return true; });
}

module.exports = { updateBlock, registerUpdates };
