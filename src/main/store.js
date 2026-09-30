'use strict';
// Archivio su file: ogni task, progetto, categoria e tag è un file Markdown.
//
//   <cartella>/
//     taccuino.json                 impostazioni della cartella (versione, prossimo ID)
//     tasks/T-042.md                un file per task
//     projects/VEND.md              un file per progetto (descrizione + decisioni)
//     tags/<categoria>/_categoria.md
//     tags/<categoria>/<tag>.md     un file per tag (descrizione nel corpo)
//     .cestino/<data_ora>/…         elementi eliminati, con voce.json (tipo, nome, percorso)
//
// Qui stanno le letture, le scritture e le regole sui dati; il formato dei file è in formats.js.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const fm = require('./frontmatter');
const { readDirSafe, renameRetry, writeAtomic } = require('./fsutil');
const {
  SYSTEM_CATEGORIES, slugify, today, stamp, isSafeName, idNum,
  parseTask, serializeTask, taskHistory, parseProject, serializeProject,
  parseCategory, serializeCategory, parseTag, serializeTag
} = require('./formats');

const TRASH = '.cestino';
const CONFIG = 'taccuino.json';

const DEFAULT_CATEGORIES = [
  { id: 'stato', nome: 'Stato', tipo: 'singola', obbligatoria: true, ordine: 1,
    descrizione: 'Gli stati segnati come "chiuso" nascondono il task dalla lista principale.',
    tags: [
      { id: 'da-fare', nome: 'Da fare', colore: '#4A473F', ordine: 1, chiuso: false, descrizione: 'Non ancora iniziato.' },
      { id: 'in-corso', nome: 'In corso', colore: '#2346A8', ordine: 2, chiuso: false, descrizione: 'Ci sto lavorando.' },
      { id: 'in-attesa', nome: 'In attesa', colore: '#8A4B06', ordine: 3, chiuso: false, descrizione: 'Bloccato da qualcun altro.' },
      { id: 'fatto', nome: 'Fatto', colore: '#146C43', ordine: 4, chiuso: true, descrizione: 'Chiuso: resta nello storico.' }
    ] },
  { id: 'priorita', nome: 'Priorità', tipo: 'singola', obbligatoria: false, ordine: 2,
    descrizione: "L'ordine dei valori decide l'ordinamento nella lista.",
    tags: [
      { id: 'alta', nome: 'Alta', colore: '#B42318', ordine: 1, descrizione: 'Da fare oggi o domani.' },
      { id: 'media', nome: 'Media', colore: '#B54708', ordine: 2, descrizione: 'Entro la settimana.' },
      { id: 'bassa', nome: 'Bassa', colore: '#6B675E', ordine: 3, descrizione: "Quando c'è tempo." }
    ] },
  { id: 'etichette', nome: 'Etichette', tipo: 'multipla', obbligatoria: false, ordine: 3,
    descrizione: 'Etichette libere, trasversali ai progetti.', tags: [] }
];

// Unisce i segmenti a una cartella rifiutando i nomi che potrebbero uscirne (.., separatori, percorsi assoluti).
function safeJoin(base, parts) {
  for (const part of parts) if (!isSafeName(part)) throw new Error('Nome file non valido: ' + part);
  return path.join(base, ...parts);
}

// Legge tutti i .md di una cartella: un file illeggibile si salta e si segnala in console.
async function readMdDir(dir, parse, label) {
  const out = [];
  for (const e of await readDirSafe(dir)) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    try { out.push(parse(await fsp.readFile(path.join(dir, e.name), 'utf8'), e.name.slice(0, -3))); } catch (err) { console.error(label, e.name, err); }
  }
  return out;
}

const byOrderThenName = (a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.lastWrite = 0;
  }

  p(...parts) { return safeJoin(this.dir, parts); }
  trashPath(entry, ...parts) { return safeJoin(path.join(this.dir, TRASH), [entry, ...parts]); }

  // lastWrite permette al watcher di main.js di ignorare le modifiche fatte dall'app stessa.
  async write(file, content) { this.lastWrite = Date.now(); await writeAtomic(file, content); this.lastWrite = Date.now(); }
  async remove(file) { this.lastWrite = Date.now(); await fsp.rm(file, { force: true, recursive: true }); }

  async readConfig() {
    try { return JSON.parse(await fsp.readFile(path.join(this.dir, CONFIG), 'utf8')); } catch { return {}; }
  }

  async writeConfig(cfg) { await this.write(path.join(this.dir, CONFIG), JSON.stringify(cfg, null, 2) + '\n'); }

  static async isDataFolder(dir) {
    try { await fsp.access(path.join(dir, CONFIG)); return true; } catch { return false; }
  }

  // Crea la struttura se manca. Non sovrascrive nulla di esistente.
  async init({ withDefaultProject = false } = {}) {
    await fsp.mkdir(this.dir, { recursive: true });
    for (const d of ['tasks', 'projects', 'tags']) await fsp.mkdir(path.join(this.dir, d), { recursive: true });
    const isNew = !(await Store.isDataFolder(this.dir));
    if (isNew) await this.writeConfig({ app: 'Taccuino', version: 1, creato: today() });
    for (const cat of DEFAULT_CATEGORIES) {
      const catFile = path.join(this.dir, 'tags', cat.id, '_categoria.md');
      if (fs.existsSync(catFile)) continue;
      if (fs.existsSync(path.join(this.dir, 'tags', cat.id))) continue;
      // Le categorie facoltative si creano solo in una cartella nuova: se l'utente le elimina non tornano.
      if (!isNew && !SYSTEM_CATEGORIES.includes(cat.id)) continue;
      await this.saveCategory(cat);
      for (const t of cat.tags) await this.saveTag(cat.id, t);
    }
    if (isNew && withDefaultProject) {
      const projects = await this.loadProjects();
      if (projects.length === 0) await this.saveProject({ codice: 'GEN', nome: 'Generale', colore: '#2F5BD3', descrizione: 'Task che non appartengono a un progetto specifico.' });
    }
  }

  async loadAll() {
    const [categories, projects, tasks] = await Promise.all([this.loadCategories(), this.loadProjects(), this.loadTasks()]);
    return { dir: this.dir, categories, projects, tasks, cestino: await this.listTrash() };
  }

  // ---------- Task
  async loadTasks() {
    const out = await readMdDir(path.join(this.dir, 'tasks'), parseTask, 'Task illeggibile');
    return out.sort((a, b) => idNum(b.id) - idNum(a.id));
  }

  // Conta anche i task nel cestino e quelli già cancellati per sempre (ultimoId): un ID non torna mai.
  async nextTaskId() {
    const tasks = await this.loadTasks();
    const trashed = (await this.listTrash()).filter((v) => v.tipo === 'task').map((v) => idNum(path.basename(v.percorso)));
    const max = Math.max(0, Number((await this.readConfig()).ultimoId) || 0, ...trashed, ...tasks.map((t) => idNum(t.id)));
    return 'T-' + String(max + 1).padStart(3, '0');
  }

  // Salva un task nuovo (senza id) o esistente: aggiorna date, completato e storico rispetto alla versione su disco.
  async saveTask(input, categories) {
    const t = JSON.parse(JSON.stringify(input));
    const now = today();
    let prev = null;
    if (t.id) {
      try { prev = parseTask(await fsp.readFile(this.p('tasks', t.id + '.md'), 'utf8'), t.id); } catch { prev = null; }
    } else {
      t.id = await this.nextTaskId();
    }
    t.titolo = String(t.titolo || '').trim() || 'Senza titolo';
    t.stato = t.stato || 'da-fare';
    t.creato = prev ? prev.creato || t.creato || now : t.creato || now;
    t.aggiornato = now;
    const cats = categories || (await this.loadCategories());
    // completato si imposta entrando in uno stato "chiuso" e si toglie uscendone.
    const closed = new Set(((cats.find((c) => c.id === 'stato') || {}).tags || []).filter((x) => x.chiuso).map((x) => x.id));
    if (closed.has(t.stato)) t.completato = (prev && closed.has(prev.stato) && prev.completato) || t.completato || now;
    else t.completato = null;
    t.storico = [...(prev ? prev.storico : []), ...taskHistory(prev, t, cats, now)];
    await this.write(this.p('tasks', t.id + '.md'), serializeTask(t));
    return parseTask(serializeTask(t), t.id);
  }

  async deleteTask(id) {
    const titolo = await this.displayName(this.p('tasks', id + '.md'), '');
    await this.trash('task', titolo ? `${id} · ${titolo}` : id, 'tasks', id + '.md');
  }

  async writeTask(t) { await this.write(this.p('tasks', t.id + '.md'), serializeTask(t)); }

  // ---------- Progetti
  async loadProjects() {
    const out = await readMdDir(path.join(this.dir, 'projects'), parseProject, 'Progetto illeggibile');
    return out.sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999) || a.nome.localeCompare(b.nome, 'it'));
  }

  async saveProject(p) {
    const codice = String(p.codice || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!codice) throw new Error('Il codice progetto è obbligatorio.');
    const out = { ...p, codice, nome: String(p.nome || codice).trim() };
    await this.write(this.p('projects', codice + '.md'), serializeProject(out));
    return parseProject(serializeProject(out), codice);
  }

  async deleteProject(codice) {
    const tasks = await this.loadTasks();
    if (tasks.some((t) => t.progetto === codice)) throw new Error('Il progetto ha dei task: archivialo invece di eliminarlo.');
    await this.trash('progetto', await this.displayName(this.p('projects', codice + '.md'), codice), 'projects', codice + '.md');
  }

  // ---------- Categorie e tag
  async loadCategories() {
    const root = path.join(this.dir, 'tags');
    const out = [];
    for (const e of await readDirSafe(root)) {
      if (!e.isDirectory() || !isSafeName(e.name)) continue;
      const dir = path.join(root, e.name);
      const text = await fsp.readFile(path.join(dir, '_categoria.md'), 'utf8').catch(() => null);   // categoria senza file descrittivo
      const cat = parseCategory(text, e.name);
      cat.tags = (await readMdDir(dir, parseTag, 'Tag illeggibile')).filter((t) => t.id !== '_categoria').sort(byOrderThenName);
      out.push(cat);
    }
    return out.sort(byOrderThenName);
  }

  async saveCategory(c) {
    const id = c.id || slugify(c.nome);
    await this.write(this.p('tags', id, '_categoria.md'), serializeCategory(c, id));
    return id;
  }

  async deleteCategory(id) {
    if (SYSTEM_CATEGORIES.includes(id)) throw new Error('Stato e Priorità non si possono eliminare.');
    await this.trash('categoria', await this.displayName(this.p('tags', id, '_categoria.md'), id), 'tags', id);
    await this.stripFromTasks(id, null);
  }

  // Un tag nuovo prende l'ID dal nome; se esiste già si aggiunge un numero (riunione-2).
  async saveTag(catId, t) {
    let id = t.id;
    if (!id) {
      id = slugify(t.nome);
      let n = 2;
      while (fs.existsSync(this.p('tags', catId, id + '.md'))) id = slugify(t.nome) + '-' + n++;
    }
    await this.write(this.p('tags', catId, id + '.md'), serializeTag(t, id, catId));
    return id;
  }

  async deleteTag(catId, id) {
    if (SYSTEM_CATEGORIES.includes(catId)) {
      const tasks = await this.loadTasks();
      if (tasks.some((t) => t[catId] === id)) throw new Error('Il valore è usato da alcuni task: cambiali prima di eliminarlo.');
    }
    await this.trash('tag', await this.displayName(this.p('tags', catId, id + '.md'), id), 'tags', catId, id + '.md');
    if (!SYSTEM_CATEGORIES.includes(catId)) await this.stripFromTasks(catId, id);
  }

  // Unisce il tag "fromId" in "toId" (stessa categoria) e poi elimina "fromId".
  async mergeTag(catId, fromId, toId) {
    const tasks = await this.loadTasks();
    const system = SYSTEM_CATEGORIES.includes(catId);
    const cats = system ? await this.loadCategories() : null;
    for (const t of tasks) {
      if (system) {
        // Stato e priorità sono campi del task, non tag: saveTask aggiorna anche storico e completato.
        if (t[catId] === fromId) await this.saveTask({ ...t, [catId]: toId }, cats);
        continue;
      }
      const v = t.tags[catId];
      if (Array.isArray(v) && v.includes(fromId)) t.tags[catId] = Array.from(new Set(v.map((x) => (x === fromId ? toId : x))));
      else if (v === fromId) t.tags[catId] = toId;
      else continue;
      await this.writeTask(t);
    }
    await this.trash('tag', await this.displayName(this.p('tags', catId, fromId + '.md'), fromId), 'tags', catId, fromId + '.md');
  }

  // Toglie un tag (o, con tagId null, tutta la categoria) dai task che lo usano.
  async stripFromTasks(catId, tagId) {
    const tasks = await this.loadTasks();
    for (const t of tasks) {
      const v = t.tags[catId];
      if (v === undefined) continue;
      if (tagId === null) delete t.tags[catId];
      else if (Array.isArray(v)) {
        if (!v.includes(tagId)) continue;
        t.tags[catId] = v.filter((x) => x !== tagId);
      } else if (v === tagId) delete t.tags[catId];
      else continue;
      await this.writeTask(t);
    }
  }

  // ---------- Cestino
  // Nome leggibile di un file che sta per finire nel cestino.
  async displayName(file, fallback) {
    try {
      const { data } = fm.parse(await fsp.readFile(file, 'utf8'));
      return String(data.titolo || data.nome || fallback);
    } catch { return fallback; }
  }

  // Sposta un file o una cartella in .cestino/<data_ora>/, mantenendo il percorso relativo.
  async trash(tipo, nome, ...parts) {
    const src = this.p(...parts);
    if (!fs.existsSync(src)) return;
    const base = stamp();
    let entry = base;
    let n = 2;
    while (fs.existsSync(path.join(this.dir, TRASH, entry))) entry = base + '-' + n++;
    const dest = this.trashPath(entry, ...parts);
    this.lastWrite = Date.now();
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await renameRetry(src, dest);
    await this.write(this.trashPath(entry, 'voce.json'), JSON.stringify({ tipo, nome, percorso: parts.join('/'), eliminato: new Date().toISOString() }, null, 2) + '\n');
  }

  async listTrash() {
    const out = [];
    for (const e of await readDirSafe(path.join(this.dir, TRASH))) {
      if (!e.isDirectory() || !isSafeName(e.name)) continue;
      try {
        const v = JSON.parse(await fsp.readFile(path.join(this.dir, TRASH, e.name, 'voce.json'), 'utf8'));
        out.push({ id: e.name, tipo: String(v.tipo || ''), nome: String(v.nome || ''), percorso: String(v.percorso || ''), eliminato: String(v.eliminato || '') });
      } catch (err) { console.error('Voce del cestino illeggibile', e.name, err); }
    }
    return out.sort((a, b) => b.eliminato.localeCompare(a.eliminato));
  }

  async trashEntry(id) {
    const v = (await this.listTrash()).find((x) => x.id === id);
    if (!v) throw new Error('Elemento non trovato nel Cestino.');
    return v;
  }

  async restoreTrash(id) {
    const v = await this.trashEntry(id);
    const parts = v.percorso.split('/');
    const dest = this.p(...parts);
    if (fs.existsSync(dest)) throw new Error(`Esiste già «${v.percorso}»: eliminalo o rinominalo prima di ripristinare.`);
    if (v.tipo === 'tag' && !fs.existsSync(this.p('tags', parts[1]))) throw new Error(`La categoria «${parts[1]}» non esiste più: ripristina prima la categoria dal Cestino.`);
    this.lastWrite = Date.now();
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await renameRetry(this.trashPath(id, ...parts), dest);
    await this.remove(this.trashPath(id));
  }

  async deleteTrash(id) { await this.purge([await this.trashEntry(id)]); }
  async emptyTrash() { await this.purge(await this.listTrash()); }
  async purgeTrash(days = 30) {
    const limit = Date.now() - days * 86400000;
    await this.purge((await this.listTrash()).filter((v) => Date.parse(v.eliminato) < limit));
  }

  // Cancella per sempre. L'ID più alto dei task cancellati resta in taccuino.json, così non viene riassegnato.
  async purge(entries) {
    const ids = entries.filter((v) => v.tipo === 'task').map((v) => idNum(path.basename(v.percorso)));
    if (ids.length) {
      const cfg = await this.readConfig();
      const max = Math.max(...ids);
      if ((Number(cfg.ultimoId) || 0) < max) await this.writeConfig({ ...cfg, ultimoId: max });
    }
    for (const v of entries) await this.remove(this.trashPath(v.id));
  }
}

module.exports = { Store, slugify, today };
