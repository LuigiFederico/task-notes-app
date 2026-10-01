import { S, project, extraCats } from '../state.js';
import { currentNote } from '../selectors.js';
import { esc, safeColor, fmtFull } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox, options, select, categoryField, links, description, saveState } from './components.js';

// Pannello di dettaglio di un appunto: come quello del task, senza stato, priorità, scadenza, sotto-task e storico.
// Titolo e testo usano gli stessi id e handler del pannello del task (task-title, task-desc).
export function notePanel() {
  const n = currentNote();
  if (!n) return '';
  const isNew = S.ui.openNote === 'new';
  const p = project(n.progetto);
  const confirmDel = S.ui.confirm === 'note:' + n.id;
  const un = S.ui.unsaved && S.ui.unsaved.id === S.ui.openNote ? S.ui.unsaved : {};
  const projects = S.data.projects.filter((x) => x.stato !== 'archiviato' || x.codice === n.progetto);
  return `
  <section class="panel" aria-label="Dettaglio appunto">
    <div class="panel-resize" aria-hidden="true"></div>
    <div class="panel-head">
      <span class="mono muted">${isNew ? 'Nuovo appunto' : esc(n.id)}</span>
      ${p ? `<span class="faint">/</span><button class="proj-link" data-action="go" data-view="project" data-code="${esc(p.codice)}"><span class="dot sq" style="background:${safeColor(p.colore)}"></span>${esc(p.nome)}</button>` : ''}
      <span class="grow"></span>
      ${isNew || confirmDel ? '' : `<button class="icon-btn" data-action="ask-confirm" data-key="note:${esc(n.id)}" aria-label="Elimina appunto" title="Elimina">${icon.trash(17)}</button>`}
      <button class="icon-btn" data-action="close-task" aria-label="Chiudi dettaglio" title="Chiudi (Esc)">${icon.close(18)}</button>
    </div>
    ${confirmDel ? `<div class="panel-confirm">${confirmBox(`Eliminare ${n.id}? Potrai ripristinarlo dal Cestino.`, `data-action="note-delete" data-id="${esc(n.id)}"`)}</div>` : ''}
    <div class="panel-body">
      <div class="row-14 start">
        <span class="note-mark">${icon.note(20)}</span>
        <label class="grow"><span class="sr">Titolo</span>
          <textarea id="task-title" class="title-input" rows="1" data-change="task-field" data-input="task-dirty" data-field="titolo" data-keydown="title-enter" placeholder="Di cosa parla l'appunto?">${esc(un.titolo ?? (isNew ? '' : n.titolo))}</textarea>
        </label>
        ${saveState('titolo', un)}
      </div>
      ${isNew ? '<div class="hint">Scrivi il titolo e premi Invio per creare l\'appunto.</div>' : ''}
      <div class="props">
        <span class="prop-label">Progetto</span>
        ${select('data-change="task-field" data-field="progetto"', '<option value="">Nessun progetto</option>' + options(projects.map((x) => [x.codice, `${x.nome} · ${x.codice}`]), n.progetto), 'Progetto')}
        ${extraCats().map((c) => `<span class="prop-label">${esc(c.nome)}</span>${categoryField(n, c)}`).join('')}
      </div>
      <div class="hr"></div>
      ${isNew ? '' : links(n)}
      <div class="note-text">${description(n, isNew, un, 'TESTO')}</div>
    </div>
    ${isNew ? '' : `<div class="panel-foot">${icon.file(14)}<span class="mono grow">appunti/${esc(n.id)}.md</span><span>Aggiornato ${esc(fmtFull(n.aggiornato))}</span></div>`}
  </section>`;
}
