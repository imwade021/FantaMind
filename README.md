# FantaMind

Il banco della tua asta. Un solo repo: il motore che costruisce il listone,
e l'applicazione che usi al tavolo.

**Regola della casa:** ogni numero che vedi nell'app deve essere ricalcolabile
dal `Lista_Finale_Master.csv`. Niente stime di rendimento futuro, niente
opinioni. Quello che non è noto resta dichiarato come non noto — è il motivo
per cui accanto a certi giocatori c'è scritto "nessuno storico" e basta.

---

## Come è fatto

```
core/        Le formule. Una sola volta, per tutti.
             certezza, resa, prezzi, fasce, confronti.

pipeline/    Da internet e dagli Excel al listone.
             build_master.py       -> dati/Lista_Finale_Master.csv
             genera_json.py        -> app/dati_asta.json
             importa_strategie.py  -> app/strategie.json

dati/        Le sorgenti: quotazioni, statistiche, anagrafica,
             più il Master che ne esce.
             strategie/ contiene gli .xlsx dei creator (facoltativi).

app/         L'applicazione. HTML, CSS e JavaScript, niente altro.
             È questa la cartella che va online.

tests/       54 test Python + 31 JavaScript, sui giocatori veri.
```

Il flusso è a senso unico:

```
Excel + API  ──>  build_master.py  ──>  Lista_Finale_Master.csv
                                              │
                                              v
                                        genera_json.py
                                              │
                                              v
                                        dati_asta.json  ──>  app/
```

Se un numero è sbagliato, il posto da correggere è `core/`. Mai `app/`.

---

## Metterlo su GitHub

### 1. Crea il repo

Su GitHub, nuovo repository **pubblico** chiamato `FantaMind`. Non aggiungere
README né .gitignore: ci sono già.

### 2. Carica i file

Dalla cartella che hai scaricato:

```bash
cd FantaMind
git init
git add .
git commit -m "FantaMind: primo commit"
git branch -M main
git remote add origin https://github.com/imwade021/FantaMind.git
git push -u origin main
```

### 3. Metti l'app online

Su GitHub: **Settings → Pages → Source: GitHub Actions**.

Il workflow `pubblica.yml` fa il resto a ogni push. Dopo un paio di minuti
l'app è su:

```
https://imwade021.github.io/FantaMind/
```

> Pubblica la cartella `app/`, non la radice. Le sorgenti Excel e il codice
> Python restano nel repo ma non finiscono online.

### 4. Il segreto per l'API

**Settings → Secrets and variables → Actions → New repository secret**

| Nome | Valore |
|---|---|
| `API_FOOTBALL_KEY` | la tua chiave API-Football |

Opzionali, per l'avviso su Telegram quando qualcuno esce dal listone:
`TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`. Senza, quello step si salta da solo.

### 5. Prova l'aggiornamento a mano

**Actions → Aggiorna il listone → Run workflow.**

Il job costruisce il Master, genera il JSON, lancia i test e committa. Se un
test fallisce il commit non parte: online resta il listone di ieri, che è
vecchio di un giorno ma giusto. Meglio di uno nuovo e sbagliato.

Da lì in poi gira da solo ogni notte all'una UTC.

---

## Installarla sul telefono

Apri `https://imwade021.github.io/FantaMind/` in Safari e fai
**Condividi → Aggiungi a Home**.

Da quel momento parte a tutto schermo, con la sua icona, e **non serve più la
rete**: al primo avvio si mette da parte tutto. È il motivo per cui non c'è
un solo font o una sola libreria caricata da internet.

Un file `.html` scaricato nell'app File non può diventare un'applicazione:
Apple ha disabilitato l'apertura di file locali in Safari. Il passaggio da
Pages è l'unico modo, e si fa una volta sola.

---

## Usarla

### Prima dell'asta — la tua lista

In Strategia, cerca chi vuoi in rosa e mettilo in lista. Non è un segnalibro:
i suoi crediti vengono **messi da parte**, e questo cambia i consigli.

Su un giocatore in lista il tetto sale, perché hai deciso che quello lo vuoi.
Su tutti gli altri dello stesso reparto scende, perché quei crediti sono già
promessi. È il senso della cosa: una lista che non toglie niente a nessuno non
sta cambiando nessuna decisione.

Quanto si mette da parte è il maggiore fra il tuo prezzo e quello che pagherà
la stanza: se i creator dicono 52 e tu lo prezzi 23, riservare 23 significa
non prenderlo.

Il riquadro in cima dice se la lista sta in piedi: quanto costa, quanto resta
per le altre caselle e quanto viene a casella. Se sfora te lo dice prima
dell'asta, non a metà.

### Prima dell'asta — Strategia

Quanti crediti mettere su ogni reparto, chi guardare, com'è fatta la fila
d'attesa nella tua lega. I consigli escono dai numeri della *tua* lega:
quanti attaccanti di fascia 1 esistono, quanti ne restano, quanti giocatori
non hanno storico. Non massime che valgono per chiunque.

### Durante — Asta Live

Imposta **squadre** e **crediti**: cambiano tutti i prezzi insieme.

Poi cerca chi è all'asta, scrivi il prezzo e premi *L'ho preso io* oppure
*Preso da altri*. Di quelli degli altri serve solo il prezzo: serve a sapere
chi è ancora libero.

Il numero che conta è **massimo per questa casella**. Non è il residuo: se
stai comprando difensori, i crediti per centrocampo e attacco vanno tenuti da
parte. Sotto trovi il piano completo del reparto — con quattro difensori da
fare e quaranta crediti non ti servono quattro giocatori da dieci, te ne serve
uno buono e poi dei tappabuchi.

Se sbagli, **Annulla l'ultimo** torna indietro fino a dieci passi.

### Ogni nome è cliccabile

Da qualunque elenco, un nome apre la scheda: prezzo, fascia, resa, certezza
con i motivi scritti per esteso, dove sta fra quelli del suo ruolo, da dove
arriva il bonus, se è fermo e da quando, e cosa fare all'asta adesso — col
tuo tetto, spiegato. Un tetto che non sai spiegare, a metà asta, non lo
rispetti.

### Se qualcosa va storto

**Salva una copia** scrive un file con tutta l'asta dentro; **Rimetti dentro**
lo rilegge. Fallo una volta a metà asta.

---

## Lavorarci sopra

```bash
pip install -r requirements.txt

python3 pipeline/build_master.py      # ricostruisce il Master (serve la chiave API)
python3 pipeline/genera_json.py       # rigenera app/dati_asta.json

python3 -m unittest discover -s tests # 54 test
node tests/test_conti.js              # 31 test
```

Per vedere l'app in locale serve un server: aprendo `index.html` col doppio
click, il browser blocca `fetch` sui file locali.

```bash
cd app && python3 -m http.server 8000
# poi apri http://localhost:8000
```

### Cambiare un numero

| Cosa | Dove |
|---|---|
| Slot per ruolo, quote di budget, leghe ammesse | `core/costanti.py` |
| Come si calcola la certezza | `core/certezza.py` |
| Come si calcolano prezzi e fasce | `core/mercato.py` |
| Quanto puoi spendere su una casella | `app/conti.js` |
| Aspetto | `app/stile.css` |

I parametri di lega finiscono dentro `dati_asta.json` e l'app li legge da lì.
Non esiste una seconda copia in JavaScript: è la cosa che prima faceva dare
numeri diversi a due schermate.

---

## Le liste dei creator

In `dati/strategie/` puoi mettere gli .xlsx delle guide all'asta scaricate dai
creator. `importa_strategie.py` le abbina al Master e produce
`app/strategie.json`; l'app lo carica se c'è, e funziona identica se non c'è.

Il campo che si usa è il **PMA**, cioè il prezzo medio d'asta in percentuale di
budget: è l'unico confrontabile fra leghe diverse. Il "prezzo" scritto da un
creator vale sulla lega che aveva in mente lui, la percentuale vale sulla tua.

Restano **separati dal Master**, e la ragione è la regola della casa: il Master
contiene solo numeri ricalcolabili dal CSV, questi sono giudizi. Servono a
sapere cosa faranno gli altri al tavolo, non quanto vale un giocatore — e il
valore sta proprio nella distanza fra i due numeri. Dove il mercato paga più
del tuo prezzo, lascialo agli altri; dove paga meno, c'è margine. La sezione
Strategia ha un pannello che elenca i secondi.

Per aggiungerne una: metti il file in `dati/strategie/` e lancia
`python3 pipeline/importa_strategie.py`. La GitHub Action lo rifà ogni notte,
perché gli abbinamenti sono per nome e vanno rifatti quando il Master cambia.

---

## Quando esce il listone nuovo

Due file da sostituire in `dati/`, entrambi da fantacalcio.it:

- `Quotazioni_Fantacalcio_Stagione_*.xlsx` — la fonte autorevole di quotazioni
  e FVM
- `Lista-FantaAsta-Fantacalcio.csv` — anagrafica, foto e nomi completi

I due si aggiornano con ritmi diversi, e a mercato aperto il CSV arriva prima.
Per questo `build_master.py` **completa** le quotazioni con i giocatori
presenti solo nel CSV: un portiere titolare comprato la settimana scorsa
esiste in asta anche se l'xlsx non lo conosce ancora. L'xlsx resta autorevole
per chi c'è già; dal CSV si aggiunge soltanto.

---

## Cosa NON fa

Non prevede il rendimento di nessuno.

Le **fasce** sono la fila d'attesa: con otto squadre i primi otto di un ruolo
sono fascia 1, uno a testa. La **certezza** sono presenze e minuti già
giocati, col motivo scritto sotto. Chi non ha mai giocato in Serie A non ha
numeri: c'è scritto "nessuno storico", e basta.

Il **vantaggio** è un confronto locale: a parità di crediti spesi, chi rende
di più. È calcolato sulla lega di riferimento (8 squadre, 500 crediti) e non
cambia con la lega scelta — le bande di prezzo scalano in proporzione, quindi
i gruppi di confronto restano gli stessi.

---

## I due repo di prima

`fanta-master-ai` e `FantaBot` sono sostituiti da questo. Archiviali
(Settings → Archive this repository), non cancellarli: se il bot è ancora
acceso da qualche parte, scarica il Master dal vecchio indirizzo, e uno
storico serve.

Se vuoi tenerlo vivo qualche giorno, cambiagli la variabile `LISTONE_URL`:

```
https://raw.githubusercontent.com/imwade021/FantaMind/main/dati/Lista_Finale_Master.csv
```

---

## Il parere AI

Non c'è, ed è una scelta rimandata, non dimenticata: una chiave API dentro una
pagina statica è una chiave pubblica. Quando lo aggiungiamo serve un piccolo
proxy — una funzione Cloudflare o Vercel — che tenga la chiave dalla sua parte.

Il resto dell'app continuerà a funzionare senza rete: il parere è l'unico
pezzo che la richiede, e si spegne da solo quando non c'è.
