import { S, cat, project, extraCats, isClosed, prioOf } from '../state.js';
import { currentTask, missingProject } from '../selectors.js';
import { esc, safeColor, tint, dueLabel, fmtFull, fmtShort } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox, options, select, categoryField, links, description, saveState } from './components.js';

function radioGroup(label, catId, current) {
  const c = cat(catId);
  const opts = (c ? c.tags : []).map((t) => {
    const on = t.id === current;
    const col = safeColor(t.colore);
    const style = on ? `border-color:${col};color:${col};background:${tint(col, '14')};font-weight:600` : '';
    return `<button role="radio" aria-checked="${on}" class="radio-pill" style="${style}" data-action="task-set" data-field="${catId}" data-value="${esc(t.id)}">${esc(t.nome)}</button>`;
  });
  return `<div role="radiogroup" aria-label="${esc(label)}" class="row-6 wrap">${opts.join('')}</div>`;
}

// Priorità: uno slider nell'ordine dei livelli (il primo a sinistra), con i nomi sotto; anche un clic sul nome la sceglie.
function prioSlider(t) {
  const tags = cat('priorita')?.tags || [];
  const i = tags.findIndex((x) => x.id === prioOf(t));
  const col = safeColor(tags[i].colore);
  const names = tags.map((x, k) => `<button class="prio-tick${k === i ? ' on' : ''}" style="${k === i ? `color:${col}` : ''}" data-action="task-set" data-field="priorita" data-value="${esc(x.id)}" tabindex="-1">${esc(x.nome)}</button>`).join('');
  return `<div class="prio-slider" style="--n:${tags.length};--c:${col}">
    <input id="task-prio" type="range" min="0" max="${tags.length - 1}" step="1" value="${i}" data-change="task-prio" aria-label="Priorità" aria-valuetext="${esc(tags[i].nome)}">
    <div class="prio-ticks">${names}</div>
  </div>`;
}

// Checklist del task: spunta, testo modificabile con un clic, frecce per l'ordine, x per togliere.
function subtasks(t) {
  const list = t.sottotask || [];
  const done = list.filter((x) => x.fatto).length;
  const items = list.map((x, i) => {
    const text = S.ui.subEdit === i
      ? `<input id="sub-edit" class="sub-input grow" value="${esc(x.testo)}" data-change="sub-edit" data-keydown="sub-edit-key" data-index="${i}" aria-label="Testo del sotto-task">`
      : `<button class="sub-text grow${x.fatto ? ' done' : ''}" data-action="sub-edit-start" data-index="${i}" title="Modifica">${esc(x.testo)}</button>`;
    return `<div class="sub-item">
      <button class="check sm${x.fatto ? ' done' : ''}" data-action="sub-toggle" data-index="${i}" aria-label="${x.fatto ? 'Riapri' : 'Completa'} ${esc(x.testo)}">${x.fatto ? icon.check(10) : ''}</button>
      ${text}
      <span class="row-2 sub-tools">
        <button class="icon-btn sm" data-action="sub-move" data-index="${i}" data-dir="-1" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>${icon.up(14)}</button>
        <button class="icon-btn sm" data-action="sub-move" data-index="${i}" data-dir="1" aria-label="Sposta giù" ${i === list.length - 1 ? 'disabled' : ''}>${icon.down(14)}</button>
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
    <div class="panel-head">
      <span class="mono muted">${isNew ? 'Nuovo task' : esc(t.id)}</span>
      ${p ? `<span class="faint">/</span><button class="proj-link" data-action="go" data-view="project" data-code="${esc(p.codice)}"><span class="dot sq" style="background:${safeColor(p.colore)}"></span>${esc(p.nome)}</button>` : ''}
      <span class="grow"></span>
      ${isNew || confirmDel ? '' : `<button class="icon-btn" data-action="ask-confirm" data-key="task:${esc(t.id)}" aria-label="Elimina task" title="Elimina">${icon.trash(17)}</button>`}
      <button class="icon-btn" data-action="close-task" aria-label="Chiudi dettaglio" title="Chiudi (Esc)">${icon.close(18)}</button>
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
        <span class="prop-label">Stato</span>${radioGroup('Stato', 'stato', t.stato)}
        ${cat('priorita')?.tags.length ? `<span class="prop-label">Priorità</span>${prioSlider(t)}` : ''}
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
