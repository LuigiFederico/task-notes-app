import { S, tagOf, project, isClosed, taskChips } from '../state.js';
import { esc, safeColor, dueLabel } from '../lib/util.js';
import { icon } from '../lib/icons.js';

export function statusPill(stateId) {
  const t = tagOf('stato', stateId);
  const c = safeColor(t ? t.colore : '#4A473F');
  const bg = c.length === 7 ? c + '1A' : 'var(--chip)';
  return `<span class="pill" style="color:${c};background:${bg}">${esc(t ? t.nome : stateId || '—')}</span>`;
}

export function prioIndicator(prioId) {
  const tags = (S.data.categories.find((c) => c.id === 'priorita') || {}).tags || [];
  const i = tags.findIndex((t) => t.id === prioId);
  if (i === -1) return '<span class="prio muted small">—</span>';
  const t = tags[i];
  const c = safeColor(t.colore);
  const lvl = Math.max(1, 3 - Math.round((i / Math.max(1, tags.length - 1)) * 2));
  const bars = [1, 2, 3].map((b) => `<span style="height:${3 + b * 3}px;background:${b <= lvl ? c : 'var(--line-strong)'}"></span>`).join('');
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
