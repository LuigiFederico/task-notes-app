import { S, cat, project, extraCats, isClosed, prioOf } from '../state.js';
import { currentTask, missingProject } from '../selectors.js';
import { esc, safeColor, tint, dueLabel, fmtFull, fmtShort } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox, options, select, categoryField, links, description, saveState, projectMark, prioBars } from './components.js';

// Stato e Priorità: una tendina che mostra il valore scelto col suo colore, con un pallino per lo stato e le barre per la priorità.
// L'elenco è nostro e non una <select>, così anche da aperto mostra pallini e barre; S.ui.menu dice quale è aperto.
function dropdown(catId, current) {
  const tags = cat(catId)?.tags || [];
  const mark = (t) => (catId === 'priorita' ? prioBars(t.id) : `<span class="dot round" style="background:${safeColor(t.colore)}"></span>`);
  const cur = tags.find((t) => t.id === current);
  const open = S.ui.menu === catId;
  const opts = tags.map((t, k) => {
    const on = t.id === current;
    const col = safeColor(t.colore);
    return `<button id="task-${catId}-opt-${k}" class="dd-opt" role="option" aria-selected="${on}" tabindex="-1" style="${on ? `background:${tint(col, '14')}` : ''}" data-action="menu-pick" data-keydown="menu-key" data-cat="${catId}" data-value="${esc(t.id)}">
      ${mark(t)}<span class="grow" style="${on ? `color:${col};font-weight:600` : ''}">${esc(t.nome)}</span>${on ? `<span class="dd-check" style="color:${col}">${icon.check(14)}</span>` : ''}</button>`;
  }).join('');
  return `<div class="dd-wrap">
    <button id="task-${catId}" class="dd" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="lbl-${catId} task-${catId}" title="↑ ↓ per cambiare senza aprire" data-action="menu-toggle" data-keydown="menu-key" data-cat="${catId}">
      ${cur ? `${mark(cur)}<span style="color:${safeColor(cur.colore)}">${esc(cur.nome)}</span>` : '<span class="muted">—</span>'}${icon.chevron(12)}
    </button>
    ${open ? `<div class="menu-backdrop" data-action="menu-close"></div><div class="dd-list" role="listbox" aria-labelledby="lbl-${catId}">${opts}</div>` : ''}
  </div>`;
}

// Checklist del task: maniglia per riordinare (trascinando o con Alt+↑ ↓), spunta, testo modificabile con un clic, x per togliere.
// La maniglia c'è da due voci in su, ed è spenta mentre una voce è in modifica.
function subtasks(t) {
  const list = t.sottotask || [];
  const done = list.filter((x) => x.fatto).length;
  const items = list.map((x, i) => {
    const text = S.ui.subEdit === i
      ? `<input id="sub-edit" class="sub-input grow" value="${esc(x.testo)}" data-change="sub-edit" data-keydown="sub-edit-key" data-index="${i}" aria-label="Testo del sotto-task">`
      : `<button class="sub-text grow${x.fatto ? ' done' : ''}" data-action="sub-edit-start" data-index="${i}" title="Modifica">${esc(x.testo)}</button>`;
    const grip = list.length > 1
      ? `<button id="sub-grip-${i}" class="sub-grip" data-index="${i}" data-keydown="sub-grip-key" aria-label="Riordina ${esc(x.testo)} (Alt+↑ ↓)" title="Trascina per riordinare"${S.ui.subEdit != null ? ' disabled' : ''}>${icon.grip(14)}</button>`
      : '';
    return `<div class="sub-item">
      ${grip}<button class="check sm${x.fatto ? ' done' : ''}" data-action="sub-toggle" data-index="${i}" aria-label="${x.fatto ? 'Riapri' : 'Completa'} ${esc(x.testo)}">${x.fatto ? icon.check(10) : ''}</button>
      ${text}
      <span class="row-2 sub-tools">
        <button class="icon-btn sm" data-action="sub-delete" data-index="${i}" aria-label="Elimina ${esc(x.testo)}">${icon.close(12)}</button>
      </span></div>`;
  }).join('');
  return `<div class="stack-10">
    <span class="section-label">SOTTO-TASK${list.length ? ` <span class="muted">${done}/${list.length}</span>` : ''}</span>
    ${list.length ? `<div class="sub-list">${items}</div>` : ''}
    <input id="sub-add" class="tag-add sub-add" placeholder="+ Aggiungi un sotto-task" data-keydown="sub-add" aria-label="Aggiungi un sotto-task">
  </div>`;
}

export function taskPanel() {
  const t = currentTask();
  if (!t) return '';
  const isNew = S.ui.openTask === 'new';
  const p = project(t.progetto);
  const done = isClosed(t);
  const due = dueLabel(t.scadenza, done);
  const confirmDel = S.ui.confirm === 'task:' + t.id;
  const un = S.ui.unsaved && S.ui.unsaved.id === S.ui.openTask ? S.ui.unsaved : {};
  // I progetti archiviati non si propongono, tranne quello a cui il task appartiene già.
  const projects = S.data.projects.filter((x) => x.stato !== 'archiviato' || x.codice === t.progetto);
  // Il progetto è obbligatorio: un task nuovo con il titolo e senza progetto non si crea.
  // L'errore c'è sempre nel task nuovo, nascosto o no, così il salvataggio del titolo lo mostra senza ridisegnare.
  const noProject = missingProject();
  const projectOpts = (p ? '' : '<option value="">Scegli un progetto…</option>') + options(projects.map((x) => [x.codice, `${x.nome} · ${x.codice}`]), t.progetto);
  const projectSelect = select(`id="task-project" data-change="task-field" data-field="progetto"${isNew ? ` aria-invalid="${noProject}" aria-describedby="task-project-err"` : ''}`, projectOpts, 'Progetto');
  return `
  <section class="panel" aria-label="Dettaglio task">
    <div class="panel-resize" aria-hidden="true"></div>
    <button class="panel-close" data-action="close-task" aria-label="Chiudi dettaglio" title="Chiudi (Esc)">${icon.chevronRight(15)}</button>
    <div class="panel-head">
      <span class="mono muted">${isNew ? 'Nuovo task' : esc(t.id)}</span>
      ${p ? `<span class="faint">/</span><button class="proj-link" data-action="go" data-view="project" data-code="${esc(p.codice)}">${projectMark(p.colore)}${esc(p.nome)}</button>` : ''}
      <span class="grow"></span>
      ${isNew || confirmDel ? '' : `<button class="icon-btn" data-action="ask-confirm" data-key="task:${esc(t.id)}" aria-label="Elimina task" title="Elimina">${icon.trash(17)}</button>`}
    </div>
    ${confirmDel ? `<div class="panel-confirm">${confirmBox(`Eliminare ${t.id}? Potrai ripristinarlo dal Cestino.`, `data-action="task-delete" data-id="${esc(t.id)}"`)}</div>` : ''}
    <div class="panel-body">
      <div class="row-14 start">
        ${isNew ? '<span class="check big ghost"></span>' : `<button class="check big${done ? ' done' : ''}" data-action="toggle-done" data-id="${esc(t.id)}" aria-label="${done ? 'Riapri' : 'Completa'}">${done ? icon.check(14) : ''}</button>`}
        <label class="grow"><span class="sr">Titolo</span>
          <textarea id="task-title" class="title-input" rows="1" data-change="task-field" data-input="task-dirty" data-field="titolo" data-keydown="title-enter" placeholder="Cosa devi fare?">${esc(un.titolo ?? t.titolo)}</textarea>
        </label>
        ${saveState('titolo', un)}
      </div>
      ${isNew ? `<div class="hint">${t.progetto ? 'Scrivi il titolo e premi Invio per creare il task.' : 'Scrivi il titolo e scegli il progetto per creare il task.'}</div>` : ''}
      <div class="props">
        <span class="prop-label">Progetto</span>
        ${isNew
          ? `<div class="stack-4 project-field${noProject ? ' invalid' : ''}">${projectSelect}<span id="task-project-err" class="field-error small"${noProject ? '' : ' hidden'}>Scegli un progetto per creare il task</span></div>`
          : projectSelect}
        <span class="prop-label" id="lbl-stato">Stato</span>${dropdown('stato', t.stato)}
        ${cat('priorita')?.tags.length ? `<span class="prop-label" id="lbl-priorita">Priorità</span>${dropdown('priorita', prioOf(t))}` : ''}
        <span class="prop-label">Scadenza</span>
        <div class="row-8">
          <label class="date-wrap">${icon.calendar(15)}<span class="sr">Scadenza</span><input type="date" value="${esc(t.scadenza || '')}" data-change="task-field" data-field="scadenza"></label>
          ${t.scadenza ? `<span class="due ${due.cls} small">${esc(due.text)}</span><button class="btn-link small" data-action="task-set" data-field="scadenza" data-value="">Togli</button>` : ''}
        </div>
        ${extraCats().map((c) => `<span class="prop-label">${esc(c.nome)}</span>${categoryField(t, c)}`).join('')}
      </div>
      <div class="hr"></div>
      ${subtasks(t)}
      ${description(t, isNew, un)}
      ${isNew ? '' : links(t)}
      ${!isNew && t.storico.length ? `<div class="stack-10"><span class="section-label">STORICO</span><div class="history">${t.storico.slice().reverse().map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
        return `<div class="row-10"><span class="mono muted small w64">${esc(m ? fmtShort(m[1]) : '')}</span><span>${esc(m ? m[2] : l)}</span></div>`;
      }).join('')}</div></div>` : ''}
    </div>
    ${isNew ? '' : `<div class="panel-foot">${icon.file(14)}<span class="mono grow">tasks/${esc(t.id)}.md</span><span>Aggiornato ${esc(fmtFull(t.aggiornato))}</span></div>`}
  </section>`;
}
