# Taccuino

Task manager personale per Windows che sostituisce l'agenda cartacea. Gestisce task, progetti (con descrizione e registro delle decisioni) e tag personalizzabili.

Tutti i dati sono **file Markdown in una cartella a tua scelta**, per esempio in OneDrive. L'app non usa database né servizi esterni. Va in rete solo quando premi "Controlla aggiornamenti" nelle Impostazioni.

## Requisiti

- Windows 10 o 11
- [Node.js](https://nodejs.org) 20 o superiore (versione LTS), necessario solo per sviluppare e compilare

## Avvio in sviluppo

```powershell
cd task-notes-app
npm install
npm start
```

Al primo avvio l'app chiede quale cartella usare per i dati. Se la cartella è nuova, crea la struttura, gli stati, le priorità e un progetto "Generale".

- `F5` ricarica l'interfaccia (in sviluppo è utile dopo aver modificato i file dell'interfaccia).
- `Ctrl+Shift+I` apre gli strumenti per sviluppatori (solo in sviluppo).

## Test

```powershell
npm test
```

I test coprono lettura e scrittura dei file (front matter, task, progetti, decisioni, storico, unione ed eliminazione dei tag, cestino, riprova della scrittura) e le funzioni di lettura dell'interfaccia (ordinamento, filtri, raggruppamenti, scadenze, markdown).

## Creare l'eseguibile

```powershell
npm run dist
```

In `dist/` trovi due file:

- l'installer (`Taccuino Setup x.y.z.exe`);
- una versione portabile (`Taccuino x.y.z.exe`), che non richiede installazione.

Gli eseguibili non sono firmati digitalmente, quindi al primo avvio Windows SmartScreen può mostrare un avviso: usa "Ulteriori informazioni" › "Esegui comunque".

## Pubblicare un aggiornamento

Le versioni si pubblicano come [release su GitHub](https://github.com/LuigiFederico/task-notes-app/releases). Con il push di un tag `v*`, GitHub Actions (`.github/workflows/release.yml`) compila installer e portabile su Windows e crea la release.

```powershell
npm test
npm version minor        # oppure patch: aggiorna package.json, fa il commit e crea il tag (es. v0.2.0)
git push --follow-tags
```

Nell'app, Impostazioni › Aggiornamenti › "Controlla aggiornamenti" scarica la versione nuova. "Riavvia e installa" la installa in silenzio e riapre l'app. I dati non cambiano: stanno nella cartella dati, e le impostazioni locali in `%APPDATA%\Taccuino`.

Si aggiorna da sola solo la copia installata con `Taccuino Setup x.y.z.exe`. La versione portabile, lo zip e `npm start` mostrano un avviso al posto del pulsante.

## Struttura del codice

```
src/
  main/            processo principale di Electron (Node)
    main.js        finestra, impostazioni locali, canali IPC, osservazione della cartella
    updater.js     aggiornamenti da GitHub Releases
    preload.js     API esposta all'interfaccia (window.api), niente accesso diretto a Node
    store.js       lettura/scrittura di task, progetti, categorie e tag, regole sui dati, cestino
    formats.js     formato dei file di task, progetti, categorie e tag (funzioni pure)
    fsutil.js      scrittura atomica e riprova quando OneDrive blocca un file
    frontmatter.js parser/serializer del front matter YAML (sottoinsieme)
  renderer/        interfaccia (HTML + CSS + moduli JS, nessun passaggio di build)
    app.js         avvio, collegamento degli eventi agli handler, scorciatoie
    core.js        render, ricarica dai file, avvisi ed errori
    handlers/      azioni dell'utente, un file per argomento (task, progetti, tag, impostazioni…)
    state.js       stato dell'interfaccia e funzioni di lettura sui dati
    selectors.js   letture che dipendono da filtri, pannello aperto o data di oggi
    views/         una vista per schermata (task, dettaglio, progetti, progetto, tag…) e components.js
    lib/           utilità (date, markdown, icone)
test/              test con node:test
```

Le impostazioni locali (cartella scelta, dimensione della finestra) sono in `%APPDATA%\Taccuino\config.json` e non finiscono nella cartella dati.

## Il corvo

La mascotte vive in basso a destra e reagisce alle azioni:

| Evento | Posa |
|---|---|
| Nessuna azione | riposo (respira piano) |
| Task creato | vola → annota (foglietto nel becco) |
| Task completato | festeggia (saltello); "Tutto fatto!" e poi dorme quando non restano task aperti |
| Task messo "In attesa" | aspetta |
| Scadenza superata (all'avvio o impostando una data passata) | allarme |
| Ricerca in corso / senza risultati | cerca / pensa |
| Errore | pensa |

Le immagini sono in `src/renderer/assets/mascotte/`, la logica in `src/renderer/mascot.js` (tabella `REACTIONS`) e le animazioni in fondo a `styles.css`. Nelle Impostazioni si può nascondere il corvo o attivare il movimento ridotto, che si attiva da solo anche quando Windows ha le animazioni disattivate.

## Formato dei dati

```
<cartella dati>/
  taccuino.json                  marcatore della cartella, ultimo ID di task cancellato, migrazioni già fatte
  tasks/T-042.md                 un file per task
  projects/VEND.md               un file per progetto
  tags/<categoria>/_categoria.md impostazioni della categoria
  tags/<categoria>/<tag>.md      un file per tag, con la descrizione nel corpo
  .cestino/<data_ora>/…          elementi eliminati, con voce.json
```

### Task

```markdown
---
id: T-042
titolo: Preparare slide review KPI e-commerce
progetto: ECOM
stato: in-corso
priorita: alta
scadenza: 2026-09-29
creato: 2026-09-24
aggiornato: 2026-09-28
completato:
etichette:
  - riunione
storico:
  - 2026-09-24 Creato
  - 2026-09-28 Stato: Da fare → In corso
---

Descrizione libera in Markdown.
```

Ogni categoria di tag creata dall'utente (es. `contesto`) diventa una chiave del front matter con lo stesso nome. Il valore è una lista se la categoria è "a scelta multipla" o "a testo libero".

### Progetto

```markdown
---
codice: VEND
nome: Dashboard vendite
colore: "#2F5BD3"
stato: attivo        # oppure archiviato
creato: 2026-09-02
ordine: 1            # posizione scelta nella sezione Tag (vuoto: in fondo, per nome)
---

## Descrizione

Testo in Markdown.

## Decisioni

### 2026-09-22 · Fonte unica: il datamart vendite

Niente estrazioni manuali da Excel.

Task: T-029
```

### Categorie e tag

- **Stato** e **Priorità** sono categorie di sistema: si possono rinominare, ricolorare e riordinare, ma non eliminare. Gli stati con `chiuso: true` (di serie solo "Fatto") nascondono il task dalla lista principale, che resta comunque visibile nello storico e nelle pagine di progetto e tag.
- Le priorità di serie sono Urgente, Alta, Media, Bassa e Backlog: l'ordine dei valori decide l'ordinamento della lista, e i task senza priorità vanno dopo l'ultimo livello. Le cartelle create prima di Urgente e Backlog li ricevono una volta sola all'avvio (la migrazione resta segnata in `migrazioni` di `taccuino.json`), quindi se poi li elimini non tornano.
- Le altre categorie (di serie "Etichette") si creano, modificano ed eliminano dalla sezione Tag.
- L'ID di un tag è il nome del file e non cambia se lo rinomini, quindi i task non vanno aggiornati.
- Una categoria **a testo libero** (`tipo: testo`, es. "Ticket Jira") non ha file per i valori: ogni task scrive i suoi valori a mano, come lista (`ticket-jira: [PROJ-123]`). Con un modello `url: https://jira.example.com/browse/{valore}` in `_categoria.md` ogni valore diventa un link; un valore che è già un indirizzo web lo è comunque. Queste categorie compaiono solo nel pannello del task, non nei filtri, nei raggruppamenti o nella ricerca.

### Cestino

Task, progetti, tag e categorie eliminati non vengono cancellati: finiscono in `.cestino/<data_ora>/`, con lo stesso percorso che avevano (es. `.cestino/2026-09-29_143205/tasks/T-042.md`) e un `voce.json` che dice cos'erano. Dalla sezione Cestino di Impostazioni si ripristinano o si eliminano per sempre. All'avvio, gli elementi eliminati da più di 30 giorni vengono cancellati.

- Il ripristino si ferma se nel frattempo esiste già un file con lo stesso nome, o se il tag appartiene a una categoria che non c'è più.
- Eliminando un tag o una categoria, il valore viene tolto dai task, e ripristinandoli non torna.
- Gli ID dei task non vengono mai riusati: il prossimo ID tiene conto anche dei task nel cestino e, dopo lo svuotamento, di `ultimoId` in `taccuino.json`.

I file si possono modificare anche a mano. L'app si accorge dei cambiamenti (anche quelli sincronizzati da OneDrive da un altro PC) e ricarica i dati.

## Note su OneDrive

- Salvare ogni elemento in un file separato riduce i conflitti tra PC.
- Se OneDrive crea una copia di conflitto (es. `T-042-PC-NAME.md`), l'app la mostra come un task a parte: tieni la versione giusta ed elimina l'altra.
- La scrittura è atomica: prima un file temporaneo, poi la rinomina. Così OneDrive non sincronizza mai un file scritto a metà. Se OneDrive tiene bloccato il file, la rinomina viene riprovata per circa un secondo prima di mostrare l'errore.
