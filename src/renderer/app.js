// Avvio dell'interfaccia: collega gli eventi del DOM agli handler, le scorciatoie globali e i messaggi dal processo main.
// Gli handler stanno in handlers/, uno per argomento; render, reload e avvisi in core.js.
import { S } from './state.js';
import { overdueCount } from './selectors.js';
import { esc } from './lib/util.js';
import { updateStatus } from './views/settings.js';
import { mascot } from './mascot.js';
import { api, root, render, autosizeTitle, reload, run, toast, checkGroupBy, stopEditing, playOnce } from './core.js';
import * as common from './handlers/common.js';
import * as taskHandlers from './handlers/task.js';
import * as noteHandlers from './handlers/note.js';
import * as graphHandlers from './handlers/graph.js';
import * as projectHandlers from './handlers/project.js';
import * as tagHandlers from './handlers/tag.js';
import * as settingsHandlers from './handlers/settings.js';
import * as layoutHandlers from './handlers/layout.js';

const { flush, closePanel, setTagHint, hideMentions } = taskHandlers;
const HANDLERS = [common, taskHandlers, noteHandlers, graphHandlers, projectHandlers, tagHandlers, settingsHandlers, layoutHandlers];

// Unisce le tabelle di un tipo di evento; lo stesso nome in due file sarebbe un errore.
function merge(kind) {
  const out = {};
  for (const h of HANDLERS) {
    for (const [name, fn] of Object.entries(h[kind] || {})) {
      if (name in out) throw new Error(`Handler duplicato: ${kind}.${name}`);
      out[name] = fn;
    }
  }
  return out;
}

const actions = merge('actions');     // data-action, al clic
const changes = merge('changes');     // data-change
const inputs = merge('inputs');       // data-input
const keydowns = merge('keydowns');   // data-keydown
const submits = merge('submits');     // data-submit, sui form

let pendingReload = false;

// ---------------------------------------------------------------- events
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
root.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
  // Un interruttore ridisegnato dal suo handler ripartirebbe già nella posizione nuova: playOnce lo fa scorrere.
  if (el?.matches('.toggle input') && !el.isConnected) playOnce(`.toggle [data-change="${CSS.escape(el.dataset.change)}"]`);
});
root.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
  if (e.target.id === 'task-title') autosizeTitle();
});
root.addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-keydown]');
  if (el && keydowns[el.dataset.keydown]) keydowns[el.dataset.keydown](el, e);
});
root.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-submit]');
  if (form) { e.preventDefault(); submits[form.dataset.submit](form, e); }
});
// Grafo: il nodo sotto il mouse (o con il focus) mette in evidenza i suoi collegamenti.
root.addEventListener('mouseover', (e) => { if (S.view.name === 'graph') graphHandlers.highlightNode(e.target.closest('[data-hover="gnode"]')?.dataset.id || null); });
root.addEventListener('focusin', (e) => { if (S.view.name === 'graph') graphHandlers.highlightNode(e.target.closest('[data-hover="gnode"]')?.dataset.id || null); });
// Grafico dei progetti: la settimana sotto il mouse si evidenzia e compare nel riepilogo.
root.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-hover="week"]');
  if (!el) return;
  const i = Number(el.dataset.index);
  if (S.ui.hoverWeek !== i) { S.ui.hoverWeek = i; render(); }
});
// Le voci dei suggerimenti di @ non prendono il focus: il clic sceglie la voce e il campo resta attivo.
root.addEventListener('pointerdown', layoutHandlers.startPanelResize);
root.addEventListener('mousedown', (e) => { if (e.target.closest('.mention-item')) e.preventDefault(); });
root.addEventListener('focusout', (e) => {
  // I suggerimenti di @ si chiudono uscendo dal campo.
  if (S.ui.mention && e.target.getAttribute && e.target.getAttribute('aria-controls') === 'mention-' + S.ui.mention.field) hideMentions();
  // La richiesta di creare un tag nuovo decade quando si esce dal campo.
  if (S.ui.pendingTag && e.target.dataset && e.target.dataset.keydown === 'task-tag-add') {
    setTagHint(S.ui.pendingTag.cat, '');
    S.ui.pendingTag = null;
  }
});
root.addEventListener('focusout', () => {
  if (!pendingReload) return;
  setTimeout(() => {
    if (pendingReload && !isTyping()) { pendingReload = false; run(reload); }
  }, 50);
});

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.id !== 'search'));
}

document.addEventListener('keydown', (e) => {
  if (!S.data || !S.config?.ready) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); actions['new-task'](document.body); }
  else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    run(async () => {
      await flush();
      if (S.view.name !== 'tasks') { S.view = { name: 'tasks' }; render(); }
      document.getElementById('search')?.focus();
    });
  } else if (e.key === 'Escape') {
    if (S.ui.confirm || S.ui.editing) { stopEditing(); render(); }
    else if (S.ui.openTask || S.ui.openNote) run(async () => { await flush(); document.activeElement?.blur(); closePanel(); });
  }
});

// Chiusura della finestra: prima si salva il campo in modifica. Se non riesce, la finestra resta aperta.
api.onBeforeClose(() => flush({ keepDraft: false }).then(() => api.closeOk(), (err) => {
  mascot.react('error');
  toast(err.message || String(err), 'error');
  api.closeFail();
}));

// Avanzamento del download di un aggiornamento: si aggiorna solo il testo, senza ridisegnare.
api.onUpdateProgress((percento) => {
  if (!S.ui.update || S.ui.update.stato !== 'scarico') return;
  S.ui.update.percento = percento;
  const el = document.getElementById('update-status');
  if (el) el.textContent = updateStatus();
});

// Cambiamenti arrivati da fuori (OneDrive, un altro PC, modifiche a mano ai file).
api.onDataChanged(() => { if (isTyping()) pendingReload = true; else run(reload); });

// ---------------------------------------------------------------- avvio
(async () => {
  try {
    mascot.mount();
    S.config = await api.getConfig();
    if (S.config.ready) { S.data = await api.load(); checkGroupBy(); }
    render();
    if (S.data && overdueCount()) setTimeout(() => mascot.react('overdue', { count: overdueCount() }), 900);
  } catch (err) {
    root.innerHTML = `<div class="fatal"><h1>Impossibile avviare Taccuino</h1><pre>${esc(err.message)}</pre></div>`;
  }
})();
