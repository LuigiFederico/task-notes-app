import { S, cat, project, activeProjects, extraCats, isClosed, values, sortTasks, taskChips } from '../state.js';
import { esc, safeColor, fmtToday, dueBucket } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { taskRow, taskHeader, segmented, emptyState } from './components.js';

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
    if (u.fTag) { const [c, id] = u.fTag.split(':'); if (!values(t, c).includes(id)) return false; }
    return matchesSearch(t, u.search);
  });
}

function groupDefs(by) {
  if (by === 'progetto') {
    const known = S.data.projects.map((p) => ({ key: p.codice, label: p.nome, color: p.colore, test: (t) => t.progetto === p.codice, link: p.codice }));
    return [...known, { key: '__none', label: 'Senza progetto', color: '#B8B4A9', test: (t) => !project(t.progetto) }];
  }
  if (by === 'scadenza') {
    return [['ritardo', 'In ritardo', '#B42318'], ['oggi', 'Oggi', '#2346A8'], ['settimana', 'Questa settimana', '#4A473F'], ['dopo', 'Più avanti', '#6B675E'], ['nessuna', 'Senza scadenza', '#B8B4A9']]
      .map(([k, l, c]) => ({ key: k, label: l, color: c, test: (t) => (isClosed(t) ? 'chiusi' : dueBucket(t.scadenza)) === k }))
      .concat([{ key: 'chiusi', label: 'Completati', color: '#146C43', test: (t) => isClosed(t) }]);
  }
  const c = cat(by);
  if (!c) return [];
  const defs = c.tags.map((tg) => ({ key: tg.id, label: by === 'priorita' ? 'Priorità ' + tg.nome.toLowerCase() : tg.nome, color: tg.colore, test: (t) => values(t, by).includes(tg.id) }));
  if (by !== 'stato') defs.push({ key: '__none', label: 'Senza ' + c.nome.toLowerCase(), color: '#B8B4A9', test: (t) => values(t, by).filter((v) => c.tags.some((x) => x.id === v)).length === 0 });
  return defs;
}

export function taskList(list, by, { showProject = true } = {}) {
  const groups = groupDefs(by).map((g) => ({ ...g, items: sortTasks(list.filter(g.test)) })).filter((g) => g.items.length);
  if (!groups.length) return emptyState('Nessun task da mostrare.');
  return `${taskHeader(showProject)}<div class="groups">${groups.map((g) => `
    <section class="group">
      <div class="group-head">
        <span class="dot sq lg" style="background:${safeColor(g.color)}"></span>
        ${g.link ? `<button class="group-title link" data-action="go" data-view="project" data-code="${esc(g.link)}">${esc(g.label)}</button>` : `<span class="group-title">${esc(g.label)}</span>`}
        <span class="muted small">${g.items.length}</span>
      </div>
      <div class="card list">${g.items.map((t) => taskRow(t, { showProject })).join('')}</div>
    </section>`).join('')}</div>`;
}

export function tasksView() {
  const u = S.ui;
  const open = S.data.tasks.filter((t) => !isClosed(t)).length;
  const done = S.data.tasks.length - open;
  const groupOpts = [['progetto', 'Progetto'], ['priorita', 'Priorità'], ['stato', 'Stato'], ['scadenza', 'Scadenza'], ...extraCats().map((c) => [c.id, c.nome])];
  const prioTags = cat('priorita')?.tags || [];
  const tagOpts = extraCats().flatMap((c) => c.tags.map((t) => [`${c.id}:${t.id}`, `${c.nome}: ${t.nome}`]));
  const select = (name, label, opts, value) => `
    <label class="filter${value ? ' on' : ''}"><span class="sr">${label}</span>
      <select data-change="filter" data-name="${name}">
        <option value="">${label}: tutti</option>
        ${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select>${icon.chevron(12)}</label>`;
  const anyFilter = u.fProject || u.fPrio || u.fTag || u.search;
  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6">
        <h1 class="display">Task</h1>
        <div class="muted">${open} aperti · ${done} completati · ${fmtToday()}</div>
      </div>
      <div class="row-10">
        <label class="search">${icon.search(16)}<input id="search" type="search" placeholder="Cerca task, progetti, tag…" value="${esc(u.search)}" data-input="search" aria-label="Cerca task"><kbd>Ctrl K</kbd></label>
        <button class="btn primary" data-action="new-task">${icon.plus(16)}Nuovo task</button>
      </div>
    </header>
    <div class="toolbar">
      <div class="row-10"><span class="muted small">Raggruppa per</span>${segmented(groupOpts, u.groupBy, 'group-by', 'Raggruppa per')}</div>
      <div class="vsep"></div>
      <div class="row-8">
        ${select('fProject', 'Progetto', S.data.projects.map((p) => [p.codice, p.nome]), u.fProject)}
        ${select('fPrio', 'Priorità', prioTags.map((t) => [t.id, t.nome]), u.fPrio)}
        ${tagOpts.length ? select('fTag', 'Tag', tagOpts, u.fTag) : ''}
        ${anyFilter ? '<button class="btn-link small" data-action="clear-filters">Azzera filtri</button>' : ''}
      </div>
      <div class="grow"></div>
      <label class="toggle"><input type="checkbox" data-change="show-done" ${u.showDone ? 'checked' : ''}>Mostra completati</label>
    </div>
    <div class="quick-add">
      ${icon.plus(16)}
      <input id="quick-add" type="text" placeholder="Aggiungi un task e premi Invio${activeProjects().length ? ' — finirà in ' + esc((project(u.fProject) || activeProjects()[0]).nome) : ''}" data-keydown="quick-add" aria-label="Aggiungi task veloce">
    </div>
    <div id="task-list" class="scroll">${taskList(visibleTasks(), u.groupBy)}</div>
  </div>`;
}
