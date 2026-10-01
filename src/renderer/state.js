// Stato dell'interfaccia e funzioni di lettura sui dati caricati.

// Raggruppamento e "Mostra completati" restano uguali tra un avvio e l'altro (solo su questo PC).
const VIEW_KEY = 'taccuino.vista';
function readView() {
  try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch { return {}; }
}
export function saveView() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ groupBy: S.ui.groupBy, showDone: S.ui.showDone })); } catch { /* preferenza solo locale */ }
}
const vista = readView();

export const S = {
  config: null,
  data: null,
  view: { name: 'tasks' },
  ui: {
    groupBy: typeof vista.groupBy === 'string' ? vista.groupBy : 'progetto',
    showDone: vista.showDone === true,
    search: '',
    fProject: '',
    fPrio: '',
    fTag: '',
    openTask: null,     // id del task aperto nel pannello, oppure 'new'
    draft: null,        // task nuovo non ancora salvato
    openNote: null,     // id dell'appunto aperto nel pannello, oppure 'new' (mai insieme a openTask)
    noteDraft: null,    // appunto nuovo non ancora salvato
    noteSearch: '',
    // Filtri del grafo: gli elenchi dicono cosa nascondere (vuoti = tutto visibile).
    graph: { kind: 'tutti', edgeColor: 'progetto', hideProjects: [], hideStates: [], hideTypes: [] },
    recentDone: {},     // task completati in questa sessione: restano visibili barrati
    projectTab: 'open',
    projFilter: 'attivo',
    hoverWeek: null,
    editing: null,      // quale blocco di testo è in modifica (es. 'project-desc')
    confirm: null,      // azione distruttiva in attesa di conferma
    mergeTo: null,      // tag di destinazione di un'unione in attesa di conferma
    unsaved: null,      // { id, titolo?, descrizione? }: testo scritto nel pannello e non ancora salvato
    saved: {},          // campi del task aperto salvati in questa apertura
    pendingTag: null,   // { cat, nome }: tag nuovo in attesa del secondo Invio
    update: null,       // { stato: 'controllo' | 'scarico' | 'pronto', versione, percento }
    setupMode: 'new'
  },
  toast: null
};

export const PROJECT_COLORS = ['#2F5BD3', '#0B8A6F', '#C2410C', '#7C3AED', '#B42318', '#B54708', '#0E7490', '#6B675E'];
export const TAG_COLORS = [...PROJECT_COLORS, '#4A473F', '#146C43', '#2346A8', '#8A4B06'];

export function cat(id) { return S.data.categories.find((c) => c.id === id); }
export function tagOf(catId, id) { const c = cat(catId); return c ? c.tags.find((t) => t.id === id) : null; }
export function project(code) { return S.data.projects.find((p) => p.codice === code); }
export function extraCats() { return S.data.categories.filter((c) => !c.sistema); }
// Categorie utente fatte di tag: le categorie a testo libero non hanno chip, filtri né raggruppamenti.
export function tagCats() { return extraCats().filter((c) => c.tipo !== 'testo'); }
export function task(id) { return S.data.tasks.find((t) => t.id === id); }
export function note(id) { return S.data.notes.find((n) => n.id === id); }
export const isNoteId = (id) => /^A-/.test(String(id));
// Elemento a cui punta un collegamento o una menzione: un task (T-…) o un appunto (A-…).
export function ref(id) { return (isNoteId(id) ? note(id) : task(id)) || null; }

export function isClosed(t) { const s = tagOf('stato', t.stato); return !!(s && s.chiuso); }
export function openStates() { return (cat('stato')?.tags || []).filter((t) => !t.chiuso); }
export function closedState() { return (cat('stato')?.tags || []).find((t) => t.chiuso); }
export function openTasks(list = S.data.tasks) { return list.filter((t) => !isClosed(t)); }

export function values(t, catId) {
  if (catId === 'stato') return t.stato ? [t.stato] : [];
  if (catId === 'priorita') return t.priorita ? [t.priorita] : [];
  if (catId === 'progetto') return t.progetto ? [t.progetto] : [];
  if (catId === 'collegamento') return Array.from(new Set((t.collegamenti || []).map((l) => l.tipo).filter(Boolean)));
  const v = t.tags[catId];
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

// Tag "liberi" (tutte le categorie non di sistema) di un task, per la ricerca.
export function taskChips(t) {
  const out = [];
  for (const c of tagCats()) {
    for (const id of values(t, c.id)) {
      const tg = c.tags.find((x) => x.id === id);
      out.push({ catId: c.id, id, nome: tg ? tg.nome : id, colore: tg ? tg.colore : '#6B675E' });
    }
  }
  return out;
}

export function prioRank(id) {
  const tags = cat('priorita')?.tags || [];
  const i = tags.findIndex((t) => t.id === id);
  return i === -1 ? 99 : i;
}

function idNum(id) { const m = String(id).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; }

export function sortTasks(list) {
  return list.slice().sort((a, b) =>
    (isClosed(a) - isClosed(b)) ||
    (prioRank(a.priorita) - prioRank(b.priorita)) ||
    String(a.scadenza || '9999').localeCompare(String(b.scadenza || '9999')) ||
    (idNum(b.id) - idNum(a.id)));
}

export function projectTasks(code) { return S.data.tasks.filter((t) => t.progetto === code); }
export function projectNotes(code) { return S.data.notes.filter((n) => n.progetto === code); }
export function openCount(code) { return openTasks(projectTasks(code)).length; }
export function activeProjects() { return S.data.projects.filter((p) => p.stato !== 'archiviato'); }
