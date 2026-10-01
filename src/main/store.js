'use strict';
// Archivio su file: ogni task, progetto, categoria e tag è un file Markdown.
//
//   <cartella>/
//     taccuino.json                 impostazioni della cartella (versione, ultimi ID cancellati, migrazioni, ordine delle colonne)
//     CLAUDE.md                     istruzioni per Claude sul formato dei dati, riscritte a ogni versione dell'app
//     note-personali.md             note dell'utente per Claude, importate da CLAUDE.md (l'app non le tocca)
//     tasks/T-042.md                un file per task
//     appunti/A-007.md              un file per appunto
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
  parseTask, serializeTask, taskHistory, parseNote, serializeNote, parseProject, serializeProject,
  parseCategory, serializeCategory, parseTag, serializeTag
} = require('./formats');

const TRASH = '.cestino';
// Chiave di taccuino.json con l'ID più alto cancellato per sempre, per tipo di elemento.
const LAST_ID = { task: 'ultimoId', appunto: 'ultimoAppunto' };
const CONFIG = 'taccuino.json';
const INSTRUCTIONS = 'CLAUDE.md';
const PERSONAL_NOTES = 'note-personali.md';
const PERSONAL_NOTES_TEXT = '# Note personali per Claude\n\nScrivi qui indicazioni tue per Claude (convenzioni, progetti, persone). Taccuino non modifica mai questo file.\n';

// Urgente e Backlog sono arrivati dopo: le cartelle esistenti li ricevono una volta sola (vedi migrate).
const URGENTE = { id: 'urgente', nome: 'Urgente', colore: '#7A1A12', ordine: 1, descrizione: 'Da fare subito, prima di tutto il resto.' };
const BACKLOG = { id: 'backlog', nome: 'Backlog', colore: '#A8A396', ordine: 5, descrizione: 'Prima o poi: non ancora pianificato.' };
const MIGRATIONS = ['priorita-5-livelli'];

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
      URGENTE,
      { id: 'alta', nome: 'Alta', colore: '#B42318', ordine: 2, descrizione: 'Da fare oggi o domani.' },
      { id: 'media', nome: 'Media', colore: '#B54708', ordine: 3, descrizione: 'Entro la settimana.' },
      { id: 'bassa', nome: 'Bassa', colore: '#6B675E', ordine: 4, descrizione: "Quando c'è tempo." },
      BACKLOG
    ] },
  { id: 'etichette', nome: 'Etichette', tipo: 'multipla', obbligatoria: false, ordine: 3,
    descrizione: 'Etichette libere, trasversali ai progetti.', tags: [] },
  { id: 'collegamento', nome: 'Collegamento', tipo: 'singola', obbligatoria: false, ordine: 4,
    descrizione: "Tipi di collegamento fra task e appunti. Il nome inverso è quello che si legge sull'elemento collegato.",
    tags: [
      { id: 'bloccato-da', nome: 'Bloccato da', inverso: 'Blocca', colore: '#B42318', ordine: 1, descrizione: 'Non può andare avanti finché l\'altro task non è chiuso.' },
      { id: 'dipende-da', nome: 'Dipende da', inverso: 'Necessario per', colore: '#B54708', ordine: 2, descrizione: "Ha bisogno del risultato dell'altro task." },
      { id: 'correlato-a', nome: 'Correlato a', inverso: 'Correlato a', colore: '#6B675E', ordine: 3, descrizione: 'Stesso argomento, senza dipendenze.' }
    ] }
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
    for (const d of ['tasks', 'appunti', 'projects', 'tags']) await fsp.mkdir(path.join(this.dir, d), { recursive: true });
    const isNew = !(await Store.isDataFolder(this.dir));
    if (isNew) await this.writeConfig({ app: 'Taccuino', version: 1, creato: today(), migrazioni: MIGRATIONS });
    for (const cat of DEFAULT_CATEGORIES) {
      const catFile = path.join(this.dir, 'tags', cat.id, '_categoria.md');
      if (fs.existsSync(catFile)) continue;
      if (fs.existsSync(path.join(this.dir, 'tags', cat.id))) continue;
      // Le categorie facoltative si creano solo in una cartella nuova: se l'utente le elimina non tornano.
      if (!isNew && !SYSTEM_CATEGORIES.includes(cat.id)) continue;
      await this.saveCategory(cat);
      for (const t of cat.tags) await this.saveTag(cat.id, t);
    }
    if (!isNew) await this.migrate();
    if (isNew && withDefaultProject) {
      const projects = await this.loadProjects();
      if (projects.length === 0) await this.saveProject({ codice: 'GEN', nome: 'Generale', colore: '#2F5BD3', descrizione: 'Task che non appartengono a un progetto specifico.' });
    }
  }

  // Aggiornamenti una tantum dei dati di una cartella esistente. Quelli già fatti sono elencati in taccuino.json,
  // così una modifica successiva dell'utente (es. eliminare un livello) non viene annullata.
  async migrate() {
    const cfg = await this.readConfig();
    const done = Array.isArray(cfg.migrazioni) ? cfg.migrazioni : [];
    if (MIGRATIONS.every((m) => done.includes(m))) return;
    if (!done.includes('priorita-5-livelli')) {
      // Urgente in cima e Backlog in fondo ai livelli che ci sono, senza riscrivere gli altri file.
      const prio = (await this.loadCategories()).find((c) => c.id === 'priorita');
      const tags = prio ? prio.tags : [];
      const orders = tags.map((t) => t.ordine);
      if (!tags.some((t) => t.id === URGENTE.id)) await this.saveTag('priorita', { ...URGENTE, ordine: Math.min(1, ...orders) - 1 });
      if (!tags.some((t) => t.id === BACKLOG.id)) await this.saveTag('priorita', { ...BACKLOG, ordine: Math.max(0, ...orders) + 1 });
    }
    await this.writeConfig({ ...cfg, migrazioni: [...new Set([...done, ...MIGRATIONS])] });
  }

  // Scrive CLAUDE.md (le istruzioni sul formato dei dati) quando la versione dell'app cambia o il file manca,
  // e crea note-personali.md solo se non c'è. Restituisce true se ha scritto CLAUDE.md.
  async syncInstructions(version) {
    const cfg = await this.readConfig();
    const file = path.join(this.dir, INSTRUCTIONS);
    if (cfg.istruzioni === version && fs.existsSync(file)) return false;
    await this.write(file, await fsp.readFile(path.join(__dirname, 'istruzioni-claude.md'), 'utf8'));
    const notes = path.join(this.dir, PERSONAL_NOTES);
    if (!fs.existsSync(notes)) await this.write(notes, PERSONAL_NOTES_TEXT);
    await this.writeConfig({ ...cfg, istruzioni: version });
    return true;
  }

  async loadAll() {
    const [categories, projects, tasks, notes, cfg] = await Promise.all([this.loadCategories(), this.loadProjects(), this.loadTasks(), this.loadNotes(), this.readConfig()]);
    return { dir: this.dir, categories, projects, tasks, notes, cestino: await this.listTrash(), colonne: Array.isArray(cfg.colonne) ? cfg.colonne : null };
  }

  // Ordine delle colonne della lista task, scelto nelle Impostazioni: sta in taccuino.json così vale su ogni PC.
  // null lo toglie (ordine di partenza). L'interfaccia scarta gli ID che non conosce.
  async saveColumns(list) {
    const cfg = await this.readConfig();
    if (Array.isArray(list)) cfg.colonne = list.map(String);
    else delete cfg.colonne;
    await this.writeConfig(cfg);
    return cfg.colonne || null;
  }

  // ---------- Task
  async loadTasks() {
    const out = await readMdDir(path.join(this.dir, 'tasks'), parseTask, 'Task illeggibile');
    return out.sort((a, b) => idNum(b.id) - idNum(a.id));
  }

  // Conta anche gli elementi nel cestino e quelli già cancellati per sempre (ultimoId, ultimoAppunto): un ID non torna mai.
  async nextId(prefix, tipo, items) {
    const trashed = (await this.listTrash()).filter((v) => v.tipo === tipo).map((v) => idNum(path.basename(v.percorso)));
    const max = Math.max(0, Number((await this.readConfig())[LAST_ID[tipo]]) || 0, ...trashed, ...items.map((x) => idNum(x.id)));
    return prefix + String(max + 1).padStart(3, '0');
  }

  async nextTaskId() { return this.nextId('T-', 'task', await this.loadTasks()); }

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

  // ---------- Appunti
  async loadNotes() {
    const out = await readMdDir(path.join(this.dir, 'appunti'), parseNote, 'Appunto illeggibile');
    return out.sort((a, b) => idNum(b.id) - idNum(a.id));
  }

  async nextNoteId() { return this.nextId('A-', 'appunto', await this.loadNotes()); }

  // Salva un appunto nuovo (senza id) o esistente: creato resta quello su disco, aggiornato diventa oggi.
  async saveNote(input) {
    const n = JSON.parse(JSON.stringify(input));
    const now = today();
    let prev = null;
    if (n.id) {
      try { prev = parseNote(await fsp.readFile(this.p('appunti', n.id + '.md'), 'utf8'), n.id); } catch { prev = null; }
    } else {
      n.id = await this.nextNoteId();
    }
    n.titolo = String(n.titolo || '').trim() || 'Senza titolo';
    n.creato = (prev && prev.creato) || n.creato || now;
    n.aggiornato = now;
    await this.writeNote(n);
    return parseNote(serializeNote(n), n.id);
  }

  async writeNote(n) { await this.write(this.p('appunti', n.id + '.md'), serializeNote(n)); }

  async deleteNote(id) {
    const titolo = await this.displayName(this.p('appunti', id + '.md'), '');
    await this.trash('appunto', titolo ? `${id} · ${titolo}` : id, 'appunti', id + '.md');
  }

  // Task e appunti insieme, ognuno con la sua funzione di scrittura: per le operazioni che toccano le categorie utente.
  async loadItems() {
    const [tasks, notes] = await Promise.all([this.loadTasks(), this.loadNotes()]);
    return [...tasks.map((item) => ({ item, save: (x) => this.writeTask(x) })), ...notes.map((item) => ({ item, save: (x) => this.writeNote(x) }))];
  }

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
    if ((await this.loadNotes()).some((n) => n.progetto === codice)) throw new Error('Il progetto ha degli appunti: archivialo invece di eliminarlo.');
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
    if (SYSTEM_CATEGORIES.includes(id)) throw new Error('Stato, Priorità e Collegamento non si possono eliminare.');
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
      const items = catId === 'collegamento' ? (await this.loadItems()).map((x) => x.item) : await this.loadTasks();
      const used = catId === 'collegamento' ? (t) => t.collegamenti.some((l) => l.tipo === id) : (t) => t[catId] === id;
      if (items.some(used)) throw new Error('Il valore è usato da alcuni task o appunti: cambiali prima di eliminarlo.');
    }
    await this.trash('tag', await this.displayName(this.p('tags', catId, id + '.md'), id), 'tags', catId, id + '.md');
    if (!SYSTEM_CATEGORIES.includes(catId)) await this.stripFromTasks(catId, id);
  }

  // Unisce il tag "fromId" in "toId" (stessa categoria) e poi elimina "fromId".
  async mergeTag(catId, fromId, toId) {
    if (catId === 'stato' || catId === 'priorita') {
      // Stato e priorità sono campi del task, non tag: saveTask aggiorna anche storico e completato.
      const cats = await this.loadCategories();
      for (const t of await this.loadTasks()) if (t[catId] === fromId) await this.saveTask({ ...t, [catId]: toId }, cats);
    } else {
      for (const { item: t, save } of await this.loadItems()) {
        if (catId === 'collegamento') {
          if (!t.collegamenti.some((l) => l.tipo === fromId)) continue;
          const seen = new Set();
          t.collegamenti = t.collegamenti.map((l) => (l.tipo === fromId ? { ...l, tipo: toId } : l))
            .filter((l) => { const k = l.tipo + ' ' + l.id; if (seen.has(k)) return false; seen.add(k); return true; });
          await save(t);
          continue;
        }
        const v = t.tags[catId];
        if (Array.isArray(v) && v.includes(fromId)) t.tags[catId] = Array.from(new Set(v.map((x) => (x === fromId ? toId : x))));
        else if (v === fromId) t.tags[catId] = toId;
        else continue;
        await save(t);
      }
    }
    await this.trash('tag', await this.displayName(this.p('tags', catId, fromId + '.md'), fromId), 'tags', catId, fromId + '.md');
  }

  // Toglie un tag (o, con tagId null, tutta la categoria) dai task e dagli appunti che lo usano.
  async stripFromTasks(catId, tagId) {
    for (const { item: t, save } of await this.loadItems()) {
      const v = t.tags[catId];
      if (v === undefined) continue;
      if (tagId === null) delete t.tags[catId];
      else if (Array.isArray(v)) {
        if (!v.includes(tagId)) continue;
        t.tags[catId] = v.filter((x) => x !== tagId);
      } else if (v === tagId) delete t.tags[catId];
      else continue;
      await save(t);
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

  // Cancella per sempre. L'ID più alto dei task e degli appunti cancellati resta in taccuino.json, così non viene riassegnato.
  async purge(entries) {
    const cfg = await this.readConfig();
    let changed = false;
    for (const [tipo, key] of Object.entries(LAST_ID)) {
      const ids = entries.filter((v) => v.tipo === tipo).map((v) => idNum(path.basename(v.percorso)));
      if (ids.length && (Number(cfg[key]) || 0) < Math.max(...ids)) { cfg[key] = Math.max(...ids); changed = true; }
    }
    if (changed) await this.writeConfig(cfg);
    for (const v of entries) await this.remove(this.trashPath(v.id));
  }
}

module.exports = { Store, slugify, today };
