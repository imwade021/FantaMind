/* ------------------------------------------------------------------
   Test della matematica d'asta, sui dati veri.

       node tests/test_conti.js

   Solo Node, nessuna libreria da installare.
   ------------------------------------------------------------------ */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RADICE = path.resolve(__dirname, '..');
const Conti = require(path.join(RADICE, 'app', 'conti.js'));

const DATI = JSON.parse(
  fs.readFileSync(path.join(RADICE, 'app', 'dati_asta.json'), 'utf8'));

// Le liste dei creator sono facoltative: i test che le riguardano si saltano
// se il file non c'è, esattamente come fa l'app.
const percorsoStrategie = path.join(RADICE, 'app', 'strategie.json');
const STRATEGIE = fs.existsSync(percorsoStrategie)
  ? JSON.parse(fs.readFileSync(percorsoStrategie, 'utf8'))
  : null;
const PER_ID = new Map(DATI.giocatori.map((g) => [g.id, g]));

let passati = 0;
const falliti = [];

function prova(nome, corpo) {
  try {
    corpo();
    passati += 1;
  } catch (errore) {
    falliti.push({ nome, messaggio: errore.message });
  }
}

function statoNuovo(squadre = 8, budget = 500) {
  return { lega: { squadre, budget }, rosa: [], venduti: [], storia: [] };
}

/** Compra il giocatore piu' caro di un ruolo che ci sta nel residuo. */
function compra(stato, ruolo, prezzoPagato) {
  const presi = Conti.occupati(stato);
  const scelto = DATI.giocatori.find((g) => g.r === ruolo && !presi.has(g.id));
  stato.rosa.push({ id: scelto.id, prezzo: prezzoPagato });
  return scelto;
}

/* ------------------------------------------------------------- LETTURA */

prova('il listone si carica', () => {
  assert.ok(DATI.giocatori.length > 400, 'troppi pochi giocatori');
  assert.ok(DATI.ordine.length === 4);
});

prova('ogni giocatore ha il prezzo della lega scelta', () => {
  const lega = { squadre: 12, budget: 1000 };
  for (const g of DATI.giocatori) {
    const p = Conti.prezzo(g, lega);
    assert.ok(Number.isInteger(p) && p >= 1, `${g.n}: prezzo ${p}`);
  }
});

prova('cambiando lega cambia il prezzo, non il giocatore', () => {
  const g = DATI.giocatori[0];
  const piccola = Conti.prezzo(g, { squadre: 8, budget: 300 });
  const grande = Conti.prezzo(g, { squadre: 12, budget: 1500 });
  assert.ok(grande > piccola, 'il monte crediti più alto non alza i prezzi');
});

prova('una lega inesistente ripiega sul riferimento', () => {
  const g = DATI.giocatori[0];
  assert.strictEqual(Conti.prezzo(g, { squadre: 99, budget: 99 }), g.p);
  assert.strictEqual(Conti.fascia(g, { squadre: 99, budget: 99 }), g.f);
});

/* --------------------------------------------------------- CONTI BASE */

prova('a rosa vuota il residuo è tutto il budget', () => {
  const stato = statoNuovo();
  assert.strictEqual(Conti.residuo(stato), 500);
  assert.strictEqual(Conti.speso(stato), 0);
  assert.strictEqual(Conti.caselleScoperte(DATI, stato, PER_ID), 25);
});

prova('ogni acquisto toglie crediti e chiude una casella', () => {
  const stato = statoNuovo();
  compra(stato, 'A', 120);
  assert.strictEqual(Conti.speso(stato), 120);
  assert.strictEqual(Conti.residuo(stato), 380);
  assert.strictEqual(Conti.mancanti(DATI, stato, PER_ID).A, 5);
  assert.strictEqual(Conti.caselleScoperte(DATI, stato, PER_ID), 24);
});

prova('i venduti agli altri non toccano il mio budget', () => {
  const stato = statoNuovo();
  const g = DATI.giocatori[0];
  stato.venduti.push({ id: g.id, prezzo: 200 });
  assert.strictEqual(Conti.residuo(stato), 500);
  assert.strictEqual(Conti.caselleScoperte(DATI, stato, PER_ID), 25);
});

prova('chi è già assegnato non è più libero', () => {
  const stato = statoNuovo();
  const prima = Conti.liberi(DATI, stato).length;
  const g = compra(stato, 'P', 20);
  const dopo = Conti.liberi(DATI, stato);
  assert.strictEqual(dopo.length, prima - 1);
  assert.ok(!dopo.some((x) => x.id === g.id), 'un giocatore preso risulta libero');
});

/* ------------------------------------------------------- REPARTO IN CORSO */

prova("l'asta parte dai portieri e avanza per reparti", () => {
  const stato = statoNuovo();
  assert.strictEqual(Conti.repartoInCorso(DATI, stato, PER_ID), 'P');
  for (let i = 0; i < 3; i += 1) compra(stato, 'P', 5);
  assert.strictEqual(Conti.repartoInCorso(DATI, stato, PER_ID), 'D');
});

prova('a rosa completa non c\'è più un reparto in corso', () => {
  const stato = statoNuovo(8, 1500);
  for (const ruolo of DATI.ordine) {
    for (let i = 0; i < DATI.slot[ruolo]; i += 1) compra(stato, ruolo, 1);
  }
  assert.strictEqual(Conti.repartoInCorso(DATI, stato, PER_ID), null);
  assert.strictEqual(Conti.caselleScoperte(DATI, stato, PER_ID), 0);
  assert.deepStrictEqual(Conti.pianoSpesa('A', DATI, stato, PER_ID), []);
});

/* ------------------------------------------------------ QUANTO POSSO SPENDERE */

prova('il disponibile di un reparto non supera mai il residuo', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const disponibile = Conti.disponibilePerReparto(ruolo, DATI, stato, PER_ID);
    assert.ok(disponibile <= Conti.residuo(stato),
      `${ruolo}: disponibile ${disponibile} sopra il residuo`);
  }
});

prova('resta sempre un credito per ogni altra casella scoperta', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const buchi = Conti.mancanti(DATI, stato, PER_ID);
    const altrove = DATI.ordine
      .filter((r) => r !== ruolo)
      .reduce((somma, r) => somma + buchi[r], 0);
    const disponibile = Conti.disponibilePerReparto(ruolo, DATI, stato, PER_ID);
    assert.ok(disponibile <= Conti.residuo(stato) - altrove,
      `${ruolo}: lascia scoperte ${altrove} caselle senza crediti`);
  }
});

prova("l'attacco pesa più del reparto portieri", () => {
  const stato = statoNuovo();
  const perPortieri = Conti.disponibilePerReparto('P', DATI, stato, PER_ID);
  const perAttacco = Conti.disponibilePerReparto('A', DATI, stato, PER_ID);
  assert.ok(perAttacco > perPortieri,
    `attacco ${perAttacco} non è sopra i portieri ${perPortieri}`);
});

prova('un reparto già completo non trattiene crediti', () => {
  const stato = statoNuovo();
  for (let i = 0; i < 3; i += 1) compra(stato, 'P', 1);
  assert.strictEqual(Conti.disponibilePerReparto('P', DATI, stato, PER_ID), 0);
});

prova("finito un reparto, i suoi crediti vanno agli altri", () => {
  const magro = statoNuovo();
  const primaAttacco = Conti.disponibilePerReparto('A', DATI, magro, PER_ID);

  const dopo = statoNuovo();
  for (let i = 0; i < 3; i += 1) compra(dopo, 'P', 1);   // portieri quasi gratis
  const poiAttacco = Conti.disponibilePerReparto('A', DATI, dopo, PER_ID);

  assert.ok(poiAttacco > primaAttacco,
    `attacco ${poiAttacco} non è cresciuto dopo aver chiuso i portieri a 3 crediti`);
});

prova('spendendo tanto presto resta poco dopo', () => {
  const parsimonioso = statoNuovo();
  for (let i = 0; i < 3; i += 1) compra(parsimonioso, 'P', 3);

  const spendaccione = statoNuovo();
  for (let i = 0; i < 3; i += 1) compra(spendaccione, 'P', 60);

  const a = Conti.disponibilePerReparto('D', DATI, parsimonioso, PER_ID);
  const b = Conti.disponibilePerReparto('D', DATI, spendaccione, PER_ID);
  assert.ok(a > b, 'spendere di più sui portieri non ha ridotto la difesa');
});

/* -------------------------------------------------------- PIANO DI SPESA */

prova('il piano ha una casella per ogni buco del reparto', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const piano = Conti.pianoSpesa(ruolo, DATI, stato, PER_ID);
    assert.strictEqual(piano.length, DATI.slot[ruolo],
      `${ruolo}: ${piano.length} caselle invece di ${DATI.slot[ruolo]}`);
  }
});

prova('il piano è decrescente: prima il pezzo pregiato', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const piano = Conti.pianoSpesa(ruolo, DATI, stato, PER_ID);
    for (let i = 1; i < piano.length; i += 1) {
      assert.ok(piano[i] <= piano[i - 1],
        `${ruolo}: la casella ${i + 1} costa più della ${i}`);
    }
  }
});

prova('il piano spende esattamente il disponibile del reparto', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const piano = Conti.pianoSpesa(ruolo, DATI, stato, PER_ID);
    const somma = piano.reduce((a, b) => a + b, 0);
    const disponibile = Conti.disponibilePerReparto(ruolo, DATI, stato, PER_ID);
    assert.strictEqual(somma, disponibile,
      `${ruolo}: il piano somma ${somma}, il disponibile è ${disponibile}`);
  }
});

prova('ogni casella vale almeno un credito', () => {
  const stato = statoNuovo(12, 300);      // la lega più stretta possibile
  for (const ruolo of DATI.ordine) {
    for (const tetto of Conti.pianoSpesa(ruolo, DATI, stato, PER_ID)) {
      assert.ok(tetto >= 1, `${ruolo}: casella da ${tetto} crediti`);
    }
  }
});

prova('il massimo di adesso è la prima casella del piano', () => {
  const stato = statoNuovo();
  const piano = Conti.pianoSpesa('P', DATI, stato, PER_ID);
  assert.strictEqual(Conti.massimoAdesso('P', DATI, stato, PER_ID), piano[0]);
});

prova('con la rosa quasi finita il massimo non supera il residuo', () => {
  const stato = statoNuovo();
  for (const ruolo of DATI.ordine) {
    const quanti = DATI.slot[ruolo] - (ruolo === 'A' ? 1 : 0);
    for (let i = 0; i < quanti; i += 1) compra(stato, ruolo, 20);
  }
  const massimo = Conti.massimoAdesso('A', DATI, stato, PER_ID);
  assert.ok(massimo <= Conti.residuo(stato),
    `massimo ${massimo} sopra il residuo ${Conti.residuo(stato)}`);
  assert.ok(massimo >= 1, 'ultima casella senza crediti');
});

prova('a budget esaurito resta comunque un credito per casella', () => {
  const stato = statoNuovo();
  compra(stato, 'P', 498);      // quasi tutto su un portiere: scelta pessima, caso reale
  const massimo = Conti.massimoAdesso('D', DATI, stato, PER_ID);
  assert.ok(massimo >= 1, 'nessun credito per la casella successiva');
  assert.ok(massimo <= Conti.residuo(stato), 'promette crediti che non ci sono');
});

/* ------------------------------------------------------------ CANDIDATI */

prova('i candidati stanno nel tetto e nel ruolo', () => {
  const stato = statoNuovo();
  const scelti = Conti.candidati('D', 20, DATI, stato, 5);
  assert.ok(scelti.length > 0, 'nessun difensore sotto i 20 crediti');
  for (const g of scelti) {
    assert.strictEqual(g.r, 'D');
    assert.ok(Conti.prezzo(g, stato.lega) <= 20, `${g.n} costa troppo`);
    assert.ok(!(g.out && g.out.grave), `${g.n} è fermo e viene consigliato`);
  }
});

prova('i candidati sono ordinati per resa, non per prezzo', () => {
  const stato = statoNuovo();
  const scelti = Conti.candidati('C', 40, DATI, stato, 5)
    .filter((g) => g.y !== null && g.y !== undefined);
  for (let i = 1; i < scelti.length; i += 1) {
    assert.ok(scelti[i].y <= scelti[i - 1].y, 'candidati non ordinati per resa');
  }
});

prova('chi è già stato preso non viene più consigliato', () => {
  const stato = statoNuovo();
  const primo = Conti.candidati('A', 200, DATI, stato, 1)[0];
  stato.venduti.push({ id: primo.id, prezzo: 150 });
  const dopo = Conti.candidati('A', 200, DATI, stato, 5);
  assert.ok(!dopo.some((g) => g.id === primo.id),
    `${primo.n} è già venduto ma viene ancora consigliato`);
});

prova('un tetto impossibile non produce candidati inventati', () => {
  const stato = statoNuovo();
  for (const g of Conti.candidati('A', 0, DATI, stato, 5)) {
    assert.fail(`${g.n} consigliato con tetto zero`);
  }
});

/* ----------------------------------------------- COERENZA CON IL CORE */

prova('la fascia 1 di ogni ruolo ha tanti giocatori quante le squadre', () => {
  for (const squadre of DATI.leghe.squadre) {
    const lega = { squadre, budget: 500 };
    for (const ruolo of DATI.ordine) {
      const quanti = DATI.giocatori
        .filter((g) => g.r === ruolo && Conti.fascia(g, lega) === 1).length;
      assert.strictEqual(quanti, squadre,
        `${ruolo} con ${squadre} squadre: ${quanti} in fascia 1`);
    }
  }
});

prova('le caselle della rosa sommano a venticinque', () => {
  assert.strictEqual(Conti.slotTotali(DATI), 25);
});


prova('quando i crediti non bastano il piano lo dice, invece di inventarli', () => {
  const stato = statoNuovo();
  compra(stato, 'P', 495);                 // tre caselle di portiere, quasi tutto speso
  const piano = Conti.pianoSpesa('D', DATI, stato, PER_ID);
  const somma = piano.reduce((a, b) => a + b, 0);
  const disponibile = Conti.disponibilePerReparto('D', DATI, stato, PER_ID);
  assert.strictEqual(somma, disponibile, 'il piano non torna col disponibile');
  assert.ok(somma <= Conti.residuo(stato), 'il piano promette più del residuo');
  assert.ok(piano.some((tetto) => tetto === 0),
    'con 5 crediti e 8 difensori nessuna casella risulta scoperta');
});

prova('a crediti finiti il massimo è zero, non un numero di comodo', () => {
  const stato = statoNuovo();
  compra(stato, 'P', 500);
  assert.strictEqual(Conti.residuo(stato), 0);
  assert.strictEqual(Conti.massimoAdesso('D', DATI, stato, PER_ID), 0);
});


/* ---------------------------------------------------------- ALLENATORE */

/** Riempie una rosa completa con i migliori disponibili per ruolo. */
function rosaPiena(stato) {
  for (const ruolo of DATI.ordine) {
    for (let i = 0; i < DATI.slot[ruolo]; i += 1) {
      const presi = Conti.occupati(stato);
      const scelto = DATI.giocatori.find(
        (g) => g.r === ruolo && !presi.has(g.id) && !(g.out && g.out.grave));
      stato.rosa.push({ id: scelto.id, prezzo: 10 });
    }
  }
  return stato;
}

prova('gli allarmi riguardano solo la tua rosa', () => {
  const stato = statoNuovo();
  const fermo = DATI.giocatori.find((g) => g.out && g.out.grave);
  assert.strictEqual(Conti.allarmi(stato, PER_ID).length, 0, 'allarmi a rosa vuota');
  stato.rosa.push({ id: fermo.id, prezzo: 10 });
  const trovati = Conti.allarmi(stato, PER_ID);
  assert.strictEqual(trovati.length, 1);
  assert.strictEqual(trovati[0].id, fermo.id);
});

prova("l'undici rispetta il modulo", () => {
  const stato = rosaPiena(statoNuovo(8, 1500));
  for (const [modulo, reparti] of Object.entries(DATI.moduli)) {
    const esito = Conti.undici(modulo, DATI, stato, PER_ID);
    const conta = (r) => esito.schierati.filter((g) => g.r === r).length;
    assert.strictEqual(esito.schierati.length, 11, `${modulo}: non sono undici`);
    assert.strictEqual(conta('P'), 1, `${modulo}: portieri`);
    assert.strictEqual(conta('D'), reparti[0], `${modulo}: difensori`);
    assert.strictEqual(conta('C'), reparti[1], `${modulo}: centrocampisti`);
    assert.strictEqual(conta('A'), reparti[2], `${modulo}: attaccanti`);
  }
});

prova("l'undici non schiera chi è fermo", () => {
  const stato = statoNuovo(8, 1500);
  const fermo = DATI.giocatori.find((g) => g.out && g.out.grave && g.r === 'A');
  stato.rosa.push({ id: fermo.id, prezzo: 10 });
  rosaPiena(stato);
  const esito = Conti.undici('3-4-3', DATI, stato, PER_ID);
  assert.ok(!esito.schierati.some((g) => g.id === fermo.id),
    `${fermo.n} è fermo ma viene schierato`);
});

prova("con la rosa incompleta l'undici dice quanti ne mancano", () => {
  const stato = statoNuovo();
  const esito = Conti.undici('3-4-3', DATI, stato, PER_ID);
  assert.strictEqual(esito.schierati.length, 0);
  assert.strictEqual(esito.buchi.D, 3);
  assert.strictEqual(esito.buchi.A, 3);
  assert.strictEqual(esito.media, null);
});

prova('un modulo inesistente non produce un undici finto', () => {
  const stato = rosaPiena(statoNuovo(8, 1500));
  assert.strictEqual(Conti.undici('9-9-9', DATI, stato, PER_ID), null);
});

prova('il modificatore difesa serve portiere più tre difensori', () => {
  const stato = statoNuovo();
  let esito = Conti.modificatoreDifesa(DATI, stato, PER_ID);
  assert.strictEqual(esito.pronto, false);
  assert.strictEqual(esito.mancaPortiere, true);

  rosaPiena(stato);
  esito = Conti.modificatoreDifesa(DATI, stato, PER_ID);
  assert.strictEqual(esito.pronto, true);
  assert.strictEqual(esito.scelti.length, 4, 'non sono portiere + 3 difensori');
  assert.strictEqual(esito.scelti.filter((g) => g.r === 'P').length, 1);
  assert.strictEqual(esito.scelti.filter((g) => g.r === 'D').length, 3);
});

prova('il bonus del modificatore segue la tabella della lega', () => {
  const stato = rosaPiena(statoNuovo(8, 1500));
  const esito = Conti.modificatoreDifesa(DATI, stato, PER_ID);
  const atteso = DATI.modificatore.find((riga) => esito.media >= riga.da);
  assert.strictEqual(esito.bonus, atteso.bonus,
    `media ${esito.media} dovrebbe dare ${atteso.bonus}, dà ${esito.bonus}`);
  assert.ok(esito.bonus >= 0 && esito.bonus <= 6);
});

prova('il modificatore usa la media voto, non la fantamedia', () => {
  const stato = rosaPiena(statoNuovo(8, 1500));
  const esito = Conti.modificatoreDifesa(DATI, stato, PER_ID);
  const daMedieVoto = esito.scelti.reduce((s, g) => s + g.mvp, 0) / 4;
  assert.ok(Math.abs(esito.media - daMedieVoto) < 0.01,
    'la media non viene dalle medie voto');
});

prova('lo scambio misura le differenze nella direzione giusta', () => {
  const stato = statoNuovo();
  const forte = DATI.giocatori.find((g) => g.r === 'A' && g.y !== null && g.y > 6.5);
  const debole = DATI.giocatori.filter(
    (g) => g.r === 'A' && g.y !== null && g.y < 5.8).pop();

  const esito = Conti.confrontoScambio(debole.id, forte.id, stato.lega, PER_ID);
  assert.ok(esito.resa > 0, 'ricevere il più forte non risulta un guadagno');
  assert.ok(esito.prezzo > 0, 'il più forte non risulta più caro');
  assert.strictEqual(esito.stessoRuolo, true);

  const contrario = Conti.confrontoScambio(forte.id, debole.id, stato.lega, PER_ID);
  assert.ok(Math.abs(contrario.resa + esito.resa) < 0.001,
    'lo scambio inverso non è simmetrico');
});

prova('uno scambio con un giocatore inesistente non inventa niente', () => {
  const stato = statoNuovo();
  assert.strictEqual(
    Conti.confrontoScambio(999999, DATI.giocatori[0].id, stato.lega, PER_ID), null);
});

prova('chi non ha storico non produce differenze finte nello scambio', () => {
  const stato = statoNuovo();
  const senza = DATI.giocatori.find((g) => g.y === null);
  const con = DATI.giocatori.find((g) => g.y !== null);
  const esito = Conti.confrontoScambio(senza.id, con.id, stato.lega, PER_ID);
  assert.strictEqual(esito.resa, null, 'confronta una resa che non esiste');
});


/* ------------------------------------------------------------- MERCATO */

prova('senza liste dei creator il mercato non inventa numeri', () => {
  const stato = statoNuovo();
  const g = DATI.giocatori[0];
  assert.strictEqual(Conti.mercato(g, null, stato.lega), null);
  assert.strictEqual(Conti.divergenza(g, null, stato.lega), null);
  assert.deepStrictEqual(Conti.affari(DATI, stato, null), []);
});

prova('il prezzo atteso scala col budget della lega', () => {
  if (!STRATEGIE) return;
  const g = DATI.giocatori.find(
    (x) => Conti.mercato(x, STRATEGIE, { squadre: 8, budget: 500 }));
  const piccola = Conti.mercato(g, STRATEGIE, { squadre: 8, budget: 500 });
  const grande = Conti.mercato(g, STRATEGIE, { squadre: 8, budget: 1000 });
  assert.ok(Math.abs(grande.atteso - piccola.atteso * 2) <= 1,
    `${g.n}: ${piccola.atteso} a 500 crediti ma ${grande.atteso} a 1000`);
});

prova('la forbice contiene sempre il valore atteso', () => {
  if (!STRATEGIE) return;
  const lega = { squadre: 8, budget: 500 };
  for (const g of DATI.giocatori) {
    const m = Conti.mercato(g, STRATEGIE, lega);
    if (!m || m.min === null || m.max === null) continue;
    assert.ok(m.min <= m.atteso && m.atteso <= m.max,
      `${g.n}: atteso ${m.atteso} fuori dalla forbice ${m.min}-${m.max}`);
  }
});

prova('ogni prezzo atteso è positivo e plausibile', () => {
  if (!STRATEGIE) return;
  const lega = { squadre: 8, budget: 500 };
  for (const g of DATI.giocatori) {
    const m = Conti.mercato(g, STRATEGIE, lega);
    if (!m) continue;
    assert.ok(m.atteso >= 0, `${g.n}: atteso ${m.atteso}`);
    assert.ok(m.atteso <= lega.budget,
      `${g.n}: atteso ${m.atteso}, più dell'intero budget`);
    assert.ok(m.liste >= 1 && m.liste <= STRATEGIE.fonti.length);
  }
});

prova('la divergenza è la distanza fra il mio prezzo e il mercato', () => {
  if (!STRATEGIE) return;
  const lega = { squadre: 8, budget: 500 };
  for (const g of DATI.giocatori.slice(0, 60)) {
    const m = Conti.mercato(g, STRATEGIE, lega);
    const d = Conti.divergenza(g, STRATEGIE, lega);
    if (!m) {
      assert.strictEqual(d, null);
      continue;
    }
    assert.strictEqual(d, m.atteso - Conti.prezzo(g, lega), `${g.n}`);
  }
});

prova('gli affari sono solo giocatori sottovalutati e liberi', () => {
  if (!STRATEGIE) return;
  const stato = statoNuovo();
  const trovati = Conti.affari(DATI, stato, STRATEGIE, 8);
  assert.ok(trovati.length > 0, 'nessun affare trovato su tutto il listone');
  for (const { g, delta } of trovati) {
    assert.ok(delta < 0, `${g.n}: delta ${delta} non è un affare`);
    assert.ok(g.y !== null, `${g.n}: affare senza resa nota`);
    assert.ok(!(g.out && g.out.grave), `${g.n}: è fermo`);
  }
  const ordinati = trovati.map((x) => x.delta);
  assert.deepStrictEqual(ordinati, [...ordinati].sort((a, b) => a - b));
});

prova('un giocatore già venduto non resta fra gli affari', () => {
  if (!STRATEGIE) return;
  const stato = statoNuovo();
  const primo = Conti.affari(DATI, stato, STRATEGIE, 1)[0];
  stato.venduti.push({ id: primo.g.id, prezzo: 30 });
  const dopo = Conti.affari(DATI, stato, STRATEGIE, 8);
  assert.ok(!dopo.some((x) => x.g.id === primo.g.id),
    `${primo.g.n} è venduto ma resta fra gli affari`);
});

prova('chi non è in nessuna lista non risulta un affare', () => {
  if (!STRATEGIE) return;
  const lega = { squadre: 8, budget: 500 };
  const senza = DATI.giocatori.filter(
    (g) => !Conti.mercato(g, STRATEGIE, lega));
  assert.ok(senza.length > 0, 'tutte le liste coprono tutto il listone');
  const stato = statoNuovo();
  const idAffari = new Set(Conti.affari(DATI, stato, STRATEGIE, 50).map((x) => x.g.id));
  for (const g of senza) {
    assert.ok(!idAffari.has(g.id), `${g.n}: affare senza dati di mercato`);
  }
});


prova('i giocatori aggiunti dalle liste sono distinguibili', () => {
  if (!STRATEGIE || !STRATEGIE.aggiunti) return;
  // Puo' essere vuoto, ed e' il caso migliore: significa che il Master
  // contiene gia' tutti i giocatori nominati dalle liste.
  const visti = new Set();
  for (const voce of STRATEGIE.aggiunti) {
    assert.ok(voce.id < 0, `${voce.nome}: id ${voce.id} non è negativo`);
    assert.ok(!visti.has(voce.id), `id duplicato: ${voce.id}`);
    visti.add(voce.id);
    assert.ok(voce.nome && voce.ruolo, 'voce senza nome o ruolo');
    assert.ok(['P', 'D', 'C', 'A'].includes(voce.ruolo));
    assert.ok(voce.pma !== null || voce.prezzo_mediano,
      `${voce.nome}: nessun prezzo, non doveva entrare`);
  }
});

prova('gli id aggiunti non collidono con quelli del Master', () => {
  if (!STRATEGIE || !STRATEGIE.aggiunti) return;
  const idMaster = new Set(DATI.giocatori.map((g) => g.id));
  for (const voce of STRATEGIE.aggiunti) {
    assert.ok(!idMaster.has(voce.id), `${voce.nome}: id già nel Master`);
  }
});

prova('chi viene solo dalle liste non ha resa né certezza inventate', () => {
  if (!STRATEGIE || !STRATEGIE.aggiunti) return;
  for (const voce of STRATEGIE.aggiunti) {
    // MV e FM esistono solo se qualcuno ha davvero giocato: lo zero dei file
    // significa "dato assente", non "rendimento pessimo".
    if (voce.mv !== null) assert.ok(voce.mv > 0, `${voce.nome}: mv ${voce.mv}`);
    if (voce.fm !== null) assert.ok(voce.fm > 0, `${voce.nome}: fm ${voce.fm}`);
  }
});

/* ------------------------------------------------------------- ESITO */

console.log(`\n  ${passati} test superati`);
if (falliti.length) {
  console.log(`  ${falliti.length} falliti:\n`);
  for (const errore of falliti) {
    console.log(`  ✗ ${errore.nome}\n    ${errore.messaggio}\n`);
  }
  process.exit(1);
}
console.log('  tutto a posto\n');
