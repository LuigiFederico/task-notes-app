import { S, activeProjects, openCount, openTasks } from '../state.js';
import { esc, safeColor } from '../lib/util.js';
import { icon } from '../lib/icons.js';

function shortPath(p) {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  const od = parts.findIndex((x) => /^OneDrive/i.test(x));
  if (od !== -1) return 'OneDrive › ' + parts.slice(od + 1).join(' › ');
  return parts.slice(-2).join(' › ');
}

export function sidebar() {
  const v = S.view.name;
  const openTotal = openTasks().length;
  // Da chiusa restano icone e pallini: il nome (e il conteggio) va nel tooltip.
  const closed = S.ui.sideCollapsed;
  const tip = (text) => (closed ? ` title="${esc(text)}"` : '');
  const nav = (name, label, ic, count, active) => `
    <button class="nav-item${active ? ' active' : ''}" data-action="go" data-view="${name}" ${active ? 'aria-current="page"' : ''}${tip(count != null ? `${label} · ${count}` : label)}>
      ${ic}<span class="grow">${label}</span>${count != null ? `<span class="count">${count}</span>` : ''}
    </button>`;
  const projects = activeProjects().map((p) => {
    const active = v === 'project' && S.view.code === p.codice;
    return `<button class="side-project${active ? ' active' : ''}" data-action="go" data-view="project" data-code="${esc(p.codice)}"${tip(p.nome)}>
      <span class="dot" style="background:${safeColor(p.colore)}"></span><span class="grow ellipsis">${esc(p.nome)}</span><span class="count">${openCount(p.codice)}</span>
    </button>`;
  }).join('');
  return `
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">${icon.book(18)}</div><span class="brand-name">Taccuino</span>
      <button id="side-toggle" class="icon-btn sm side-toggle" data-action="toggle-sidebar" aria-expanded="${!closed}" aria-label="${closed ? 'Apri il menu' : 'Chiudi il menu'}" title="${closed ? 'Apri il menu' : 'Chiudi il menu'}">${icon.sidebar(16)}</button></div>
    <button class="folder-pill" data-action="go" data-view="settings" title="${esc(S.data.dir)}">
      ${icon.folder(14)}<span class="grow ellipsis mono">${esc(shortPath(S.data.dir))}</span><span class="sync-dot" aria-label="Cartella collegata"></span>
    </button>
    <nav aria-label="Sezioni" class="nav">
      ${nav('tasks', 'Task', icon.tasks(18), openTotal, v === 'tasks')}
      ${nav('notes', 'Appunti', icon.note(18), S.data.notes.length, v === 'notes')}
      ${nav('graph', 'Grafo', icon.graph(18), null, v === 'graph')}
      ${nav('projects', 'Progetti', icon.folder(18), activeProjects().length, v === 'projects' || v === 'project')}
      ${nav('tags', 'Tag', icon.tag(18), null, v === 'tags' || v === 'tag')}
    </nav>
    <div class="side-section">
      <div class="side-label">PROGETTI</div>
      ${projects}
      <button class="side-project muted" data-action="new-project"${tip('Nuovo progetto')}>${icon.plus(12)}<span>Nuovo progetto</span></button>
    </div>
    <div class="grow"></div>
    ${nav('settings', 'Impostazioni', icon.settings(18), null, v === 'settings')}
  </aside>`;
}
