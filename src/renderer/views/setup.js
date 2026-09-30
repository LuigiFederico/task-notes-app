import { S } from '../state.js';
import { esc } from '../lib/util.js';
import { icon } from '../lib/icons.js';

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
