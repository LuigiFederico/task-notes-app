import { S } from '../state.js';
import { TASK_COLUMNS, DEFAULT_COLUMNS, columnOrder } from '../selectors.js';
import { esc, iso, fmtFull, plural } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { mascot } from '../mascot.js';
import { confirmBox } from './components.js';

const TRASH_KIND = { task: 'Task', appunto: 'Appunto', progetto: 'Progetto', categoria: 'Categoria', tag: 'Tag' };

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

// Ordine delle colonne della lista task: frecce come per i sotto-task; si salva nella cartella dati.
function columnsSection() {
  const order = columnOrder();
  const rows = order.map((id, i) => {
    const label = TASK_COLUMNS.find((c) => c.id === id).label;
    const arrow = (dir, text, off) => `<button id="col-${id}-${dir < 0 ? 'up' : 'down'}" class="icon-btn sm" data-action="column-move" data-index="${i}" data-dir="${dir}" aria-label="Sposta ${esc(label)} ${dir < 0 ? 'prima' : 'dopo'}" ${off ? 'disabled' : ''}>${text}</button>`;
    return `<div class="col-item"><span class="grow">${esc(label)}</span>${arrow(-1, '↑', i === 0)}${arrow(1, '↓', i === order.length - 1)}</div>`;
  }).join('');
  return `
    <section class="card pad stack-12">
      <div class="row-between"><h2 class="h2">Colonne della lista task</h2>${order.join() !== DEFAULT_COLUMNS.join() ? '<button class="btn-link small" data-action="columns-reset">Ripristina ordine</button>' : ''}</div>
      <div class="col-list">${rows}</div>
      <p class="muted small">L'ordine vale per la lista dei task e per le pagine di progetti e tag. La casella di completamento resta sempre la prima. È salvato nella cartella dati, quindi è lo stesso su ogni PC.</p>
    </section>`;
}

const RELEASES = 'https://github.com/LuigiFederico/task-notes-app/releases';

export function updateStatus() {
  const u = S.ui.update;
  return `Scaricamento di Taccuino ${u.versione}… ${u.percento}%`;
}

function updateSection() {
  const cfg = S.config;
  const u = S.ui.update;
  let body;
  if (cfg.updateBlock) body = `<p class="muted small">${esc(cfg.updateBlock)} <a href="${RELEASES}" target="_blank">Apri la pagina delle release</a></p>`;
  else if (u && u.stato === 'scarico') body = `<p class="small" id="update-status" role="status">${esc(updateStatus())}</p>`;
  else if (u && u.stato === 'pronto') body = `<p class="small">Taccuino ${esc(u.versione)} è pronto. Al riavvio si installa e si riapre da solo.</p><div class="row-10"><button class="btn primary" data-action="update-install">Riavvia e installa</button></div>`;
  else body = `<div class="row-10"><button class="btn" data-action="update-check" ${u ? 'disabled' : ''}>${u ? 'Controllo…' : 'Controlla aggiornamenti'}</button></div>`;
  return `
    <section class="card pad stack-12">
      <h2 class="h2">Aggiornamenti</h2>
      <p class="muted small">Versione installata: ${esc(cfg.version)}. Le nuove versioni si scaricano da GitHub.</p>
      ${body}
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
    ${updateSection()}
    ${columnsSection()}
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
