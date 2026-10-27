// Utilità condivise dall'interfaccia: escaping, date, Markdown.
import { Marked } from '../../../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../../../node_modules/dompurify/dist/purify.es.mjs';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Colori: accettiamo solo esadecimali, così un valore scritto a mano nei file non può iniettare CSS.
export function safeColor(c, fallback = '#6B675E') {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : fallback;
}

// Sfondo tenue di un colore già passato da safeColor: aggiunge l'alfa (es. '1A') solo ai #RRGGBB.
export function tint(c, alpha) {
  return c.length === 7 ? c + alpha : 'var(--chip)';
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayISO() { return iso(new Date()); }
export function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
export function weekStart(s) { const d = parseISO(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d); }

export function fmtShort(s) { if (!s) return '—'; const d = parseISO(s); return `${d.getDate()} ${MESI[d.getMonth()]}`; }
export function fmtFull(s) { if (!s) return '—'; const d = parseISO(s); return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`; }
export function fmtToday() { const d = new Date(); return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI_LUNGHI[d.getMonth()]}`; }
export function monthName(s) { return MESI_LUNGHI[parseISO(s).getMonth()]; }

// Fascia di scadenza rispetto a oggi.
export function dueBucket(due) {
  if (!due) return 'nessuna';
  const t = todayISO();
  if (due < t) return 'ritardo';
  if (due === t) return 'oggi';
  const end = addDays(weekStart(t), 6);
  if (due <= end) return 'settimana';
  return 'dopo';
}

export function dueLabel(due, closed) {
  if (!due) return { text: '—', cls: 'muted' };
  if (closed) return { text: fmtShort(due), cls: 'muted' };
  const b = dueBucket(due);
  if (b === 'ritardo') return { text: fmtShort(due) + ' · in ritardo', cls: 'late' };
  if (b === 'oggi') return { text: 'Oggi', cls: 'today' };
  if (due === addDays(todayISO(), 1)) return { text: 'Domani', cls: '' };
  return { text: fmtShort(due), cls: '' };
}

// Menzioni nel testo: @T-042 (task) e @A-007 (appunto), non attaccate a una parola o a un indirizzo (mail@T-1, …/@T-1).
const MENTION = /(^|[^\w@/.-])@([TA]-\d+)\b/g;

// ID menzionati in un testo, senza doppioni, nell'ordine in cui compaiono.
export function mentionsOf(src) {
  return Array.from(new Set(Array.from(String(src || '').matchAll(MENTION), (m) => m[2])));
}

// Markdown GFM (tabelle, checklist, codice, citazioni, barrato, link nudi…) con marked, poi ripulito da DOMPurify.
// Le librerie si caricano da node_modules come i font: il renderer non ha né bundler né rete.
const MD = new Marked({ gfm: true, breaks: true });
let ctx = null;   // opzioni della chiamata a md() in corso: marked è sincrono, quindi non si mescolano

MD.use({
  renderer: {
    // L'HTML scritto nel testo resta testo: niente sorprese nei file modificati a mano.
    html({ text, block }) { return block ? `<p>${esc(text.trim()).replace(/\n/g, '<br>')}</p>` : esc(text); },
    // Solo http e https diventano link, e si aprono nel browser (setWindowOpenHandler in main.js); le immagini non si caricano.
    link({ href, text, tokens, autolink }) {
      const label = autolink ? esc(text) : this.parser.parseInline(tokens);
      return /^https?:\/\//i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noreferrer">${label}</a>` : label;
    },
    image({ href, text }) {
      return /^https?:\/\//i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(text || href)}</a>` : esc(text);
    },
    heading({ tokens }) { return `<h4>${this.parser.parseInline(tokens)}</h4>`; },
    text(token) {
      if (token.tokens) return this.parser.parseInline(token.tokens);
      return mentions(token.escaped ? token.text : esc(token.text));
    },
    // La casella n del testo: con ctx.check è cliccabile (data-change) e il clic la riscrive con toggleCheck.
    checkbox({ checked }) {
      const n = ctx.checks++;
      return `<input type="checkbox" class="md-check" data-index="${n}"${checked ? ' checked' : ''}${ctx.check ? ` data-change="${ctx.check}" aria-label="Spunta la voce"` : ' disabled'}> `;
    }
  }
});

// Menzioni in un testo già passato da esc(). refTitle(id) dà il titolo dell'elemento menzionato, oppure null se non esiste.
function mentions(html) {
  const { refTitle } = ctx;
  return html.replace(MENTION, (_, pre, id) => {
    const title = refTitle ? refTitle(id) : '';
    const miss = refTitle && title == null;
    return `${pre}<button type="button" class="mention${miss ? ' missing' : ''}" data-action="open-ref" data-id="${id}" title="${miss ? 'Non trovato' : esc(title || '')}">@${id}</button>`;
  });
}

// check è il data-change delle caselle delle checklist; senza, le caselle si vedono ma non si cliccano.
export function md(src, { refTitle = null, check = '' } = {}) {
  ctx = { refTitle, check, checks: 0 };
  try {
    const html = MD.parse(String(src || ''));
    // Senza DOM (i test in Node) DOMPurify non c'è: l'HTML del testo è comunque già stato reso innocuo dal renderer.
    return DOMPurify.isSupported ? DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html;
  } finally { ctx = null; }
}

// Spunta (o toglie la spunta al)la casella n del testo, contata come fa md(). Ogni voce si cerca nel testo dalla
// prima riga del suo blocco in avanti, così le voci uguali, annidate o in una citazione cadono al posto giusto.
export function toggleCheck(src, n) {
  const text = String(src || '').replace(/\r\n?/g, '\n');
  let pos = 0;
  let k = 0;
  let out = null;
  for (const block of MD.lexer(text)) {
    let cur = pos;
    pos += block.raw.length;
    MD.walkTokens([block], (t) => {
      if (out != null || t.type !== 'list_item' || !t.task) return;
      const line = t.raw.split('\n')[0];
      const at = text.indexOf(line, cur);
      const box = at === -1 ? -1 : at + line.search(/\[[ xX]\]/);
      if (box >= at && at !== -1) cur = box + 3;
      if (k++ === n && at !== -1) out = text.slice(0, box) + (t.checked ? '[ ]' : '[x]') + text.slice(box + 3);
    });
    if (out != null) return out;
  }
  return text;
}

// Link di un valore di una categoria a testo: il modello con {valore} sostituito, oppure il valore stesso se è già un link.
// Solo http e https: qualsiasi altra cosa non diventa un link.
export function textLink(template, value) {
  const v = String(value || '').trim();
  let url = '';
  if (/^https?:\/\//i.test(v)) url = v;
  else if (template && v) url = template.includes('{valore}') ? template.split('{valore}').join(encodeURIComponent(v)) : template + encodeURIComponent(v);
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
}

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

// Sposta la voce in posizione from alla posizione to, nella lista stessa.
export function moveItem(list, from, to) {
  list.splice(to, 0, list.splice(from, 1)[0]);
  return list;
}

// Posizione in cui cade la voce trascinata: quante delle altre voci hanno il centro sopra y.
export function dropIndex(mids, y, from) {
  return mids.filter((m, k) => k !== from && m < y).length;
}
