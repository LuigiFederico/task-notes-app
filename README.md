# Taccuino

Task manager personale per Windows che sostituisce l'agenda cartacea. Gestisce task, progetti (con descrizione e registro delle decisioni) e tag personalizzabili.

Tutti i dati sono **file Markdown in una cartella a tua scelta**, per esempio in OneDrive. L'app non usa database né servizi esterni.

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

I test coprono lettura e scrittura dei file: front matter, task, progetti, decisioni, unione ed eliminazione dei tag.

## Creare l'eseguibile

```powershell
npm run dist
```

In `dist/` trovi due file:

- l'installer (`Taccuino Setup x.y.z.exe`);
- una versione portabile (`Taccuino x.y.z.exe`), che non richiede installazione.

Gli eseguibili non sono firmati digitalmente, quindi al primo avvio Windows SmartScreen può mostrare un avviso: usa "Ulteriori informazioni" › "Esegui comunque".

## Struttura del codice

```
src/
  main/            processo principale di Electron (Node)
    main.js        finestra, impostazioni locali, canali IPC, osservazione della cartella
    preload.js     API esposta all'interfaccia (window.api), niente accesso diretto a Node
    store.js       lettura/scrittura di task, progetti, categorie e tag
    frontmatter.js parser/serializer del front matter YAML (sottoinsieme)
  renderer/        interfaccia (HTML + CSS + moduli JS, nessun passaggio di build)
    app.js         stato, azioni, gestione eventi
    state.js       stato dell'interfaccia e funzioni di lettura sui dati
    views/         una vista per schermata (task, dettaglio, progetti, progetto, tag…)
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
  taccuino.json                  marcatore della cartella
  tasks/T-042.md                 un file per task
  projects/VEND.md               un file per progetto
  tags/<categoria>/_categoria.md impostazioni della categoria
  tags/<categoria>/<tag>.md      un file per tag, con la descrizione nel corpo
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

Ogni categoria di tag creata dall'utente (es. `contesto`) diventa una chiave del front matter con lo stesso nome. Il valore è una lista se la categoria è "a scelta multipla".

### Progetto

```markdown
---
codice: VEND
nome: Dashboard vendite
colore: "#2F5BD3"
stato: attivo        # oppure archiviato
creato: 2026-09-02
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
- Le altre categorie (di serie "Etichette") si creano, modificano ed eliminano dalla sezione Tag.
- L'ID di un tag è il nome del file e non cambia se lo rinomini, quindi i task non vanno aggiornati.

I file si possono modificare anche a mano. L'app si accorge dei cambiamenti (anche quelli sincronizzati da OneDrive da un altro PC) e ricarica i dati.

## Note su OneDrive

- Salvare ogni elemento in un file separato riduce i conflitti tra PC.
- Se OneDrive crea una copia di conflitto (es. `T-042-PC-NAME.md`), l'app la mostra come un task a parte: tieni la versione giusta ed elimina l'altra.
- La scrittura è atomica: prima un file temporaneo, poi la rinomina. Così OneDrive non sincronizza mai un file scritto a metà.
