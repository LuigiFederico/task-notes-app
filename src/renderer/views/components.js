import { S, cat, tagOf, project, isClosed, taskChips, values, ref } from '../state.js';
import { linksOf } from '../selectors.js';
import { esc, safeColor, tint, dueLabel, textLink, md, fmtShort } from '../lib/util.js';
import { icon } from '../lib/icons.js';

export function statusPill(stateId) {
  const t = tagOf('stato', stateId);
  const c = safeColor(t ? t.colore : '#4A473F');
  return `<span class="pill" style="color:${c};background:${tint(c, '1A')}">${esc(t ? t.nome : stateId || '—')}</span>`;
}

export function prioIndicator(prioId) {
  const tags = cat('priorita')?.tags || [];
  const i = tags.findIndex((t) => t.id === prioId);
  if (i === -1) return '<span class="prio muted small">—</span>';
  const t = tags[i];
  const c = safeColor(t.colore);
  // Da 3 a 5 barre secondo quanti livelli ci sono; il primo livello le accende tutte, l'ultimo una sola.
  const n = Math.min(5, Math.max(3, tags.length));
  const lvl = n - Math.round((i / Math.max(1, tags.length - 1)) * (n - 1));
  const bars = Array.from({ length: n }, (_, k) => k + 1).map((b) => `<span style="height:${3 + b * 3}px;background:${b <= lvl ? c : 'var(--line-strong)'}"></span>`).join('');
  return `<span class="prio"><span class="bars" aria-hidden="true">${bars}</span><span style="color:${c}">${esc(t.nome)}</span></span>`;
}

export function chip(c) {
  return `<button class="chip" data-action="go" data-view="tag" data-cat="${esc(c.catId)}" data-tag="${esc(c.id)}"><span class="chip-dot" style="background:${safeColor(c.colore)}"></span>${esc(c.nome)}</button>`;
}

export function projectLabel(code) {
  const p = project(code);
  return `<button class="proj-link" data-action="go" data-view="project" data-code="${esc(code)}">
    <span class="dot sq" style="background:${safeColor(p ? p.colore : '#6B675E')}"></span><span class="ellipsis">${esc(p ? p.nome : code || 'Senza progetto')}</span></button>`;
}

export function checkbox(t) {
  const done = isClosed(t);
  return `<button class="check${done ? ' done' : ''}" data-action="toggle-done" data-id="${esc(t.id)}" aria-label="${done ? 'Riapri' : 'Completa'} ${esc(t.id)}">${done ? icon.check(12) : ''}</button>`;
}

// Avanzamento della checklist, es. 2/5, accanto al titolo.
export function subProgress(t) {
  const list = t.sottotask || [];
  if (!list.length) return '';
  const done = list.filter((x) => x.fatto).length;
  return `<span class="sub-progress${done === list.length ? ' all' : ''}" title="Sotto-task completati">${icon.check(10)}${done}/${list.length}</span>`;
}

// Riga task completa (lista principale).
export function taskRow(t, { showProject = true } = {}) {
  const done = isClosed(t);
  const due = dueLabel(t.scadenza, done);
  const sel = S.ui.openTask === t.id ? ' selected' : '';
  return `<div class="task-row${sel}${done ? ' is-done' : ''}${showProject ? '' : ' no-project'}">
    ${checkbox(t)}
    <span class="mono muted small">${esc(t.id)}</span>
    <span class="title-cell">
      <button class="task-title" data-action="open-task" data-id="${esc(t.id)}">${esc(t.titolo)}</button>
      ${subProgress(t)}
      ${taskChips(t).map(chip).join('')}
    </span>
    ${showProject ? projectLabel(t.progetto) : ''}
    ${prioIndicator(t.priorita)}
    <span class="due ${due.cls}">${esc(due.text)}</span>
    ${statusPill(t.stato)}
  </div>`;
}

// Riga di un appunto: ID, titolo con i tag, progetto e data dell'ultima modifica.
export function noteRow(n, { showProject = true } = {}) {
  const sel = S.ui.openNote === n.id ? ' selected' : '';
  return `<div class="note-row${sel}${showProject ? '' : ' no-project'}">
    <span class="mono muted small">${esc(n.id)}</span>
    <span class="title-cell">
      <button class="task-title" data-action="open-note" data-id="${esc(n.id)}">${esc(n.titolo)}</button>
      ${taskChips(n).map(chip).join('')}
    </span>
    ${showProject ? `<span class="note-proj">${n.progetto ? projectLabel(n.progetto) : '<span class="muted small">—</span>'}</span>` : ''}
    <span class="muted small">${esc(fmtShort(n.aggiornato))}</span>
  </div>`;
}

export function noteHeader({ showProject = true } = {}) {
  return `<div class="note-row head${showProject ? '' : ' no-project'}"><span>ID</span><span>TITOLO</span>${showProject ? '<span class="note-proj">PROGETTO</span>' : ''}<span>MODIFICATO</span></div>`;
}

export function taskHeader(showProject = true) {
  return `<div class="task-row head${showProject ? '' : ' no-project'}"><span></span><span>ID</span><span>TITOLO</span>${showProject ? '<span class="h-proj">PROGETTO</span>' : ''}<span class="h-prio">PRIORITÀ</span><span>SCADENZA</span><span>STATO</span></div>`;
}

// Suggerimenti di @ (collegamenti e menzioni): items da refCandidates, active è quello evidenziato dalle frecce.
// Le voci non prendono il focus (vedi il mousedown in app.js), così il campo resta attivo mentre si sceglie.
export function mentionItems(items, active) {
  if (!items.length) return '<div class="mention-empty small muted">Nessun risultato</div>';
  return items.map((x, i) => `<button type="button" role="option" aria-selected="${i === active}" class="mention-item${i === active ? ' on' : ''}${x.chiuso ? ' closed' : ''}" data-action="mention-pick" data-id="${esc(x.id)}">
    <span class="mono muted small">${esc(x.id)}</span><span class="ellipsis">${esc(x.titolo)}</span></button>`).join('');
}

// Conferma di un'azione distruttiva: una frase con l'effetto, il pulsante dell'azione e Annulla.
export function confirmBox(text, attrs, label = 'Elimina') {
  return `<div class="confirm" role="alert"><span class="grow">${esc(text)}</span><button type="button" class="btn danger small" ${attrs}>${esc(label)}</button><button type="button" class="btn small" data-action="cancel-confirm">Annulla</button></div>`;
}

export function emptyState(text, action = '') {
  return `<div class="empty">${esc(text)}${action}</div>`;
}

export function segmented(options, current, action, label) {
  return `<div class="segmented" role="group" aria-label="${esc(label)}">${options.map(([v, l, extra]) =>
    `<button data-action="${action}" data-value="${esc(v)}" aria-pressed="${v === current}" class="${v === current ? 'on' : ''}">${esc(l)}${extra != null ? ` <span class="muted">${esc(extra)}</span>` : ''}</button>`).join('')}</div>`;
}

export function kpiTile(label, value, sub, subCls = '') {
  return `<div class="kpi card"><span class="muted small">${esc(label)}</span><span class="kpi-value">${esc(value)}</span><span class="small ${subCls}">${sub}</span></div>`;
}

// Scelta di un colore della palette. small: pallini piccoli che vanno a capo; attrs: attributi in più per ogni pallino;
// custom: nome del data-change di un ultimo pallino che apre il selettore di sistema, per un colore fuori palette.
export function colorPicker(colors, current, action, { small = false, attrs = '', custom = '' } = {}) {
  const swatch = (c) => `<button type="button" role="radio" aria-checked="${c === current}" class="swatch${small ? ' sm' : ''}${c === current ? ' on' : ''}" style="background:${c}" data-action="${action}" data-value="${c}" ${attrs ? attrs + ' ' : ''}aria-label="Colore ${c}"></button>`;
  let other = '';
  if (custom) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(String(current || '')) ? current.toLowerCase() : '';
    const own = hex && !colors.includes(current);
    other = `<label class="swatch custom${small ? ' sm' : ''}${own ? ' on' : ''}" style="${own ? `background:${hex}` : ''}" title="Altro colore">
      <input type="color" value="${hex || '#2f5bd3'}" data-change="${custom}" aria-label="Altro colore"></label>`;
  }
  return `<div class="${small ? 'row-6 wrap' : 'row-8'}" role="radiogroup" aria-label="Colore">${colors.map(swatch).join('')}${other}</div>`;
}

// Opzioni di una <select> da coppie [valore, etichetta]. current può essere un valore o una lista di valori.
export function options(list, current) {
  const on = (v) => (Array.isArray(current) ? current.includes(v) : v === current);
  return list.map(([v, l]) => `<option value="${esc(v)}"${on(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

// <select> nel contenitore con la freccia. Con label, il contenitore è una <label> con il nome per i lettori di schermo.
export function select(attrs, opts, label = '') {
  const tag = label ? 'label' : 'span';
  return `<${tag} class="select-wrap">${label ? `<span class="sr">${esc(label)}</span>` : ''}<select ${attrs}>${opts}</select>${icon.chevron(12)}</${tag}>`;
}

// ---------------------------------------------------------------- campi del pannello (task e appunti)
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

export function categoryField(t, c) {
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

// Collegamenti di un task o appunto: quelli scritti nel suo file e, con il nome inverso, quelli degli altri che puntano a lui.
// Si aggiungono scegliendo il tipo e cercando con @ (ID o titolo).
export function links(t) {
  const types = cat('collegamento')?.tags || [];
  const rows = linksOf(t).map((l) => {
    const target = l.target
      ? `<button class="link-ref" data-action="open-ref" data-id="${esc(l.id)}"><span class="mono muted">${esc(l.id)}</span><span class="ellipsis">${esc(l.target.titolo)}</span></button>`
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
        <input id="link-input" class="tag-add" placeholder="@ cerca un task o un appunto per ID o titolo" autocomplete="off" data-input="link-search" data-keydown="link-key"
          role="combobox" aria-expanded="${!!m}" aria-controls="mention-link" aria-label="Elemento da collegare" value="${m ? esc(m.query) : ''}">
        <div id="mention-link" class="mention-list" role="listbox"${m ? '' : ' hidden'}>${m ? mentionItems(m.items, m.active) : ''}</div>
      </div>
    </div>
  </div>`;
}

// Testo in Markdown (descrizione del task, corpo dell'appunto): in lettura con link e menzioni cliccabili; «Modifica» apre
// il campo, dove @ suggerisce task e appunti. Resta in modifica per un elemento nuovo e finché c'è testo non salvato.
export function description(t, isNew, un, label = 'DESCRIZIONE') {
  const editing = isNew || S.ui.descEdit || 'descrizione' in un;
  const head = (btn) => `<div class="row-between"><span class="section-label">${label}</span>${btn}</div>`;
  if (!editing) {
    const refTitle = (id) => { const x = ref(id); return x ? x.titolo : null; };
    return `<div class="stack-10">
      ${head('<button class="btn-link small" data-action="desc-edit">Modifica</button>')}
      ${(t.descrizione || '').trim() ? `<div class="md desc-view">${md(t.descrizione, { refTitle })}</div>`
        : '<button class="desc-empty" data-action="desc-edit">Aggiungi note, link, @menzioni… (Markdown)</button>'}
      ${S.ui.saved.descrizione ? `<span class="small save-state">Salvato</span>` : ''}
    </div>`;
  }
  const m = S.ui.mention && S.ui.mention.field === 'desc' ? S.ui.mention : null;
  return `<div class="stack-10">
    ${head(isNew ? '' : '<button class="btn-link small" data-action="desc-done">Fine</button>')}
    <div class="mention-wrap">
      <textarea id="task-desc" class="desc-input" rows="8" data-change="task-field" data-input="task-dirty" data-keydown="desc-key" data-field="descrizione"
        aria-label="${label === 'DESCRIZIONE' ? 'Descrizione' : 'Testo'}" aria-controls="mention-desc" placeholder="Note, link, @ per citare un task o un appunto… (Markdown)">${esc(un.descrizione ?? (t.descrizione || ''))}</textarea>
      <div id="mention-desc" class="mention-list up" role="listbox"${m ? '' : ' hidden'}>${m ? mentionItems(m.items, m.active) : ''}</div>
    </div>
    <span class="row-between small"><span class="muted">Markdown · @ per citare · Esc per chiudere</span>${saveState('descrizione', un)}</span>
  </div>`;
}

// "Non salvato" mentre si scrive, "Salvato" dopo il salvataggio. Il testo è aggiornato anche da app.js senza render.
export function saveState(field, un) {
  const dirty = field in un;
  return `<span id="save-${field}" class="save-state small${dirty ? ' dirty' : ''}" aria-live="polite">${dirty ? 'Non salvato' : S.ui.saved[field] ? 'Salvato' : ''}</span>`;
}
