import { S, cat, values, TAG_COLORS, projectTasks, openTasks } from '../state.js';
import { tagUsage } from '../selectors.js';
import { esc, safeColor } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { confirmBox } from './components.js';

export function swatches(current, action, extra = '') {
  return `<div class="row-6 wrap" role="radiogroup" aria-label="Colore">${TAG_COLORS.map((c) =>
    `<button type="button" role="radio" aria-checked="${c === current}" class="swatch sm${c === current ? ' on' : ''}" style="background:${c}" data-action="${action}" data-value="${c}" ${extra} aria-label="Colore ${c}"></button>`).join('')}</div>`;
}

function kindLabel(c) { return (c.tipo === 'singola' ? 'Scelta singola' : 'Scelta multipla'); }

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
      <label class="field"><span>Tipo</span><span class="select-wrap"><select name="tipo"><option value="multipla">Scelta multipla</option><option value="singola">Scelta singola</option></select>${icon.chevron(12)}</span></label>
      <div class="row-8 end"><button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Crea</button></div>
    </form>` : `<button class="dashed-btn" data-action="edit" data-key="cat-new">${icon.plus(14)}Nuova categoria</button>`;

  let detail;
  if (sel === 'progetto') {
    detail = `
      <div class="cat-head"><div class="stack-4 grow"><h2 class="h2 lg">Progetto</h2><span class="muted small">Ogni task appartiene a un progetto. Si creano e modificano dalla sezione Progetti.</span></div>
        <span class="pill">Scelta singola</span><span class="pill">Obbligatoria</span></div>
      <div class="tag-row head"><span></span><span>NOME</span><span>DESCRIZIONE</span><span>APERTI</span><span>TOTALE</span><span></span></div>
      ${S.data.projects.map((p) => { const pt = projectTasks(p.codice); return `
        <div class="tag-row"><span class="swatch-static" style="background:${safeColor(p.colore)}"></span>
          <button class="link strong" data-action="go" data-view="project" data-code="${esc(p.codice)}">${esc(p.nome)}</button>
          <span class="ellipsis small">${esc((p.descrizione || '').split('\n')[0])}</span>
          <span>${openTasks(pt).length}</span><span class="muted">${pt.length}</span><span></span></div>`; }).join('')}
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
          <div class="field"><span>Colore</span>${swatches(S.ui.tagColor || t.colore, 'tag-color')}</div>
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
        <div class="field"><span>Colore</span>${swatches(S.ui.tagColor || TAG_COLORS[c.tags.length % TAG_COLORS.length], 'tag-color')}</div>
        <div class="row-8 end"><button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Aggiungi</button></div>
      </form>` : `<button class="add-row" data-action="edit" data-key="tag-new">${icon.plus(14)}Aggiungi ${c.id === 'stato' ? 'uno stato' : c.id === 'priorita' ? 'un livello' : 'un tag'}</button>`;
    const head = editingCat ? `
      <form class="cat-head form" data-submit="save-category" data-cat="${esc(c.id)}">
        <label class="field grow"><span>Nome</span><input name="nome" required value="${esc(c.nome)}"></label>
        ${c.sistema ? '' : `<label class="field"><span>Tipo</span><span class="select-wrap"><select name="tipo"><option value="multipla"${c.tipo !== 'singola' ? ' selected' : ''}>Scelta multipla</option><option value="singola"${c.tipo === 'singola' ? ' selected' : ''}>Scelta singola</option></select>${icon.chevron(12)}</span></label>`}
        <label class="field grow2"><span>Descrizione</span><input name="descrizione" value="${esc(c.descrizione)}"></label>
        <div class="row-8 self-end">
          ${c.sistema || confirmCat ? '' : `<button type="button" class="btn-link small danger-text" data-action="ask-confirm" data-key="cat:${esc(c.id)}">Elimina</button>`}
          <button type="button" class="btn small" data-action="cancel-edit">Annulla</button><button class="btn primary small">Salva</button></div>
        ${confirmCat ? `<div class="full-row">${confirmBox(`Eliminare «${c.nome}»? ${catUsed ? `Il valore viene tolto da ${catUsed} task. ` : ''}Potrai ripristinarla dal Cestino.`, `data-action="category-delete" data-cat="${esc(c.id)}"`)}</div>` : ''}
      </form>` : `
      <div class="cat-head"><div class="stack-4 grow"><h2 class="h2 lg">${esc(c.nome)}</h2><span class="muted small">${esc(c.descrizione || '')}</span></div>
        <span class="pill">${kindLabel(c)}</span>${c.sistema ? '<span class="pill">Di sistema</span>' : ''}
        <button class="btn small" data-action="edit" data-key="cat-edit">Impostazioni</button></div>`;
    detail = `${head}
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
