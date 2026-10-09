'use strict';
// Funzioni di lettura del renderer: si caricano come moduli ES e si provano su dati finti in S.data.
const test = require('node:test');
const assert = require('node:assert');

const load = (file) => import(`../src/renderer/${file}`);

async function setup(tasks) {
  const { S } = await load('state.js');
  S.data = {
    categories: [
      { id: 'stato', nome: 'Stato', tipo: 'singola', sistema: true, tags: [
        { id: 'da-fare', nome: 'Da fare' }, { id: 'in-corso', nome: 'In corso' },
        { id: 'in-attesa', nome: 'In attesa' }, { id: 'fatto', nome: 'Fatto', chiuso: true }] },
      { id: 'priorita', nome: 'Priorità', tipo: 'singola', sistema: true, tags: [
        { id: 'urgente', nome: 'Urgente' }, { id: 'alta', nome: 'Alta' }, { id: 'media', nome: 'Media' },
        { id: 'bassa', nome: 'Bassa' }, { id: 'backlog', nome: 'Backlog' }] },
      { id: 'etichette', nome: 'Etichette', tipo: 'multipla', sistema: false, tags: [{ id: 'riunione', nome: 'Riunione' }] }
    ],
    projects: [
      { codice: 'VEND', nome: 'Dashboard vendite', colore: '#2F5BD3', stato: 'attivo', decisioni: [] },
      { codice: 'ECOM', nome: 'E-commerce', colore: '#0B8A6F', stato: 'attivo', decisioni: [] }
    ],
    tasks: tasks.map((t) => ({ progetto: 'VEND', stato: 'da-fare', priorita: null, scadenza: null, tags: {}, descrizione: '', storico: [], ...t })),
    notes: []
  };
  Object.assign(S.ui, { showDone: false, recentDone: {}, fProject: '', fPrio: '', fTag: '', search: '' });
  return S;
}

test('renderer: sortTasks mette prima gli aperti, poi priorità, scadenza e ID più recente', async () => {
  const { sortTasks } = await load('state.js');
  const S = await setup([
    { id: 'T-001', titolo: 'chiuso alto', stato: 'fatto', priorita: 'alta' },
    { id: 'T-002', titolo: 'basso', priorita: 'bassa' },
    { id: 'T-003', titolo: 'alto senza scadenza', priorita: 'alta' },
    { id: 'T-004', titolo: 'alto con scadenza', priorita: 'alta', scadenza: '2026-10-01' },
    { id: 'T-005', titolo: 'alto senza scadenza, più recente', priorita: 'alta' }
  ]);
  assert.deepStrictEqual(sortTasks(S.data.tasks).map((t) => t.id), ['T-004', 'T-005', 'T-003', 'T-002', 'T-001']);
});

test('renderer: sortTasks mette Urgente in cima, Backlog dopo Bassa e i task senza priorità insieme a Backlog', async () => {
  const { sortTasks } = await load('state.js');
  const S = await setup([
    { id: 'T-001', titolo: 'senza priorità' },
    { id: 'T-002', titolo: 'backlog', priorita: 'backlog' },
    { id: 'T-003', titolo: 'bassa', priorita: 'bassa' },
    { id: 'T-004', titolo: 'urgente', priorita: 'urgente' },
    { id: 'T-005', titolo: 'alta', priorita: 'alta' }
  ]);
  assert.deepStrictEqual(sortTasks(S.data.tasks).map((t) => t.id), ['T-004', 'T-005', 'T-003', 'T-002', 'T-001']);
});

test('renderer: la priorità di default è l\'ultimo livello, anche rinominato o dopo averlo eliminato', async () => {
  const { prioOf, defaultPrio, prioRank } = await load('state.js');
  const S = await setup([
    { id: 'T-001', titolo: 'senza priorità' },
    { id: 'T-002', titolo: 'priorità sparita', priorita: 'sparita' },
    { id: 'T-003', titolo: 'alta', priorita: 'alta' }
  ]);
  const prio = S.data.categories.find((c) => c.id === 'priorita');
  assert.strictEqual(defaultPrio(), 'backlog');
  assert.deepStrictEqual(S.data.tasks.map(prioOf), ['backlog', 'backlog', 'alta']);
  assert.strictEqual(prioRank(''), prioRank('backlog'));
  prio.tags[4].nome = 'Un giorno';
  assert.strictEqual(prioOf(S.data.tasks[0]), 'backlog');
  prio.tags.pop();
  assert.deepStrictEqual(S.data.tasks.map(prioOf), ['bassa', 'bassa', 'alta']);
  prio.tags = [];
  assert.strictEqual(prioOf(S.data.tasks[0]), null);
});

test('renderer: filtro e gruppi per priorità trattano i task senza priorità come Backlog', async () => {
  const { visibleTasks, groupDefs } = await load('selectors.js');
  const S = await setup([
    { id: 'T-001', titolo: 'senza priorità' },
    { id: 'T-002', titolo: 'backlog', priorita: 'backlog' },
    { id: 'T-003', titolo: 'alta', priorita: 'alta' }
  ]);
  S.ui.fPrio = 'backlog';
  assert.deepStrictEqual(visibleTasks().map((t) => t.id), ['T-001', 'T-002']);
  const groups = groupDefs('priorita').map((g) => [g.key, S.data.tasks.filter(g.test).map((t) => t.id).join(',')]).filter(([, ids]) => ids);
  assert.deepStrictEqual(groups, [['alta', 'T-003'], ['backlog', 'T-001,T-002']]);
  assert.ok(!groupDefs('priorita').some((g) => g.key === '__none'));
});

test('renderer: ordine delle colonne salvato, ripulito da ID sconosciuti e doppioni', async () => {
  const { columnOrder, DEFAULT_COLUMNS } = await load('selectors.js');
  const S = await setup([]);
  assert.deepStrictEqual(columnOrder(), DEFAULT_COLUMNS);
  S.data.colonne = ['id', 'stato', 'titolo', 'progetto', 'priorita', 'scadenza'];
  assert.deepStrictEqual(columnOrder(), ['id', 'stato', 'titolo', 'progetto', 'priorita', 'scadenza']);
  // Scritto a mano: un ID che non esiste, un doppione e colonne mancanti (vanno in fondo, nell'ordine di partenza).
  S.data.colonne = ['stato', 'boh', 'stato', 'id'];
  assert.deepStrictEqual(columnOrder(), ['stato', 'id', 'titolo', 'progetto', 'priorita', 'scadenza']);
});

test('renderer: colonne visibili e griglia per pagina e pannello aperto', async () => {
  const { taskColumns } = await load('selectors.js');
  const S = await setup([]);
  S.data.colonne = ['id', 'stato', 'titolo', 'progetto', 'priorita', 'scadenza'];
  Object.assign(S.ui, { openTask: null, openNote: null });
  const ids = (opts) => taskColumns(opts).cols.map((c) => c.id);
  assert.deepStrictEqual(ids(), ['id', 'stato', 'titolo', 'progetto', 'priorita', 'scadenza']);
  assert.strictEqual(taskColumns().grid, '36px 64px 100px minmax(0, 1fr) 190px 90px 130px');
  assert.deepStrictEqual(ids({ showProject: false }), ['id', 'stato', 'titolo', 'priorita', 'scadenza']);
  assert.deepStrictEqual(ids({ showPrio: false }), ['id', 'stato', 'titolo', 'progetto', 'scadenza']);
  S.ui.openTask = 'T-001';
  assert.deepStrictEqual(ids(), ['id', 'stato', 'titolo', 'scadenza']);
  assert.strictEqual(taskColumns().grid, '30px 56px 92px minmax(0, 1fr) 96px');
  S.ui.openTask = null;
});

test('renderer: un task nuovo con il titolo e senza progetto non si crea', async () => {
  const { missingProject } = await load('selectors.js');
  const S = await setup([{ id: 'T-001', titolo: 'Esistente', progetto: null }]);
  S.ui.openTask = 'T-001';
  assert.strictEqual(missingProject(), false);
  S.ui.openTask = 'new';
  S.ui.draft = { titolo: '', progetto: '' };
  assert.strictEqual(missingProject(), false);
  S.ui.draft.titolo = '   ';
  assert.strictEqual(missingProject(), false);
  S.ui.draft.titolo = 'Nuovo';
  assert.strictEqual(missingProject(), true);
  S.ui.draft.progetto = 'VEND';
  assert.strictEqual(missingProject(), false);
  S.ui.openTask = null;
  S.ui.draft = null;
});

test('renderer: visibleTasks applica completati, filtri e ricerca', async () => {
  const { visibleTasks } = await load('selectors.js');
  const S = await setup([
    { id: 'T-001', titolo: 'Slide review', priorita: 'alta', tags: { etichette: ['riunione'] } },
    { id: 'T-002', titolo: 'Catalogo', progetto: 'ECOM', priorita: 'bassa' },
    { id: 'T-003', titolo: 'Chiuso', stato: 'fatto' }
  ]);
  const ids = () => visibleTasks().map((t) => t.id).sort();
  assert.deepStrictEqual(ids(), ['T-001', 'T-002']);
  S.ui.recentDone = { 'T-003': true };
  assert.deepStrictEqual(ids(), ['T-001', 'T-002', 'T-003']);
  S.ui.recentDone = {};
  S.ui.showDone = true;
  assert.deepStrictEqual(ids(), ['T-001', 'T-002', 'T-003']);
  S.ui.showDone = false;
  S.ui.fProject = 'ECOM';
  assert.deepStrictEqual(ids(), ['T-002']);
  S.ui.fProject = '';
  S.ui.fPrio = 'alta';
  assert.deepStrictEqual(ids(), ['T-001']);
  S.ui.fPrio = '';
  S.ui.fTag = 'etichette:riunione';
  assert.deepStrictEqual(ids(), ['T-001']);
  S.ui.fTag = '';
  S.ui.search = 'vendite slide';   // nome del progetto + titolo, tutte le parole devono esserci
  assert.deepStrictEqual(ids(), ['T-001']);
  S.ui.search = 'riunione';        // nome del tag
  assert.deepStrictEqual(ids(), ['T-001']);
});

test('renderer: groupDefs divide la lista per progetto, scadenza e categoria', async () => {
  const { groupDefs } = await load('selectors.js');
  const { todayISO, addDays } = await load('lib/util.js');
  const S = await setup([
    { id: 'T-001', titolo: 'a', scadenza: addDays(todayISO(), -1), tags: { etichette: ['riunione', 'sparito'] } },
    { id: 'T-002', titolo: 'b', progetto: 'NOPE', tags: { etichette: ['sparito'] } },
    { id: 'T-003', titolo: 'c', stato: 'fatto', scadenza: addDays(todayISO(), -1) }
  ]);
  const groups = (by) => groupDefs(by).map((g) => [g.key, S.data.tasks.filter(g.test).map((t) => t.id).join(',')]).filter(([, ids]) => ids);
  assert.deepStrictEqual(groups('progetto'), [['VEND', 'T-001,T-003'], ['__none', 'T-002']]);
  assert.deepStrictEqual(groups('scadenza'), [['ritardo', 'T-001'], ['nessuna', 'T-002'], ['chiusi', 'T-003']]);
  // un tag che non esiste più nella categoria conta come "senza"
  assert.deepStrictEqual(groups('etichette'), [['riunione', 'T-001'], ['__none', 'T-002,T-003']]);
  assert.deepStrictEqual(groups('stato').map(([k]) => k), ['da-fare', 'fatto']);
  assert.deepStrictEqual(groupDefs('inesistente'), []);
});

test('renderer: tagUsage conta i task aperti e totali di un tag', async () => {
  const { tagUsage } = await load('selectors.js');
  await setup([
    { id: 'T-001', titolo: 'a', tags: { etichette: ['riunione'] } },
    { id: 'T-002', titolo: 'b', stato: 'fatto', tags: { etichette: ['riunione'] } },
    { id: 'T-003', titolo: 'c' }
  ]);
  const u = tagUsage('etichette', 'riunione');
  assert.deepStrictEqual([u.open, u.total], [1, 2]);
  assert.strictEqual(tagUsage('stato', 'fatto').total, 1);
});

test('renderer: dueBucket e dueLabel rispetto a oggi', async () => {
  const { dueBucket, dueLabel, todayISO, addDays, weekStart } = await load('lib/util.js');
  const t = todayISO();
  assert.strictEqual(dueBucket(null), 'nessuna');
  assert.strictEqual(dueBucket(addDays(t, -1)), 'ritardo');
  assert.strictEqual(dueBucket(t), 'oggi');
  const sunday = addDays(weekStart(t), 6);
  if (sunday !== t) assert.strictEqual(dueBucket(sunday), 'settimana');
  assert.strictEqual(dueBucket(addDays(t, 30)), 'dopo');
  assert.deepStrictEqual(dueLabel(null), { text: '—', cls: 'muted' });
  assert.strictEqual(dueLabel(addDays(t, -1)).cls, 'late');
  assert.strictEqual(dueLabel(addDays(t, -1), true).cls, 'muted');
  assert.deepStrictEqual(dueLabel(t), { text: 'Oggi', cls: 'today' });
  assert.strictEqual(dueLabel(addDays(t, 1)).text, 'Domani');
});

test('renderer: md fa l\'escaping e rende il markdown minimale', async () => {
  const { md } = await load('lib/util.js');
  assert.strictEqual(md('<b>x</b> **y** *z* `c`'), '<p>&lt;b&gt;x&lt;/b&gt; <strong>y</strong> <em>z</em> <code>c</code></p>');
  assert.strictEqual(md('- a\n- b\n\n1. c'), '<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>');
  assert.strictEqual(md('[sito](https://example.com) [no](javascript:alert(1))'),
    '<p><a href="https://example.com" target="_blank" rel="noreferrer">sito</a> [no](javascript:alert(1))</p>');
});

test('renderer: link dei valori di una categoria a testo', async () => {
  const { textLink } = await load('lib/util.js');
  assert.strictEqual(textLink('https://jira.example.com/browse/{valore}', 'PROJ-123'), 'https://jira.example.com/browse/PROJ-123');
  assert.strictEqual(textLink('https://x.example/?q={valore}', 'a b&c'), 'https://x.example/?q=a%20b%26c');
  assert.strictEqual(textLink('', 'https://x.example/y'), 'https://x.example/y');
  assert.strictEqual(textLink('', 'PROJ-1'), '');
  assert.strictEqual(textLink('javascript:{valore}', 'x'), '');
});

test('renderer: le categorie a testo non danno chip', async () => {
  const { taskChips } = await load('state.js');
  const S = await setup([{ id: 'T-001', titolo: 'a', tags: { etichette: ['riunione'], jira: ['PROJ-1'] } }]);
  S.data.categories.push({ id: 'jira', nome: 'Jira', tipo: 'testo', sistema: false, tags: [] });
  assert.deepStrictEqual(taskChips(S.data.tasks[0]).map((c) => c.id), ['riunione']);
});

test('renderer: collegamenti in uscita con il nome del tipo, in entrata con il nome inverso, mancanti segnati', async () => {
  const { linksOf } = await load('selectors.js');
  const S = await setup([
    { id: 'T-001', titolo: 'Contratto', collegamenti: [] },
    { id: 'T-002', titolo: 'Slide', collegamenti: [{ tipo: 'bloccato-da', id: 'T-001' }, { tipo: 'correlato-a', id: 'T-099' }] }
  ]);
  S.data.categories.push({ id: 'collegamento', nome: 'Collegamento', tipo: 'singola', sistema: true, tags: [
    { id: 'bloccato-da', nome: 'Bloccato da', inverso: 'Blocca', colore: '#B42318' }, { id: 'correlato-a', nome: 'Correlato a', inverso: 'Correlato a' }] });
  const pick = (l) => [l.dir, l.nome, l.id, !!l.target];
  assert.deepStrictEqual(linksOf(S.data.tasks[1]).map(pick), [['out', 'Bloccato da', 'T-001', true], ['out', 'Correlato a', 'T-099', false]]);
  assert.deepStrictEqual(linksOf(S.data.tasks[0]).map(pick), [['in', 'Blocca', 'T-002', true]]);
});

test('renderer: suggerimenti di @ per ID o titolo, senza il task stesso', async () => {
  const { refCandidates } = await load('selectors.js');
  await setup([
    { id: 'T-001', titolo: 'Contratto fornitore' },
    { id: 'T-010', titolo: 'Slide contratto', stato: 'fatto' },
    { id: 'T-012', titolo: 'Export datamart' }
  ]);
  assert.deepStrictEqual(refCandidates('@contr').map((x) => x.id), ['T-001', 'T-010']);
  assert.deepStrictEqual(refCandidates('t-01', ['T-012']).map((x) => x.id), ['T-010']);
  assert.strictEqual(refCandidates('').length, 3);
});

test('renderer: menzioni @ nel Markdown e nel testo', async () => {
  const { md, mentionsOf } = await load('lib/util.js');
  const html = md('Vedi @T-012 e **@T-9**, non mail@T-1 né https://x.example/@T-5', { refTitle: (id) => (id === 'T-012' ? 'Contratto <b>' : null) });
  assert.match(html, /<button type="button" class="mention" data-action="open-ref" data-id="T-012" title="Contratto &lt;b&gt;">@T-012<\/button>/);
  assert.match(html, /class="mention missing" data-action="open-ref" data-id="T-9"/);
  assert.doesNotMatch(html, /data-id="T-1"|data-id="T-5"/);
  assert.deepStrictEqual(mentionsOf('@T-1 poi (@A-7) e ancora @T-1, ma non a@T-2'), ['T-1', 'A-7']);
});

test('renderer: appunti nei collegamenti, nei suggerimenti e nella ricerca', async () => {
  const { linksOf, refCandidates, visibleNotes } = await load('selectors.js');
  const { ref } = await load('state.js');
  const S = await setup([{ id: 'T-001', titolo: 'Contratto', collegamenti: [{ tipo: '', id: 'A-001' }] }]);
  S.data.notes = [
    { id: 'A-001', titolo: 'Riunione contratto', progetto: 'VEND', aggiornato: '2026-09-01', tags: {}, collegamenti: [], descrizione: 'Con Marco' },
    { id: 'A-002', titolo: 'Idee', progetto: '', aggiornato: '2026-09-20', tags: {}, collegamenti: [{ tipo: '', id: 'T-001' }], descrizione: '' }
  ];
  S.ui.noteSearch = '';
  assert.strictEqual(ref('A-001').titolo, 'Riunione contratto');
  assert.deepStrictEqual(linksOf(S.data.notes[0]).map((l) => [l.dir, l.id]), [['in', 'T-001']]);
  assert.deepStrictEqual(linksOf(S.data.tasks[0]).map((l) => [l.dir, l.id]), [['out', 'A-001'], ['in', 'A-002']]);
  assert.deepStrictEqual(refCandidates('contr').map((x) => x.id).sort(), ['A-001', 'T-001']);
  assert.deepStrictEqual(visibleNotes().map((n) => n.id), ['A-002', 'A-001']);
  S.ui.noteSearch = 'marco';
  assert.deepStrictEqual(visibleNotes().map((n) => n.id), ['A-001']);
  assert.deepStrictEqual(visibleNotes(S.data.notes, '').length, 2);
});

test('renderer: layout del grafo, nodi raggruppati sul cerchio e raggio secondo i collegamenti', async () => {
  const { layoutGraph, labelSize } = await load('lib/graph.js');
  const groups = [{ key: 'A', nodes: [{ id: 'T-1' }, { id: 'T-2' }] }, { key: 'B', nodes: [{ id: 'T-3' }] }, { key: 'C', nodes: [] }];
  const edges = [{ from: 'T-1', to: 'T-3' }, { from: 'T-1', to: 'T-2' }, { from: 'T-1', to: 'T-9' }];
  const g = layoutGraph(groups, edges, { size: 1000, radius: 300, gap: 0.2 });
  assert.deepStrictEqual(g.nodes.map((n) => n.id), ['T-1', 'T-2', 'T-3']);
  const [a, b, c] = g.nodes;
  // angoli crescenti in senso orario, e fra un gruppo e l'altro c'è uno spazio in più
  assert.ok(a.angle < b.angle && b.angle < c.angle);
  assert.ok(c.angle - b.angle > b.angle - a.angle);
  // tutti sul cerchio
  for (const n of g.nodes) assert.ok(Math.abs(Math.hypot(n.x - 500, n.y - 500) - 300) < 1e-6);
  // T-1 ha più collegamenti: pallino più grande; l'arco verso un nodo assente si scarta
  assert.ok(a.r > b.r && b.r === c.r);
  assert.strictEqual(g.edges.length, 2);
  assert.match(g.edges[0].d, /^M[\d.]+ [\d.]+ C/);
  assert.deepStrictEqual(layoutGraph([], []).nodes, []);
  assert.ok(labelSize(500) < labelSize(20));
});

test('renderer: dati del grafo con filtri, menzioni e colori degli archi', async () => {
  const { graphData, NO_PROJECT, MENTION_TYPE } = await load('selectors.js');
  const S = await setup([
    { id: 'T-001', titolo: 'A', progetto: 'VEND', collegamenti: [{ tipo: 'bloccato-da', id: 'T-002' }] },
    { id: 'T-002', titolo: 'B', progetto: 'ECOM', stato: 'fatto', descrizione: 'vedi @A-001 e @T-001' },
    { id: 'T-003', titolo: 'C', progetto: '' }
  ]);
  S.data.categories.push({ id: 'collegamento', nome: 'Collegamento', tipo: 'singola', sistema: true, tags: [{ id: 'bloccato-da', nome: 'Bloccato da', colore: '#B42318' }] });
  S.data.notes = [{ id: 'A-001', titolo: 'Nota', progetto: 'VEND', tags: {}, collegamenti: [], descrizione: '' }];
  S.ui.graph = { kind: 'tutti', edgeColor: 'progetto', hideProjects: [], hideStates: [], hideTypes: [] };
  let d = graphData();
  assert.deepStrictEqual(d.groups.map((g) => [g.key, g.nodes.map((n) => n.id)]), [['VEND', ['T-001', 'A-001']], ['ECOM', ['T-002']], [NO_PROJECT, ['T-003']]]);
  assert.deepStrictEqual(d.edges.map((e) => [e.from, e.to, e.type, e.color]),
    [['T-001', 'T-002', 'bloccato-da', '#2F5BD3'], ['T-002', 'A-001', MENTION_TYPE, '#0B8A6F'], ['T-002', 'T-001', MENTION_TYPE, '#0B8A6F']]);
  S.ui.graph = { ...S.ui.graph, edgeColor: 'tipo', hideTypes: [MENTION_TYPE] };
  assert.deepStrictEqual(graphData().edges.map((e) => e.color), ['#B42318']);
  S.ui.graph = { ...S.ui.graph, kind: 'task', hideStates: ['fatto'], hideProjects: [NO_PROJECT] };
  d = graphData();
  assert.deepStrictEqual(d.groups.flatMap((g) => g.nodes.map((n) => n.id)), ['T-001']);
  assert.strictEqual(d.edges.length, 0);
});

test('renderer: ogni icona è un svg con la sua classe, e i tratti disegnati con stroke-dasharray hanno pathLength', async () => {
  const { icon } = await load('lib/icons.js');
  // Oltre alle icone "draw", i tratti animati da ic-check, ic-tick e ic-draw-in in animations.css.
  const dashed = { check: /<path\b/, tasks: /class="p\d/, note: /class="p\d/ };
  for (const [key, fn] of Object.entries(icon)) {
    const html = fn(20);
    const name = key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    assert.match(html, new RegExp(`^<svg class="ic ic-${name}( ic-draw)?" width="20" height="20" `), key);
    const shapes = html.match(/<(path|rect|circle|line)\b[^>]*>/g);
    const drawn = html.includes('ic-draw') ? shapes : shapes.filter((s) => dashed[key]?.test(s));
    assert.ok(drawn.every((s) => s.includes('pathLength="1"')), key);
  }
  assert.ok(Object.keys(dashed).every((k) => icon[k]), 'icone in dashed');
});
