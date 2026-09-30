// Progetti: creazione, modifica, eliminazione e decisioni.
import { S, project } from '../state.js';
import { api, render, reload, run, toast, stopEditing } from '../core.js';
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
    await api.saveProject({ codice, nome: d.nome.trim(), colore: d.colore, descrizione: d.descrizione, decisioni: [] });
    S.ui.projectDraft = null;
    S.view = { name: 'project', code: codice };
    await reload();
    toast('Progetto creato');
  }),
  'save-project-head': (form) => run(async () => {
    const p = project(S.view.code);
    const f = new FormData(form);
    await api.saveProject({ ...p, nome: f.get('nome').trim(), stato: f.get('stato'), colore: S.ui.projectColor || p.colore });
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
