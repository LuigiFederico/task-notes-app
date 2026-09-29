'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fm = require('../src/main/frontmatter');
const { Store, slugify } = require('../src/main/store');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'taccuino-')); }

test('front matter: andata e ritorno', () => {
  const data = { id: 'T-001', titolo: 'Rispondere: "urgente"', n: 3, ok: true, vuoto: null, lista: ['a b', 'c:d'], zero: [], numstr: '42' };
  const text = fm.stringify(data, 'Corpo\n\n- punto');
  const back = fm.parse(text);
  assert.deepStrictEqual(back.data, data);
  assert.strictEqual(back.body, 'Corpo\n\n- punto');
});

test('front matter: file scritto a mano con liste inline e CRLF', () => {
  const back = fm.parse('---\r\ntitolo: Ciao mondo\r\ntag: [riunione, "dati"]\r\n---\r\n\r\nTesto');
  assert.deepStrictEqual(back.data, { titolo: 'Ciao mondo', tag: ['riunione', 'dati'] });
  assert.strictEqual(back.body, 'Testo');
});

test('slugify', () => {
  assert.strictEqual(slugify('Attesa altri!'), 'attesa-altri');
  assert.strictEqual(slugify('Priorità'), 'priorita');
});

test('init crea struttura e categorie di base', async () => {
  const s = new Store(tmpDir());
  await s.init({ withDefaultProject: true });
  const all = await s.loadAll();
  assert.deepStrictEqual(all.categories.map((c) => c.id), ['stato', 'priorita', 'etichette']);
  assert.strictEqual(all.categories[0].tags.find((t) => t.id === 'fatto').chiuso, true);
  assert.strictEqual(all.projects[0].codice, 'GEN');
  // una seconda init non duplica e non sovrascrive
  await s.init({ withDefaultProject: true });
  assert.strictEqual((await s.loadProjects()).length, 1);
});

test('task: creazione, ID progressivo, storico e completamento', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveProject({ codice: 'vend', nome: 'Dashboard vendite', colore: '#2F5BD3' });
  const a = await s.saveTask({ titolo: 'Primo', progetto: 'VEND', priorita: 'alta', tags: { etichette: ['riunione'] }, descrizione: 'Dettagli' });
  const b = await s.saveTask({ titolo: 'Secondo', progetto: 'VEND' });
  assert.strictEqual(a.id, 'T-001');
  assert.strictEqual(b.id, 'T-002');
  const done = await s.saveTask({ ...a, stato: 'fatto' });
  assert.ok(done.completato);
  assert.ok(done.storico.some((l) => l.includes('Stato: Da fare → Fatto')));
  assert.deepStrictEqual(done.tags.etichette, ['riunione']);
  assert.strictEqual(done.descrizione, 'Dettagli');
  const reopened = await s.saveTask({ ...done, stato: 'da-fare' });
  assert.strictEqual(reopened.completato, null);
});

test('progetto: descrizione e decisioni', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveProject({ codice: 'ECOM', nome: 'E-commerce', descrizione: 'Migrazione sito.\n\n- punto', decisioni: [
    { data: '2026-09-15', titolo: 'Seconda', testo: 'Testo due' },
    { data: '2026-09-22', titolo: 'Fonte unica', testo: 'Solo datamart.', task: 'T-029' }
  ] });
  const [p] = await s.loadProjects();
  assert.strictEqual(p.descrizione, 'Migrazione sito.\n\n- punto');
  assert.strictEqual(p.decisioni.length, 2);
  assert.deepStrictEqual(p.decisioni[0], { data: '2026-09-22', titolo: 'Fonte unica', testo: 'Solo datamart.', task: 'T-029' });
  await assert.rejects(() => s.saveProject({ codice: '' }));
});

test('tag: creazione, unione ed eliminazione aggiornano i task', async () => {
  const s = new Store(tmpDir());
  await s.init();
  const id1 = await s.saveTag('etichette', { nome: 'Riunione', colore: '#2F5BD3', descrizione: 'Da discutere' });
  const id2 = await s.saveTag('etichette', { nome: 'Meeting' });
  assert.strictEqual(id1, 'riunione');
  const t = await s.saveTask({ titolo: 'X', progetto: 'A', tags: { etichette: ['meeting', 'altro'] } });
  await s.mergeTag('etichette', id2, id1);
  let [task] = await s.loadTasks();
  assert.deepStrictEqual(task.tags.etichette, ['riunione', 'altro']);
  await s.deleteTag('etichette', 'riunione');
  [task] = await s.loadTasks();
  assert.deepStrictEqual(task.tags.etichette, ['altro']);
  await assert.rejects(() => s.deleteCategory('stato'));
  await s.saveCategory({ nome: 'Contesto', tipo: 'singola' });
  const cats = await s.loadCategories();
  assert.ok(cats.find((c) => c.id === 'contesto' && c.tipo === 'singola'));
  assert.strictEqual(t.id, 'T-001');
});

test('nomi file pericolosi vengono rifiutati', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await assert.rejects(() => s.deleteTask('../fuori'));
});
