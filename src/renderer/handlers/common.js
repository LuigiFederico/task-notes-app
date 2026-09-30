// Navigazione, blocchi in modifica e conferme, filtri e raggruppamento della lista.
import { S, saveView } from '../state.js';
import { root, render, renderList, closeToast, stopEditing } from '../core.js';
import { afterFlush } from './task.js';

function go(el) {
  const d = el.dataset;
  S.view = { name: d.view, code: d.code, cat: d.cat, tag: d.tag };
  if (d.view === 'tags' && !d.cat) S.view.cat = 'progetto';
  stopEditing();
  S.ui.hoverWeek = null;
  S.ui.recentDone = {};
  if (d.view === 'project') S.ui.projectTab = 'open';
  render();
  const main = root.querySelector('.scroll');
  if (main) main.scrollTop = 0;
}

// Evidenzia il pallino scelto senza ridisegnare e ne restituisce il colore.
export function pickSwatch(el) {
  el.parentElement.querySelectorAll('.swatch').forEach((s) => { s.classList.remove('on'); s.setAttribute('aria-checked', 'false'); });
  el.classList.add('on');
  el.setAttribute('aria-checked', 'true');
  return el.dataset.value;
}

export const actions = {
  go: afterFlush(go),
  'toast-close': closeToast,
  edit: (el) => {
    S.ui.editing = el.dataset.key;
    S.ui.confirm = null;
    S.ui.tagColor = null;
    S.ui.projectColor = null;
    render();
  },
  'cancel-edit': () => { stopEditing(); render(); },
  'ask-confirm': (el) => { S.ui.confirm = el.dataset.key; render(); },
  'cancel-confirm': () => { S.ui.confirm = null; render(); },
  'group-by': (el) => { S.ui.groupBy = el.dataset.value; saveView(); render(); },
  'clear-filters': () => { Object.assign(S.ui, { fProject: '', fPrio: '', fTag: '', search: '' }); render(); }
};

export const changes = {
  filter: (el) => { S.ui[el.dataset.name] = el.value; render(); },
  'show-done': (el) => { S.ui.showDone = el.checked; S.ui.recentDone = {}; saveView(); render(); }
};

export const inputs = {
  search: (el) => { S.ui.search = el.value; renderList(); }
};
