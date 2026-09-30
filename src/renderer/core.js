// Nucleo dell'interfaccia: disegno di #app, ricarica dai file, avvisi ed errori.
// Gli handler in handlers/ usano queste funzioni; qui non si importa mai un handler.
import { S, task, openTasks, tagCats } from './state.js';
import { visibleTasks, visibleNotes } from './selectors.js';
import { esc } from './lib/util.js';
import { sidebar } from './views/sidebar.js';
import { tasksView, taskList } from './views/tasks.js';
import { taskPanel } from './views/taskPanel.js';
import { notesView, noteList } from './views/notes.js';
import { notePanel } from './views/notePanel.js';
import { graphView } from './views/graph.js';
import { projectsView } from './views/projects.js';
import { projectView, newProjectView } from './views/project.js';
import { tagsView } from './views/tags.js';
import { tagView } from './views/tag.js';
import { setupView } from './views/setup.js';
import { settingsView } from './views/settings.js';
import { mascot } from './mascot.js';

export const api = window.api;
export const root = document.getElementById('app');

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
    case 'notes': return notesView();
    case 'graph': return graphView();
    default: return tasksView();
  }
}

function toastHtml() {
  if (!S.toast) return '';
  if (S.toast.kind === 'error') {
    return `<div class="toast error" role="alert"><span>${esc(S.toast.text)}</span><button class="toast-close" data-action="toast-close" aria-label="Chiudi">×</button></div>`;
  }
  return `<div class="toast ${S.toast.kind}" role="status">${esc(S.toast.text)}</div>`;
}

// Ridisegna tutto, poi rimette focus, selezione del testo e posizioni di scorrimento.
export function render() {
  const active = document.activeElement;
  const focusId = active && active.id;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = [...document.querySelectorAll('.scroll, .panel-body')].map((el) => el.scrollTop);

  if (!S.config || !S.config.ready || S.view.name === 'setup') {
    root.innerHTML = setupView();
  } else {
    const panel = S.ui.openNote ? notePanel() : taskPanel();
    root.innerHTML = `<div class="app${panel ? ' with-panel' : ''}">${sidebar()}<main class="main">${viewHtml()}</main>${panel}</div>`;
  }
  root.insertAdjacentHTML('beforeend', toastHtml());

  [...document.querySelectorAll('.scroll, .panel-body')].forEach((el, i) => { if (scrolls[i] != null) el.scrollTop = scrolls[i]; });
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* non tutti gli input lo supportano */ }
    }
  }
  const auto = root.querySelector('[autofocus]');
  if (auto && !focusId) auto.focus();
  autosizeTitle();
  updateMascot();
}

// Posa di base del corvo in funzione di ciò che si vede.
function updateMascot() {
  const ready = S.config && S.config.ready && S.data && S.view.name !== 'setup';
  mascot.setLayout({ panelOpen: !!(S.ui.openTask || S.ui.openNote), hidden: !ready });
  if (!ready) return;
  const open = openTasks().length;
  let base = 'riposo';
  if (S.view.name === 'tasks' && S.ui.search.trim()) base = visibleTasks().length ? 'cerca' : 'pensa';
  else if (open === 0) base = 'dorme';
  mascot.setBase(base);
}

// Ridisegna solo la lista task (durante la ricerca), così il campo di ricerca non perde il focus.
export function renderList() {
  const el = document.getElementById('task-list');
  if (el) {
    el.innerHTML = taskList(visibleTasks(), S.ui.groupBy);
    updateMascot();
  } else render();
}

// Ridisegna solo la lista degli appunti (durante la ricerca).
export function renderNotes() {
  const el = document.getElementById('note-list');
  if (el) el.innerHTML = noteList(visibleNotes());
  else render();
}

export function autosizeTitle() {
  const t = document.getElementById('task-title');
  if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
}

// ---------------------------------------------------------------- avvisi
let toastTimer = null;

export function toast(text, kind = 'info') {
  S.toast = { text, kind };
  render();
  clearTimeout(toastTimer);
  // Gli errori restano finché non si chiudono, così si fa in tempo a leggerli.
  if (kind !== 'error') {
    toastTimer = setTimeout(() => {
      S.toast = null;
      const el = root.querySelector('.toast');
      if (el) el.remove();
    }, 2500);
  }
}

export function closeToast() {
  clearTimeout(toastTimer);
  S.toast = null;
  root.querySelector('.toast')?.remove();
}

// Esegue un'azione asincrona: un errore diventa un avviso e il corvo si preoccupa.
export async function run(fn) {
  try { await fn(); } catch (err) {
    console.error(err);
    mascot.react('error');
    toast(err.message || String(err), 'error');
  }
}

// ---------------------------------------------------------------- dati
// Il raggruppamento ricordato può riferirsi a una categoria che nel frattempo è stata eliminata.
export function checkGroupBy() {
  const ids = ['progetto', 'priorita', 'stato', 'scadenza', ...tagCats().map((c) => c.id)];
  if (!ids.includes(S.ui.groupBy)) S.ui.groupBy = 'progetto';
}

// Rilegge tutto dalla cartella e ridisegna.
export async function reload() {
  S.data = await api.load();
  checkGroupBy();
  if (S.ui.openTask && S.ui.openTask !== 'new' && !task(S.ui.openTask)) S.ui.openTask = null;
  render();
}

// Chiude i blocchi in modifica e le conferme in attesa.
export function stopEditing() {
  S.ui.editing = null;
  S.ui.confirm = null;
}
