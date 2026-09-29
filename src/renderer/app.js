import { S, task, project, cat, activeProjects, openStates, closedState, isClosed, values } from './state.js';
import { esc, todayISO } from './lib/util.js';
import { sidebar } from './views/sidebar.js';
import { tasksView, taskList, visibleTasks } from './views/tasks.js';
import { taskPanel, currentTask } from './views/taskPanel.js';
import { projectsView } from './views/projects.js';
import { projectView, newProjectView } from './views/project.js';
import { tagsView, TAG_COLORS } from './views/tags.js';
import { tagView } from './views/tag.js';
import { setupView, settingsView } from './views/setup.js';
import { mascot } from './mascot.js';

const api = window.api;
const root = document.getElementById('app');
let pendingReload = false;

// ---------------------------------------------------------------- render
function viewHtml() {
  const v = S.view;
  switch (v.name) {
    case 'projects': return projectsView();
    case 'project': return projectView(v.code);
    case 'new-project': return newProjectView();
    case 'tags': return tagsView();
    case 'tag': return tagView(v.cat, v.tag);
    case 'settings': return settingsView();
    default: return tasksView();
  }
}

function render() {
  const active = document.activeElement;
  const focusId = active && active.id;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = [...document.querySelectorAll('.scroll, .panel-body')].map((el) => el.scrollTop);

  if (!S.config || !S.config.ready || S.view.name === 'setup') {
    root.innerHTML = setupView();
  } else {
    root.innerHTML = `<div class="app${S.ui.openTask ? ' with-panel' : ''}">${sidebar()}<main class="main">${viewHtml()}</main>${taskPanel()}</div>`;
  }
  root.insertAdjacentHTML('beforeend', S.toast ? `<div class="toast ${S.toast.kind}" role="status">${esc(S.toast.text)}</div>` : '');

  [...document.querySelectorAll('.scroll, .panel-body')].forEach((el, i) => { if (scrolls[i] != null) el.scrollTop = scrolls[i]; });
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* non tutti gli input lo supportano */ } }
  }
  const auto = root.querySelector('[autofocus]');
  if (auto && !focusId) auto.focus();
  autosizeTitle();
  updateMascot();
}

// Posa di base del corvo in funzione di ciò che si vede.
function updateMascot() {
  const ready = S.config && S.config.ready && S.data && S.view.name !== 'setup';
  mascot.setLayout({ panelOpen: !!S.ui.openTask, hidden: !ready });
  if (!ready) return;
  const open = S.data.tasks.filter((t) => !isClosed(t)).length;
  let base = 'riposo';
  if (S.view.name === 'tasks' && S.ui.search.trim()) base = visibleTasks().length ? 'cerca' : 'pensa';
  else if (open === 0) base = 'dorme';
  mascot.setBase(base);
}

function openCountNow() { return S.data.tasks.filter((t) => !isClosed(t)).length; }

function overdueCount() {
  const t0 = todayISO();
  return S.data.tasks.filter((t) => !isClosed(t) && t.scadenza && t.scadenza < t0).length;
}

function renderList() {
  const el = document.getElementById('task-list');
  if (el) { el.innerHTML = taskList(visibleTasks(), S.ui.groupBy); updateMascot(); }
  else render();
}

function autosizeTitle() {
  const t = document.getElementById('task-title');
  if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
}

let toastTimer = null;
function toast(text, kind = 'info') {
  S.toast = { text, kind };
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; const el = root.querySelector('.toast'); if (el) el.remove(); }, kind === 'error' ? 6000 : 2500);
}

async function reload() {
  S.data = await api.load();
  if (S.ui.openTask && S.ui.openTask !== 'new' && !task(S.ui.openTask)) S.ui.openTask = null;
  render();
}

async function run(fn) {
  try { await fn(); } catch (err) { console.error(err); mascot.react('error'); toast(err.message || String(err), 'error'); }
}

// ---------------------------------------------------------------- task
function defaultProject() {
  if (S.view.name === 'project' && project(S.view.code)) return S.view.code;
  if (S.ui.fProject) return S.ui.fProject;
  return (activeProjects()[0] || S.data.projects[0] || {}).codice || '';
}

function newDraft(code) {
  const prio = cat('priorita')?.tags || [];
  return {
    id: null, titolo: '', progetto: code || defaultProject(), stato: (openStates()[0] || {}).id || 'da-fare',
    priorita: (prio.find((t) => t.id === 'media') || prio[Math.floor(prio.length / 2)] || {}).id || null,
    scadenza: null, tags: {}, descrizione: '', storico: []
  };
}

async function saveTask(t) {
  const saved = await api.saveTask(t);
  await reload();
  return saved;
}

async function updateTask(patch) {
  const t = currentTask();
  if (!t) return;
  if (S.ui.openTask === 'new') {
    Object.assign(t, patch);
    if (t.titolo && t.titolo.trim()) {
      const saved = await api.saveTask(t);
      S.ui.openTask = saved.id;
      S.ui.draft = null;
      await reload();
      mascot.react('created');
      toast(`Creato ${saved.id}`);
    } else render();
    return;
  }
  const wasClosed = isClosed(t);
  const prevState = t.stato;
  const prevDue = t.scadenza;
  await saveTask({ ...t, ...patch });
  reactToChange(task(t.id), wasClosed, prevState, prevDue);
}

// Il corvo reagisce ai cambi di stato e di scadenza.
function reactToChange(now, wasClosed, prevState, prevDue) {
  if (!now) return;
  if (!wasClosed && isClosed(now)) mascot.react(openCountNow() === 0 ? 'allDone' : 'completed');
  else if (now.stato === 'in-attesa' && prevState !== 'in-attesa') mascot.react('waiting');
  else if (now.scadenza && now.scadenza !== prevDue && now.scadenza < todayISO() && !isClosed(now)) mascot.react('overdue', { count: overdueCount() });
}

async function toggleDone(id) {
  const t = task(id);
  if (!t) return;
  if (isClosed(t)) await saveTask({ ...t, stato: (openStates()[0] || {}).id });
  else {
    S.ui.recentDone[id] = true;
    await saveTask({ ...t, stato: (closedState() || {}).id || 'fatto' });
    mascot.react(openCountNow() === 0 ? 'allDone' : 'completed');
  }
}

async function findOrCreateTag(catId, name) {
  const c = cat(catId);
  const n = name.trim();
  if (!n) return null;
  const hit = c.tags.find((t) => t.nome.toLowerCase() === n.toLowerCase().replace(/^#/, '') || t.id === n.toLowerCase());
  if (hit) return hit.id;
  return api.saveTag(catId, { nome: n.replace(/^#/, ''), colore: TAG_COLORS[c.tags.length % TAG_COLORS.length], ordine: c.tags.length + 1 });
}

// ---------------------------------------------------------------- actions
function go(el) {
  const d = el.dataset;
  S.view = { name: d.view, code: d.code, cat: d.cat, tag: d.tag };
  if (d.view === 'tags' && !d.cat) S.view.cat = 'progetto';
  S.ui.editing = null; S.ui.confirm = null; S.ui.hoverWeek = null; S.ui.recentDone = {};
  if (d.view === 'project') S.ui.projectTab = 'open';
  render();
  const main = root.querySelector('.scroll'); if (main) main.scrollTop = 0;
}

function pickSwatch(el) {
  el.parentElement.querySelectorAll('.swatch').forEach((s) => { s.classList.remove('on'); s.setAttribute('aria-checked', 'false'); });
  el.classList.add('on'); el.setAttribute('aria-checked', 'true');
  return el.dataset.value;
}

const actions = {
  go,
  'new-task': (el) => { S.ui.draft = newDraft(el.dataset.code); S.ui.openTask = 'new'; render(); document.getElementById('task-title')?.focus(); },
  'open-task': (el) => { if (!task(el.dataset.id)) return toast('Task ' + el.dataset.id + ' non trovato', 'error'); S.ui.openTask = el.dataset.id; S.ui.draft = null; S.ui.confirm = null; render(); },
  'close-task': () => { S.ui.openTask = null; S.ui.draft = null; S.ui.confirm = null; render(); },
  'toggle-done': (el) => run(() => toggleDone(el.dataset.id)),
  'task-set': (el) => run(() => updateTask({ [el.dataset.field]: el.dataset.value || null })),
  'task-tag-remove': (el) => run(() => { const t = currentTask(); return updateTask({ tags: { ...t.tags, [el.dataset.cat]: values(t, el.dataset.cat).filter((x) => x !== el.dataset.tag) } }); }),
  'task-delete': (el) => run(async () => { await api.deleteTask(el.dataset.id); S.ui.openTask = null; S.ui.confirm = null; await reload(); toast('Task eliminato'); }),
  'group-by': (el) => { S.ui.groupBy = el.dataset.value; render(); },
  'proj-filter': (el) => { S.ui.projFilter = el.dataset.value; render(); },
  'project-tab': (el) => { S.ui.projectTab = el.dataset.value; render(); },
  'clear-filters': () => { Object.assign(S.ui, { fProject: '', fPrio: '', fTag: '', search: '' }); render(); },
  edit: (el) => { S.ui.editing = el.dataset.key; S.ui.confirm = null; S.ui.tagColor = null; S.ui.projectColor = null; render(); },
  'cancel-edit': () => { S.ui.editing = null; S.ui.confirm = null; render(); },
  'ask-confirm': (el) => { S.ui.confirm = el.dataset.key; render(); },
  'cancel-confirm': () => { S.ui.confirm = null; render(); },

  'new-project': () => { S.ui.projectDraft = null; S.view = { name: 'new-project' }; S.ui.editing = null; render(); },
  'draft-color': (el) => { S.ui.projectDraft.colore = pickSwatch(el); },
  'project-color': (el) => { S.ui.projectColor = pickSwatch(el); },
  'project-delete': () => run(async () => { await api.deleteProject(S.view.code); S.view = { name: 'projects' }; S.ui.confirm = null; S.ui.editing = null; await reload(); toast('Progetto eliminato'); }),
  'decision-delete': (el) => run(async () => {
    const p = project(S.view.code);
    const decisioni = p.decisioni.filter((_, i) => i !== Number(el.dataset.index));
    await api.saveProject({ ...p, decisioni }); S.ui.confirm = null; await reload();
  }),

  'tag-color': (el) => { S.ui.tagColor = pickSwatch(el); },
  'tag-page-color': (el) => run(async () => { const t = cat(el.dataset.cat).tags.find((x) => x.id === el.dataset.tag); await api.saveTag(el.dataset.cat, { ...t, colore: el.dataset.value }); await reload(); }),
  'tag-move': (el) => run(async () => {
    const c = cat(el.dataset.cat);
    const i = Number(el.dataset.index); const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= c.tags.length) return;
    const list = c.tags.slice(); [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].ordine !== k + 1) await api.saveTag(c.id, { ...list[k], ordine: k + 1 });
    await reload();
  }),
  'tag-delete': (el) => run(async () => { await api.deleteTag(el.dataset.cat, el.dataset.tag); S.view = { name: 'tags', cat: el.dataset.cat }; S.ui.confirm = null; await reload(); toast('Tag eliminato'); }),
  'category-delete': (el) => run(async () => { await api.deleteCategory(el.dataset.cat); S.view = { name: 'tags', cat: 'progetto' }; S.ui.confirm = null; S.ui.editing = null; await reload(); toast('Categoria eliminata'); }),

  'setup-mode': (el) => { S.ui.setupMode = el.dataset.value; S.ui.setupError = null; render(); },
  'choose-folder': () => run(async () => { const d = await api.chooseFolder(S.ui.setupDir || S.config.dataDir || S.config.suggested); if (d) { S.ui.setupDir = S.ui.setupMode === 'new' && !/Taccuino$/i.test(d) ? d + '\\Taccuino' : d; render(); } }),
  'setup-start': () => run(async () => {
    const dir = (document.getElementById('setup-dir')?.value || '').trim();
    try { await api.setDataDir(dir, S.ui.setupMode); } catch (err) { S.ui.setupError = err.message; render(); return; }
    S.ui.setupError = null; S.ui.setupDir = null;
    S.config = await api.getConfig();
    S.view = { name: 'tasks' };
    await reload();
    mascot.react('welcome');
  }),
  'change-folder': () => { S.ui.setupDir = S.data.dir; S.ui.setupMode = 'open'; S.view = { name: 'setup' }; render(); },
  'open-data-folder': () => run(() => api.openDataFolder())
};

const changes = {
  'task-field': (el) => run(() => updateTask({ [el.dataset.field]: el.value.trim() === '' && el.dataset.field !== 'descrizione' ? null : el.dataset.field === 'titolo' ? el.value.replace(/\s*\n\s*/g, ' ').trim() : el.value })),
  'task-cat-single': (el) => run(() => { const t = currentTask(); return updateTask({ tags: { ...t.tags, [el.dataset.cat]: el.value || undefined } }); }),
  filter: (el) => { S.ui[el.dataset.name] = el.value; render(); },
  'show-done': (el) => { S.ui.showDone = el.checked; S.ui.recentDone = {}; render(); },
  'tag-rename': (el) => run(async () => { const t = cat(el.dataset.cat).tags.find((x) => x.id === el.dataset.tag); if (!el.value.trim()) return render(); await api.saveTag(el.dataset.cat, { ...t, nome: el.value.trim() }); await reload(); }),
  'tag-merge': (el) => run(async () => {
    if (!el.value) return;
    const to = el.value;
    await api.mergeTag(el.dataset.cat, el.dataset.tag, to);
    S.view = { name: 'tag', cat: el.dataset.cat, tag: to };
    await reload(); toast('Tag uniti');
  }),
  'mascot-visible': (el) => { mascot.setPrefs({ visible: el.checked }); render(); },
  'mascot-reduced': (el) => { mascot.setPrefs({ reduced: el.checked }); render(); },
  'open-at-login': (el) => run(async () => { await api.setOpenAtLogin(el.checked); S.config.openAtLogin = el.checked; })
};

const inputs = {
  search: (el) => { S.ui.search = el.value; renderList(); },
  'project-draft': (el) => { S.ui.projectDraft[el.dataset.field] = el.dataset.field === 'codice' ? el.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : el.value; if (el.dataset.field === 'codice') el.value = S.ui.projectDraft.codice; },
  'setup-dir': (el) => { S.ui.setupDir = el.value; }
};

const keydowns = {
  'quick-add': (el, e) => {
    if (e.key !== 'Enter' || !el.value.trim()) return;
    e.preventDefault();
    const titolo = el.value.trim();
    run(async () => {
      if (!defaultProject()) throw new Error('Crea prima un progetto.');
      const saved = await api.saveTask({ ...newDraft(), titolo });
      el.value = '';
      await reload();
      mascot.react('created');
      toast(`Creato ${saved.id}`);
      document.getElementById('quick-add')?.focus();
    });
  },
  'title-enter': (el, e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } },
  'task-tag-add': (el, e) => {
    if (e.key !== 'Enter' || !el.value.trim()) return;
    e.preventDefault();
    const catId = el.dataset.cat;
    run(async () => {
      const id = await findOrCreateTag(catId, el.value);
      if (!id) return;
      if (S.ui.openTask !== 'new') S.data = await api.load();
      const t = currentTask();
      const vals = values(t, catId);
      await updateTask({ tags: { ...t.tags, [catId]: vals.includes(id) ? vals : [...vals, id] } });
      if (S.ui.openTask === 'new') S.data = await api.load(), render();
    });
  }
};

const submits = {
  'create-project': (form) => run(async () => {
    const d = S.ui.projectDraft;
    const codice = (d.codice || '').toUpperCase();
    if (codice.length < 2) throw new Error('Il codice deve avere almeno 2 caratteri.');
    if (project(codice)) throw new Error('Esiste già un progetto con codice ' + codice + '.');
    await api.saveProject({ codice, nome: d.nome.trim(), colore: d.colore, descrizione: d.descrizione, decisioni: [] });
    S.ui.projectDraft = null;
    S.view = { name: 'project', code: codice };
    await reload();
    toast('Progetto creato');
  }),
  'save-project-head': (form) => run(async () => {
    const p = project(S.view.code); const f = new FormData(form);
    await api.saveProject({ ...p, nome: f.get('nome').trim(), stato: f.get('stato'), colore: S.ui.projectColor || p.colore });
    S.ui.editing = null; await reload();
  }),
  'save-project-desc': (form) => run(async () => { const p = project(S.view.code); await api.saveProject({ ...p, descrizione: new FormData(form).get('descrizione') }); S.ui.editing = null; await reload(); }),
  'add-decision': (form) => run(async () => {
    const p = project(S.view.code); const f = new FormData(form);
    const dec = { data: f.get('data'), titolo: f.get('titolo').trim(), testo: f.get('testo').trim(), task: f.get('task') || null };
    await api.saveProject({ ...p, decisioni: [dec, ...p.decisioni] });
    S.ui.editing = null; await reload(); toast('Decisione registrata');
  }),
  'create-category': (form) => run(async () => {
    const f = new FormData(form);
    const id = await api.saveCategory({ nome: f.get('nome').trim(), tipo: f.get('tipo'), ordine: S.data.categories.length + 1 });
    S.ui.editing = null; S.view = { name: 'tags', cat: id }; await reload();
  }),
  'save-category': (form) => run(async () => {
    const c = cat(form.dataset.cat); const f = new FormData(form);
    await api.saveCategory({ ...c, nome: f.get('nome').trim(), tipo: f.get('tipo') || c.tipo, descrizione: f.get('descrizione') });
    S.ui.editing = null; await reload();
  }),
  'create-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat); const f = new FormData(form);
    await api.saveTag(c.id, { nome: f.get('nome').trim(), colore: S.ui.tagColor || TAG_COLORS[c.tags.length % TAG_COLORS.length], ordine: c.tags.length + 1 });
    S.ui.editing = 'tag-new'; S.ui.tagColor = null; await reload();
  }),
  'save-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat); const t = c.tags.find((x) => x.id === form.dataset.tag); const f = new FormData(form);
    await api.saveTag(c.id, { ...t, nome: f.get('nome').trim(), colore: S.ui.tagColor || t.colore, chiuso: c.id === 'stato' ? f.get('chiuso') === 'on' : t.chiuso });
    S.ui.editing = null; S.ui.tagColor = null; await reload();
  }),
  'save-tag-desc': (form) => run(async () => {
    const c = cat(form.dataset.cat); const t = c.tags.find((x) => x.id === form.dataset.tag);
    await api.saveTag(c.id, { ...t, descrizione: new FormData(form).get('descrizione') });
    S.ui.editing = null; await reload();
  })
};

// ---------------------------------------------------------------- events
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
root.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e); });
root.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
  if (e.target.id === 'task-title') autosizeTitle();
});
root.addEventListener('keydown', (e) => { const el = e.target.closest('[data-keydown]'); if (el && keydowns[el.dataset.keydown]) keydowns[el.dataset.keydown](el, e); });
root.addEventListener('submit', (e) => { const form = e.target.closest('[data-submit]'); if (form) { e.preventDefault(); submits[form.dataset.submit](form, e); } });
root.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-hover="week"]');
  if (!el) return;
  const i = Number(el.dataset.index);
  if (S.ui.hoverWeek !== i) { S.ui.hoverWeek = i; render(); }
});
root.addEventListener('focusout', () => { if (pendingReload) setTimeout(() => { if (pendingReload && !isTyping()) { pendingReload = false; run(reload); } }, 50); });

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.id !== 'search'));
}

document.addEventListener('keydown', (e) => {
  if (!S.data || !S.config?.ready) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); actions['new-task'](document.body); }
  else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (S.view.name !== 'tasks') { S.view = { name: 'tasks' }; render(); }
    document.getElementById('search')?.focus();
  } else if (e.key === 'Escape') {
    if (S.ui.confirm || S.ui.editing) { S.ui.confirm = null; S.ui.editing = null; render(); }
    else if (S.ui.openTask) { document.activeElement?.blur(); S.ui.openTask = null; S.ui.draft = null; render(); }
  }
});

// Cambiamenti arrivati da fuori (OneDrive, un altro PC, modifiche a mano ai file).
api.onDataChanged(() => { if (isTyping()) pendingReload = true; else run(reload); });

// ---------------------------------------------------------------- avvio
(async () => {
  try {
    mascot.mount();
    S.config = await api.getConfig();
    if (S.config.ready) S.data = await api.load();
    render();
    if (S.data && overdueCount()) setTimeout(() => mascot.react('overdue', { count: overdueCount() }), 900);
  } catch (err) {
    root.innerHTML = `<div class="fatal"><h1>Impossibile avviare Taccuino</h1><pre>${esc(err.message)}</pre></div>`;
  }
})();
