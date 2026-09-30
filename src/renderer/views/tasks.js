import { S, cat, project, activeProjects, extraCats, sortTasks, openTasks } from '../state.js';
import { visibleTasks, groupDefs, emptyReason } from '../selectors.js';
import { esc, safeColor, fmtToday } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { taskRow, taskHeader, segmented, emptyState, options } from './components.js';

export function taskList(list, by, { showProject = true } = {}) {
  const groups = groupDefs(by).map((g) => ({ ...g, items: sortTasks(list.filter(g.test)) })).filter((g) => g.items.length);
  if (!groups.length) return emptyState(emptyReason());
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
  const open = openTasks().length;
  const done = S.data.tasks.length - open;
  const groupOpts = [['progetto', 'Progetto'], ['priorita', 'Priorità'], ['stato', 'Stato'], ['scadenza', 'Scadenza'], ...extraCats().map((c) => [c.id, c.nome])];
  const prioTags = cat('priorita')?.tags || [];
  const tagOpts = extraCats().flatMap((c) => c.tags.map((t) => [`${c.id}:${t.id}`, `${c.nome}: ${t.nome}`]));
  const select = (name, label, opts, value) => `
    <label class="filter${value ? ' on' : ''}"><span class="sr">${label}</span>
      <select data-change="filter" data-name="${name}">
        <option value="">${label}: tutti</option>
        ${options(opts, value)}
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
