'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fm = require('../src/main/frontmatter');
const { Store, slugify } = require('../src/main/store');
const formats = require('../src/main/formats');

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

test('formato: un task fa andata e ritorno, con le categorie utente come chiavi in cima al file', () => {
  const t = {
    id: 'T-007', titolo: 'Preparare: slide', progetto: 'VEND', stato: 'in-corso', priorita: 'alta', scadenza: '2026-10-01',
    creato: '2026-09-01', aggiornato: '2026-09-02', completato: null,
    tags: { etichette: ['riunione', 'dati'], contesto: 'ufficio', vuota: null }, sottotask: [], collegamenti: [], storico: ['2026-09-01 Creato'], descrizione: 'Note\n\n- punto'
  };
  const text = formats.serializeTask(t);
  assert.match(text, /^contesto: ufficio$/m);
  assert.doesNotMatch(text, /vuota/);
  const back = formats.parseTask(text, 'T-007');
  assert.deepStrictEqual(back, { ...t, tags: { etichette: ['riunione', 'dati'], contesto: 'ufficio' } });
  // l'ID viene dal nome del file, non dal campo id
  assert.strictEqual(formats.parseTask(text, 'T-007-PC').id, 'T-007-PC');
});

test('formato: storico dei cambi con i nomi di stato e priorità', () => {
  const cats = [
    { id: 'stato', tags: [{ id: 'da-fare', nome: 'Da fare' }, { id: 'fatto', nome: 'Fatto' }] },
    { id: 'priorita', tags: [{ id: 'alta', nome: 'Alta' }] }
  ];
  const now = '2026-09-30';
  assert.deepStrictEqual(formats.taskHistory(null, {}, cats, now), ['2026-09-30 Creato']);
  const prev = { stato: 'da-fare', priorita: null, scadenza: '2026-10-01', progetto: 'VEND' };
  assert.deepStrictEqual(formats.taskHistory(prev, { ...prev }, cats, now), []);
  assert.deepStrictEqual(formats.taskHistory(prev, { stato: 'fatto', priorita: 'alta', scadenza: null, progetto: 'ECOM' }, cats, now), [
    '2026-09-30 Stato: Da fare → Fatto',
    '2026-09-30 Priorità: — → Alta',
    '2026-09-30 Scadenza: 2026-10-01 → —',
    '2026-09-30 Progetto: VEND → ECOM'
  ]);
});

test('formato: categorie senza file descrittivo e categorie di sistema', () => {
  assert.deepStrictEqual(formats.parseCategory(null, 'contesto'),
    { id: 'contesto', nome: 'contesto', tipo: 'multipla', obbligatoria: false, ordine: 99, descrizione: '', sistema: false, tags: [] });
  // stato e priorità restano a scelta singola anche se il file dice altro
  const stato = formats.parseCategory(formats.serializeCategory({ nome: 'Stato', tipo: 'multipla' }, 'stato'), 'stato');
  assert.deepStrictEqual([stato.tipo, stato.sistema], ['singola', true]);
  assert.match(formats.serializeTag({ nome: 'Fatto', chiuso: true }, 'fatto', 'stato'), /^chiuso: true$/m);
  assert.doesNotMatch(formats.serializeTag({ nome: 'Alta', chiuso: true }, 'alta', 'priorita'), /chiuso/);
});

test('formato: categoria a testo libero con modello di link, valori scritti nel task', () => {
  const text = formats.serializeCategory({ nome: 'Ticket Jira', tipo: 'testo', url: 'https://jira.example.com/browse/{valore}' }, 'ticket-jira');
  assert.match(text, /^url: /m);
  const c = formats.parseCategory(text, 'ticket-jira');
  assert.deepStrictEqual([c.tipo, c.url], ['testo', 'https://jira.example.com/browse/{valore}']);
  // l'url vale solo per le categorie a testo
  assert.strictEqual(formats.parseCategory(formats.serializeCategory({ nome: 'X', tipo: 'multipla', url: 'https://a' }, 'x'), 'x').url, undefined);
  // più valori per task, anche scritti a mano come valore singolo
  const t = formats.parseTask(formats.serializeTask({ id: 'T-001', titolo: 'a', tags: { 'ticket-jira': ['PROJ-123', 'https://x.example/y?z=1'] } }), 'T-001');
  assert.deepStrictEqual(t.tags['ticket-jira'], ['PROJ-123', 'https://x.example/y?z=1']);
  assert.strictEqual(formats.parseTask('---\nticket-jira: PROJ-9\n---\n', 'T-002').tags['ticket-jira'], 'PROJ-9');
});

test('init crea struttura e categorie di base', async () => {
  const s = new Store(tmpDir());
  await s.init({ withDefaultProject: true });
  const all = await s.loadAll();
  assert.deepStrictEqual(all.categories.map((c) => c.id), ['stato', 'priorita', 'etichette', 'collegamento']);
  assert.strictEqual(all.categories[0].tags.find((t) => t.id === 'fatto').chiuso, true);
  assert.deepStrictEqual(all.categories[1].tags.map((t) => t.id), ['urgente', 'alta', 'media', 'bassa', 'backlog']);
  assert.strictEqual(all.projects[0].codice, 'GEN');
  // una seconda init non duplica e non sovrascrive
  await s.init({ withDefaultProject: true });
  assert.strictEqual((await s.loadProjects()).length, 1);
});

test('migrazione: una cartella con 3 priorità riceve Urgente e Backlog una volta sola', async () => {
  const dir = tmpDir();
  const s = new Store(dir);
  await s.init();
  // Cartella "vecchia": 3 livelli e nessuna migrazione registrata.
  await s.remove(s.p('tags', 'priorita', 'urgente.md'));
  await s.remove(s.p('tags', 'priorita', 'backlog.md'));
  for (const [id, ordine] of [['alta', 1], ['media', 2], ['bassa', 3]]) {
    const t = (await s.loadCategories()).find((c) => c.id === 'priorita').tags.find((x) => x.id === id);
    await s.saveTag('priorita', { ...t, ordine });
  }
  const { migrazioni, ...cfg } = await s.readConfig();
  assert.deepStrictEqual(migrazioni, ['priorita-5-livelli']);
  await s.writeConfig(cfg);

  await s.init();
  const prio = () => s.loadCategories().then((cs) => cs.find((c) => c.id === 'priorita').tags.map((t) => t.id));
  assert.deepStrictEqual(await prio(), ['urgente', 'alta', 'media', 'bassa', 'backlog']);
  assert.deepStrictEqual((await s.readConfig()).migrazioni, ['priorita-5-livelli']);

  // Se l'utente elimina un livello, non torna.
  await s.deleteTag('priorita', 'backlog');
  await s.init();
  assert.deepStrictEqual(await prio(), ['urgente', 'alta', 'media', 'bassa']);
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

test('progetto: l\'ordine scelto viene prima del nome, i progetti senza ordine vanno in fondo', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveProject({ codice: 'AAA', nome: 'Alfa' });
  await s.saveProject({ codice: 'ZZZ', nome: 'Zeta', ordine: 1 });
  await s.saveProject({ codice: 'MMM', nome: 'Emme', ordine: 2 });
  assert.deepStrictEqual((await s.loadProjects()).map((p) => p.codice), ['ZZZ', 'MMM', 'AAA']);
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

test('cestino: eliminare un task lo sposta in .cestino e si può ripristinare', async () => {
  const dir = tmpDir();
  const s = new Store(dir);
  await s.init();
  const t = await s.saveTask({ titolo: 'Da buttare', progetto: 'A' });
  await s.deleteTask(t.id);
  assert.strictEqual((await s.loadTasks()).length, 0);
  const [v] = await s.listTrash();
  assert.strictEqual(v.tipo, 'task');
  assert.strictEqual(v.nome, 'T-001 · Da buttare');
  assert.strictEqual(v.percorso, 'tasks/T-001.md');
  assert.ok(fs.existsSync(path.join(dir, '.cestino', v.id, 'tasks', 'T-001.md')));
  await s.restoreTrash(v.id);
  assert.strictEqual((await s.loadTasks())[0].titolo, 'Da buttare');
  assert.deepStrictEqual(await s.listTrash(), []);
});

test('cestino: gli ID dei task eliminati non vengono riusati, nemmeno dopo lo svuotamento', async () => {
  const s = new Store(tmpDir());
  await s.init();
  const a = await s.saveTask({ titolo: 'Uno', progetto: 'A' });
  await s.deleteTask(a.id);
  assert.strictEqual((await s.saveTask({ titolo: 'Due', progetto: 'A' })).id, 'T-002');
  await s.deleteTask('T-002');
  await s.emptyTrash();
  assert.deepStrictEqual(await s.listTrash(), []);
  assert.strictEqual((await s.saveTask({ titolo: 'Tre', progetto: 'A' })).id, 'T-003');
});

test('cestino: il ripristino si ferma se il file esiste già o se manca la categoria', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveProject({ codice: 'VEND', nome: 'Vendite' });
  await s.deleteProject('VEND');
  await s.saveProject({ codice: 'VEND', nome: 'Vendite bis' });
  const [p] = await s.listTrash();
  await assert.rejects(() => s.restoreTrash(p.id), /Esiste già «projects\/VEND.md»/);

  await s.saveCategory({ nome: 'Contesto' });
  await s.saveTag('contesto', { nome: 'Ufficio' });
  await s.deleteTag('contesto', 'ufficio');
  await s.deleteCategory('contesto');
  const tag = (await s.listTrash()).find((v) => v.tipo === 'tag');
  await assert.rejects(() => s.restoreTrash(tag.id), /La categoria «contesto» non esiste più/);
});

test('cestino: una categoria eliminata si ripristina con i suoi tag', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveCategory({ nome: 'Contesto', tipo: 'singola' });
  await s.saveTag('contesto', { nome: 'Ufficio' });
  await s.saveTask({ titolo: 'X', progetto: 'A', tags: { contesto: 'ufficio' } });
  await s.deleteCategory('contesto');
  assert.ok(!(await s.loadCategories()).some((c) => c.id === 'contesto'));
  assert.strictEqual((await s.loadTasks())[0].tags.contesto, undefined);
  const [v] = await s.listTrash();
  assert.deepStrictEqual([v.tipo, v.nome, v.percorso], ['categoria', 'Contesto', 'tags/contesto']);
  await s.restoreTrash(v.id);
  const c = (await s.loadCategories()).find((x) => x.id === 'contesto');
  assert.deepStrictEqual(c.tags.map((t) => t.id), ['ufficio']);
});

test('cestino: la pulizia toglie solo gli elementi più vecchi di 30 giorni', async () => {
  const dir = tmpDir();
  const s = new Store(dir);
  await s.init();
  await s.saveTask({ titolo: 'Vecchio', progetto: 'A' });
  await s.saveTask({ titolo: 'Recente', progetto: 'A' });
  await s.deleteTask('T-001');
  await s.deleteTask('T-002');
  const old = (await s.listTrash()).find((v) => v.percorso === 'tasks/T-001.md');
  const file = path.join(dir, '.cestino', old.id, 'voce.json');
  const v = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...v, eliminato: new Date(Date.now() - 31 * 86400000).toISOString() }));
  await s.purgeTrash(30);
  assert.deepStrictEqual((await s.listTrash()).map((x) => x.percorso), ['tasks/T-002.md']);
});

test('unione di valori di stato e priorità sposta i task', async () => {
  const s = new Store(tmpDir());
  await s.init();
  const a = await s.saveTask({ titolo: 'Attesa', progetto: 'A', stato: 'in-attesa', priorita: 'bassa' });
  const b = await s.saveTask({ titolo: 'Fatto', progetto: 'A', stato: 'fatto' });
  await s.mergeTag('stato', 'in-attesa', 'in-corso');
  await s.mergeTag('priorita', 'bassa', 'media');
  await s.mergeTag('stato', 'fatto', 'da-fare');
  const tasks = await s.loadTasks();
  const ta = tasks.find((t) => t.id === a.id);
  const tb = tasks.find((t) => t.id === b.id);
  assert.strictEqual(ta.stato, 'in-corso');
  assert.strictEqual(ta.priorita, 'media');
  assert.ok(ta.storico.some((l) => l.includes('Stato: In attesa → In corso')));
  assert.strictEqual(tb.stato, 'da-fare');
  assert.strictEqual(tb.completato, null);
  const stati = (await s.loadCategories()).find((c) => c.id === 'stato').tags.map((t) => t.id);
  assert.deepStrictEqual(stati, ['da-fare', 'in-corso']);
  assert.deepStrictEqual((await s.listTrash()).map((v) => v.percorso).sort(), ['tags/priorita/bassa.md', 'tags/stato/fatto.md', 'tags/stato/in-attesa.md']);
});

test('scrittura: riprova il rename se il file è bloccato', async () => {
  const dir = tmpDir();
  const s = new Store(dir);
  await s.init();
  const rename = fs.promises.rename;
  let calls = 0;
  const busy = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  try {
    fs.promises.rename = async (...args) => { if (++calls <= 2) throw busy(); return rename(...args); };
    const t = await s.saveTask({ titolo: 'Bloccato', progetto: 'A' });
    assert.strictEqual(calls, 3);
    assert.strictEqual((await s.loadTasks())[0].id, t.id);

    fs.promises.rename = async () => { throw busy(); };
    await assert.rejects(() => s.saveTask({ ...t, titolo: 'Mai' }), (err) => err.code === 'EPERM');
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'tasks')), ['T-001.md']);
  } finally {
    fs.promises.rename = rename;
  }
});

test('formato: sotto-task come checklist nel file del task', () => {
  const t = { id: 'T-001', titolo: 'a', tags: {}, storico: [], sottotask: [
    { fatto: true, testo: 'Raccogliere i dati' }, { fatto: false, testo: 'Bozza: "slide" #1' }] };
  const text = formats.serializeTask(t);
  assert.match(text, /^sottotask:\n {2}- "\[x\] Raccogliere i dati"/m);
  const back = formats.parseTask(text, 'T-001');
  assert.deepStrictEqual(back.sottotask, t.sottotask);
  assert.strictEqual('sottotask' in back.tags, false);
  // senza voci la chiave non si scrive; a mano valgono anche le righe senza casella
  assert.doesNotMatch(formats.serializeTask({ ...t, sottotask: [] }), /sottotask/);
  assert.deepStrictEqual(formats.parseTask('---\nsottotask:\n  - "[X] fatto"\n  - libera\n---\n', 'T-2').sottotask,
    [{ fatto: true, testo: 'fatto' }, { fatto: false, testo: 'libera' }]);
});

test('formato: collegamenti "tipo ID" nel file del task, e il nome inverso dei tipi', () => {
  const t = { id: 'T-042', titolo: 'a', tags: {}, storico: [], collegamenti: [{ tipo: 'bloccato-da', id: 'T-012' }, { tipo: '', id: 'T-007' }] };
  const text = formats.serializeTask(t);
  assert.match(text, /^collegamenti:\n {2}- bloccato-da T-012\n {2}- T-007$/m);
  const back = formats.parseTask(text, 'T-042');
  assert.deepStrictEqual(back.collegamenti, t.collegamenti);
  assert.strictEqual('collegamenti' in back.tags, false);
  assert.doesNotMatch(formats.serializeTask({ ...t, collegamenti: [] }), /collegamenti/);
  // l'inverso si scrive solo per i tipi di collegamento, e se manca vale il nome
  assert.match(formats.serializeTag({ nome: 'Bloccato da', inverso: 'Blocca' }, 'bloccato-da', 'collegamento'), /^inverso: Blocca$/m);
  assert.match(formats.serializeTag({ nome: 'Simile a' }, 'simile-a', 'collegamento'), /^inverso: Simile a$/m);
  assert.doesNotMatch(formats.serializeTag({ nome: 'Alta', inverso: 'x' }, 'alta', 'priorita'), /inverso/);
});

test('collegamento: categoria di sistema anche nelle cartelle esistenti, tipi uniti e protetti', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.remove(s.p('tags', 'collegamento'));
  await s.init();   // cartella esistente: la categoria di sistema torna, con i tipi di serie
  const tipi = (await s.loadCategories()).find((c) => c.id === 'collegamento');
  assert.deepStrictEqual(tipi.tags.map((t) => [t.id, t.inverso]), [['bloccato-da', 'Blocca'], ['dipende-da', 'Necessario per'], ['correlato-a', 'Correlato a']]);
  await assert.rejects(() => s.deleteCategory('collegamento'));

  const a = await s.saveTask({ titolo: 'A', progetto: 'X' });
  const b = await s.saveTask({ titolo: 'B', progetto: 'X', collegamenti: [{ tipo: 'dipende-da', id: a.id }, { tipo: 'bloccato-da', id: a.id }] });
  await assert.rejects(() => s.deleteTag('collegamento', 'dipende-da'), /usato/);
  // unire due tipi riscrive i collegamenti e toglie i doppioni
  await s.mergeTag('collegamento', 'dipende-da', 'bloccato-da');
  const [back] = (await s.loadTasks()).filter((t) => t.id === b.id);
  assert.deepStrictEqual(back.collegamenti, [{ tipo: 'bloccato-da', id: a.id }]);
});

test('appunti: formato, ID sequenziali che non tornano, date', async () => {
  const n = { id: 'A-007', titolo: 'Riunione KPI', progetto: 'ECOM', creato: '2026-09-30', aggiornato: '2026-09-30',
    tags: { etichette: ['riunione'] }, collegamenti: [{ tipo: 'correlato-a', id: 'T-042' }], descrizione: 'Testo\n\n- @T-042' };
  assert.deepStrictEqual(formats.parseNote(formats.serializeNote(n), 'A-007'), n);

  const s = new Store(tmpDir());
  await s.init();
  const a = await s.saveNote({ titolo: '  Primo  ' });
  const b = await s.saveNote({ titolo: '' });
  assert.deepStrictEqual([a.id, a.titolo, b.id, b.titolo], ['A-001', 'Primo', 'A-002', 'Senza titolo']);
  const again = await s.saveNote({ ...a, creato: '2000-01-01', descrizione: 'x' });
  assert.strictEqual(again.creato, a.creato);
  await s.deleteNote('A-002');
  assert.strictEqual(await s.nextNoteId(), 'A-003');
  await s.emptyTrash();
  assert.strictEqual(await s.nextNoteId(), 'A-003');
  assert.strictEqual((await s.readConfig()).ultimoAppunto, 2);
  assert.deepStrictEqual((await s.loadAll()).notes.map((x) => x.id), ['A-001']);
});

test('appunti: eliminare o unire un tag tocca anche gli appunti; un progetto con appunti non si elimina', async () => {
  const s = new Store(tmpDir());
  await s.init();
  await s.saveTag('etichette', { nome: 'Riunione' });
  await s.saveTag('etichette', { nome: 'Incontro' });
  await s.saveProject({ codice: 'ECOM', nome: 'E-commerce' });
  const n = await s.saveNote({ titolo: 'Note', progetto: 'ECOM', tags: { etichette: ['riunione'] }, collegamenti: [{ tipo: 'dipende-da', id: 'T-001' }] });
  await s.mergeTag('etichette', 'riunione', 'incontro');
  await s.mergeTag('collegamento', 'dipende-da', 'correlato-a');
  let [back] = await s.loadNotes();
  assert.deepStrictEqual([back.tags.etichette, back.collegamenti], [['incontro'], [{ tipo: 'correlato-a', id: 'T-001' }]]);
  await assert.rejects(() => s.deleteTag('collegamento', 'correlato-a'), /usato/);
  await s.deleteTag('etichette', 'incontro');
  [back] = await s.loadNotes();
  assert.deepStrictEqual(back.tags.etichette, []);
  await assert.rejects(() => s.deleteProject('ECOM'), /appunti/);
  await s.deleteNote(n.id);
  await s.deleteProject('ECOM');
});

test('istruzioni per Claude: scritte al cambio di versione, note personali mai sovrascritte', async () => {
  const dir = tmpDir();
  const s = new Store(dir);
  await s.init();
  assert.strictEqual(await s.syncInstructions('0.3.0'), true);
  const text = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.match(text, /^# Cartella dati di Taccuino/);
  assert.match(text, /^@note-personali\.md$/m);
  assert.strictEqual((await s.readConfig()).istruzioni, '0.3.0');
  // stessa versione: niente da fare; l'utente scrive le sue note
  assert.strictEqual(await s.syncInstructions('0.3.0'), false);
  fs.writeFileSync(path.join(dir, 'note-personali.md'), 'Mie note');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'modificato a mano');
  // versione nuova: CLAUDE.md torna quello dell'app, le note restano
  assert.strictEqual(await s.syncInstructions('0.4.0'), true);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), text);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'note-personali.md'), 'utf8'), 'Mie note');
  // se CLAUDE.md sparisce si ricrea anche a versione uguale
  fs.rmSync(path.join(dir, 'CLAUDE.md'));
  assert.strictEqual(await s.syncInstructions('0.4.0'), true);
  // i file nella radice non diventano dati
  const all = await s.loadAll();
  assert.deepStrictEqual([all.tasks.length, all.notes.length], [0, 0]);
});
