// Disposizione della finestra: sidebar richiudibile e larghezza del pannello. Preferenze solo di questo PC (vedi saveView in state.js).
import { S, saveView } from '../state.js';
import { render, clampPanel, applyPanelWidth, autosizeTitle } from '../core.js';

export const actions = {
  'toggle-sidebar': () => { S.ui.sideCollapsed = !S.ui.sideCollapsed; saveView(); render(); }
};

// Trascinando il bordo sinistro del pannello la larghezza cambia subito, senza render; si ricorda al rilascio.
// S.ui.panelWidth si aggiorna a ogni passo, così anche un render a metà trascinamento la mantiene.
export function startPanelResize(e) {
  const handle = e.target.closest('.panel-resize');
  if (!handle || e.button !== 0) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  const move = (ev) => { S.ui.panelWidth = clampPanel(window.innerWidth - ev.clientX); applyPanelWidth(); autosizeTitle(); };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', () => {
    handle.removeEventListener('pointermove', move);
    document.body.classList.remove('resizing');
    saveView();
  }, { once: true });
}
