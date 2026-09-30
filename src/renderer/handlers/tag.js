// Tag e categorie: creazione, modifica, ordine, unione ed eliminazione.
import { S, cat, TAG_COLORS } from '../state.js';
import { api, render, reload, run, toast, stopEditing } from '../core.js';
import { pickSwatch } from './common.js';

// Tag indicato da data-cat e data-tag. Se la categoria non esiste più l'errore sale, e non si salva un tag nuovo.
function targetTag(el) { return cat(el.dataset.cat).tags.find((x) => x.id === el.dataset.tag); }

export const actions = {
  'tag-color': (el) => { S.ui.tagColor = pickSwatch(el); },
  'tag-page-color': (el) => run(async () => {
    await api.saveTag(el.dataset.cat, { ...targetTag(el), colore: el.dataset.value });
    await reload();
  }),
  'tag-move': (el) => run(async () => {
    const c = cat(el.dataset.cat);
    const i = Number(el.dataset.index);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= c.tags.length) return;
    const list = c.tags.slice();
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].ordine !== k + 1) await api.saveTag(c.id, { ...list[k], ordine: k + 1 });
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

export const changes = {
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
    await api.saveCategory({ ...c, nome: f.get('nome').trim(), tipo: f.get('tipo') || c.tipo, descrizione: f.get('descrizione') });
    S.ui.editing = null;
    await reload();
  }),
  'create-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    const f = new FormData(form);
    await api.saveTag(c.id, { nome: f.get('nome').trim(), colore: S.ui.tagColor || TAG_COLORS[c.tags.length % TAG_COLORS.length], ordine: c.tags.length + 1 });
    S.ui.editing = 'tag-new';
    S.ui.tagColor = null;
    await reload();
  }),
  'save-tag': (form) => run(async () => {
    const c = cat(form.dataset.cat);
    const t = targetTag(form);
    const f = new FormData(form);
    await api.saveTag(c.id, { ...t, nome: f.get('nome').trim(), colore: S.ui.tagColor || t.colore, chiuso: c.id === 'stato' ? f.get('chiuso') === 'on' : t.chiuso });
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
