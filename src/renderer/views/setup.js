import { S } from '../state.js';
import { esc, iso, fmtFull, plural } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { mascot } from '../mascot.js';
import { confirmBox } from './components.js';

const TRASH_KIND = { task: 'Task', progetto: 'Progetto', categoria: 'Categoria', tag: 'Tag' };

const TREE = `Taccuino/
  tasks/
    T-001.md …
  projects/
    GEN.md …
  tags/
    stato/  priorita/  etichette/
  taccuino.json`;

const SAMPLE = `---
id: T-001
titolo: Preparare slide review
progetto: GEN
stato: in-corso
priorita: alta
scadenza: 2026-10-01
etichette:
  - riunione
---

Note del task in Markdown…`;

export function setupView() {
  const cfg = S.config;
  const mode = S.ui.setupMode;
  const dir = S.ui.setupDir ?? cfg.dataDir ?? cfg.suggested;
  const mcard = (m, title, desc) => `<button type="button" role="radio" aria-checked="${mode === m}" class="mode-card${mode === m ? ' on' : ''}" data-action="setup-mode" data-value="${m}"><span class="strong">${title}</span><span class="small muted-2">${desc}</span></button>`;
  return `
  <div class="setup">
    <div class="setup-card">
      <div class="setup-main">
        <div class="row-12"><div class="brand-mark lg">${icon.book(22)}</div><span class="brand-name lg">Taccuino</span></div>
        <div class="stack-10"><h1 class="display">Dove teniamo i tuoi task?</h1>
          <p class="lead">Taccuino salva task, progetti e tag come file Markdown in una cartella. Mettila in OneDrive per averla sempre sincronizzata; potrai cambiarla dalle impostazioni.</p></div>
        <div class="grid-2" role="radiogroup" aria-label="Tipo di cartella">
          ${mcard('new', 'Crea una nuova cartella', 'Parto da zero: preparo la struttura, gli stati, le priorità e un progetto “Generale”.')}
          ${mcard('open', 'Apri una cartella esistente', 'Ho già usato Taccuino, anche da un altro PC.')}
        </div>
        <label class="field"><span>Cartella dati</span>
          <span class="row-8"><input id="setup-dir" class="mono grow" value="${esc(dir)}" data-input="setup-dir"><button type="button" class="btn" data-action="choose-folder">Sfoglia…</button></span>
          ${/onedrive/i.test(dir) ? `<span class="ok small row-6">${icon.check(14)}Cartella di OneDrive</span>` : ''}
        </label>
        ${S.ui.setupError ? `<div class="error">${esc(S.ui.setupError)}</div>` : ''}
        <div class="row-10 end">${S.data && cfg.ready ? '<button class="btn lg" data-action="go" data-view="settings">Annulla</button>' : ''}<button class="btn primary lg" data-action="setup-start">Inizia ${icon.arrow(16)}</button></div>
      </div>
      <div class="setup-side">
        <span class="section-label">COSA TROVERAI NELLA CARTELLA</span>
        <pre class="tree">${esc(TREE)}</pre>
        <div class="sample"><span class="mono muted small">tasks/T-001.md</span><pre>${esc(SAMPLE)}</pre></div>
        <span class="small muted-2">Un file per elemento: meno conflitti di sincronizzazione, e restano leggibili anche senza l'app.</span>
      </div>
    </div>
  </div>`;
}

function trashSection() {
  const list = S.data.cestino || [];
  const rows = list.map((v) => `
    <div class="trash-row">
      <span class="pill xs">${esc(TRASH_KIND[v.tipo] || v.tipo)}</span>
      <span class="stack-2 grow minw0"><span class="ellipsis">${esc(v.nome)}</span><span class="muted small">eliminato il ${esc(fmtFull(iso(new Date(v.eliminato))))}</span></span>
      ${S.ui.confirm === 'trash:' + v.id
        ? confirmBox(`Eliminare per sempre «${v.nome}»? Non si potrà più recuperare.`, `data-action="trash-delete" data-id="${esc(v.id)}"`)
        : `<button class="btn small" data-action="trash-restore" data-id="${esc(v.id)}">Ripristina</button><button class="btn-link small danger-text" data-action="ask-confirm" data-key="trash:${esc(v.id)}">Elimina definitivamente</button>`}
    </div>`).join('');
  const emptying = S.ui.confirm === 'trash-empty';
  return `
    <section class="card pad stack-12">
      <div class="row-between"><h2 class="h2">Cestino</h2>${list.length && !emptying ? '<button class="btn-link small danger-text" data-action="ask-confirm" data-key="trash-empty">Svuota cestino</button>' : ''}</div>
      ${emptying ? confirmBox(`Eliminare per sempre ${plural(list.length, 'elemento', 'elementi')}? ${list.length === 1 ? 'Non si potrà più recuperare.' : 'Non si potranno più recuperare.'}`, 'data-action="trash-empty"', 'Svuota') : ''}
      ${list.length ? `<div>${rows}</div>` : '<p class="muted small">Il cestino è vuoto.</p>'}
      <p class="muted small">Gli elementi restano qui 30 giorni, poi vengono eliminati per sempre. Ripristinando un tag o una categoria, i task da cui era stato tolto non lo riprendono.</p>
    </section>`;
}

export function settingsView() {
  const cfg = S.config;
  return `
  <div class="page narrow">
    <h1 class="display">Impostazioni</h1>
    <section class="card pad stack-16">
      <h2 class="h2">Cartella dati</h2>
      <div class="row-10"><span class="mono grow path">${esc(S.data.dir)}</span><button class="btn" data-action="open-data-folder">${icon.external(15)}Apri in Esplora risorse</button></div>
      <p class="muted small">Tutti i dati sono file Markdown in questa cartella. Per spostarli, chiudi l'app, sposta la cartella e poi scegli la nuova posizione qui sotto.</p>
      <div class="row-10"><button class="btn" data-action="change-folder">Cambia cartella…</button></div>
    </section>
    ${trashSection()}
    <section class="card pad stack-12">
      <h2 class="h2">Avvio</h2>
      <label class="toggle"><input type="checkbox" data-change="open-at-login" ${cfg.openAtLogin ? 'checked' : ''}>Avvia Taccuino all'accesso a Windows</label>
    </section>
    <section class="card pad stack-12">
      <h2 class="h2">Il corvo</h2>
      <label class="toggle"><input type="checkbox" data-change="mascot-visible" ${mascot.prefs.visible ? 'checked' : ''}>Mostra il corvo</label>
      <label class="toggle"><input type="checkbox" data-change="mascot-reduced" ${mascot.prefs.reduced ? 'checked' : ''}>Movimento ridotto (solo un cenno e il fumetto)</label>
      <span class="muted small">Se in Windows le animazioni sono disattivate, il movimento ridotto si attiva da solo. Clicca il corvo per salutarlo.</span>
    </section>
    <section class="card pad stack-10">
      <h2 class="h2">Scorciatoie</h2>
      <div class="kv small">
        <span><kbd>Ctrl N</kbd></span><span>Nuovo task</span>
        <span><kbd>Ctrl K</kbd></span><span>Cerca</span>
        <span><kbd>Esc</kbd></span><span>Chiudi il dettaglio</span>
        <span><kbd>F5</kbd></span><span>Ricarica i dati dalla cartella</span>
      </div>
    </section>
    <p class="muted small">Taccuino ${esc(cfg.version)}</p>
  </div>`;
}
