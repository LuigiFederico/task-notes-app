// Il corvo: mascotte che reagisce alle azioni sui task.
// Vive fuori da #app, così i re-render dell'interfaccia non interrompono le animazioni.

const POSES = ['riposo', 'scrive', 'festeggia', 'attende', 'allarme', 'dorme', 'cerca', 'vola', 'pensa'];
const ALT = {
  riposo: 'Corvo a riposo', scrive: 'Corvo con un foglietto nel becco', festeggia: 'Corvo che festeggia',
  attende: 'Corvo in attesa', allarme: 'Corvo allarmato', dorme: 'Corvo che dorme',
  cerca: 'Corvo con la lente', vola: 'Corvo in volo', pensa: 'Corvo pensieroso'
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Sequenze per ogni evento: una o più pose, ciascuna con animazione, fumetto e durata.
const REACTIONS = {
  created: () => [{ pose: 'vola', anim: 'fly', ms: 900 }, { pose: 'scrive', anim: 'land', msg: pick(['Annotato!', 'In lista!', 'Segnato.']), ms: 1900 }],
  completed: (d) => [{ pose: 'festeggia', anim: 'hop', msg: d.streak % 5 === 0 ? 'Cinque di fila!' : pick(['Fatto!', 'Cra!', 'Uno in meno!']), ms: 1800 }],
  allDone: () => [{ pose: 'festeggia', anim: 'hop', msg: 'Tutto fatto!', ms: 1800 }, { pose: 'dorme', anim: 'pop', msg: 'Zzz…', ms: 1600 }],
  waiting: () => [{ pose: 'attende', anim: 'pop', msg: 'Aspettiamo…', ms: 2000 }],
  overdue: (d) => [{ pose: 'allarme', anim: 'shake', msg: d.count > 1 ? `${d.count} in ritardo!` : 'Uno è in ritardo!', ms: 2400 }],
  error: () => [{ pose: 'pensa', anim: 'pop', msg: 'Qualcosa non va…', ms: 2400 }],
  welcome: () => [{ pose: 'vola', anim: 'fly', ms: 900 }, { pose: 'riposo', anim: 'land', msg: 'Benvenuto!', ms: 2000 }],
  poke: () => [{ pose: pick(['festeggia', 'pensa', 'attende']), anim: 'pop', msg: pick(['Cra!', 'Eccomi.', 'Tutto sotto controllo.']), ms: 1500 }]
};

function readPrefs() {
  try { return JSON.parse(localStorage.getItem('taccuino.mascotte') || '{}'); } catch { return {}; }
}
function writePrefs(p) {
  try { localStorage.setItem('taccuino.mascotte', JSON.stringify(p)); } catch { /* preferenza solo locale */ }
}

export const mascot = {
  el: null,
  actor: null,
  bubble: null,
  imgs: {},
  base: 'riposo',
  current: null,     // posa della reazione in corso (null = posa di base)
  timers: [],
  streak: 0,
  prefs: { visible: true, reduced: false, ...readPrefs() },

  get reduced() {
    const sys = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return this.prefs.reduced || sys;
  },

  mount() {
    const el = document.createElement('div');
    el.id = 'mascot';
    el.className = 'mascot';
    el.innerHTML = `<div class="mascot-bubble" role="status" aria-live="polite"></div>
      <button class="mascot-actor idle" type="button" aria-label="Il corvo di Taccuino">${POSES.map((p) =>
        `<img src="assets/mascotte/corvo-${p}.png" alt="${ALT[p]}" data-pose="${p}" draggable="false">`).join('')}</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.actor = el.querySelector('.mascot-actor');
    this.bubble = el.querySelector('.mascot-bubble');
    el.querySelectorAll('img').forEach((img) => { this.imgs[img.dataset.pose] = img; });
    this.actor.addEventListener('click', () => this.react('poke'));
    this.show(this.base);
    this.applyVisibility();
  },

  setPrefs(patch) {
    this.prefs = { ...this.prefs, ...patch };
    writePrefs(this.prefs);
    this.applyVisibility();
  },

  applyVisibility() { if (this.el) this.el.hidden = !this.prefs.visible; },

  // Posizione: si sposta a sinistra quando il pannello di dettaglio è aperto.
  setLayout({ panelOpen, hidden }) {
    if (!this.el) return;
    this.el.classList.toggle('panel-open', !!panelOpen);
    this.el.classList.toggle('away', !!hidden);
  },

  setBase(pose) {
    if (!POSES.includes(pose) || pose === this.base) return;
    this.base = pose;
    if (!this.current) { this.show(pose); this.animate(pose === 'cerca' || pose === 'pensa' ? 'sway' : 'pop'); }
  },

  show(pose) {
    for (const [p, img] of Object.entries(this.imgs)) img.classList.toggle('on', p === pose);
  },

  animate(anim) {
    const a = this.actor;
    a.className = 'mascot-actor';
    if (this.reduced && anim !== 'idle' && anim !== 'sway') anim = 'nod';
    void a.offsetWidth; // riavvia l'animazione CSS
    a.classList.add(anim);
  },

  say(text, ms) {
    const b = this.bubble;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    b.style.animationDuration = Math.max(1200, ms) + 'ms';
  },

  react(event, data = {}) {
    if (!this.el || !this.prefs.visible) return;
    if (event === 'completed') { this.streak += 1; data.streak = this.streak; }
    const steps = (REACTIONS[event] || REACTIONS.poke)(data);
    this.timers.forEach(clearTimeout);
    this.timers = [];
    let t = 0;
    steps.forEach((s, i) => {
      const run = () => {
        this.current = s.pose;
        // con movimento ridotto il volo diventa un semplice cambio di posa
        if (this.reduced && s.anim === 'fly') return;
        this.show(s.pose);
        this.animate(s.anim);
        if (s.msg) this.say(s.msg, i === steps.length - 1 ? s.ms + 300 : s.ms);
      };
      if (i === 0) run(); else this.timers.push(setTimeout(run, t));
      t += this.reduced && s.anim === 'fly' ? 0 : s.ms;
    });
    this.timers.push(setTimeout(() => { this.current = null; this.show(this.base); this.animate(this.base === 'cerca' || this.base === 'pensa' ? 'sway' : 'idle'); }, t));
  }
};
