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

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const fm = require('./frontmatter');

const SYSTEM_CATEGORIES = ['stato', 'priorita'];
const TRASH = '.cestino';
const RETRY_CODES = ['EPERM', 'EBUSY'];
const RETRY_WAIT = [100, 200, 300, 400];
const TASK_KEYS = ['id', 'titolo', 'progetto', 'stato', 'priorita', 'scadenza', 'creato', 'aggiornato', 'completato'];

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

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tag';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSafeName(name) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name) && !name.includes('..');
}

async function readDirSafe(dir) {
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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

async function writeAtomic(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  await fsp.writeFile(tmp, content, 'utf8');
  try { await renameRetry(tmp, file); } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.lastWrite = 0;
  }

  p(...parts) {
    for (const part of parts) if (!isSafeName(part)) throw new Error('Nome file non valido: ' + part);
    return path.join(this.dir, ...parts);
  }

  async write(file, content) { this.lastWrite = Date.now(); await writeAtomic(file, content); this.lastWrite = Date.now(); }
  async remove(file) { this.lastWrite = Date.now(); await fsp.rm(file, { force: true, recursive: true }); }

  async readConfig() {
    try { return JSON.parse(await fsp.readFile(path.join(this.dir, 'taccuino.json'), 'utf8')); } catch { return {}; }
  }

  static async isDataFolder(dir) {
    try { await fsp.access(path.join(dir, 'taccuino.json')); return true; } catch { return false; }
  }

  // Crea la struttura se manca. Non sovrascrive nulla di esistente.
  async init({ withDefaultProject = false } = {}) {
    await fsp.mkdir(this.dir, { recursive: true });
    for (const d of ['tasks', 'projects', 'tags']) await fsp.mkdir(path.join(this.dir, d), { recursive: true });
    const cfgFile = path.join(this.dir, 'taccuino.json');
    const isNew = !(await Store.isDataFolder(this.dir));
    if (isNew) await this.write(cfgFile, JSON.stringify({ app: 'Taccuino', version: 1, creato: today() }, null, 2) + '\n');
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

  // ---------- Task ----------
  async loadTasks() {
    const dir = path.join(this.dir, 'tasks');
    const out = [];
    for (const e of await readDirSafe(dir)) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      try { out.push(this.parseTask(await fsp.readFile(path.join(dir, e.name), 'utf8'), e.name.slice(0, -3))); } catch (err) { console.error('Task illeggibile', e.name, err); }
    }
    return out.sort((a, b) => idNum(b.id) - idNum(a.id));
  }

  parseTask(text, fallbackId) {
    const { data, body } = fm.parse(text);
    const tags = {};
    for (const [k, v] of Object.entries(data)) {
      if (TASK_KEYS.includes(k) || k === 'storico') continue;
      tags[k] = Array.isArray(v) ? v.map(String) : v == null ? null : String(v);
    }
    return {
      // L'ID è il nome del file: una copia di conflitto di OneDrive (T-042-PC.md) resta un task distinto.
      id: String(fallbackId || data.id),
      titolo: data.titolo == null ? '' : String(data.titolo),
      progetto: data.progetto == null ? '' : String(data.progetto),
      stato: data.stato == null ? 'da-fare' : String(data.stato),
      priorita: data.priorita == null ? null : String(data.priorita),
      scadenza: data.scadenza == null ? null : String(data.scadenza),
      creato: data.creato == null ? null : String(data.creato),
      aggiornato: data.aggiornato == null ? null : String(data.aggiornato),
      completato: data.completato == null ? null : String(data.completato),
      tags,
      storico: Array.isArray(data.storico) ? data.storico.map(String) : [],
      descrizione: body
    };
  }

  serializeTask(t) {
    const data = {};
    for (const k of TASK_KEYS) data[k] = t[k] == null || t[k] === '' ? null : t[k];
    for (const [k, v] of Object.entries(t.tags || {})) {
      if (TASK_KEYS.includes(k) || k === 'storico' || !isSafeName(k)) continue;
      if (Array.isArray(v)) data[k] = v; else if (v) data[k] = v;
    }
    data.storico = t.storico || [];
    return fm.stringify(data, t.descrizione || '');
  }

  // Conta anche i task nel cestino e quelli già cancellati per sempre (ultimoId): un ID non torna mai.
  async nextTaskId() {
    const tasks = await this.loadTasks();
    const trashed = (await this.listTrash()).filter((v) => v.tipo === 'task').map((v) => idNum(path.basename(v.percorso)));
    const max = Math.max(0, Number((await this.readConfig()).ultimoId) || 0, ...trashed, ...tasks.map((t) => idNum(t.id)));
    return 'T-' + String(max + 1).padStart(3, '0');
  }

  async saveTask(input, categories) {
    const t = JSON.parse(JSON.stringify(input));
    const now = today();
    let prev = null;
    if (t.id) {
      try { prev = this.parseTask(await fsp.readFile(this.p('tasks', t.id + '.md'), 'utf8'), t.id); } catch { prev = null; }
    } else {
      t.id = await this.nextTaskId();
    }
    t.titolo = String(t.titolo || '').trim() || 'Senza titolo';
    t.stato = t.stato || 'da-fare';
    t.creato = prev ? prev.creato || t.creato || now : t.creato || now;
    t.aggiornato = now;
    t.storico = prev ? prev.storico.slice() : [];
    const cats = categories || (await this.loadCategories());
    const closed = new Set(((cats.find((c) => c.id === 'stato') || {}).tags || []).filter((x) => x.chiuso).map((x) => x.id));
    if (closed.has(t.stato)) t.completato = (prev && closed.has(prev.stato) && prev.completato) || t.completato || now;
    else t.completato = null;
    if (!prev) t.storico.push(`${now} Creato`);
    else {
      const name = (catId, v) => { const c = cats.find((x) => x.id === catId); const tag = c && c.tags.find((x) => x.id === v); return tag ? tag.nome : v || '—'; };
      if (prev.stato !== t.stato) t.storico.push(`${now} Stato: ${name('stato', prev.stato)} → ${name('stato', t.stato)}`);
      if ((prev.priorita || null) !== (t.priorita || null)) t.storico.push(`${now} Priorità: ${name('priorita', prev.priorita)} → ${name('priorita', t.priorita)}`);
      if ((prev.scadenza || null) !== (t.scadenza || null)) t.storico.push(`${now} Scadenza: ${prev.scadenza || '—'} → ${t.scadenza || '—'}`);
      if (prev.progetto !== t.progetto) t.storico.push(`${now} Progetto: ${prev.progetto || '—'} → ${t.progetto || '—'}`);
    }
    await this.write(this.p('tasks', t.id + '.md'), this.serializeTask(t));
    return this.parseTask(this.serializeTask(t), t.id);
  }

  async deleteTask(id) {
    const titolo = await this.displayName(this.p('tasks', id + '.md'), '');
    await this.trash('task', titolo ? `${id} · ${titolo}` : id, 'tasks', id + '.md');
  }

  // ---------- Progetti ----------
  async loadProjects() {
    const dir = path.join(this.dir, 'projects');
    const out = [];
    for (const e of await readDirSafe(dir)) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      try { out.push(this.parseProject(await fsp.readFile(path.join(dir, e.name), 'utf8'), e.name.slice(0, -3))); } catch (err) { console.error('Progetto illeggibile', e.name, err); }
    }
    return out.sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999) || a.nome.localeCompare(b.nome, 'it'));
  }

  parseProject(text, fallback) {
    const { data, body } = fm.parse(text);
    const idx = body.search(/^## Decisioni\s*$/m);
    const descr = (idx === -1 ? body : body.slice(0, idx)).replace(/^## Descrizione\s*\n/m, '').trim();
    const decisioni = [];
    if (idx !== -1) {
      const blocks = body.slice(idx).split(/^### /m).slice(1);
      for (const b of blocks) {
        const [first, ...rest] = b.split('\n');
        const m = first.match(/^(\d{4}-\d{2}-\d{2})\s*[·—-]\s*(.*)$/);
        let task = null;
        const lines = rest.filter((l) => { const tm = l.match(/^Task:\s*(\S+)\s*$/); if (tm) { task = tm[1]; return false; } return true; });
        decisioni.push({ data: m ? m[1] : null, titolo: (m ? m[2] : first).trim(), testo: lines.join('\n').trim(), task });
      }
    }
    return {
      codice: String(data.codice || fallback),
      nome: data.nome == null ? String(fallback) : String(data.nome),
      colore: data.colore ? String(data.colore) : '#2F5BD3',
      stato: data.stato ? String(data.stato) : 'attivo',
      creato: data.creato ? String(data.creato) : null,
      ordine: typeof data.ordine === 'number' ? data.ordine : null,
      descrizione: descr,
      decisioni: decisioni.sort((a, b) => String(b.data).localeCompare(String(a.data)))
    };
  }

  serializeProject(p) {
    let body = '## Descrizione\n\n' + (p.descrizione || '').trim() + '\n\n## Decisioni\n';
    for (const d of p.decisioni || []) {
      body += `\n### ${d.data || today()} · ${String(d.titolo || '').replace(/\n/g, ' ')}\n`;
      if (d.testo) body += '\n' + d.testo.trim() + '\n';
      if (d.task) body += `\nTask: ${d.task}\n`;
    }
    return fm.stringify({ codice: p.codice, nome: p.nome, colore: p.colore, stato: p.stato || 'attivo', creato: p.creato || today(), ordine: p.ordine ?? null }, body);
  }

  async saveProject(p) {
    const codice = String(p.codice || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!codice) throw new Error('Il codice progetto è obbligatorio.');
    const out = { ...p, codice, nome: String(p.nome || codice).trim() };
    await this.write(this.p('projects', codice + '.md'), this.serializeProject(out));
    return this.parseProject(this.serializeProject(out), codice);
  }

  async deleteProject(codice) {
    const tasks = await this.loadTasks();
    if (tasks.some((t) => t.progetto === codice)) throw new Error('Il progetto ha dei task: archivialo invece di eliminarlo.');
    await this.trash('progetto', await this.displayName(this.p('projects', codice + '.md'), codice), 'projects', codice + '.md');
  }

  // ---------- Categorie e tag ----------
  async loadCategories() {
    const root = path.join(this.dir, 'tags');
    const out = [];
    for (const e of await readDirSafe(root)) {
      if (!e.isDirectory() || !isSafeName(e.name)) continue;
      const dir = path.join(root, e.name);
      let cat = { id: e.name, nome: e.name, tipo: 'multipla', obbligatoria: false, ordine: 99, descrizione: '' };
      try {
        const { data, body } = fm.parse(await fsp.readFile(path.join(dir, '_categoria.md'), 'utf8'));
        cat = { ...cat, nome: data.nome ? String(data.nome) : e.name, tipo: data.tipo === 'singola' ? 'singola' : 'multipla', obbligatoria: data.obbligatoria === true, ordine: typeof data.ordine === 'number' ? data.ordine : 99, descrizione: body };
      } catch { /* categoria senza file descrittivo */ }
      if (SYSTEM_CATEGORIES.includes(cat.id)) cat.tipo = 'singola';
      cat.sistema = SYSTEM_CATEGORIES.includes(cat.id);
      cat.tags = [];
      for (const f of await readDirSafe(dir)) {
        if (!f.isFile() || !f.name.endsWith('.md') || f.name === '_categoria.md') continue;
        try {
          const { data, body } = fm.parse(await fsp.readFile(path.join(dir, f.name), 'utf8'));
          cat.tags.push({ id: f.name.slice(0, -3), nome: data.nome ? String(data.nome) : f.name.slice(0, -3), colore: data.colore ? String(data.colore) : '#6B675E', ordine: typeof data.ordine === 'number' ? data.ordine : 99, chiuso: data.chiuso === true, creato: data.creato ? String(data.creato) : null, descrizione: body });
        } catch (err) { console.error('Tag illeggibile', f.name, err); }
      }
      cat.tags.sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'));
      out.push(cat);
    }
    return out.sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'));
  }

  async saveCategory(c) {
    const id = c.id || slugify(c.nome);
    const data = { nome: c.nome || id, tipo: SYSTEM_CATEGORIES.includes(id) ? 'singola' : c.tipo === 'singola' ? 'singola' : 'multipla', obbligatoria: !!c.obbligatoria, ordine: c.ordine ?? 99 };
    await this.write(this.p('tags', id, '_categoria.md'), fm.stringify(data, c.descrizione || ''));
    return id;
  }

  async deleteCategory(id) {
    if (SYSTEM_CATEGORIES.includes(id)) throw new Error('Stato e Priorità non si possono eliminare.');
    await this.trash('categoria', await this.displayName(this.p('tags', id, '_categoria.md'), id), 'tags', id);
    await this.stripFromTasks(id, null);
  }

  async saveTag(catId, t) {
    let id = t.id;
    if (!id) {
      id = slugify(t.nome);
      let n = 2;
      while (fs.existsSync(this.p('tags', catId, id + '.md'))) id = slugify(t.nome) + '-' + n++;
    }
    const data = { nome: t.nome || id, colore: t.colore || '#6B675E', ordine: t.ordine ?? 99 };
    if (catId === 'stato') data.chiuso = !!t.chiuso;
    data.creato = t.creato || today();
    await this.write(this.p('tags', catId, id + '.md'), fm.stringify(data, t.descrizione || ''));
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
      await this.write(this.p('tasks', t.id + '.md'), this.serializeTask(t));
    }
    await this.trash('tag', await this.displayName(this.p('tags', catId, fromId + '.md'), fromId), 'tags', catId, fromId + '.md');
  }

  async stripFromTasks(catId, tagId) {
    const tasks = await this.loadTasks();
    for (const t of tasks) {
      const v = t.tags[catId];
      if (v === undefined) continue;
      if (tagId === null) delete t.tags[catId];
      else if (Array.isArray(v)) { if (!v.includes(tagId)) continue; t.tags[catId] = v.filter((x) => x !== tagId); }
      else if (v === tagId) delete t.tags[catId];
      else continue;
      await this.write(this.p('tasks', t.id + '.md'), this.serializeTask(t));
    }
  }

  // ---------- Cestino ----------
  trashPath(entry, ...parts) {
    for (const part of [entry, ...parts]) if (!isSafeName(part)) throw new Error('Nome file non valido: ' + part);
    return path.join(this.dir, TRASH, entry, ...parts);
  }

  // Nome leggibile di un file che sta per finire nel cestino.
  async displayName(file, fallback) {
    try { const { data } = fm.parse(await fsp.readFile(file, 'utf8')); return String(data.titolo || data.nome || fallback); } catch { return fallback; }
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
      if ((Number(cfg.ultimoId) || 0) < max) await this.write(path.join(this.dir, 'taccuino.json'), JSON.stringify({ ...cfg, ultimoId: max }, null, 2) + '\n');
    }
    for (const v of entries) await this.remove(this.trashPath(v.id));
  }
}

function idNum(id) { const m = String(id).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }

module.exports = { Store, slugify, today };
