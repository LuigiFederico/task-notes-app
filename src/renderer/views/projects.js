import { S, projectTasks, openTasks } from '../state.js';
import { WEEKS, weekStarts, weeklyDone, isHot } from '../selectors.js';
import { esc, safeColor, tint, todayISO, fmtShort, daysBetween, monthName } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { segmented, kpiTile } from './components.js';

export function projectsView() {
  const t0 = todayISO();
  const filter = S.ui.projFilter;
  const list = S.data.projects.filter((p) => filter === 'tutti' || (filter === 'archiviato' ? p.stato === 'archiviato' : p.stato !== 'archiviato'));
  const codes = new Set(list.map((p) => p.codice));
  const tasks = S.data.tasks.filter((t) => codes.has(t.progetto));
  const open = openTasks(tasks);
  const late = open.filter((t) => t.scadenza && t.scadenza < t0);
  const starts = weekStarts();
  const perProject = list.map((p) => ({ p, weekly: weeklyDone(projectTasks(p.codice), starts) }));
  const totals = starts.map((_, i) => perProject.reduce((a, x) => a + x.weekly[i], 0));
  const lastWeek = totals[WEEKS - 2];
  const avg = totals.slice(0, WEEKS - 1).reduce((a, b) => a + b, 0) / (WEEKS - 1);
  const waiting = open.filter((t) => t.stato === 'in-attesa');
  const oldestWait = waiting.reduce((m, t) => Math.max(m, daysBetween(t.aggiornato || t.creato || t0, t0)), 0);
  const month = t0.slice(0, 7);
  const decMonth = list.flatMap((p) => p.decisioni.filter((d) => String(d.data).startsWith(month)).map(() => p.codice));

  // Grafico: completati per settimana, barre impilate per progetto.
  const max = Math.max(4, ...totals);
  const step = max <= 6 ? 2 : Math.ceil(max / 3);
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = top; v >= 0; v -= step) ticks.push(v);
  const H = 180;
  const hover = S.ui.hoverWeek == null ? WEEKS - 2 : S.ui.hoverWeek;
  const cols = starts.map((ws, i) => {
    const parts = perProject.filter((x) => x.weekly[i] > 0);
    const segs = parts.map((x, j) => `<span class="seg" style="height:${Math.max(2, (x.weekly[i] / top) * H - 2)}px;background:${safeColor(x.p.colore)};${j === parts.length - 1 ? 'border-radius:4px 4px 0 0' : ''}"></span>`).join('');
    return `<div class="col${i === hover ? ' hot' : ''}" data-hover="week" data-index="${i}" title="${esc(i === WEEKS - 1 ? 'Questa settimana' : 'Settimana del ' + fmtShort(ws))}">${segs}</div>`;
  }).join('');
  const labels = starts.map((ws, i) => `<span class="${i === hover ? 'strong' : ''}">${i === WEEKS - 1 ? 'Questa' : esc(fmtShort(ws))}</span>`).join('');
  const readout = `${hover === WEEKS - 1 ? 'Questa settimana' : 'Settimana del ' + fmtShort(starts[hover])}: ${totals[hover]} completati` +
    (perProject.length ? ' · ' + perProject.map((x) => `${x.p.codice} ${x.weekly[hover]}`).join(' · ') : '');
  const gridLines = ticks.map((v) => `<div class="gridline${v === 0 ? ' base' : ''}" style="top:${H - (v / top) * H}px"></div>`).join('');

  const maxOpen = Math.max(1, ...list.map((p) => openTasks(projectTasks(p.codice)).length));
  const load = list.map((p) => {
    const o = openTasks(projectTasks(p.codice));
    const hot = o.filter(isHot).length;
    const l = o.filter((t) => t.scadenza && t.scadenza < t0).length;
    const note = [l ? `${l} in ritardo` : '', hot - l ? `${hot - l} in scadenza a breve` : '', o.filter((t) => t.stato === 'in-attesa').length ? `${o.filter((t) => t.stato === 'in-attesa').length} in attesa` : ''].filter(Boolean).join(' · ') || 'Nessuna urgenza';
    const c = safeColor(p.colore);
    return `<button class="load-row" data-action="go" data-view="project" data-code="${esc(p.codice)}">
      <span class="row-between small"><span>${esc(p.nome)}</span><strong>${o.length}</strong></span>
      <span class="load-bar"><span style="width:${(hot / maxOpen) * 100}%;background:${c}"></span><span style="width:${((o.length - hot) / maxOpen) * 100}%;background:${c};opacity:.45"></span></span>
      <span class="muted small">${esc(note)}</span></button>`;
  }).join('');

  const cards = perProject.map(({ p, weekly }) => {
    const pt = projectTasks(p.codice);
    const o = openTasks(pt);
    const d = pt.length - o.length;
    const pct = pt.length ? Math.round((d / pt.length) * 100) : 0;
    const next = o.filter((t) => t.scadenza).sort((a, b) => a.scadenza.localeCompare(b.scadenza))[0];
    const lateNext = next && next.scadenza < t0;
    const c = safeColor(p.colore);
    const maxW = Math.max(1, ...weekly);
    const spark = weekly.map((v) => `<span style="height:${v ? 4 + (v / maxW) * 18 : 2}px;background:${v ? c : 'var(--line)'}"></span>`).join('');
    return `<button class="proj-card card" data-action="go" data-view="project" data-code="${esc(p.codice)}">
      <span class="row-10"><span class="code-badge" style="color:${c};background:${tint(c, '1A')}">${esc(p.codice)}</span>
        ${p.stato === 'archiviato' ? '<span class="pill">Archiviato</span>' : ''}<span class="grow"></span><span class="spark" aria-hidden="true">${spark}</span></span>
      <span class="stack-4"><span class="card-title">${esc(p.nome)}</span><span class="muted small clamp2">${esc((p.descrizione || '').split('\n')[0] || 'Nessuna descrizione')}</span></span>
      <span class="stack-6"><span class="row-between small"><span>${d} di ${pt.length} completati</span><strong>${pct}%</strong></span>
        <span class="progress"><span style="width:${pct}%;background:${c}"></span></span></span>
      <span class="mini-grid small">
        <span><span class="muted">Aperti</span><strong>${o.length}</strong></span>
        <span><span class="muted">Prossima scadenza</span><strong class="${lateNext ? 'late' : ''}">${next ? esc(fmtShort(next.scadenza)) + (lateNext ? ' · in ritardo' : '') : '—'}</strong></span>
        <span><span class="muted">In attesa</span><strong>${o.filter((t) => t.stato === 'in-attesa').length}</strong></span>
        <span><span class="muted">Ultima decisione</span><strong>${p.decisioni[0] ? esc(fmtShort(p.decisioni[0].data)) : '—'}</strong></span>
      </span>
    </button>`;
  }).join('');

  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6"><h1 class="display">Progetti</h1><div class="muted">${list.length} ${filter === 'archiviato' ? 'archiviati' : filter === 'tutti' ? 'in totale' : 'attivi'} · ultime ${WEEKS} settimane</div></div>
      <div class="row-10">
        ${segmented([['attivo', 'Attivi'], ['archiviato', 'Archiviati'], ['tutti', 'Tutti']], filter, 'proj-filter', 'Mostra progetti')}
        <button class="btn primary" data-action="new-project">${icon.plus(16)}Nuovo progetto</button>
      </div>
    </header>
    <div class="scroll stack-20">
      <div class="grid-4">
        ${kpiTile('Task aperti', open.length, late.length ? `${icon.clock(14)} ${late.length} in ritardo` : 'Nessuno in ritardo', late.length ? 'late row-6' : 'muted')}
        ${kpiTile('Completati la settimana scorsa', lastWeek, `Media ${WEEKS - 1} settimane: ${avg.toFixed(1).replace('.', ',')}`, 'muted')}
        ${kpiTile('In attesa di altri', waiting.length, waiting.length ? `Il più vecchio da ${oldestWait} giorni` : '—', 'muted')}
        ${kpiTile(`Decisioni a ${monthName(t0)}`, decMonth.length, decMonth.length ? `In ${new Set(decMonth).size} progetti` : 'Nessuna ancora', 'muted')}
      </div>
      ${list.length ? `
      <div class="grid-chart">
        <section class="card pad chart" aria-label="Task completati per settimana">
          <div class="row-between start">
            <div class="stack-4"><h2 class="h2">Task completati per settimana</h2><span class="small">${esc(readout)}</span></div>
            <div class="legend">${perProject.map((x) => `<span><span class="dot sq" style="background:${safeColor(x.p.colore)}"></span>${esc(x.p.codice)}</span>`).join('')}</div>
          </div>
          <div class="chart-body">
            <div class="y-axis" style="height:${H}px">${ticks.map((v) => `<span>${v}</span>`).join('')}</div>
            <div class="grow stack-8">
              <div class="plot" style="height:${H}px">${gridLines}<div class="cols">${cols}</div></div>
              <div class="x-axis">${labels}</div>
            </div>
          </div>
        </section>
        <section class="card pad stack-16" aria-label="Task aperti per progetto">
          <div class="stack-4"><h2 class="h2">Task aperti per progetto</h2><span class="small">Pieno = in ritardo o in scadenza entro 2 giorni</span></div>
          <div class="stack-16">${load}</div>
        </section>
      </div>
      <div class="grid-cards">${cards}</div>` : '<div class="empty">Nessun progetto qui. Creane uno con “Nuovo progetto”.</div>'}
    </div>
  </div>`;
}
