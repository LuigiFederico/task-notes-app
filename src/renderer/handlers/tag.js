// Tag e categorie: creazione, modifica, ordine (anche dei progetti), unione ed eliminazione.
import { S, cat, TAG_COLORS } from '../state.js';
import { moveItem } from '../lib/util.js';
import { api, render, reload, run, toast, stopEditing, dragList, gripMove } from '../core.js';
import { pickSwatch } from './common.js';

// Tag indicato da data-cat e data-tag. Se la categoria non esiste più l'errore sale, e non si salva un tag nuovo.
function targetTag(el) { return cat(el.dataset.cat).tags.find((x) => x.id === el.dataset.tag); }

export const actions = {
  'tag-color': (el) => { S.ui.tagColor = pickSwatch(el); },
  'tag-page-color': (el) => run(async () => {
    await api.saveTag(el.dataset.cat, { ...targetTag(el), colore: el.dataset.value });
    await reload();
  }),
  'tag-merge-confirm': (el) => run(async () => {
    const d = el.dataset;
    await api.mergeTag(d.cat, d.tag, d.to);
    S.view = { name: 'tag', cat: d.cat, tag: d.to };
    S.ui.confirm = null;
    S.ui.mergeTo = null;
    await reload();
    toast('Tag uniti');
  }),
  'tag-delete': (el) => run(async () => {
    await api.deleteTag(el.dataset.cat, el.dataset.tag);
    S.view = { name: 'tags', cat: el.dataset.cat };
    S.ui.confirm = null;
    await reload();
    toast('Tag eliminato');
  }),
  'category-delete': (el) => run(async () => {
    await api.deleteCategory(el.dataset.cat);
    S.view = { name: 'tags', cat: 'progetto' };
    stopEditing();
    await reload();
    toast('Categoria eliminata');
  })
};

// ---------------------------------------------------------------- ordine
// Le tre liste della pagina Tag che si riordinano, come erano quando la voce è stata presa:
// la voce in posizione from va in to e si riscrive "ordine" (1..n) dove cambia.
function reorderer(grip) {
  const list = grip.dataset.list;
  if (list === 'proj') {
    // Lo stesso ordine unico della pagina Priorità progetti, archiviati compresi.
    const codes = S.data.projects.map((p) => p.codice);
    return { length: codes.length, move: (from, to) => api.reorderProjects(moveItem(codes, from, to)) };
  }
  if (list === 'cat') {
    // Le categorie senza _categoria.md (ordine 99) ricevono il file con il loro posto.
    const cats = S.data.categories.slice();
    return { length: cats.length, move: async (from, to) => {
      const l = moveItem(cats, from, to);
      for (let k = 0; k < l.length; k++) if (l[k].ordine !== k + 1) await api.saveCategory({ ...l[k], ordine: k + 1 });
    } };
  }
  const c = cat(grip.dataset.cat);
  const tags = c.tags.slice();
  return { length: tags.length, move: async (from, to) => {
    const l = moveItem(tags, from, to);
    for (let k = 0; k < l.length; k++) if (l[k].ordine !== k + 1) await api.saveTag(c.id, { ...l[k], ordine: k + 1 });
  } };
}

// Trascinando la maniglia la voce segue il mouse e le altre scorrono; si salva al rilascio.
export function startTagDrag(e) {
  const grip = e.target.closest('.tag-grip');
  if (!grip || grip.disabled || e.button !== 0) return;
  const r = reorderer(grip);
  dragList(e, grip, grip.closest('.cat-row, .tag-row'), (from, to) => run(async () => {
    try { await r.move(from, to); } finally { await reload(); }
  }));
}

export const keydowns = {
  // Alt+↑ ↓ sulla maniglia sposta la voce di un posto; il focus la segue.
  'tag-grip-key': (el, e) => {
    const r = reorderer(el);
    const j = gripMove(el, e, r.length);
    if (j == null) return;
    run(async () => {
      try { await r.move(Number(el.dataset.index), j); } finally { await reload(); }
      document.getElementById(`grip-${el.dataset.list}-${j}`)?.focus();
    });
  }
};

export const changes = {
  'tag-inverse': (el) => run(async () => {
    await api.saveTag(el.dataset.cat, { ...targetTag(el), inverso: el.value.trim() });
    await reload();
  }),
  'tag-rename': (el) => run(async () => {
    const t = targetTag(el);
    if (!el.value.trim()) return render();
    await api.saveTag(el.dataset.cat, { ...t, nome: el.value.trim() });
    await reload();
  }),
  // Scegliere la destinazione propone l'unione: parte solo con il pulsante Unisci.
  'tag-merge': (el) => {
    S.ui.confirm = el.value ? 'merge:' + el.dataset.tag : null;
    S.ui.mergeTo = el.value || null;
    render();
  }
};

export const submits = {
  'create-category': (form) => run(async () => {
    const f = new FormData(form);
    const id = await api.saveCategory({ nome: f.get('nome').trim(), tipo: f.get('tipo'), ordine: S.data.categories.length + 1 });
    S.ui.editing = null;
    S.view = { name: 'tags', cat: id };
    await reload();
  }),
  'save-category': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    const f = new FormData(form);
    const url = c.tipo === 'testo' ? String(f.get('url') || '').trim() : c.url;
    await api.saveCategory({ ...c, nome: f.get('nome').trim(), tipo: f.get('tipo') || c.tipo, descrizione: f.get('descrizione'), url });
    S.ui.editing = null;
    await reload();
  }),
  'create-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    const f = new FormData(form);
    await api.saveTag(c.id, { nome: f.get('nome').trim(), colore: S.ui.tagColor || TAG_COLORS[c.tags.length % TAG_COLORS.length], ordine: c.tags.length + 1, inverso: String(f.get('inverso') || '').trim() });
    S.ui.editing = 'tag-new';
    S.ui.tagColor = null;
    await reload();
  }),
  'save-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    const t = targetTag(form);
    const f = new FormData(form);
    const inverso = c.id === 'collegamento' ? String(f.get('inverso') || '').trim() : t.inverso;
    await api.saveTag(c.id, { ...t, nome: f.get('nome').trim(), colore: S.ui.tagColor || t.colore, chiuso: c.id === 'stato' ? f.get('chiuso') === 'on' : t.chiuso, inverso });
    S.ui.editing = null;
    S.ui.tagColor = null;
    await reload();
  }),
  'save-tag-desc': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    await api.saveTag(c.id, { ...targetTag(form), descrizione: new FormData(form).get('descrizione') });
    S.ui.editing = null;
    await reload();
  })
};
