// Letture che dipendono dallo stato dell'interfaccia (filtri, pannello aperto) o dalla data di oggi.
import { S, cat, task, project, isClosed, values, taskChips, openTasks } from './state.js';
import { todayISO, addDays, weekStart, dueBucket } from './lib/util.js';

export function currentTask() {
  if (S.ui.openTask === 'new') return S.ui.draft;
  return S.ui.openTask ? task(S.ui.openTask) : null;
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
