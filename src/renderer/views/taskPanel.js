import { S, cat, task, project, extraCats, isClosed, values } from '../state.js';
import { esc, safeColor, dueLabel, fmtFull, fmtShort } from '../lib/util.js';
import { icon } from '../lib/icons.js';

export function currentTask() {
  if (S.ui.openTask === 'new') return S.ui.draft;
  return S.ui.openTask ? task(S.ui.openTask) : null;
}

function radioGroup(label, catId, current, allowNone) {
  const c = cat(catId);
  const opts = (c ? c.tags : []).map((t) => {
    const on = t.id === current;
    const col = safeColor(t.colore);
    const style = on ? `border-color:${col};color:${col};background:${col.length === 7 ? col + '14' : 'var(--chip)'};font-weight:600` : '';
    return `<button role="radio" aria-checked="${on}" class="radio-pill" style="${style}" data-action="task-set" data-field="${catId}" data-value="${esc(t.id)}">${esc(t.nome)}</button>`;
  });
  if (allowNone) opts.push(`<button role="radio" aria-checked="${!current}" class="radio-pill${!current ? ' on-neutral' : ''}" data-action="task-set" data-field="${catId}" data-value="">Nessuna</button>`);
  return `<div role="radiogroup" aria-label="${esc(label)}" class="row-6 wrap">${opts.join('')}</div>`;
}

function categoryField(t, c) {
  const vals = values(t, c.id);
  if (c.tipo === 'singola') {
    return `<label class="select-wrap"><span class="sr">${esc(c.nome)}</span><select data-change="task-cat-single" data-cat="${esc(c.id)}">
      <option value="">—</option>${c.tags.map((x) => `<option value="${esc(x.id)}"${vals.includes(x.id) ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}
    </select>${icon.chevron(12)}</label>`;
  }
  const chips = vals.map((id) => {
    const tg = c.tags.find((x) => x.id === id);
    return `<span class="chip removable"><span class="chip-dot" style="background:${safeColor(tg ? tg.colore : '')}"></span>${esc(tg ? tg.nome : id)}<button data-action="task-tag-remove" data-cat="${esc(c.id)}" data-tag="${esc(id)}" aria-label="Rimuovi ${esc(tg ? tg.nome : id)}">${icon.close(12)}</button></span>`;
  }).join('');
  const listId = 'dl-' + c.id;
  const unused = c.tags.filter((x) => !vals.includes(x.id));
  return `<div class="row-6 wrap">${chips}
    <input class="tag-add" list="${listId}" placeholder="+ Aggiungi" data-keydown="task-tag-add" data-cat="${esc(c.id)}" aria-label="Aggiungi ${esc(c.nome)}">
    <datalist id="${listId}">${unused.map((x) => `<option value="${esc(x.nome)}"></option>`).join('')}</datalist></div>`;
}

export function taskPanel() {
  const t = currentTask();
  if (!t) return '';
  const isNew = S.ui.openTask === 'new';
  const p = project(t.progetto);
  const done = isClosed(t);
  const due = dueLabel(t.scadenza, done);
  const confirmDel = S.ui.confirm === 'task:' + t.id;
  return `
  <section class="panel" aria-label="Dettaglio task">
    <div class="panel-head">
      <span class="mono muted">${isNew ? 'Nuovo task' : esc(t.id)}</span>
      ${p ? `<span class="faint">/</span><button class="proj-link" data-action="go" data-view="project" data-code="${esc(p.codice)}"><span class="dot sq" style="background:${safeColor(p.colore)}"></span>${esc(p.nome)}</button>` : ''}
      <span class="grow"></span>
      ${isNew ? '' : confirmDel
        ? `<button class="btn danger small" data-action="task-delete" data-id="${esc(t.id)}">Conferma eliminazione</button><button class="btn small" data-action="cancel-confirm">Annulla</button>`
        : `<button class="icon-btn" data-action="ask-confirm" data-key="task:${esc(t.id)}" aria-label="Elimina task" title="Elimina">${icon.trash(17)}</button>`}
      <button class="icon-btn" data-action="close-task" aria-label="Chiudi dettaglio" title="Chiudi (Esc)">${icon.close(18)}</button>
    </div>
    <div class="panel-body">
      <div class="row-14 start">
        ${isNew ? '<span class="check big ghost"></span>' : `<button class="check big${done ? ' done' : ''}" data-action="toggle-done" data-id="${esc(t.id)}" aria-label="${done ? 'Riapri' : 'Completa'}">${done ? icon.check(14) : ''}</button>`}
        <label class="grow"><span class="sr">Titolo</span>
          <textarea id="task-title" class="title-input" rows="1" data-change="task-field" data-field="titolo" data-keydown="title-enter" placeholder="Cosa devi fare?">${esc(isNew ? '' : t.titolo)}</textarea>
        </label>
      </div>
      ${isNew ? '<div class="hint">Scrivi il titolo e premi Invio per creare il task.</div>' : ''}
      <div class="props">
        <span class="prop-label">Progetto</span>
        <label class="select-wrap"><span class="sr">Progetto</span><select data-change="task-field" data-field="progetto">
          ${S.data.projects.filter((x) => x.stato !== 'archiviato' || x.codice === t.progetto).map((x) => `<option value="${esc(x.codice)}"${x.codice === t.progetto ? ' selected' : ''}>${esc(x.nome)} · ${esc(x.codice)}</option>`).join('')}
        </select>${icon.chevron(12)}</label>
        <span class="prop-label">Stato</span>${radioGroup('Stato', 'stato', t.stato, false)}
        <span class="prop-label">Priorità</span>${radioGroup('Priorità', 'priorita', t.priorita, true)}
        <span class="prop-label">Scadenza</span>
        <div class="row-8">
          <label class="date-wrap">${icon.calendar(15)}<span class="sr">Scadenza</span><input type="date" value="${esc(t.scadenza || '')}" data-change="task-field" data-field="scadenza"></label>
          ${t.scadenza ? `<span class="due ${due.cls} small">${esc(due.text)}</span><button class="btn-link small" data-action="task-set" data-field="scadenza" data-value="">Togli</button>` : ''}
        </div>
        ${extraCats().map((c) => `<span class="prop-label">${esc(c.nome)}</span>${categoryField(t, c)}`).join('')}
      </div>
      <div class="hr"></div>
      <label class="stack-10">
        <span class="section-label">DESCRIZIONE</span>
        <textarea class="desc-input" rows="8" data-change="task-field" data-field="descrizione" placeholder="Note, link, sotto-attività… (Markdown)">${esc(t.descrizione || '')}</textarea>
        <span class="muted small">Supporta Markdown · si salva quando esci dal campo</span>
      </label>
      ${!isNew && t.storico.length ? `<div class="stack-10"><span class="section-label">STORICO</span><div class="history">${t.storico.slice().reverse().map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
        return `<div class="row-10"><span class="mono muted small w64">${esc(m ? fmtShort(m[1]) : '')}</span><span>${esc(m ? m[2] : l)}</span></div>`;
      }).join('')}</div></div>` : ''}
    </div>
    ${isNew ? '' : `<div class="panel-foot">${icon.file(14)}<span class="mono grow">tasks/${esc(t.id)}.md</span><span>Aggiornato ${esc(fmtFull(t.aggiornato))}</span></div>`}
  </section>`;
}
