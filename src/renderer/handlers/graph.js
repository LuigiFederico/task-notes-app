// Grafo: filtri (cosa mostrare, colore degli archi, elementi nascosti) ed evidenziazione di un nodo.
import { S } from '../state.js';
import { root, render } from '../core.js';

export const actions = {
  'graph-kind': (el) => { S.ui.graph.kind = el.dataset.value; render(); },
  'graph-color': (el) => { S.ui.graph.edgeColor = el.dataset.value; render(); },
  'graph-toggle': (el) => {
    const { list, value } = el.dataset;
    const hidden = S.ui.graph[list];
    S.ui.graph[list] = hidden.includes(value) ? hidden.filter((x) => x !== value) : [...hidden, value];
    render();
  }
};

// I nodi sono <g> con role="button": Invio e spazio li aprono come un clic.
export const keydowns = {
  'gnode-key': (el, e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
};

// Sotto il mouse (o con il focus): il nodo e i suoi archi restano in primo piano, il resto si attenua. Senza ridisegnare.
export function highlightNode(id) {
  const svg = root.querySelector('svg.graph');
  if (!svg || (svg.dataset.lit || null) === id) return;
  if (id) svg.dataset.lit = id; else delete svg.dataset.lit;
  svg.classList.toggle('dim', !!id);
  svg.querySelectorAll('.graph-edges path').forEach((p) => p.classList.toggle('hl', !!id && (p.dataset.from === id || p.dataset.to === id)));
  const near = new Set(id ? [id] : []);
  if (id) svg.querySelectorAll('.graph-edges path.hl').forEach((p) => { near.add(p.dataset.from); near.add(p.dataset.to); });
  svg.querySelectorAll('.gnode').forEach((n) => n.classList.toggle('hl', near.has(n.dataset.id)));
}
