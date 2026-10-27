// Progetti: creazione, modifica, eliminazione e decisioni.
import { S, project, activeProjects } from '../state.js';
import { moveItem, toggleCheck } from '../lib/util.js';
import { api, render, reload, run, toast, stopEditing, dragList } from '../core.js';
import { pickSwatch, pickCustomColor } from './common.js';

export const actions = {
  'new-project': () => {
    S.ui.projectDraft = null;
    S.view = { name: 'new-project' };
    S.ui.editing = null;
    render();
  },
  'draft-color': (el) => { S.ui.projectDraft.colore = pickSwatch(el); },
  'project-color': (el) => { S.ui.projectColor = pickSwatch(el); },
  'proj-filter': (el) => { S.ui.projFilter = el.dataset.value; render(); },
  'project-tab': (el) => { S.ui.projectTab = el.dataset.value; render(); },
  'project-delete': () => run(async () => {
    await api.deleteProject(S.view.code);
    S.view = { name: 'projects' };
    stopEditing();
    await reload();
    toast('Progetto eliminato');
  }),
  'decision-delete': (el) => run(async () => {
    const p = project(S.view.code);
    const decisioni = p.decisioni.filter((_, i) => i !== Number(el.dataset.index));
    await api.saveProject({ ...p, decisioni });
    S.ui.confirm = null;
    await reload();
  })
};

export const changes = {
  // Caselle delle checklist nella descrizione del progetto e nel testo di una decisione: [ ] ↔ [x], poi si salva.
  'md-check-project': (el) => run(async () => {
    const p = project(S.view.code);
    await api.saveProject({ ...p, descrizione: toggleCheck(p.descrizione, Number(el.dataset.index)) });
    await reload();
  }),
  'md-check-decision': (el) => run(async () => {
    const p = project(S.view.code);
    const i = Number(el.closest('.md').dataset.index);
    const decisioni = p.decisioni.map((d, k) => (k === i ? { ...d, testo: toggleCheck(d.testo, Number(el.dataset.index)) } : d));
    await api.saveProject({ ...p, decisioni });
    await reload();
  }),
  'draft-color-custom': (el) => { S.ui.projectDraft.colore = pickCustomColor(el); },
  'project-color-custom': (el) => { S.ui.projectColor = pickCustomColor(el); }
};

export const inputs = {
  'project-draft': (el) => {
    const f = el.dataset.field;
    S.ui.projectDraft[f] = f === 'codice' ? el.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : el.value;
    if (f === 'codice') el.value = S.ui.projectDraft.codice;
  }
};

export const submits = {
  'create-project': () => run(async () => {
    const d = S.ui.projectDraft;
    const codice = (d.codice || '').toUpperCase();
    if (codice.length < 2) throw new Error('Il codice deve avere almeno 2 caratteri.');
    if (project(codice)) throw new Error('Esiste già un progetto con codice ' + codice + '.');
    await api.saveProject({ codice, nome: d.nome.trim(), colore: d.colore, descrizione: d.descrizione, repository: (d.repository || '').trim(), decisioni: [] });
    S.ui.projectDraft = null;
    S.view = { name: 'project', code: codice };
    await reload();
    toast('Progetto creato');
  }),
  'save-project-head': (form) => run(async () => {
    const p = project(S.view.code);
    const f = new FormData(form);
    await api.saveProject({ ...p, nome: f.get('nome').trim(), stato: f.get('stato'), colore: S.ui.projectColor || p.colore, repository: String(f.get('repository') || '').trim() });
    S.ui.editing = null;
    await reload();
  }),
  'save-project-desc': (form) => run(async () => {
    const p = project(S.view.code);
    await api.saveProject({ ...p, descrizione: new FormData(form).get('descrizione') });
    S.ui.editing = null;
    await reload();
  }),
  'add-decision': (form) => run(async () => {
    const p = project(S.view.code);
    const f = new FormData(form);
    const dec = { data: f.get('data'), titolo: f.get('titolo').trim(), testo: f.get('testo').trim(), task: f.get('task') || null };
    await api.saveProject({ ...p, decisioni: [dec, ...p.decisioni] });
    S.ui.editing = null;
    await reload();
    toast('Decisione registrata');
  })
};

// Pagina Priorità progetti: la scheda si trascina da qualsiasi punto. Al rilascio lo Store mette questi
// progetti attivi nel nuovo ordine e gli altri (archiviati) in coda, riscrivendo solo "ordine".
export function startPrioDrag(e) {
  const card = e.target.closest('.prio-card.movable');
  if (!card || e.button !== 0) return;
  const codes = activeProjects().map((p) => p.codice);   // l'elenco com'era quando la scheda è stata presa
  dragList(e, card, card, (from, to) => run(async () => {
    try { await api.reorderProjects(moveItem(codes, from, to)); } finally { await reload(); }
  }));
}
