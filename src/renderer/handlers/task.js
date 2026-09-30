// Task: creazione, pannello di dettaglio (salvataggio dei campi, tag) e completamento.
import { S, task, project, cat, activeProjects, openStates, closedState, isClosed, values, openTasks, TAG_COLORS } from '../state.js';
import { currentTask, visibleTasks, overdueCount } from '../selectors.js';
import { todayISO } from '../lib/util.js';
import { newTagHint } from '../views/taskPanel.js';
import { mascot } from '../mascot.js';
import { api, root, render, reload, run, toast } from '../core.js';

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
  if (!wasClosed && isClosed(now)) mascot.react(openTasks().length === 0 ? 'allDone' : 'completed');
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
    mascot.react(openTasks().length === 0 ? 'allDone' : 'completed');
  }
}

// ---------------------------------------------------------------- salvataggio di titolo e descrizione
// Il testo scritto e non ancora salvato vive in S.ui.unsaved, così nessun render lo cancella.
let saving = null;   // salvataggio di un campo in corso

function fieldValue(el) {
  const f = el.dataset.field;
  if (el.value.trim() === '' && f !== 'descrizione') return null;
  return f === 'titolo' ? el.value.replace(/\s*\n\s*/g, ' ').trim() : el.value;
}

function setSaveState(field, text) {
  const el = document.getElementById('save-' + field);
  if (el) { el.textContent = text; el.classList.toggle('dirty', text === 'Non salvato'); }
}

function clearUnsaved(field) {
  if (!S.ui.unsaved) return;
  delete S.ui.unsaved[field];
  if (Object.keys(S.ui.unsaved).length === 1) S.ui.unsaved = null;
}

function resetPanelState() { S.ui.unsaved = null; S.ui.saved = {}; S.ui.pendingTag = null; }

export function closePanel() {
  resetPanelState();
  S.ui.openTask = null;
  S.ui.draft = null;
  S.ui.confirm = null;
  render();
}

// Salva un campo del pannello. Se fallisce il testo resta nel campo, "Non salvato", e l'errore risale.
async function saveField(el) {
  const f = el.dataset.field;
  const t = currentTask();
  if (!t) return;
  const value = fieldValue(el);
  const typed = S.ui.unsaved ? S.ui.unsaved[f] : undefined;
  if (S.ui.openTask !== 'new' && (t[f] ?? null) === value) {
    clearUnsaved(f);
    setSaveState(f, S.ui.saved[f] ? 'Salvato' : '');
    return;
  }
  saving = updateTask({ [f]: value });
  try { await saving; } finally { saving = null; }
  // Se nel frattempo si è ripreso a scrivere, il testo nuovo resta "Non salvato".
  if (S.ui.unsaved && S.ui.unsaved[f] !== typed) return;
  clearUnsaved(f);
  if (f === 'titolo' || f === 'descrizione') { S.ui.saved[f] = true; setSaveState(f, 'Salvato'); }
}

// Prima di cambiare ciò che si vede (o di chiudere la finestra): salva quello che si sta scrivendo.
export async function flush() {
  if (saving) await saving;
  const un = S.ui.unsaved;
  if (!un || un.id !== S.ui.openTask) return;
  for (const f of ['titolo', 'descrizione']) {
    const el = root.querySelector(`[data-change="task-field"][data-field="${f}"]`);
    if (el && f in un) await saveField(el);
  }
}

// Un'azione che cambia contesto parte solo se il salvataggio riesce.
export const afterFlush = (fn) => (el, e) => run(async () => { await flush(); fn(el, e); });

// ---------------------------------------------------------------- tag del task
function findTag(c, name) {
  const n = name.trim();
  return c.tags.find((t) => t.nome.toLowerCase() === n.toLowerCase().replace(/^#/, '') || t.id === n.toLowerCase());
}

async function findOrCreateTag(catId, name) {
  const c = cat(catId);
  const n = name.trim();
  if (!n) return null;
  const hit = findTag(c, n);
  if (hit) return hit.id;
  return api.saveTag(catId, { nome: n.replace(/^#/, ''), colore: TAG_COLORS[c.tags.length % TAG_COLORS.length], ordine: c.tags.length + 1 });
}

export function setTagHint(catId, text) {
  const el = document.getElementById('tag-hint-' + catId);
  if (el) { el.textContent = text; el.hidden = !text; }
}

// Aggiunge al task aperto il tag scritto nel campo, creandolo se non esiste.
async function addTag(el) {
  const catId = el.dataset.cat;
  S.ui.pendingTag = null;
  const id = await findOrCreateTag(catId, el.value);
  if (!id) return;
  if (S.ui.openTask !== 'new') S.data = await api.load();
  const t = currentTask();
  const vals = values(t, catId);
  await updateTask({ tags: { ...t.tags, [catId]: vals.includes(id) ? vals : [...vals, id] } });
  if (S.ui.openTask === 'new') {
    S.data = await api.load();
    render();
  }
}

// ---------------------------------------------------------------- handler
export const actions = {
  'new-task': afterFlush((el) => {
    resetPanelState();
    S.ui.draft = newDraft(el.dataset.code);
    S.ui.openTask = 'new';
    render();
    document.getElementById('task-title')?.focus();
  }),
  'open-task': afterFlush((el) => {
    if (!task(el.dataset.id)) return toast('Task ' + el.dataset.id + ' non trovato', 'error');
    if (S.ui.openTask !== el.dataset.id) resetPanelState();
    S.ui.openTask = el.dataset.id;
    S.ui.draft = null;
    S.ui.confirm = null;
    render();
  }),
  'close-task': afterFlush(closePanel),
  'toggle-done': (el) => run(() => toggleDone(el.dataset.id)),
  'task-set': (el) => run(() => updateTask({ [el.dataset.field]: el.dataset.value || null })),
  'task-tag-remove': (el) => run(() => {
    const t = currentTask();
    return updateTask({ tags: { ...t.tags, [el.dataset.cat]: values(t, el.dataset.cat).filter((x) => x !== el.dataset.tag) } });
  }),
  'task-text-remove': (el) => run(() => {
    const t = currentTask();
    return updateTask({ tags: { ...t.tags, [el.dataset.cat]: values(t, el.dataset.cat).filter((x) => x !== el.dataset.value) } });
  }),
  'task-delete': (el) => run(async () => {
    await api.deleteTask(el.dataset.id);
    S.ui.openTask = null;
    S.ui.confirm = null;
    await reload();
    toast('Task eliminato');
  })
};

export const changes = {
  'task-field': (el) => run(() => saveField(el)),
  'task-cat-single': (el) => run(() => {
    const t = currentTask();
    return updateTask({ tags: { ...t.tags, [el.dataset.cat]: el.value || undefined } });
  })
};

export const inputs = {
  'task-dirty': (el) => {
    const f = el.dataset.field;
    if (!S.ui.unsaved || S.ui.unsaved.id !== S.ui.openTask) S.ui.unsaved = { id: S.ui.openTask };
    S.ui.unsaved[f] = el.value;
    delete S.ui.saved[f];
    setSaveState(f, 'Non salvato');
  },
  'task-tag-input': (el) => {
    const catId = el.dataset.cat;
    if (S.ui.pendingTag) { S.ui.pendingTag = null; setTagHint(catId, ''); }
    if (!el.value.trim()) return;
    // Clic su un suggerimento (o nome esistente scritto per intero): il tag si aggiunge subito.
    const hit = findTag(cat(catId), el.value);
    if (hit && !values(currentTask(), catId).includes(hit.id)) run(() => addTag(el));
  }
};

export const keydowns = {
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
      const p = project(saved.progetto);
      const hidden = !visibleTasks().some((t) => t.id === saved.id);
      toast(`Creato ${saved.id}${p ? ' in ' + p.nome : ''}${hidden ? ' (nascosto dai filtri attivi)' : ''}`);
      document.getElementById('quick-add')?.focus();
    });
  },
  // Valore di una categoria a testo libero: si aggiunge con Invio, senza creare file.
  'task-text-add': (el, e) => {
    if (e.key !== 'Enter' || !el.value.trim()) return;
    e.preventDefault();
    const catId = el.dataset.cat;
    const v = el.value.trim();
    run(async () => {
      const t = currentTask();
      const vals = values(t, catId);
      if (!vals.includes(v)) await updateTask({ tags: { ...t.tags, [catId]: [...vals, v] } });
      document.querySelector(`[data-keydown="task-text-add"][data-cat="${catId}"]`)?.focus();
    });
  },
  'title-enter': (el, e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } },
  'task-tag-add': (el, e) => {
    if (e.key !== 'Enter' || !el.value.trim()) return;
    e.preventDefault();
    const catId = el.dataset.cat;
    // Un tag che non esiste si crea solo al secondo Invio, così un refuso non diventa un tag nuovo.
    if (!findTag(cat(catId), el.value)) {
      const nome = el.value.trim().replace(/^#/, '');
      const p = S.ui.pendingTag;
      if (!p || p.cat !== catId || p.nome !== nome) {
        S.ui.pendingTag = { cat: catId, nome };
        setTagHint(catId, newTagHint(nome));
        return;
      }
    }
    run(() => addTag(el));
  }
};
