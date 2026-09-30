// Appunti: creazione, apertura nel pannello ed eliminazione. I campi del pannello (titolo, testo, categorie,
// collegamenti) usano gli stessi handler dei task, in handlers/task.js.
import { S, note, project, isNoteId } from '../state.js';
import { api, render, renderNotes, reload, run, toast } from '../core.js';
import { afterFlush, openTask, resetPanelState } from './task.js';

function newNote(code) {
  const inProject = S.view.name === 'project' && project(S.view.code) ? S.view.code : '';
  return { id: null, titolo: '', progetto: code || inProject, tags: {}, collegamenti: [], descrizione: '' };
}

const openNote = afterFlush((el) => {
  if (!note(el.dataset.id)) return toast('Appunto ' + el.dataset.id + ' non trovato', 'error');
  if (S.ui.openNote !== el.dataset.id) resetPanelState();
  S.ui.openNote = el.dataset.id;
  S.ui.noteDraft = null;
  S.ui.openTask = null;
  S.ui.draft = null;
  S.ui.confirm = null;
  render();
});

export const actions = {
  'new-note': afterFlush((el) => {
    resetPanelState();
    S.ui.noteDraft = newNote(el.dataset.code);
    S.ui.openNote = 'new';
    S.ui.openTask = null;
    S.ui.draft = null;
    render();
    document.getElementById('task-title')?.focus();
  }),
  'open-note': openNote,
  // Collegamento o menzione cliccati: apre il task o l'appunto.
  'open-ref': (el, e) => (isNoteId(el.dataset.id) ? openNote : openTask)(el, e),
  'note-delete': (el) => run(async () => {
    await api.deleteNote(el.dataset.id);
    S.ui.openNote = null;
    S.ui.confirm = null;
    await reload();
    toast('Appunto eliminato');
  })
};

export const inputs = {
  'note-search': (el) => { S.ui.noteSearch = el.value; renderNotes(); }
};
