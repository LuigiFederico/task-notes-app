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
    tasks: tasks.map((t) => ({ progetto: 'VEND', stato: 'da-fare', priorita: null, scadenza: null, tags: {}, descrizione: '', storico: [], ...t }))
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

test('renderer: sortTasks mette Urgente in cima, Backlog dopo Bassa e i task senza priorità in fondo', async () => {
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
