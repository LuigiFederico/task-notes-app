// Disposizione del grafo circolare: i nodi stanno su un cerchio, raggruppati per progetto con uno spazio fra i gruppi;
// gli archi sono curve che passano verso il centro, tanto più quanto più i due nodi sono lontani sul cerchio.
// Funzione pura: riceve gruppi e archi e restituisce le coordinate per l'SVG (nessun accesso al DOM).

const TAU = Math.PI * 2;

// groups: [{ key, nodes: [{ id, … }] }] nell'ordine in cui vanno sul cerchio (dall'alto, in senso orario).
// edges: [{ from, to, … }] fra ID di nodi presenti. Restituisce { size, nodes, edges }: i nodi con x, y, r (raggio del
// pallino, secondo il numero di collegamenti), angle (radianti) e la posizione dell'etichetta; gli archi con il path "d".
export function layoutGraph(groups, edges, { size = 1200, radius = 340, gap = 0.12, rMin = 4.5, rMax = 14 } = {}) {
  const full = groups.filter((g) => g.nodes.length);
  const count = full.reduce((n, g) => n + g.nodes.length, 0);
  const c = size / 2;
  if (!count) return { size, nodes: [], edges: [] };

  // Lo spazio fra i gruppi non supera un terzo del cerchio, anche con molti progetti.
  const gapAngle = full.length > 1 ? Math.min(gap, (TAU / 3) / full.length) : 0;
  const step = (TAU - gapAngle * full.length) / count;

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  const maxDeg = Math.max(0, ...degree.values());

  const nodes = [];
  let angle = -Math.PI / 2 + gapAngle / 2;
  for (const g of full) {
    for (const n of g.nodes) {
      const a = angle + step / 2;
      const deg = degree.get(n.id) || 0;
      const r = maxDeg ? rMin + (rMax - rMin) * Math.sqrt(deg / maxDeg) : rMin;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // L'etichetta esce in senso radiale; a sinistra si ruota di 180° per non leggerla capovolta.
      const left = cos < 0;
      const rot = (a * 180) / Math.PI + (left ? 180 : 0);
      const lr = radius + rMax + 8;
      nodes.push({
        ...n, group: g.key, angle: a, degree: deg, r,
        x: c + radius * cos, y: c + radius * sin,
        labelX: c + lr * cos, labelY: c + lr * sin, labelRotate: rot, labelAnchor: left ? 'end' : 'start'
      });
      angle += step;
    }
    angle += gapAngle;
  }

  const at = new Map(nodes.map((n) => [n.id, n]));
  const out = [];
  for (const e of edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (!a || !b || a === b) continue;
    // Distanza sul cerchio da 0 (vicini) a 1 (opposti): i punti di controllo si avvicinano al centro di conseguenza.
    let da = Math.abs(a.angle - b.angle) % TAU;
    if (da > Math.PI) da = TAU - da;
    const k = 0.25 + 0.7 * (da / Math.PI);
    const cx1 = a.x + (c - a.x) * k;
    const cy1 = a.y + (c - a.y) * k;
    const cx2 = b.x + (c - b.x) * k;
    const cy2 = b.y + (c - b.y) * k;
    out.push({ ...e, d: `M${f(a.x)} ${f(a.y)} C${f(cx1)} ${f(cy1)} ${f(cx2)} ${f(cy2)} ${f(b.x)} ${f(b.y)}` });
  }
  return { size, nodes, edges: out };
}

const f = (n) => Math.round(n * 10) / 10;

// Dimensione del testo delle etichette: più nodi ci sono, più è piccola (fra 10 e 18 unità del viewBox).
export function labelSize(count, radius = 340) {
  if (!count) return 18;
  return Math.max(10, Math.min(18, (TAU * radius / count) * 0.8));
}
