// Utilità condivise dall'interfaccia: escaping, date, markdown minimale.

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

// Markdown minimale e sicuro: paragrafi, elenchi, titoli, grassetto, corsivo, codice, link e menzioni @.
// refTitle(id) dà il titolo dell'elemento menzionato, oppure null se non esiste.
export function md(src, { refTitle = null } = {}) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(MENTION, (_, pre, id) => {
      const title = refTitle ? refTitle(id) : '';
      const miss = refTitle && title == null;
      return `${pre}<button type="button" class="mention${miss ? ' missing' : ''}" data-action="open-ref" data-id="${id}" title="${miss ? 'Non trovato' : esc(title || '')}">@${id}</button>`;
    });
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.tag}>`); list = null; } };
  for (const line of lines) {
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const hd = line.match(/^(#{1,3})\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
    } else if (hd) {
      flushPara(); flushList();
      out.push(`<h4>${inline(hd[2])}</h4>`);
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return out.join('');
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
