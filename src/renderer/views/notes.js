import { S } from '../state.js';
import { visibleNotes } from '../selectors.js';
import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { noteRow, noteHeader, emptyState } from './components.js';

export function noteList(list, opts) {
  if (!list.length) {
    return emptyState(S.data.notes.length ? 'Nessun appunto corrisponde alla ricerca.' : 'Ancora nessun appunto: creane uno con «Nuovo appunto».');
  }
  return `${noteHeader(opts)}<div class="card list">${list.map((n) => noteRow(n, opts)).join('')}</div>`;
}

export function notesView() {
  const n = S.data.notes.length;
  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6">
        <h1 class="display">Appunti</h1>
        <div class="muted">${n === 1 ? '1 appunto' : `${n} appunti`} · si collegano a task e ad altri appunti</div>
      </div>
      <div class="row-10">
        <label class="search">${icon.search(16)}<input id="note-search" type="search" placeholder="Cerca negli appunti…" value="${esc(S.ui.noteSearch)}" data-input="note-search" aria-label="Cerca negli appunti"></label>
        <button class="btn primary" data-action="new-note">${icon.plus(16)}Nuovo appunto</button>
      </div>
    </header>
    <div id="note-list" class="scroll">${noteList(visibleNotes())}</div>
  </div>`;
}
