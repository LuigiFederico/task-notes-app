'use strict';
// Operazioni sul file system pensate per una cartella sincronizzata da OneDrive.

const fsp = require('fs').promises;
const path = require('path');

const RETRY_CODES = ['EPERM', 'EBUSY'];
const RETRY_WAIT = [100, 200, 300, 400];

async function readDirSafe(dir) {
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
}

// OneDrive può tenere bloccato un file per qualche istante: riprova prima di arrendersi.
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { return await fsp.rename(from, to); } catch (err) {
      if (!RETRY_CODES.includes(err.code) || i >= RETRY_WAIT.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_WAIT[i]));
    }
  }
}

// Scrive in un file temporaneo e poi lo rinomina, così OneDrive non sincronizza mai un file scritto a metà.
async function writeAtomic(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  await fsp.writeFile(tmp, content, 'utf8');
  try { await renameRetry(tmp, file); } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

module.exports = { readDirSafe, renameRetry, writeAtomic };
