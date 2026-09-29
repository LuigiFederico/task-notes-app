// Stato dell'interfaccia e funzioni di lettura sui dati caricati.

export const S = {
  config: null,
  data: null,
  view: { name: 'tasks' },
  ui: {
    groupBy: 'progetto',
    showDone: false,
    search: '',
    fProject: '',
    fPrio: '',
    fTag: '',
    openTask: null,     // id del task aperto nel pannello, oppure 'new'
    draft: null,        // task nuovo non ancora salvato
    recentDone: {},     // task completati in questa sessione: restano visibili barrati
    projectTab: 'open',
    projFilter: 'attivo',
    hoverWeek: null,
    editing: null,      // quale blocco di testo è in modifica (es. 'project-desc')
    confirm: null,      // azione distruttiva in attesa di conferma
    setupMode: 'new'
  },
  toast: null
};

export const PROJECT_COLORS = ['#2F5BD3', '#0B8A6F', '#C2410C', '#7C3AED', '#B42318', '#B54708', '#0E7490', '#6B675E'];

export function cat(id) { return S.data.categories.find((c) => c.id === id); }
export function tagOf(catId, id) { const c = cat(catId); return c ? c.tags.find((t) => t.id === id) : null; }
export function project(code) { return S.data.projects.find((p) => p.codice === code); }
export function extraCats() { return S.data.categories.filter((c) => !c.sistema); }
export function task(id) { return S.data.tasks.find((t) => t.id === id); }

export function isClosed(t) { const s = tagOf('stato', t.stato); return !!(s && s.chiuso); }
export function openStates() { return (cat('stato')?.tags || []).filter((t) => !t.chiuso); }
export function closedState() { return (cat('stato')?.tags || []).find((t) => t.chiuso); }

export function values(t, catId) {
  if (catId === 'stato') return t.stato ? [t.stato] : [];
  if (catId === 'priorita') return t.priorita ? [t.priorita] : [];
  if (catId === 'progetto') return t.progetto ? [t.progetto] : [];
  const v = t.tags[catId];
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

// Tag "liberi" (tutte le categorie non di sistema) di un task, per i chip.
export function taskChips(t) {
  const out = [];
  for (const c of extraCats()) {
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
export function openCount(code) { return projectTasks(code).filter((t) => !isClosed(t)).length; }
export function activeProjects() { return S.data.projects.filter((p) => p.stato !== 'archiviato'); }
