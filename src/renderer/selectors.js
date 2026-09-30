// Letture che dipendono dallo stato dell'interfaccia (filtri, pannello aperto) o dalla data di oggi.
import { S, cat, tagOf, task, note, ref, isNoteId, project, isClosed, values, taskChips, openTasks } from './state.js';
import { todayISO, addDays, weekStart, dueBucket } from './lib/util.js';

export function currentTask() {
  if (S.ui.openTask === 'new') return S.ui.draft;
  return S.ui.openTask ? task(S.ui.openTask) : null;
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
    if (u.fPrio && t.priorita !== u.fPrio) return false;
    if (u.fTag) {
      const [c, id] = u.fTag.split(':');
      if (!values(t, c).includes(id)) return false;
    }
    return matchesSearch(t, u.search);
  });
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
  if (by !== 'stato') {
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
