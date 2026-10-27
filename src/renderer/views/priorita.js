// Pagina Priorità progetti: i progetti attivi come schede da trascinare. L'ordine scelto qui è "ordine" nei file
// dei progetti, quindi vale anche per la sidebar, la pagina Progetti e i task raggruppati per progetto.
import { activeProjects, openTasks, projectTasks } from '../state.js';
import { esc, safeColor, tint, todayISO } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { projectMark, emptyState } from './components.js';

export function priorityView() {
  const t0 = todayISO();
  const list = activeProjects();
  const movable = list.length > 1;
  const cards = list.map((p, i) => {
    const c = safeColor(p.colore);
    const tasks = openTasks(projectTasks(p.codice));
    const open = tasks.length;
    const late = tasks.filter((t) => t.scadenza && t.scadenza < t0).length;
    return `
      <div class="card prio-card${movable ? ' movable' : ''}"${movable ? ' title="Trascina per riordinare"' : ''}>
        ${movable ? `<span class="prio-grip">${icon.grip(16)}</span>` : ''}<span class="prio-rank">${i + 1}</span>
        ${projectMark(p.colore, 16)}<span class="strong ellipsis">${esc(p.nome)}</span>
        <span class="code-badge" style="color:${c};background:${tint(c, '1A')}">${esc(p.codice)}</span>
        ${i === 0 ? '<span class="pill prio-focus">Focus</span>' : ''}
        <span class="grow"></span>
        <span class="muted small">${open} ${open === 1 ? 'aperto' : 'aperti'}</span>
        ${late ? `<span class="late small row-6">${icon.clock(14)} ${late} in ritardo</span>` : ''}
      </div>`;
  }).join('');
  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6"><h1 class="display">Priorità progetti</h1>
        <div class="muted">Trascina le schede per riordinare i progetti: il primo è il focus. Lo stesso ordine vale per la barra a sinistra, la pagina Progetti e i task raggruppati per progetto.</div></div>
    </header>
    <div class="scroll">
      ${list.length ? `<div class="prio-list">${cards}</div>`
        : emptyState('Nessun progetto attivo.', ` <button class="btn-link" data-action="new-project">Crea un progetto</button>`)}
    </div>
  </div>`;
}
