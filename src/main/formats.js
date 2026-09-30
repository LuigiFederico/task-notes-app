'use strict';
// Conversione fra i file Markdown della cartella e gli oggetti dell'app, più le regole pure che ne derivano
// (righe di storico). Nessun accesso al disco: le letture e le scritture stanno in store.js.

const fm = require('./frontmatter');

// stato e priorita sono campi del task; collegamento elenca i tipi dei collegamenti fra task (campo collegamenti).
const SYSTEM_CATEGORIES = ['stato', 'priorita', 'collegamento'];
const TASK_KEYS = ['id', 'titolo', 'progetto', 'stato', 'priorita', 'scadenza', 'creato', 'aggiornato', 'completato'];
// Chiavi del task con un formato proprio, scritte solo se servono: non sono categorie utente.
const RESERVED_KEYS = ['sottotask', 'collegamenti', 'storico'];
const isTaskKey = (k) => TASK_KEYS.includes(k) || RESERVED_KEYS.includes(k);

const pad = (n) => String(n).padStart(2, '0');

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tag';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Nome della voce del cestino: data e ora dell'eliminazione.
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isSafeName(name) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name) && !name.includes('..');
}

function idNum(id) { const m = String(id).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }

const str = (v) => (v == null ? null : String(v));

// ---------- Task
// Le chiavi che non sono campi del task sono categorie utente: finiscono in tags[catId].
function parseTask(text, fallbackId) {
  const { data, body } = fm.parse(text);
  const tags = {};
  for (const [k, v] of Object.entries(data)) {
    if (isTaskKey(k)) continue;
    tags[k] = Array.isArray(v) ? v.map(String) : str(v);
  }
  return {
    // L'ID è il nome del file: una copia di conflitto di OneDrive (T-042-PC.md) resta un task distinto.
    id: String(fallbackId || data.id),
    titolo: data.titolo == null ? '' : String(data.titolo),
    progetto: data.progetto == null ? '' : String(data.progetto),
    stato: data.stato == null ? 'da-fare' : String(data.stato),
    priorita: str(data.priorita),
    scadenza: str(data.scadenza),
    creato: str(data.creato),
    aggiornato: str(data.aggiornato),
    completato: str(data.completato),
    tags,
    sottotask: parseSubtasks(data.sottotask),
    collegamenti: parseLinks(data.collegamenti),
    storico: Array.isArray(data.storico) ? data.storico.map(String) : [],
    descrizione: body
  };
}

function serializeTask(t) {
  const data = {};
  for (const k of TASK_KEYS) data[k] = t[k] == null || t[k] === '' ? null : t[k];
  for (const [k, v] of Object.entries(t.tags || {})) {
    if (isTaskKey(k) || !isSafeName(k)) continue;
    if (Array.isArray(v)) data[k] = v; else if (v) data[k] = v;
  }
  if (t.sottotask && t.sottotask.length) data.sottotask = t.sottotask.map((x) => `[${x.fatto ? 'x' : ' '}] ${x.testo}`);
  if (t.collegamenti && t.collegamenti.length) data.collegamenti = t.collegamenti.map((l) => (l.tipo ? `${l.tipo} ${l.id}` : l.id));
  data.storico = t.storico || [];
  return fm.stringify(data, t.descrizione || '');
}

// Sotto-task: una checklist nel file del task, una riga "[x] testo" o "[ ] testo" per voce.
// Una riga scritta a mano senza casella conta come da fare.
function parseSubtasks(v) {
  if (!Array.isArray(v)) return [];
  return v.map((line) => {
    const m = String(line).match(/^\[([ xX]?)\]\s*(.*)$/);
    return m ? { fatto: m[1].toLowerCase() === 'x', testo: m[2] } : { fatto: false, testo: String(line) };
  }).filter((x) => x.testo.trim());
}

// Collegamenti: una riga "<tipo> <ID>" per collegamento (es. "bloccato-da T-012"), salvata solo sul task di partenza.
// Il tipo è l'ID di un tag della categoria collegamento; una riga con il solo ID è un collegamento senza tipo.
function parseLinks(v) {
  if (!Array.isArray(v)) return [];
  return v.map((line) => {
    const parts = String(line).trim().split(/\s+/);
    return parts.length > 1 ? { tipo: parts[0], id: parts[1] } : { tipo: '', id: parts[0] };
  }).filter((l) => l.id);
}

// Righe di storico di un salvataggio: "Creato" per un task nuovo, altrimenti i cambi di stato,
// priorità, scadenza e progetto rispetto alla versione su disco. Stato e priorità con il loro nome.
function taskHistory(prev, t, cats, now) {
  if (!prev) return [`${now} Creato`];
  const name = (catId, v) => {
    const c = cats.find((x) => x.id === catId);
    const tag = c && c.tags.find((x) => x.id === v);
    return tag ? tag.nome : v || '—';
  };
  const lines = [];
  if (prev.stato !== t.stato) lines.push(`${now} Stato: ${name('stato', prev.stato)} → ${name('stato', t.stato)}`);
  if ((prev.priorita || null) !== (t.priorita || null)) lines.push(`${now} Priorità: ${name('priorita', prev.priorita)} → ${name('priorita', t.priorita)}`);
  if ((prev.scadenza || null) !== (t.scadenza || null)) lines.push(`${now} Scadenza: ${prev.scadenza || '—'} → ${t.scadenza || '—'}`);
  if (prev.progetto !== t.progetto) lines.push(`${now} Progetto: ${prev.progetto || '—'} → ${t.progetto || '—'}`);
  return lines;
}

// ---------- Progetti
// Il corpo ha due sezioni: "## Descrizione" e "## Decisioni", con una "### data · titolo" per decisione.
function parseProject(text, fallback) {
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
      const lines = rest.filter((l) => {
        const tm = l.match(/^Task:\s*(\S+)\s*$/);
        if (tm) { task = tm[1]; return false; }
        return true;
      });
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

function serializeProject(p) {
  let body = '## Descrizione\n\n' + (p.descrizione || '').trim() + '\n\n## Decisioni\n';
  for (const d of p.decisioni || []) {
    body += `\n### ${d.data || today()} · ${String(d.titolo || '').replace(/\n/g, ' ')}\n`;
    if (d.testo) body += '\n' + d.testo.trim() + '\n';
    if (d.task) body += `\nTask: ${d.task}\n`;
  }
  const data = { codice: p.codice, nome: p.nome, colore: p.colore, stato: p.stato || 'attivo', creato: p.creato || today(), ordine: p.ordine ?? null };
  return fm.stringify(data, body);
}

// ---------- Categorie e tag
// Tipi di categoria: "singola" e "multipla" scelgono fra i tag della cartella; "testo" ha valori scritti a mano
// (una lista per task, nessun file per valore) e un modello di link facoltativo, es. https://…/browse/{valore}.
const CATEGORY_TYPES = ['singola', 'multipla', 'testo'];
const categoryType = (tipo, id) => (SYSTEM_CATEGORIES.includes(id) ? 'singola' : CATEGORY_TYPES.includes(tipo) ? tipo : 'multipla');

// text è il contenuto di _categoria.md, oppure null se la cartella della categoria non ce l'ha.
function parseCategory(text, id) {
  const cat = { id, nome: id, tipo: 'multipla', obbligatoria: false, ordine: 99, descrizione: '' };
  if (text != null) {
    const { data, body } = fm.parse(text);
    Object.assign(cat, {
      nome: data.nome ? String(data.nome) : id,
      tipo: data.tipo,
      obbligatoria: data.obbligatoria === true,
      ordine: typeof data.ordine === 'number' ? data.ordine : 99,
      descrizione: body
    });
    if (data.url) cat.url = String(data.url);
  }
  cat.tipo = categoryType(cat.tipo, id);
  if (cat.tipo !== 'testo') delete cat.url;
  cat.sistema = SYSTEM_CATEGORIES.includes(id);
  cat.tags = [];
  return cat;
}

function serializeCategory(c, id) {
  const tipo = categoryType(c.tipo, id);
  const data = { nome: c.nome || id, tipo, obbligatoria: !!c.obbligatoria, ordine: c.ordine ?? 99 };
  if (tipo === 'testo' && c.url) data.url = String(c.url).trim();
  return fm.stringify(data, c.descrizione || '');
}

function parseTag(text, id) {
  const { data, body } = fm.parse(text);
  return {
    id,
    nome: data.nome ? String(data.nome) : id,
    colore: data.colore ? String(data.colore) : '#6B675E',
    ordine: typeof data.ordine === 'number' ? data.ordine : 99,
    chiuso: data.chiuso === true,
    inverso: data.inverso ? String(data.inverso) : null,
    creato: data.creato ? String(data.creato) : null,
    descrizione: body
  };
}

// Solo gli stati hanno "chiuso"; solo i tipi di collegamento hanno "inverso" (il nome visto dall'altro task).
function serializeTag(t, id, catId) {
  const data = { nome: t.nome || id, colore: t.colore || '#6B675E', ordine: t.ordine ?? 99 };
  if (catId === 'stato') data.chiuso = !!t.chiuso;
  if (catId === 'collegamento') data.inverso = (t.inverso || '').trim() || t.nome || id;
  data.creato = t.creato || today();
  return fm.stringify(data, t.descrizione || '');
}

module.exports = {
  SYSTEM_CATEGORIES, TASK_KEYS, RESERVED_KEYS,
  slugify, today, stamp, isSafeName, idNum,
  parseTask, serializeTask, taskHistory,
  parseProject, serializeProject,
  parseCategory, serializeCategory, parseTag, serializeTag
};
