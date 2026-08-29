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
