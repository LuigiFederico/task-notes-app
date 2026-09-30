import { S, cat, tagOf, project, isClosed, taskChips } from '../state.js';
import { esc, safeColor, tint, dueLabel } from '../lib/util.js';
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

export function taskHeader(showProject = true) {
  return `<div class="task-row head${showProject ? '' : ' no-project'}"><span></span><span>ID</span><span>TITOLO</span>${showProject ? '<span class="h-proj">PROGETTO</span>' : ''}<span class="h-prio">PRIORITÀ</span><span>SCADENZA</span><span>STATO</span></div>`;
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
