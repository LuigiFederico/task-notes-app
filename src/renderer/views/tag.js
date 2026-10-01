import { S, cat, project, isClosed, sortTasks, openTasks, TAG_COLORS } from '../state.js';
import { esc, safeColor, tint, md, fmtFull } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { tagUsage } from '../selectors.js';
import { taskRow, taskHeader, emptyState, confirmBox, colorPicker, options } from './components.js';

export function tagView(catId, tagId) {
  const c = cat(catId);
  const t = c && c.tags.find((x) => x.id === tagId);
  if (!t) return `<div class="page">${emptyState('Tag non trovato.')}</div>`;
  const u = tagUsage(catId, tagId);
  const col = safeColor(t.colore);
  const open = sortTasks(openTasks(u.list));
  const closed = sortTasks(u.list.filter((x) => isClosed(x)));
  const byProject = {};
  for (const x of u.list) byProject[x.progetto] = (byProject[x.progetto] || 0) + 1;
  const editDesc = S.ui.editing === 'tag-desc';
  const label = catId === 'etichette' ? '#' + t.nome : t.nome;
  const others = c.tags.filter((x) => x.id !== tagId);
  const confirmDel = S.ui.confirm === 'tag:' + tagId;
  const mergeTo = S.ui.confirm === 'merge:' + tagId ? others.find((x) => x.id === S.ui.mergeTo) : null;
  const attrs = `data-cat="${esc(catId)}" data-tag="${esc(tagId)}"`;
  let del;
  if (c.sistema && u.total) del = `<p class="muted small">Usato da ${u.total} task: per eliminarlo usa «Unisci con…» e scegli dove spostarli.</p>`;
  else if (confirmDel) del = confirmBox(`Eliminare «${t.nome}»? ${u.total ? `Viene tolto da ${u.total} task. ` : ''}Potrai ripristinarlo dal Cestino.`, `data-action="tag-delete" ${attrs}`);
  else del = `<button class="btn-link danger-text small self-start" data-action="ask-confirm" data-key="tag:${esc(tagId)}">Elimina tag</button>`;
  return `
  <div class="page">
    <nav class="crumbs"><button data-action="go" data-view="tags" data-cat="progetto">Tag</button><span>/</span><button data-action="go" data-view="tags" data-cat="${esc(catId)}">${esc(c.nome)}</button><span>/</span><span>${esc(t.nome)}</span></nav>
    <div class="row-between start">
      <div class="row-16">
        <div class="tag-square" style="color:${col};background:${tint(col, '1F')}">${icon.tag(24)}</div>
        <div class="stack-6"><h1 class="display">${esc(label)}</h1>
          <div class="row-10 muted small"><span>Categoria <span class="strong">${esc(c.nome)}</span></span><span>·</span><span>${u.open} aperti · ${u.total - u.open} chiusi</span><span>·</span><span>Usato in ${Object.keys(byProject).length} progetti</span></div></div>
      </div>
      ${others.length ? `<label class="filter"><span class="sr">Unisci con</span><select id="tag-merge" data-change="tag-merge" data-cat="${esc(catId)}" data-tag="${esc(tagId)}"><option value="">Unisci con…</option>${options(others.map((x) => [x.id, x.nome]), mergeTo && mergeTo.id)}</select>${icon.chevron(12)}</label>` : ''}
    </div>
    ${mergeTo ? confirmBox(`Spostare ${u.total} task da «${t.nome}» a «${mergeTo.nome}» ed eliminare «${t.nome}»?`, `data-action="tag-merge-confirm" ${attrs} data-to="${esc(mergeTo.id)}"`, 'Unisci') : ''}
    <div class="scroll">
      <div class="tag-grid">
        <div class="stack-20 minw0">
          <section class="card pad stack-10">
            <div class="row-between"><h2 class="section-label">A COSA SERVE</h2>${editDesc ? '' : '<button class="btn-link small" data-action="edit" data-key="tag-desc">Modifica</button>'}</div>
            ${editDesc ? `<form class="stack-10" data-submit="save-tag-desc" data-cat="${esc(catId)}" data-tag="${esc(tagId)}"><textarea name="descrizione" rows="6" autofocus>${esc(t.descrizione)}</textarea><div class="row-8 end"><button type="button" class="btn" data-action="cancel-edit">Annulla</button><button class="btn primary">Salva</button></div></form>`
              : t.descrizione ? `<div class="md">${md(t.descrizione)}</div>` : '<p class="muted">Descrivi quando usare questo tag, così resta coerente nel tempo.</p>'}
          </section>
          <section class="stack-12">
            <h2 class="h2">Task con questo tag</h2>
            ${u.total ? `${taskHeader({ showPrio: false })}<div class="card list">
              <div class="list-sub">APERTI · ${open.length}</div>${open.map((x) => taskRow(x, { showPrio: false })).join('')}
              <div class="list-sub">CHIUSI · ${closed.length}</div>${closed.map((x) => taskRow(x, { showPrio: false })).join('')}</div>` : emptyState('Nessun task usa ancora questo tag.')}
          </section>
        </div>
        <aside class="card pad stack-16 self-start" aria-label="Proprietà del tag">
          <h2 class="section-label">PROPRIETÀ</h2>
          <label class="field"><span>Nome</span><input value="${esc(t.nome)}" data-change="tag-rename" data-cat="${esc(catId)}" data-tag="${esc(tagId)}"></label>
          ${catId === 'collegamento' ? `<label class="field"><span>Nome inverso</span><input value="${esc(t.inverso || '')}" placeholder="${esc(t.nome)}" data-change="tag-inverse" ${attrs}></label>` : ''}
          <div class="field"><span>Colore</span>${colorPicker(TAG_COLORS, t.colore, 'tag-page-color', { small: true, attrs })}</div>
          <div class="kv small"><span class="muted">Categoria</span><span>${esc(c.nome)}</span><span class="muted">Creato</span><span>${esc(fmtFull(t.creato))}</span><span class="muted">File</span><span class="mono">tags/${esc(catId)}/${esc(tagId)}.md</span></div>
          ${Object.keys(byProject).length ? `<div class="hr"></div><div class="stack-10"><span class="muted small">Per progetto</span>${Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([code, n]) => { const p = project(code); return `<button class="row-8 link" data-action="go" data-view="project" data-code="${esc(code)}"><span class="dot sq" style="background:${safeColor(p ? p.colore : '')}"></span><span class="grow">${esc(p ? p.nome : code)}</span><span class="muted">${n}</span></button>`; }).join('')}</div>` : ''}
          ${del}
        </aside>
      </div>
    </div>
  </div>`;
}
