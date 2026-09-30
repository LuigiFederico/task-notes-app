import { S, cat, values, TAG_COLORS, projectTasks, openTasks } from '../state.js';
import { tagUsage } from '../selectors.js';
import { esc, safeColor, plural } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox, colorPicker, options, select } from './components.js';

const KINDS = [['multipla', 'Scelta multipla'], ['singola', 'Scelta singola']];
// Il testo libero si sceglie solo alla creazione: i valori già scritti non si convertono in tag (né viceversa).
const NEW_KINDS = [...KINDS, ['testo', 'Testo libero (es. ticket, link)']];
const KIND_LABELS = { singola: 'Scelta singola', multipla: 'Scelta multipla', testo: 'Testo libero' };

function kindLabel(c) { return KIND_LABELS[c.tipo] || KIND_LABELS.multipla; }

export function tagsView() {
  const sel = S.view.cat || 'progetto';
  const cats = [{ id: 'progetto', nome: 'Progetto', tipo: 'singola', obbligatoria: true, sistema: true, tags: S.data.projects }, ...S.data.categories];
  const list = cats.map((c) => `
    <button class="cat-item${c.id === sel ? ' on' : ''}" data-action="go" data-view="tags" data-cat="${esc(c.id)}" aria-pressed="${c.id === sel}">
      <span class="stack-2 grow"><span class="strong">${esc(c.nome)}</span><span class="muted small">${kindLabel(c)}</span></span><span class="muted small">${c.tags.length}</span>
    </button>`).join('');
  const newCat = S.ui.editing === 'cat-new' ? `
    <form class="card pad stack-10 form" data-submit="create-category">
      <label class="field"><span>Nome categoria</span><input name="nome" required placeholder="Es. Contesto" autofocus></label>
      <label class="field"><span>Tipo</span>${select('name="tipo"', options(NEW_KINDS))}</label>
      <div class="row-8 end"><button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Crea</button></div>
    </form>` : `<button class="dashed-btn" data-action="edit" data-key="cat-new">${icon.plus(14)}Nuova categoria</button>`;

  let detail;
  if (sel === 'progetto') {
    detail = `
      <div class="cat-head"><div class="stack-4 grow"><h2 class="h2 lg">Progetto</h2><span class="muted small">Ogni task appartiene a un progetto. Si creano e modificano dalla sezione Progetti; l'ordine scelto qui vale in tutta l'app.</span></div>
        <span class="pill">Scelta singola</span><span class="pill">Obbligatoria</span></div>
      <div class="tag-row head"><span></span><span>NOME</span><span>DESCRIZIONE</span><span>APERTI</span><span>TOTALE</span><span></span></div>
      ${S.data.projects.map((p, i) => { const pt = projectTasks(p.codice); return `
        <div class="tag-row"><span class="swatch-static" style="background:${safeColor(p.colore)}"></span>
          <button class="link strong" data-action="go" data-view="project" data-code="${esc(p.codice)}">${esc(p.nome)}</button>
          <span class="ellipsis small">${esc((p.descrizione || '').split('\n')[0])}</span>
          <span>${openTasks(pt).length}</span><span class="muted">${pt.length}</span>
          <span class="row-2">
            <button class="icon-btn sm" data-action="project-move" data-index="${i}" data-dir="-1" aria-label="Sposta su ${esc(p.nome)}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn sm" data-action="project-move" data-index="${i}" data-dir="1" aria-label="Sposta giù ${esc(p.nome)}" ${i === S.data.projects.length - 1 ? 'disabled' : ''}>↓</button>
          </span></div>`; }).join('')}
      <div class="grow"></div><div class="file-foot">${icon.file(14)}<span class="mono">projects/*.md</span></div>`;
  } else {
    const c = cat(sel);
    if (!c) return `<div class="page">Categoria non trovata.</div>`;
    const editingCat = S.ui.editing === 'cat-edit';
    const confirmCat = S.ui.confirm === 'cat:' + c.id;
    const catUsed = S.data.tasks.filter((t) => values(t, c.id).length > 0).length;
    const rows = c.tags.map((t, i) => {
      const u = tagUsage(c.id, t.id);
      if (S.ui.editing === 'tag:' + t.id) {
        return `<form class="tag-edit" data-submit="save-tag" data-cat="${esc(c.id)}" data-tag="${esc(t.id)}">
          <div class="row-10 wrap"><label class="field grow"><span>Nome</span><input name="nome" required value="${esc(t.nome)}" autofocus></label>
          ${c.id === 'stato' ? `<label class="toggle"><input type="checkbox" name="chiuso" ${t.chiuso ? 'checked' : ''}>Conta come chiuso</label>` : ''}</div>
          <div class="field"><span>Colore</span>${colorPicker(TAG_COLORS, S.ui.tagColor || t.colore, 'tag-color', { small: true })}</div>
          <div class="row-8"><button type="button" class="btn-link small" data-action="go" data-view="tag" data-cat="${esc(c.id)}" data-tag="${esc(t.id)}">Apri pagina e descrizione</button><span class="grow"></span>
          <button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Salva</button></div>
        </form>`;
      }
      return `<div class="tag-row">
        <span class="swatch-static" style="background:${safeColor(t.colore)}"></span>
        <button class="link strong ellipsis" data-action="go" data-view="tag" data-cat="${esc(c.id)}" data-tag="${esc(t.id)}">${esc(t.nome)}${t.chiuso ? ' <span class="pill xs">chiuso</span>' : ''}</button>
        <span class="ellipsis small">${esc((t.descrizione || '').split('\n')[0])}</span>
        <span>${u.open}</span><span class="muted">${u.total}</span>
        <span class="row-2">
          <button class="icon-btn sm" data-action="tag-move" data-cat="${esc(c.id)}" data-index="${i}" data-dir="-1" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn sm" data-action="tag-move" data-cat="${esc(c.id)}" data-index="${i}" data-dir="1" aria-label="Sposta giù" ${i === c.tags.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn sm" data-action="edit" data-key="tag:${esc(t.id)}" aria-label="Modifica ${esc(t.nome)}">${icon.edit(15)}</button>
        </span>
      </div>`;
    }).join('');
    const newTag = S.ui.editing === 'tag-new' ? `
      <form class="tag-edit" data-submit="create-tag" data-cat="${esc(c.id)}">
        <label class="field"><span>Nome del nuovo tag</span><input name="nome" required autofocus></label>
        <div class="field"><span>Colore</span>${colorPicker(TAG_COLORS, S.ui.tagColor || TAG_COLORS[c.tags.length % TAG_COLORS.length], 'tag-color', { small: true })}</div>
        <div class="row-8 end"><button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Aggiungi</button></div>
      </form>` : `<button class="add-row" data-action="edit" data-key="tag-new">${icon.plus(14)}Aggiungi ${c.id === 'stato' ? 'uno stato' : c.id === 'priorita' ? 'un livello' : 'un tag'}</button>`;
    const head = editingCat ? `
      <form class="cat-head form" data-submit="save-category" data-cat="${esc(c.id)}">
        <label class="field grow"><span>Nome</span><input name="nome" required value="${esc(c.nome)}"></label>
        ${c.sistema || c.tipo === 'testo' ? '' : `<label class="field"><span>Tipo</span>${select('name="tipo"', options(KINDS, c.tipo === 'singola' ? 'singola' : 'multipla'))}</label>`}
        ${c.tipo === 'testo' ? `<label class="field grow2"><span>Modello del link</span><input name="url" value="${esc(c.url || '')}" placeholder="https://jira.example.com/browse/{valore}" class="mono"></label>` : ''}
        <label class="field grow2"><span>Descrizione</span><input name="descrizione" value="${esc(c.descrizione)}"></label>
        <div class="row-8 self-end">
          ${c.sistema || confirmCat ? '' : `<button type="button" class="btn-link small danger-text" data-action="ask-confirm" data-key="cat:${esc(c.id)}">Elimina</button>`}
          <button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Salva</button></div>
        ${confirmCat ? `<div class="full-row">${confirmBox(`Eliminare «${c.nome}»? ${catUsed ? `Il valore viene tolto da ${catUsed} task. ` : ''}Potrai ripristinarla dal Cestino.`, `data-action="category-delete" data-cat="${esc(c.id)}"`)}</div>` : ''}
      </form>` : `
      <div class="cat-head"><div class="stack-4 grow"><h2 class="h2 lg">${esc(c.nome)}</h2><span class="muted small">${esc(c.descrizione || '')}</span></div>
        <span class="pill">${kindLabel(c)}</span>${c.sistema ? '<span class="pill">Di sistema</span>' : ''}
        <button class="btn small" data-action="edit" data-key="cat-edit">Impostazioni</button></div>`;
    detail = c.tipo === 'testo' ? `${head}
      <div class="cat-note stack-10 small">
        <p>I valori si scrivono nel pannello del task, uno o più per task, e restano nel file del task: non si crea un file per valore.</p>
        <p class="muted">${c.url ? `Ogni valore diventa un link: <span class="mono">${esc(c.url)}</span>, con <span class="mono">{valore}</span> sostituito dal valore.` : 'Imposta un modello del link (con <span class="mono">{valore}</span>) per trasformare i valori in link. Un valore che è già un indirizzo web è comunque un link.'}</p>
        <p class="muted">${plural(catUsed, 'task usa', 'task usano')} questa categoria.</p>
      </div>
      <div class="grow"></div><div class="file-foot">${icon.file(14)}<span class="mono">tags/${esc(c.id)}/_categoria.md</span></div>` : `${head}
      <div class="tag-row head"><span></span><span>NOME</span><span>DESCRIZIONE</span><span>APERTI</span><span>TOTALE</span><span></span></div>
      ${rows || '<div class="empty small">Nessun tag in questa categoria.</div>'}
      ${newTag}
      <div class="grow"></div><div class="file-foot">${icon.file(14)}<span class="mono">tags/${esc(c.id)}/*.md</span></div>`;
  }

  return `
  <div class="page">
    <header class="page-head">
      <div class="stack-6"><h1 class="display">Tag</h1><div class="muted">Ogni categoria diventa un filtro e un raggruppamento nella lista task.</div></div>
    </header>
    <div class="tags-grid">
      <div class="stack-4"><div class="side-label pad-x">CATEGORIE</div>${list}<div class="mt-8">${newCat}</div></div>
      <section class="card cat-detail">${detail}</section>
    </div>
  </div>`;
}
