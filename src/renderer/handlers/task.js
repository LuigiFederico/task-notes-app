// Task: creazione, pannello di dettaglio (salvataggio dei campi, tag, collegamenti) e completamento.
// Il pannello serve anche gli appunti: i campi in comune passano da currentItem() e updateItem().
import { S, task, ref, isNoteId, project, cat, activeProjects, openStates, closedState, isClosed, values, openTasks, defaultPrio, TAG_COLORS } from '../state.js';
import { currentTask, currentNote, currentItem, visibleTasks, overdueCount, refCandidates } from '../selectors.js';
import { todayISO } from '../lib/util.js';
import { newTagHint, mentionItems } from '../views/components.js';
import { mascot } from '../mascot.js';
import { api, root, render, reload, run, toast } from '../core.js';

function defaultProject() {
  if (S.view.name === 'project' && project(S.view.code)) return S.view.code;
  if (S.ui.fProject) return S.ui.fProject;
  return (activeProjects()[0] || S.data.projects[0] || {}).codice || '';
}

function newDraft(code) {
  return {
    id: null, titolo: '', progetto: code || defaultProject(), stato: (openStates()[0] || {}).id || 'da-fare',
    priorita: defaultPrio(),
    scadenza: null, tags: {}, sottotask: [], descrizione: '', storico: []
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

// Appunto aperto nel pannello: come un task, uno nuovo si crea quando ha un titolo.
async function updateNote(patch) {
  const n = currentNote();
  if (!n) return;
  if (S.ui.openNote === 'new') {
    Object.assign(n, patch);
    if (n.titolo && n.titolo.trim()) {
      const saved = await api.saveNote(n);
      S.ui.openNote = saved.id;
      S.ui.noteDraft = null;
      await reload();
      mascot.react('created');
      toast(`Creato ${saved.id}`);
    } else render();
    return;
  }
  await api.saveNote({ ...n, ...patch });
  await reload();
}

// Titolo, progetto, categorie, collegamenti e testo si salvano allo stesso modo per task e appunti.
function updateItem(patch) { return S.ui.openNote ? updateNote(patch) : updateTask(patch); }
function openId() { return S.ui.openNote || S.ui.openTask; }

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

function markDirty(el) {
  const f = el.dataset.field;
  if (!S.ui.unsaved || S.ui.unsaved.id !== openId()) S.ui.unsaved = { id: openId() };
  S.ui.unsaved[f] = el.value;
  delete S.ui.saved[f];
  setSaveState(f, 'Non salvato');
}

function clearUnsaved(field) {
  if (!S.ui.unsaved) return;
  delete S.ui.unsaved[field];
  if (Object.keys(S.ui.unsaved).length === 1) S.ui.unsaved = null;
}

export function resetPanelState() { S.ui.unsaved = null; S.ui.saved = {}; S.ui.pendingTag = null; S.ui.subEdit = null; S.ui.mention = null; S.ui.descEdit = false; }

export function closePanel() {
  resetPanelState();
  S.ui.openTask = null;
  S.ui.draft = null;
  S.ui.openNote = null;
  S.ui.noteDraft = null;
  S.ui.confirm = null;
  render();
}

// Salva un campo del pannello. Se fallisce il testo resta nel campo, "Non salvato", e l'errore risale.
async function saveField(el) {
  const f = el.dataset.field;
  const t = currentItem();
  if (!t) return;
  const value = fieldValue(el);
  const typed = S.ui.unsaved ? S.ui.unsaved[f] : undefined;
  if (openId() !== 'new' && (t[f] ?? null) === value) {
    clearUnsaved(f);
    setSaveState(f, S.ui.saved[f] ? 'Salvato' : '');
    return;
  }
  saving = updateItem({ [f]: value });
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
  if (!un || un.id !== openId()) return;
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
  if (openId() !== 'new') S.data = await api.load();
  const t = currentItem();
  const vals = values(t, catId);
  await updateItem({ tags: { ...t.tags, [catId]: vals.includes(id) ? vals : [...vals, id] } });
  if (openId() === 'new') {
    S.data = await api.load();
    render();
  }
}

// ---------------------------------------------------------------- sotto-task
// Ogni modifica salva il task intero con la lista nuova; la checklist non scrive righe di storico.
function saveSubtasks(fn) {
  const t = currentTask();
  const list = (t.sottotask || []).map((x) => ({ ...x }));
  fn(list);
  return updateTask({ sottotask: list });
}

// ---------------------------------------------------------------- collegamenti e suggerimenti di @
// L'elenco dei suggerimenti si aggiorna senza ridisegnare, così il campo non perde il focus mentre si scrive.
function drawMentions() {
  const m = S.ui.mention;
  const box = m && document.getElementById('mention-' + m.field);
  if (!box) return;
  box.innerHTML = mentionItems(m.items, m.active);
  box.hidden = false;
  box.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  document.querySelector(`[aria-controls="mention-${m.field}"]`)?.setAttribute('aria-expanded', 'true');
}

function showMentions(field, query) {
  const t = currentItem();
  S.ui.mention = { field, query, active: 0, items: refCandidates(query, t ? [t.id] : []) };
  drawMentions();
}

export function hideMentions() {
  const m = S.ui.mention;
  S.ui.mention = null;
  const box = m && document.getElementById('mention-' + m.field);
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
  document.querySelector(`[aria-controls="mention-${m.field}"]`)?.setAttribute('aria-expanded', 'false');
}

// Frecce, Invio ed Esc sull'elenco aperto. Restituisce true se il tasto è stato usato.
function mentionKey(e, pick) {
  const m = S.ui.mention;
  if (!m) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = m.items.length;
    if (n) m.active = (m.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    drawMentions();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const x = m.items[m.active];
    if (x) run(() => pick(x.id));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();   // Esc chiude i suggerimenti, non il pannello
    hideMentions();
  } else return false;
  return true;
}

async function addLink(id) {
  const t = currentItem();
  const tipo = document.querySelector('[data-change="link-type"]')?.value || '';
  hideMentions();
  if (id === t.id) throw new Error('Un elemento non può essere collegato a sé stesso.');
  const list = t.collegamenti || [];
  if (!list.some((l) => l.tipo === tipo && l.id === id)) await updateItem({ collegamenti: [...list, { tipo, id }] });
  document.getElementById('link-input')?.focus();
}

// Menzione nella descrizione: sostituisce la @ che si sta scrivendo con @ID. Il testo si salva come il resto, all'uscita dal campo.
function insertMention(id) {
  const el = document.getElementById('task-desc');
  hideMentions();
  if (!el) return;
  const pos = el.selectionStart;
  const before = el.value.slice(0, pos).replace(/@[\w-]*$/, '@' + id + ' ');
  el.value = before + el.value.slice(pos);
  el.setSelectionRange(before.length, before.length);
  markDirty(el);
  el.focus();
}

// Apre i suggerimenti se subito prima del cursore c'è una @ con l'inizio di un ID o di un titolo.
function detectMention(el) {
  const m = el.value.slice(0, el.selectionStart).match(/(?:^|[^\w@/.-])@([\w-]*)$/);
  if (m) showMentions('desc', m[1]);
  else if (S.ui.mention && S.ui.mention.field === 'desc') hideMentions();
}

// Chi sceglie un suggerimento, secondo il campo in cui si sta scrivendo.
const PICKERS = { link: addLink, desc: insertMention };

export const openTask = afterFlush((el) => {
  if (!task(el.dataset.id)) return toast('Task ' + el.dataset.id + ' non trovato', 'error');
  if (S.ui.openTask !== el.dataset.id) resetPanelState();
  S.ui.openTask = el.dataset.id;
  S.ui.draft = null;
  S.ui.openNote = null;
  S.ui.noteDraft = null;
  S.ui.confirm = null;
  render();
});

// Salva la descrizione e torna alla lettura.
async function closeDescription() {
  hideMentions();
  await flush();
  S.ui.descEdit = false;
  render();
}

// ---------------------------------------------------------------- handler
export const actions = {
  'new-task': afterFlush((el) => {
    resetPanelState();
    S.ui.draft = newDraft(el.dataset.code);
    S.ui.openTask = 'new';
    S.ui.openNote = null;
    S.ui.noteDraft = null;
    render();
    document.getElementById('task-title')?.focus();
  }),
  'open-task': openTask,
  'desc-edit': () => {
    S.ui.descEdit = true;
    render();
    const el = document.getElementById('task-desc');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  },
  'desc-done': () => run(closeDescription),
  'close-task': afterFlush(closePanel),
  'toggle-done': (el) => run(() => toggleDone(el.dataset.id)),
  'task-set': (el) => run(() => updateTask({ [el.dataset.field]: el.dataset.value || null })),
  'task-tag-remove': (el) => run(() => {
    const t = currentItem();
    return updateItem({ tags: { ...t.tags, [el.dataset.cat]: values(t, el.dataset.cat).filter((x) => x !== el.dataset.tag) } });
  }),
  'task-text-remove': (el) => run(() => {
    const t = currentItem();
    return updateItem({ tags: { ...t.tags, [el.dataset.cat]: values(t, el.dataset.cat).filter((x) => x !== el.dataset.value) } });
  }),
  'sub-toggle': (el) => run(() => saveSubtasks((l) => { const x = l[Number(el.dataset.index)]; x.fatto = !x.fatto; })),
  'sub-delete': (el) => run(() => saveSubtasks((l) => l.splice(Number(el.dataset.index), 1))),
  'sub-move': (el) => run(() => saveSubtasks((l) => {
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.dir);
    if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
  })),
  'sub-edit-start': (el) => {
    S.ui.subEdit = Number(el.dataset.index);
    render();
    const input = document.getElementById('sub-edit');
    if (input) { input.focus(); input.select(); }
  },
  'mention-pick': (el) => run(() => { const m = S.ui.mention; return m && PICKERS[m.field](el.dataset.id); }),
  // Il collegamento sta nel file di partenza: togliere quello in entrata riscrive l'altro task o appunto.
  'link-remove': (el) => run(async () => {
    const { from, tipo, to } = el.dataset;
    const drop = (list) => (list || []).filter((l) => !(l.tipo === tipo && l.id === to));
    const t = currentItem();
    if (from === t.id) return updateItem({ collegamenti: drop(t.collegamenti) });
    const other = ref(from);
    if (!other) return;
    await (isNoteId(from) ? api.saveNote : api.saveTask)({ ...other, collegamenti: drop(other.collegamenti) });
    await reload();
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
  'task-prio': (el) => run(() => updateTask({ priorita: (cat('priorita')?.tags[Number(el.value)] || {}).id || null })),
  'link-type': (el) => { S.ui.linkType = el.value; },
  // Un testo vuoto elimina la voce.
  'sub-edit': (el) => run(() => {
    S.ui.subEdit = null;
    const i = Number(el.dataset.index);
    const v = el.value.trim();
    return saveSubtasks((l) => { if (!l[i]) return; if (v) l[i].testo = v; else l.splice(i, 1); });
  }),
  'task-cat-single': (el) => run(() => {
    const t = currentItem();
    return updateItem({ tags: { ...t.tags, [el.dataset.cat]: el.value || undefined } });
  })
};

export const inputs = {
  'link-search': (el) => showMentions('link', el.value),
  'task-dirty': (el) => {
    markDirty(el);
    if (el.id === 'task-desc') detectMention(el);
  },
  'task-tag-input': (el) => {
    const catId = el.dataset.cat;
    if (S.ui.pendingTag) { S.ui.pendingTag = null; setTagHint(catId, ''); }
    if (!el.value.trim()) return;
    // Clic su un suggerimento (o nome esistente scritto per intero): il tag si aggiunge subito.
    const hit = findTag(cat(catId), el.value);
    if (hit && !values(currentItem(), catId).includes(hit.id)) run(() => addTag(el));
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
      const t = currentItem();
      const vals = values(t, catId);
      if (!vals.includes(v)) await updateItem({ tags: { ...t.tags, [catId]: [...vals, v] } });
      document.querySelector(`[data-keydown="task-text-add"][data-cat="${catId}"]`)?.focus();
    });
  },
  'desc-key': (el, e) => {
    if (mentionKey(e, insertMention)) return;
    // Esc torna alla lettura; in un task nuovo chiude il pannello come sempre.
    if (e.key === 'Escape' && openId() !== 'new') {
      e.preventDefault();
      e.stopPropagation();
      run(closeDescription);
    }
  },
  'link-key': (el, e) => {
    if (mentionKey(e, addLink)) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); showMentions('link', el.value); }
  },
  'sub-add': (el, e) => {
    if (e.key !== 'Enter' || !el.value.trim()) return;
    e.preventDefault();
    const testo = el.value.trim();
    run(async () => {
      await saveSubtasks((l) => l.push({ fatto: false, testo }));
      document.getElementById('sub-add')?.focus();
    });
  },
  'sub-edit-key': (el, e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      el.value = el.defaultValue;   // nessun salvataggio
      S.ui.subEdit = null;
      render();
    }
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
