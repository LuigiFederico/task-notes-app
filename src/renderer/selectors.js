// Letture che dipendono dallo stato dell'interfaccia (filtri, pannello aperto) o dalla data di oggi.
import { S, cat, tagOf, task, note, ref, isNoteId, project, isClosed, values, taskChips, openTasks, prioOf } from './state.js';
import { todayISO, addDays, weekStart, dueBucket, mentionsOf } from './lib/util.js';

export function currentTask() {
  if (S.ui.openTask === 'new') return S.ui.draft;
  return S.ui.openTask ? task(S.ui.openTask) : null;
}

// Task nuovo con il titolo ma senza progetto: non si crea finché il progetto non c'è.
export function missingProject() {
  const t = S.ui.openTask === 'new' && S.ui.draft;
  return !!(t && t.titolo && t.titolo.trim() && !t.progetto);
}

export function currentNote() {
  if (S.ui.openNote === 'new') return S.ui.noteDraft;
  return S.ui.openNote ? note(S.ui.openNote) : null;
}

// Ciò che è aperto nel pannello, task o appunto.
export function currentItem() { return S.ui.openNote ? currentNote() : currentTask(); }

// ---------- appunti
// Più recenti in cima; la ricerca guarda ID, titolo, testo e progetto.
export function visibleNotes(list = S.data.notes, search = S.ui.noteSearch) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((n) => {
      if (!words.length) return true;
      const p = project(n.progetto);
      const hay = [n.id, n.titolo, n.descrizione, p && p.nome, n.progetto].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => String(b.aggiornato || '').localeCompare(String(a.aggiornato || '')) || b.id.localeCompare(a.id, 'it', { numeric: true }));
}

export function overdueCount() {
  const t0 = todayISO();
  return openTasks().filter((t) => t.scadenza && t.scadenza < t0).length;
}

// ---------- lista task

export function matchesSearch(t, q) {
  if (!q) return true;
  q = q.toLowerCase();
  const p = project(t.progetto);
  const hay = [t.id, t.titolo, t.descrizione, p && p.nome, t.progetto, ...taskChips(t).map((c) => c.nome)].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function visibleTasks() {
  const u = S.ui;
  return S.data.tasks.filter((t) => {
    if (isClosed(t) && !u.showDone && !u.recentDone[t.id]) return false;
    if (u.fProject && t.progetto !== u.fProject) return false;
    if (u.fPrio && prioOf(t) !== u.fPrio) return false;
    if (u.fTag) {
      const [c, id] = u.fTag.split(':');
      if (!values(t, c).includes(id)) return false;
    }
    return matchesSearch(t, u.search);
  });
}

// Colonne della lista task che si riordinano dalle Impostazioni; la casella di completamento resta sempre la prima.
// w è la larghezza normale, wc quella col pannello aperto quando è diversa.
export const TASK_COLUMNS = [
  { id: 'id', label: 'ID', w: '64px', wc: '56px' },
  { id: 'titolo', label: 'TITOLO', w: 'minmax(0, 1fr)' },
  { id: 'progetto', label: 'PROGETTO', w: '190px' },
  { id: 'priorita', label: 'PRIORITÀ', w: '90px' },
  { id: 'scadenza', label: 'SCADENZA', w: '130px', wc: '96px' },
  { id: 'stato', label: 'STATO', w: '100px', wc: '92px' }
];
export const DEFAULT_COLUMNS = TASK_COLUMNS.map((c) => c.id);

// Ordine scelto (colonne in taccuino.json) senza ID sconosciuti né doppioni; quelle che mancano vanno in fondo.
export function columnOrder(saved = S.data.colonne) {
  const known = (Array.isArray(saved) ? saved : []).filter((id, i, l) => DEFAULT_COLUMNS.includes(id) && l.indexOf(id) === i);
  return [...known, ...DEFAULT_COLUMNS.filter((id) => !known.includes(id))];
}

// Colonne di una lista task nell'ordine scelto, con il grid-template-columns (spunta in testa).
// Pagina progetto senza Progetto, pagina tag senza Priorità; col pannello aperto mancano tutte e due e sono più strette.
export function taskColumns({ showProject = true, showPrio = true } = {}) {
  const compact = !!(S.ui.openTask || S.ui.openNote);
  const hide = new Set();
  if (!showProject || compact) hide.add('progetto');
  if (!showPrio || compact) hide.add('priorita');
  const cols = columnOrder().filter((id) => !hide.has(id)).map((id) => TASK_COLUMNS.find((c) => c.id === id));
  const grid = [compact ? '30px' : '36px', ...cols.map((c) => (compact && c.wc) || c.w)].join(' ');
  return { cols, grid };
}

// Gruppi della lista per il raggruppamento scelto: ognuno ha etichetta, colore e un test sul task.
export function groupDefs(by) {
  if (by === 'progetto') {
    const known = S.data.projects.map((p) => ({ key: p.codice, label: p.nome, color: p.colore, test: (t) => t.progetto === p.codice, link: p.codice }));
    return [...known, { key: '__none', label: 'Senza progetto', color: '#B8B4A9', test: (t) => !project(t.progetto) }];
  }
  if (by === 'scadenza') {
    const buckets = [
      ['ritardo', 'In ritardo', '#B42318'],
      ['oggi', 'Oggi', '#2346A8'],
      ['settimana', 'Questa settimana', '#4A473F'],
      ['dopo', 'Più avanti', '#6B675E'],
      ['nessuna', 'Senza scadenza', '#B8B4A9']
    ];
    return buckets
      .map(([k, l, c]) => ({ key: k, label: l, color: c, test: (t) => (isClosed(t) ? 'chiusi' : dueBucket(t.scadenza)) === k }))
      .concat([{ key: 'chiusi', label: 'Completati', color: '#146C43', test: (t) => isClosed(t) }]);
  }
  const c = cat(by);
  if (!c) return [];
  const defs = c.tags.map((tg) => ({
    key: tg.id,
    label: by === 'priorita' ? 'Priorità ' + tg.nome.toLowerCase() : tg.nome,
    color: tg.colore,
    test: (t) => values(t, by).includes(tg.id)
  }));
  // Stato e priorità hanno sempre un valore (la priorità vuota vale come l'ultimo livello).
  if (by !== 'stato' && by !== 'priorita') {
    defs.push({
      key: '__none',
      label: 'Senza ' + c.nome.toLowerCase(),
      color: '#B8B4A9',
      test: (t) => values(t, by).filter((v) => c.tags.some((x) => x.id === v)).length === 0
    });
  }
  return defs;
}

// Perché la lista è vuota: nessun task, filtri che escludono tutto, oppure tutti completati e nascosti.
export function emptyReason() {
  const u = S.ui;
  if (!S.data.tasks.length) return 'Ancora nessun task: scrivine uno qui sopra.';
  if (u.fProject || u.fPrio || u.fTag || u.search.trim()) return 'Nessun task corrisponde ai filtri attivi.';
  if (!u.showDone && S.data.tasks.every(isClosed)) return 'Tutti i task sono completati.';
  return 'Nessun task da mostrare.';
}

// ---------- collegamenti
// Collegamenti di un elemento: quelli scritti nel suo file (out, con il nome del tipo) e quelli scritti negli altri
// che puntano a lui (in, con il nome inverso). target è null se l'elemento collegato non esiste (es. nel Cestino).
export function linksOf(item) {
  const kind = (l, inverse) => {
    const tp = l.tipo ? tagOf('collegamento', l.tipo) : null;
    return { nome: tp ? (inverse ? tp.inverso || tp.nome : tp.nome) : l.tipo || 'Collegato a', colore: tp ? tp.colore : '#6B675E' };
  };
  const out = (item.collegamenti || []).map((l) => ({ dir: 'out', tipo: l.tipo, id: l.id, from: item.id, to: l.id, target: ref(l.id), ...kind(l, false) }));
  const inc = [];
  for (const t of [...S.data.tasks, ...S.data.notes]) {
    if (t.id === item.id) continue;
    for (const l of t.collegamenti || []) if (l.id === item.id) inc.push({ dir: 'in', tipo: l.tipo, id: t.id, from: t.id, to: item.id, target: t, ...kind(l, true) });
  }
  return [...out, ...inc];
}

// Suggerimenti per @: task e appunti che contengono il testo nell'ID o nel titolo.
// Prima chi ha l'ID che comincia così, poi gli elementi aperti (gli appunti non si chiudono), poi i più recenti.
export function refCandidates(query, exclude = [], limit = 8) {
  const q = String(query || '').trim().replace(/^@/, '').toLowerCase();
  const closed = (x) => !isNoteId(x.id) && isClosed(x);
  const rank = (x) => (q && x.id.toLowerCase().startsWith(q) ? 0 : 2) + (closed(x) ? 1 : 0);
  return [...S.data.tasks, ...S.data.notes]
    .filter((x) => !exclude.includes(x.id) && (!q || x.id.toLowerCase().includes(q) || x.titolo.toLowerCase().includes(q)))
    .sort((a, b) => rank(a) - rank(b) || String(b.aggiornato || '').localeCompare(String(a.aggiornato || '')) || b.id.localeCompare(a.id, 'it', { numeric: true }))
    .slice(0, limit)
    .map((x) => ({ id: x.id, titolo: x.titolo, chiuso: closed(x) }));
}

// ---------- grafo
export const NO_PROJECT = '__none';
export const MENTION_TYPE = '@';      // tipo degli archi che vengono dalle menzioni nel testo
export const UNTYPED = '_';           // collegamento senza tipo
const GREY = '#B8B4A9';

// Gruppi (un arco del cerchio per progetto, nell'ordine dei progetti, poi "Senza progetto") e archi del grafo,
// con i filtri di S.ui.graph. Ci sono anche i task chiusi, i progetti archiviati e i nodi senza collegamenti.
export function graphData() {
  const g = S.ui.graph;
  const hideP = new Set(g.hideProjects);
  const hideS = new Set(g.hideStates);
  const hideT = new Set(g.hideTypes);
  const items = [
    ...(g.kind === 'appunti' ? [] : S.data.tasks.filter((t) => !hideS.has(t.stato)).map((t) => ({ item: t, kind: 'task', closed: isClosed(t) }))),
    ...(g.kind === 'task' ? [] : S.data.notes.map((n) => ({ item: n, kind: 'appunto', closed: false })))
  ].filter(({ item }) => !hideP.has(project(item.progetto) ? item.progetto : NO_PROJECT));

  const byKey = new Map();
  const groupOf = (code) => {
    const key = project(code) ? code : NO_PROJECT;
    if (!byKey.has(key)) byKey.set(key, []);
    return byKey.get(key);
  };
  for (const x of items) groupOf(x.item.progetto).push(x);
  const order = [...S.data.projects.map((p) => p.codice), NO_PROJECT];
  const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;
  const groups = order.filter((k) => byKey.has(k)).map((key) => {
    const p = project(key);
    const color = p ? p.colore : GREY;
    const list = byKey.get(key).sort((a, b) => (a.kind === b.kind ? num(a.item.id) - num(b.item.id) : a.kind === 'task' ? -1 : 1));
    return {
      key, color, label: p ? p.nome : 'Senza progetto',
      nodes: list.map(({ item, kind, closed }) => ({ id: item.id, label: item.titolo, kind, closed, color }))
    };
  });

  const visible = new Map(groups.flatMap((gr) => gr.nodes.map((n) => [n.id, n])));
  const edges = [];
  const seen = new Set();
  const add = (from, to, type, typeColor) => {
    const key = `${from}>${to}>${type}`;
    if (!visible.has(from) || !visible.has(to) || from === to || hideT.has(type) || seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type, color: g.edgeColor === 'tipo' ? typeColor : visible.get(from).color });
  };
  for (const { item } of items) {
    for (const l of item.collegamenti || []) {
      const tp = l.tipo ? tagOf('collegamento', l.tipo) : null;
      add(item.id, l.id, l.tipo || UNTYPED, tp ? tp.colore : GREY);
    }
    for (const id of mentionsOf(item.descrizione)) add(item.id, id, MENTION_TYPE, GREY);
  }
  return { groups, edges };
}

// ---------- tag

export function tagUsage(catId, tagId) {
  const list = S.data.tasks.filter((t) => values(t, catId).includes(tagId));
  return { open: openTasks(list).length, total: list.length, list };
}

// ---------- progetti

export const WEEKS = 8;

export function weekStarts() {
  const cur = weekStart(todayISO());
  return Array.from({ length: WEEKS }, (_, i) => addDays(cur, (i - WEEKS + 1) * 7));
}

export function weeklyDone(tasks, starts) {
  return starts.map((ws) => {
    const we = addDays(ws, 6);
    return tasks.filter((t) => isClosed(t) && t.completato && t.completato >= ws && t.completato <= we).length;
  });
}

// In ritardo o in scadenza entro 2 giorni.
export function isHot(t) {
  if (isClosed(t) || !t.scadenza) return false;
  return t.scadenza <= addDays(todayISO(), 2);
}
