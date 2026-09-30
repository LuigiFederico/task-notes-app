import { S, cat } from '../state.js';
import { graphData, NO_PROJECT, MENTION_TYPE, UNTYPED } from '../selectors.js';
import { layoutGraph, labelSize } from '../lib/graph.js';
import { esc, safeColor } from '../lib/util.js';
import { segmented, emptyState } from './components.js';

const RADIUS = 340;
const MAX_LABEL = 22;   // oltre, l'etichetta uscirebbe dal disegno; il titolo intero è nel tooltip

// Interruttore di un filtro: acceso = visibile. list è la chiave di S.ui.graph con gli elementi nascosti.
function toggle(list, value, label, color) {
  const on = !S.ui.graph[list].includes(value);
  return `<button class="graph-chip${on ? ' on' : ''}" aria-pressed="${on}" data-action="graph-toggle" data-list="${list}" data-value="${esc(value)}">
    ${color ? `<span class="chip-dot" style="background:${safeColor(color)}"></span>` : ''}${esc(label)}</button>`;
}

function filters() {
  const g = S.ui.graph;
  const projects = [...S.data.projects.map((p) => [p.codice, p.nome, p.colore]), [NO_PROJECT, 'Senza progetto', '#B8B4A9']];
  const states = (cat('stato')?.tags || []).map((t) => [t.id, t.nome, t.colore]);
  const types = [...(cat('collegamento')?.tags || []).map((t) => [t.id, t.nome, t.colore]), [UNTYPED, 'Senza tipo', '#B8B4A9'], [MENTION_TYPE, 'Menzioni @', '#A8A396']];
  const row = (label, items) => `<div class="graph-filter"><span class="muted small">${label}</span><div class="row-6 wrap">${items}</div></div>`;
  return `<div class="graph-filters">
    <div class="row-16 wrap">
      ${segmented([['tutti', 'Task e appunti'], ['task', 'Solo task'], ['appunti', 'Solo appunti']], g.kind, 'graph-kind', 'Cosa mostrare')}
      <div class="row-8"><span class="muted small">Colore degli archi</span>${segmented([['progetto', 'Progetto'], ['tipo', 'Tipo di collegamento']], g.edgeColor, 'graph-color', 'Colore degli archi')}</div>
    </div>
    ${row('Progetti', projects.map(([v, l, c]) => toggle('hideProjects', v, l, c)).join(''))}
    ${g.kind === 'appunti' ? '' : row('Stati dei task', states.map(([v, l, c]) => toggle('hideStates', v, l, c)).join(''))}
    ${row('Collegamenti', types.map(([v, l, c]) => toggle('hideTypes', v, l, c)).join(''))}
  </div>`;
}

export function graphView() {
  const { groups, edges } = graphData();
  const g = layoutGraph(groups, edges, { radius: RADIUS });
  const font = labelSize(g.nodes.length, RADIUS);
  const svg = g.nodes.length ? `
    <svg class="graph" viewBox="0 0 ${g.size} ${g.size}" role="img" aria-label="Grafo dei collegamenti: ${g.nodes.length} elementi, ${g.edges.length} collegamenti">
      <g class="graph-edges">${g.edges.map((e) => `<path d="${e.d}" stroke="${safeColor(e.color)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${e.type === MENTION_TYPE ? ' stroke-dasharray="4 4"' : ''}/>`).join('')}</g>
      <g class="graph-nodes">${g.nodes.map((n) => {
        const text = n.label.length > MAX_LABEL ? n.label.slice(0, MAX_LABEL - 1) + '…' : n.label;
        return `<g class="gnode${n.closed ? ' closed' : ''}${n.kind === 'appunto' ? ' note' : ''}" data-action="open-ref" data-keydown="gnode-key" data-hover="gnode" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.id)} ${esc(n.label)}">
          <title>${esc(n.id)} · ${esc(n.label)}</title>
          <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${safeColor(n.color)}"${n.kind === 'appunto' ? ` style="stroke:${safeColor(n.color)}"` : ''}/>
          <text x="${n.labelX}" y="${n.labelY}" transform="rotate(${n.labelRotate} ${n.labelX} ${n.labelY})" text-anchor="${n.labelAnchor}" dominant-baseline="middle" fill="${safeColor(n.color)}" font-size="${font}">${esc(text)}</text>
        </g>`;
      }).join('')}</g>
    </svg>` : emptyState('Nessun elemento da mostrare con i filtri scelti.');
  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6"><h1 class="display">Grafo</h1>
        <div class="muted">${g.nodes.length} elementi · ${g.edges.length} collegamenti · un arco del cerchio per progetto; gli appunti sono cerchi vuoti, le menzioni tratteggiate</div></div>
    </header>
    ${filters()}
    <div class="scroll graph-wrap">${svg}</div>
  </div>`;
}
