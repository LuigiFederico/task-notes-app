import { S, cat, project, extraCats, isClosed, values } from '../state.js';
import { currentTask, linksOf } from '../selectors.js';
import { esc, safeColor, tint, dueLabel, fmtFull, fmtShort, textLink } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox, options, select, mentionItems } from './components.js';

function radioGroup(label, catId, current, allowNone) {
  const c = cat(catId);
  const opts = (c ? c.tags : []).map((t) => {
    const on = t.id === current;
    const col = safeColor(t.colore);
    const style = on ? `border-color:${col};color:${col};background:${tint(col, '14')};font-weight:600` : '';
    return `<button role="radio" aria-checked="${on}" class="radio-pill" style="${style}" data-action="task-set" data-field="${catId}" data-value="${esc(t.id)}">${esc(t.nome)}</button>`;
  });
  if (allowNone) opts.push(`<button role="radio" aria-checked="${!current}" class="radio-pill${!current ? ' on-neutral' : ''}" data-action="task-set" data-field="${catId}" data-value="">Nessuna</button>`);
  return `<div role="radiogroup" aria-label="${esc(label)}" class="row-6 wrap">${opts.join('')}</div>`;
}

// Categoria a testo libero: un chip per valore (un link se la categoria ha un modello o se il valore è un URL).
function textField(t, c) {
  const chips = values(t, c.id).map((v) => {
    const url = textLink(c.url, v);
    const label = url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer" title="${esc(url)}">${esc(v)}</a>` : esc(v);
    return `<span class="chip removable text-value">${label}<button data-action="task-text-remove" data-cat="${esc(c.id)}" data-value="${esc(v)}" aria-label="Rimuovi ${esc(v)}">${icon.close(12)}</button></span>`;
  }).join('');
  return `<div class="row-6 wrap">${chips}
    <input class="tag-add" placeholder="+ Aggiungi" data-keydown="task-text-add" data-cat="${esc(c.id)}" aria-label="Aggiungi ${esc(c.nome)}"></div>`;
}

function categoryField(t, c) {
  if (c.tipo === 'testo') return textField(t, c);
  const vals = values(t, c.id);
  if (c.tipo === 'singola') {
    const opts = '<option value="">—</option>' + options(c.tags.map((x) => [x.id, x.nome]), vals);
    return select(`data-change="task-cat-single" data-cat="${esc(c.id)}"`, opts, c.nome);
  }
  const chips = vals.map((id) => {
    const tg = c.tags.find((x) => x.id === id);
    return `<span class="chip removable"><span class="chip-dot" style="background:${safeColor(tg ? tg.colore : '')}"></span>${esc(tg ? tg.nome : id)}<button data-action="task-tag-remove" data-cat="${esc(c.id)}" data-tag="${esc(id)}" aria-label="Rimuovi ${esc(tg ? tg.nome : id)}">${icon.close(12)}</button></span>`;
  }).join('');
  const listId = 'dl-' + c.id;
  const unused = c.tags.filter((x) => !vals.includes(x.id));
  const pending = S.ui.pendingTag && S.ui.pendingTag.cat === c.id ? S.ui.pendingTag : null;
  return `<div class="row-6 wrap">${chips}
    <input id="tag-add-${esc(c.id)}" class="tag-add" list="${listId}" placeholder="+ Aggiungi" value="${pending ? esc(pending.nome) : ''}" data-input="task-tag-input" data-keydown="task-tag-add" data-cat="${esc(c.id)}" aria-label="Aggiungi ${esc(c.nome)}" aria-describedby="tag-hint-${esc(c.id)}">
    <datalist id="${listId}">${unused.map((x) => `<option value="${esc(x.nome)}"></option>`).join('')}</datalist>
    <span id="tag-hint-${esc(c.id)}" class="tag-hint small" aria-live="polite"${pending ? '' : ' hidden'}>${pending ? esc(newTagHint(pending.nome)) : ''}</span></div>`;
}

export function newTagHint(nome) { return `Nuovo tag «${nome}»: premi di nuovo Invio per crearlo`; }

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
        <button class="icon-btn sm" data-action="sub-move" data-index="${i}" data-dir="-1" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn sm" data-action="sub-move" data-index="${i}" data-dir="1" aria-label="Sposta giù" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn sm" data-action="sub-delete" data-index="${i}" aria-label="Elimina ${esc(x.testo)}">${icon.close(12)}</button>
      </span></div>`;
  }).join('');
  return `<div class="stack-10">
    <span class="section-label">SOTTO-TASK${list.length ? ` <span class="muted">${done}/${list.length}</span>` : ''}</span>
    ${list.length ? `<div class="sub-list">${items}</div>` : ''}
    <input id="sub-add" class="tag-add sub-add" placeholder="+ Aggiungi un sotto-task" data-keydown="sub-add" aria-label="Aggiungi un sotto-task">
  </div>`;
}

// Collegamenti del task: quelli scritti nel suo file e, con il nome inverso, quelli degli altri task che puntano a lui.
// Si aggiungono scegliendo il tipo e cercando il task con @ (ID o titolo).
function links(t) {
  const types = cat('collegamento')?.tags || [];
  const rows = linksOf(t).map((l) => {
    const target = l.target
      ? `<button class="link-ref" data-action="open-task" data-id="${esc(l.id)}"><span class="mono muted">${esc(l.id)}</span><span class="ellipsis">${esc(l.target.titolo)}</span></button>`
      : `<span class="link-ref missing" title="Non trovato: forse è nel Cestino"><span class="mono">${esc(l.id)}</span><span>non trovato</span></span>`;
    return `<div class="link-row${l.target && isClosed(l.target) ? ' closed' : ''}">
      <span class="link-type" style="color:${safeColor(l.colore)}">${esc(l.nome)}</span>${target}
      <button class="icon-btn sm" data-action="link-remove" data-from="${esc(l.from)}" data-tipo="${esc(l.tipo)}" data-to="${esc(l.to)}" aria-label="Togli il collegamento con ${esc(l.id)}">${icon.close(12)}</button>
    </div>`;
  }).join('');
  const m = S.ui.mention && S.ui.mention.field === 'link' ? S.ui.mention : null;
  const typeId = S.ui.linkType && types.some((x) => x.id === S.ui.linkType) ? S.ui.linkType : (types[0] || {}).id || '';
  return `<div class="stack-10">
    <span class="section-label">COLLEGAMENTI</span>
    ${rows ? `<div class="link-list">${rows}</div>` : ''}
    <div class="link-add">
      ${select('data-change="link-type"', options(types.map((x) => [x.id, x.nome]), typeId), 'Tipo di collegamento')}
      <div class="mention-wrap grow">
        <input id="link-input" class="tag-add" placeholder="@ cerca un task per ID o titolo" autocomplete="off" data-input="link-search" data-keydown="link-key"
          role="combobox" aria-expanded="${!!m}" aria-controls="mention-link" aria-label="Task da collegare" value="${m ? esc(m.query) : ''}">
        <div id="mention-link" class="mention-list" role="listbox"${m ? '' : ' hidden'}>${m ? mentionItems(m.items, m.active) : ''}</div>
      </div>
    </div>
  </div>`;
}

// "Non salvato" mentre si scrive, "Salvato" dopo il salvataggio. Il testo è aggiornato anche da app.js senza render.
function saveState(field, un) {
  const dirty = field in un;
  return `<span id="save-${field}" class="save-state small${dirty ? ' dirty' : ''}" aria-live="polite">${dirty ? 'Non salvato' : S.ui.saved[field] ? 'Salvato' : ''}</span>`;
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
  return `
  <section class="panel" aria-label="Dettaglio task">
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
          <textarea id="task-title" class="title-input" rows="1" data-change="task-field" data-input="task-dirty" data-field="titolo" data-keydown="title-enter" placeholder="Cosa devi fare?">${esc(un.titolo ?? (isNew ? '' : t.titolo))}</textarea>
        </label>
        ${saveState('titolo', un)}
      </div>
      ${isNew ? '<div class="hint">Scrivi il titolo e premi Invio per creare il task.</div>' : ''}
      <div class="props">
        <span class="prop-label">Progetto</span>
        ${select('data-change="task-field" data-field="progetto"', options(projects.map((x) => [x.codice, `${x.nome} · ${x.codice}`]), t.progetto), 'Progetto')}
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
      ${subtasks(t)}
      ${isNew ? '' : links(t)}
      <label class="stack-10">
        <span class="section-label">DESCRIZIONE</span>
        <textarea id="task-desc" class="desc-input" rows="8" data-change="task-field" data-input="task-dirty" data-field="descrizione" placeholder="Note, link, sotto-attività… (Markdown)">${esc(un.descrizione ?? (t.descrizione || ''))}</textarea>
        <span class="row-between small"><span class="muted">Supporta Markdown</span>${saveState('descrizione', un)}</span>
      </label>
      ${!isNew && t.storico.length ? `<div class="stack-10"><span class="section-label">STORICO</span><div class="history">${t.storico.slice().reverse().map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
        return `<div class="row-10"><span class="mono muted small w64">${esc(m ? fmtShort(m[1]) : '')}</span><span>${esc(m ? m[2] : l)}</span></div>`;
      }).join('')}</div></div>` : ''}
    </div>
    ${isNew ? '' : `<div class="panel-foot">${icon.file(14)}<span class="mono grow">tasks/${esc(t.id)}.md</span><span>Aggiornato ${esc(fmtFull(t.aggiornato))}</span></div>`}
  </section>`;
}
