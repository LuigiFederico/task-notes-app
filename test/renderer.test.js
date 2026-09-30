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
        { id: 'alta', nome: 'Alta' }, { id: 'media', nome: 'Media' }, { id: 'bassa', nome: 'Bassa' }] },
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

test('renderer: visibleTasks applica completati, filtri e ricerca', async () => {
  const { visibleTasks } = await load('views/tasks.js');
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
