// Icone a tratto, ereditano il colore del testo.
// Geometria da Animate UI (https://animate-ui.com, MIT + Commons Clause, © 2025 Elliot Sutton) e,
// dove Animate UI non ha l'icona, da Lucide (https://lucide.dev, ISC, © Lucide Icons and Contributors).
// Le animazioni sono in animations.css: le parti animate hanno le classi p1, p2…; le icone "draw"
// ridisegnano il tratto (l'animazione generica "path" di Animate UI) e per questo hanno pathLength="1".
const svg = (name, d, size = 18, sw = 1.8) => `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const draw = (name, d, size, sw) => svg(`${name} ic-draw`, d.replace(/<(path|rect|circle|line)\b/g, '$& pathLength="1"'), size, sw);

export const icon = {
  book: (s) => svg('book', '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z"/><path d="M6 3v18"/><path d="M10 8h5M10 12h5"/>', s, 2),
  tasks: (s) => svg('tasks', '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path class="p1" pathLength="1" d="m9 11 3 3L22 4"/>', s),
  folder: (s) => draw('folder', '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>', s),
  tag: (s) => draw('tag', '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>', s),
  settings: (s) => svg('settings', '<path class="p1" d="M3 5H10"/><path class="p2" d="M14 3V7"/><path class="p3" d="M14 5H21"/><path class="p4" d="M3 12H8"/><path class="p5" d="M8 10V14"/><path class="p6" d="M12 12H21"/><path class="p7" d="M3 19H12"/><path class="p8" d="M16 17V21"/><path class="p9" d="M16 19H21"/>', s),
  search: (s) => svg('search', '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', s),
  plus: (s) => svg('plus', '<path class="p1" d="M12 19V5"/><path class="p2" d="M5 12h14"/>', s, 2),
  check: (s) => svg('check', '<path pathLength="1" d="m4 12 5 5L20 6"/>', s, 3),
  close: (s) => svg('close', '<path class="p1" d="M6 18 18 6"/><path class="p2" d="m6 6 12 12"/>', s),
  chevron: (s) => svg('chevron', '<path class="p1" d="m6 9 6 6 6-6"/>', s, 2),
  calendar: (s) => draw('calendar', '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>', s),
  file: (s) => draw('file', '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>', s),
  edit: (s) => draw('edit', '<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>', s),
  trash: (s) => svg('trash', '<g class="p1"><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M3 6h18"/></g><path class="p2" d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path class="p3" d="M10 11v6"/><path class="p3" d="M14 11v6"/>', s),
  clock: (s) => svg('clock', '<circle cx="12" cy="12" r="10"/><path d="m12 12 4 2"/><path d="M12 6v6"/>', s, 2),
  external: (s) => svg('external', '<g class="p1"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></g><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', s),
  note: (s) => svg('note', '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path class="p1" pathLength="1" d="M8 11h.01"/><path class="p2" pathLength="1" d="M12 11h4"/><path class="p3" pathLength="1" d="M8 16h.01"/><path class="p4" pathLength="1" d="M12 16h4"/>', s),
  sidebar: (s) => svg('sidebar', '<rect width="18" height="18" x="3" y="3" rx="2"/><path class="p1" d="M9 3v18"/><path class="p2" d="m16 15-3-3 3-3"/>', s),
  sidebarOpen: (s) => svg('sidebar-open', '<rect width="18" height="18" x="3" y="3" rx="2"/><path class="p1" d="M9 3v18"/><path class="p2" d="m14 9 3 3-3 3"/>', s),
  graph: (s) => svg('graph', '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>', s),
  arrow: (s) => svg('arrow', '<g class="p1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></g>', s, 2),
  up: (s) => svg('up', '<g class="p1"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></g>', s, 2),
  down: (s) => svg('down', '<g class="p1"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></g>', s, 2)
};
