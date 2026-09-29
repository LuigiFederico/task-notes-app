import { S, project, projectTasks, isClosed, sortTasks, PROJECT_COLORS } from '../state.js';
import { esc, safeColor, md, fmtFull, todayISO } from '../lib/util.js';
import { icon } from '../lib/icons.js';
import { taskRow, taskHeader, segmented, emptyState, confirmBox } from './components.js';
import { kpiTile } from './projects.js';

function colorPicker(current, action) {
  return `<div class="row-8" role="radiogroup" aria-label="Colore">${PROJECT_COLORS.map((c) =>
    `<button role="radio" aria-checked="${c === current}" class="swatch${c === current ? ' on' : ''}" style="background:${c}" data-action="${action}" data-value="${c}" aria-label="Colore ${c}"></button>`).join('')}</div>`;
}

export function newProjectView() {
  const d = S.ui.projectDraft || { nome: '', codice: '', colore: PROJECT_COLORS[S.data.projects.length % PROJECT_COLORS.length], descrizione: '' };
  S.ui.projectDraft = d;
  return `
  <div class="page narrow">
    <nav class="crumbs"><button data-action="go" data-view="projects">Progetti</button><span>/</span><span>Nuovo progetto</span></nav>
    <h1 class="display">Nuovo progetto</h1>
    <form class="card pad stack-16 form" data-submit="create-project">
      <label class="field"><span>Nome</span><input name="nome" required value="${esc(d.nome)}" data-input="project-draft" data-field="nome" placeholder="Es. Dashboard vendite" autofocus></label>
      <label class="field"><span>Codice (tag del progetto)</span><input name="codice" required maxlength="8" value="${esc(d.codice)}" data-input="project-draft" data-field="codice" class="mono" placeholder="VEND"><small class="muted">Da 2 a 8 lettere o numeri. Dà il nome al file e non si può cambiare in seguito.</small></label>
      <div class="field"><span>Colore</span>${colorPicker(d.colore, 'draft-color')}</div>
      <label class="field"><span>Descrizione</span><textarea name="descrizione" rows="5" data-input="project-draft" data-field="descrizione" placeholder="A cosa serve il progetto (Markdown)">${esc(d.descrizione)}</textarea></label>
      <div class="row-10 end"><button type="button" class="btn" data-action="go" data-view="projects">Annulla</button><button type="submit" class="btn primary">Crea progetto</button></div>
    </form>
  </div>`;
}

export function projectView(code) {
  const p = project(code);
  if (!p) return `<div class="page">${emptyState('Progetto non trovato.')}</div>`;
  const c = safeColor(p.colore);
  const all = projectTasks(code);
  const open = all.filter((t) => !isClosed(t));
  const done = all.length - open.length;
  const late = open.filter((t) => t.scadenza && t.scadenza < todayISO()).length;
  const tab = S.ui.projectTab;
  const shown = sortTasks(all.filter((t) => tab === 'all' || (tab === 'open' ? !isClosed(t) : isClosed(t))));
  const editHead = S.ui.editing === 'project-head';
  const editDesc = S.ui.editing === 'project-desc';
  const addDec = S.ui.editing === 'decision-new';
  const confirmDel = S.ui.confirm === 'project:' + code;

  const head = editHead ? `
    <form class="card pad stack-16 form" data-submit="save-project-head">
      <div class="row-16 wrap">
        <label class="field grow"><span>Nome</span><input name="nome" required value="${esc(p.nome)}"></label>
        <label class="field"><span>Stato</span><span class="select-wrap"><select name="stato"><option value="attivo"${p.stato !== 'archiviato' ? ' selected' : ''}>Attivo</option><option value="archiviato"${p.stato === 'archiviato' ? ' selected' : ''}>Archiviato</option></select>${icon.chevron(12)}</span></label>
      </div>
      <div class="field"><span>Colore</span>${colorPicker(p.colore, 'project-color')}</div>
      ${confirmDel ? confirmBox(`Eliminare «${p.nome}»? Potrai ripristinarlo dal Cestino.`, 'data-action="project-delete"') : ''}
      <div class="row-10">
        ${all.length === 0 ? (confirmDel ? '' : `<button type="button" class="btn-link danger-text" data-action="ask-confirm" data-key="project:${esc(code)}">Elimina progetto</button>`) : '<span class="muted small">Un progetto con task si può archiviare, non eliminare.</span>'}
        <span class="grow"></span><button type="button" class="btn" data-action="cancel-edit">Annulla</button><button type="submit" class="btn primary">Salva</button>
      </div>
    </form>` : `
    <div class="row-between start">
      <div class="row-16">
        <div class="code-square" style="background:${c}">${esc(p.codice)}</div>
        <div class="stack-6">
          <h1 class="display">${esc(p.nome)}</h1>
          <div class="row-10 muted small wrap">
            <span class="pill" style="${p.stato === 'archiviato' ? '' : 'color:#146C43;background:#E3F2EA'}">${p.stato === 'archiviato' ? 'Archiviato' : 'Attivo'}</span>
            <span>Tag progetto <span class="mono strong">${esc(p.codice)}</span></span><span>·</span><span>Creato ${esc(fmtFull(p.creato))}</span>
          </div>
        </div>
      </div>
      <div class="row-8"><button class="btn" data-action="edit" data-key="project-head">Modifica</button><button class="btn primary" data-action="new-task" data-code="${esc(code)}">${icon.plus(16)}Nuovo task</button></div>
    </div>`;

  const decisions = p.decisioni.map((d, i) => `
    <li class="decision">
      <div class="rail"><span class="dot round" style="background:${i === 0 ? c : 'var(--line-strong)'}"></span>${i < p.decisioni.length - 1 ? '<span class="line"></span>' : ''}</div>
      <div class="stack-4 grow">
        <div class="row-between"><span class="mono muted small">${esc(fmtFull(d.data))}</span>
          ${S.ui.confirm === `decision:${i}` ? '' : `<button class="icon-btn sm" data-action="ask-confirm" data-key="decision:${i}" aria-label="Elimina decisione">${icon.trash(14)}</button>`}</div>
        <span class="strong">${esc(d.titolo)}</span>
        ${S.ui.confirm === `decision:${i}` ? confirmBox('Eliminare questa decisione?', `data-action="decision-delete" data-index="${i}"`) : ''}
        ${d.testo ? `<div class="md small-md">${md(d.testo)}</div>` : ''}
        ${d.task ? `<button class="btn-link small" data-action="open-task" data-id="${esc(d.task)}">Da ${esc(d.task)}</button>` : ''}
      </div>
    </li>`).join('');

  const decForm = addDec ? `
    <form class="stack-10 form dec-form" data-submit="add-decision">
      <div class="row-8"><label class="field"><span>Data</span><input type="date" name="data" value="${todayISO()}" required></label>
        <label class="field grow"><span>Task collegato</span><span class="select-wrap"><select name="task"><option value="">Nessuno</option>${sortTasks(all).map((t) => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.titolo)}</option>`).join('')}</select>${icon.chevron(12)}</span></label></div>
      <label class="field"><span>Decisione</span><input name="titolo" required placeholder="Cosa è stato deciso" autofocus></label>
      <label class="field"><span>Dettagli</span><textarea name="testo" rows="3" placeholder="Perché, alternative scartate… (facoltativo)"></textarea></label>
      <div class="row-8 end"><button type="button" class="btn" data-action="cancel-edit">Annulla</button><button type="submit" class="btn primary">Registra</button></div>
    </form>` : `<button class="dashed-btn" data-action="edit" data-key="decision-new">${icon.plus(14)}Registra una decisione</button>`;

  return `
  <div class="page">
    <nav class="crumbs"><button data-action="go" data-view="projects">Progetti</button><span>/</span><span>${esc(p.nome)}</span></nav>
    ${head}
    <div class="scroll">
      <div class="project-grid">
        <div class="stack-20 minw0">
          <div class="grid-4 compact">
            ${kpiTile('Aperti', open.length, late ? `${late} in ritardo` : 'Nessuno in ritardo', late ? 'late' : 'muted')}
            ${kpiTile('Completati', done, `su ${all.length} totali`, 'muted')}
            ${kpiTile('Avanzamento', (all.length ? Math.round((done / all.length) * 100) : 0) + '%', `<span class="progress"><span style="width:${all.length ? (done / all.length) * 100 : 0}%;background:${c}"></span></span>`)}
            ${kpiTile('Decisioni', p.decisioni.length, p.decisioni[0] ? 'Ultima ' + esc(fmtFull(p.decisioni[0].data)) : 'Nessuna', 'muted')}
          </div>
          <section class="card pad stack-10">
            <div class="row-between"><h2 class="section-label">DESCRIZIONE</h2>${editDesc ? '' : '<button class="btn-link small" data-action="edit" data-key="project-desc">Modifica</button>'}</div>
            ${editDesc ? `<form class="stack-10" data-submit="save-project-desc"><textarea name="descrizione" rows="6" autofocus>${esc(p.descrizione)}</textarea><div class="row-8 end"><button type="button" class="btn" data-action="cancel-edit">Annulla</button><button type="submit" class="btn primary">Salva</button></div></form>`
              : p.descrizione ? `<div class="md">${md(p.descrizione)}</div>` : '<p class="muted">Nessuna descrizione. Aggiungine una per ricordarti obiettivo e contesto.</p>'}
          </section>
          <section class="stack-12">
            <div class="row-between"><h2 class="h2">Task del progetto</h2>${segmented([['open', 'Aperti', open.length], ['done', 'Completati', done], ['all', 'Tutti', all.length]], tab, 'project-tab', 'Filtro task')}</div>
            ${shown.length ? `${taskHeader(false)}<div class="card list">${shown.map((t) => taskRow(t, { showProject: false })).join('')}</div>` : emptyState(tab === 'done' ? 'Ancora nessun task completato.' : 'Nessun task aperto.')}
          </section>
        </div>
        <section class="card pad stack-14 decisions" aria-label="Decisioni prese">
          <div class="row-between"><h2 class="h2">Decisioni prese</h2><span class="muted small">${p.decisioni.length}</span></div>
          ${decForm}
          ${p.decisioni.length ? `<ol class="timeline">${decisions}</ol>` : '<p class="muted small">Tieni traccia qui di cosa è stato deciso, quando e perché.</p>'}
        </section>
      </div>
    </div>
  </div>`;
}
