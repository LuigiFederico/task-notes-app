# Cartella dati di Taccuino

Questa cartella contiene i dati di **Taccuino**, un'app per gestire task, appunti e progetti. Ogni elemento è un file Markdown con front matter YAML, e l'app si accorge da sola dei file modificati da fuori e ricarica i dati. Puoi quindi creare e modificare task, appunti e progetti scrivendo direttamente i file, a patto di seguire le regole qui sotto: un file scritto male viene saltato dall'app, o letto in modo diverso da come intendevi.

Questo file è scritto dall'app e **viene riscritto a ogni nuova versione**: non modificarlo. Le note dell'utente per Claude stanno in `note-personali.md`, importato in fondo.

## Struttura

```
taccuino.json                  impostazioni della cartella: non modificarlo
tasks/T-042.md                 un file per task
appunti/A-007.md               un file per appunto
projects/VEND.md               un file per progetto
tags/<categoria>/_categoria.md impostazioni di una categoria di tag
tags/<categoria>/<tag>.md      un file per tag
.cestino/<data_ora>/…          elementi eliminati
```

## Regole generali

- File in UTF-8 con fine riga LF. Le date sono sempre `AAAA-MM-GG` e "oggi" è la data locale del giorno in cui scrivi.
- Se una cartella della struttura manca (es. `appunti/`), creala.
- Il front matter sta fra due righe `---` in cima al file. Il resto del file è il corpo in Markdown.
- Il front matter è un **sottoinsieme di YAML**. Ammette solo:
  - `chiave: valore` su una riga, con un valore scalare: testo, numero, `true`/`false`, oppure vuoto (nessun valore);
  - liste inline `chiave: [a, b]` e liste a blocco, con la chiave da sola sulla riga e poi una riga `  - voce` per voce;
  - `chiave: []` per una lista vuota.
- Non ammette oggetti annidati, testi su più righe (`|`, `>`), ancore o **commenti in linea**: in `chiave: valore # nota` la nota diventerebbe parte del valore.
- Le virgolette doppie (come in una stringa JSON) sono **obbligatorie** se il testo comincia con `[`, `"` o `'` (es. le voci `- "[x] Fatto"`), ha spazi all'inizio o alla fine, o sembra un numero, `true`, `false` o `null` ma va letto come testo (es. `titolo: "2026"`). Negli altri casi sono facoltative: `- 2026-09-28 Stato: Da fare → In corso` va bene così. L'app, quando riscrive un file, mette tra virgolette i testi con simboli come `:` o `#`.
- Nei file nuovi segui l'ordine dei campi degli esempi. Una categoria utente senza valori si omette. Il corpo, se c'è, comincia dopo una riga vuota sotto il secondo `---`.
- **L'ID di un task o di un appunto è il nome del file**, non il campo `id`, e i due devono coincidere. Un file come `T-042-PC.md` è una copia di conflitto di OneDrive: segnalala all'utente invece di modificarla.
- Non toccare i file `.tmp-*`, che sono scritture dell'app ancora in corso.

## Task (`tasks/T-042.md`)

```markdown
---
id: T-042
titolo: Preparare slide review KPI
progetto: ECOM
stato: in-corso
priorita: alta
scadenza: 2026-10-03
creato: 2026-09-24
aggiornato: 2026-09-28
completato:
etichette:
  - riunione
ticket-jira:
  - PROJ-123
collegamenti:
  - bloccato-da T-012
sottotask:
  - "[x] Raccogliere i dati"
  - "[ ] Bozza slide"
storico:
  - 2026-09-24 Creato
  - 2026-09-28 Stato: Da fare → In corso
---

Descrizione in Markdown. Si può citare un altro elemento con @T-012 o @A-007.
```

Campi del task:
- `progetto` è il codice di un file in `projects/`.
- `stato` è l'ID (nome del file senza `.md`) di un tag in `tags/stato/`. `priorita` è l'ID di un tag in `tags/priorita/`. Vuota vale come l'ultimo livello (quello con `ordine` più alto, di serie `backlog`), che è anche la priorità da dare a un task nuovo se l'utente non ne indica una. Quando l'utente nomina uno stato o una priorità ("Fatto", "Alta"), cerca il tag con quel `nome` e usa il suo ID.
- `scadenza` è una data oppure vuoto.
- Ogni altra categoria in `tags/` (es. `etichette`) è una chiave con il nome della categoria. Il valore è un ID di tag per le categorie `tipo: singola`, una lista di ID per le `multipla` e una lista di testi liberi per le `testo`.
- `collegamenti` ha una riga `<tipo> <ID>` per collegamento: il tipo è l'ID di un tag in `tags/collegamento/`, e l'ID è di un task (`T-…`) o di un appunto (`A-…`). Il collegamento si scrive **solo in un file**, quello dell'elemento a cui si applica il nome del tipo: "T-042 è bloccato da T-012" si scrive in T-042 come `bloccato-da T-012`. Allo stesso modo "T-012 blocca T-042", che usa il nome `inverso`, si scrive in T-042. L'altro elemento lo mostra da solo e il suo file non cambia (nemmeno `aggiornato`).
- `sottotask` è una checklist, una riga `"[x] testo"` (fatto) o `"[ ] testo"` per voce.
- `collegamenti` e `sottotask` si omettono quando sono vuoti.

### Creare un task
1. Calcola il nuovo ID. Prendi il numero più alto fra:
   - i file in `tasks/`;
   - i task nel cestino (`.cestino/*/tasks/T-*.md`);
   - `ultimoId` in `taccuino.json`.

   Aggiungi 1 e scrivilo con almeno tre cifre (`T-043`). **Un ID non si riusa mai**, nemmeno quello di un task eliminato. Se `ultimoId` manca vale 0, e non va aggiornato quando crei un task: serve all'app per gli ID cancellati per sempre.
2. Scrivi `tasks/<ID>.md` con `id` uguale al nome del file.
3. Imposta `stato` (di solito `da-fare`), `creato` e `aggiornato` a oggi, `completato` vuoto, e `storico` con la sola riga `AAAA-MM-GG Creato`.

### Modificare un task
- Imposta `aggiornato` a oggi.
- Per ogni cambio di stato, priorità, scadenza o progetto **aggiungi in fondo allo `storico`** una riga come queste, usando la data di oggi e il campo `nome` dei tag (non il loro ID). Scrivi `—` al posto di un valore vuoto.
  - `2026-09-30 Stato: Da fare → In corso`
  - `2026-09-30 Priorità: Media → Alta`
  - `2026-09-30 Scadenza: 2026-10-01 → 2026-10-03`
  - `2026-09-30 Progetto: VEND → ECOM`
- `completato`: quando il task passa in uno stato con `chiuso: true` nel suo file (di serie "Fatto"), mettici la data di oggi. Quando torna in uno stato aperto, svuotalo.
- Non riscrivere le righe già presenti nello `storico`. Gli altri cambiamenti (titolo, descrizione, tag, collegamenti, sotto-task) non scrivono righe di storico.
- Le menzioni `@T-012` / `@A-007` nel corpo sono solo testo: non creano collegamenti e non cambiano l'elemento citato.

## Appunti (`appunti/A-007.md`)

```markdown
---
id: A-007
titolo: Riunione KPI con Marco
progetto: ECOM
creato: 2026-09-30
aggiornato: 2026-09-30
etichette:
  - riunione
collegamenti:
  - correlato-a T-042
---

Testo in Markdown, con menzioni come @T-042.
```

- Gli appunti non hanno stato, priorità, scadenza, sotto-task o storico. Il `progetto` è facoltativo.
- Le categorie utente e i `collegamenti` funzionano come nei task.
- Il nuovo ID segue la stessa regola dei task, con prefisso `A-`: guarda `appunti/`, `.cestino/*/appunti/A-*.md` e `ultimoAppunto` in `taccuino.json` (0 se manca, e non va aggiornato).
- Quando modifichi un appunto, aggiorna `aggiornato`.

## Progetti (`projects/VEND.md`)

```markdown
---
codice: VEND
nome: Dashboard vendite
colore: "#2F5BD3"
stato: attivo
creato: 2026-09-02
ordine: 1
---

## Descrizione

Testo in Markdown.

## Decisioni

### 2026-09-22 · Fonte unica: il datamart vendite

Niente estrazioni manuali da Excel.

Task: T-029
```

- `codice` ha da 2 a 8 caratteri, fra lettere maiuscole e numeri, ed è anche il nome del file. Non cambia mai.
- `stato` è `attivo` oppure `archiviato`. `ordine` è la posizione nell'elenco dei progetti, oppure vuoto.
- Il corpo ha due sezioni fisse, `## Descrizione` e `## Decisioni`. Ogni decisione è un titolo `### AAAA-MM-GG · titolo`, un testo facoltativo e, se c'è un task collegato, una riga `Task: T-029`. Una decisione nuova va in cima.

## Categorie e tag (`tags/`)

- Ogni cartella in `tags/` è una categoria. `_categoria.md` contiene `nome`, `tipo` (`singola`, `multipla` o `testo`), `obbligatoria` e `ordine`. Le categorie `testo` possono avere anche `url`, un modello di link con `{valore}`.
- Ogni altro file della cartella è un tag. Il suo ID è il nome del file, che non cambia se il tag viene rinominato. Contiene `nome`, `colore`, `ordine` e `creato`, e nel corpo la descrizione.
- Le categorie di sistema sono `stato` (i tag hanno `chiuso: true/false`), `priorita` (l'ordine dei tag è l'ordine di importanza) e `collegamento` (i tipi di collegamento, con `inverso`, il nome visto dall'elemento collegato). Non vanno eliminate.
- Prima di usare un tag in un task, controlla che il file del tag esista. Se l'utente ti chiede un tag che non c'è, crealo:
  - l'ID è il nome in minuscolo, senza accenti, con ogni gruppo di caratteri che non sono lettere o numeri sostituito da `-` (es. "Attesa altri!" → `attesa-altri`). Se il file esiste già, aggiungi `-2`, `-3`…;
  - `ordine` è il più alto della categoria più 1, e `creato` è oggi;
  - scegli un `colore` fra `#2F5BD3`, `#0B8A6F`, `#C2410C`, `#7C3AED`, `#B42318`, `#B54708`, `#0E7490` e `#6B675E`;
  - la descrizione nel corpo è facoltativa.

## Eliminare

Non cancellare mai i file. Per eliminare un elemento spostalo nel cestino:
1. Sposta il file in `.cestino/<AAAA-MM-GG_HHMMSS>/`, conservando il percorso relativo (es. `.cestino/2026-09-30_143205/tasks/T-042.md`).
2. Nella stessa cartella scrivi `voce.json` con questo contenuto: `{"tipo": "task", "nome": "T-042 · titolo", "percorso": "tasks/T-042.md", "eliminato": "<data e ora ISO>"}`. `tipo` vale `task`, `appunto`, `progetto`, `tag` o `categoria`.

Nel dubbio chiedi all'utente di eliminarlo dall'app. Un progetto che ha task o appunti non si elimina: si archivia (`stato: archiviato`).

## Note dell'utente

@note-personali.md
