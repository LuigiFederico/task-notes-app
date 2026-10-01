// Disposizione della finestra: sidebar richiudibile. Preferenza solo di questo PC (vedi saveView in state.js).
import { S, saveView } from '../state.js';
import { render } from '../core.js';

export const actions = {
  'toggle-sidebar': () => { S.ui.sideCollapsed = !S.ui.sideCollapsed; saveView(); render(); }
};
