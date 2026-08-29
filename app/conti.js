/* ------------------------------------------------------------------
   conti.js - La matematica dell'asta in corso.

   Sta qui, separato dall'interfaccia, per due motivi: si prova senza un
   browser (tests/test_conti.js lo carica con Node) e non puo' toccare la
   pagina, quindi non puo' avere effetti collaterali.

   Non contiene NESSUNA formula del listone: prezzi, fasce, certezza e resa
   arrivano gia' calcolati dal core Python. Qui c'e' solo cio' che dipende
   da come sta andando l'asta adesso, e che quindi prima non si poteva
   sapere: crediti residui, caselle scoperte, quanto puoi ancora mettere.
   ------------------------------------------------------------------ */

'use strict';

const Conti = (function () {

  function chiaveLega(lega) {
    return `${lega.squadre}x${lega.budget}`;
  }

  /** Il prezzo nella lega scelta. Ripiega sul riferimento se manca. */
  function prezzo(g, lega) {
    const valore = g.pz && g.pz[chiaveLega(lega)];
    return valore === undefined ? g.p : valore;
  }

  /** La fascia nella lega scelta. */
  function fascia(g, lega) {
    const valore = g.fs && g.fs[chiaveLega(lega)];
    return valore === undefined ? g.f : valore;
  }

  function slotTotali(dati) {
    return Object.values(dati.slot).reduce((a, b) => a + b, 0);
  }

  function speso(stato) {
    return stato.rosa.reduce((somma, voce) => somma + voce.prezzo, 0);
  }

  function residuo(stato) {
    return stato.lega.budget - speso(stato);
  }

  function presiPerRuolo(dati, stato, perId) {
    const conto = {};
    for (const ruolo of dati.ordine) conto[ruolo] = 0;
    for (const voce of stato.rosa) {
      const g = perId.get(voce.id);
      if (g && conto[g.r] !== undefined) conto[g.r] += 1;
    }
    return conto;
  }

  function mancanti(dati, stato, perId) {
    const presi = presiPerRuolo(dati, stato, perId);
    const buchi = {};
    for (const ruolo of dati.ordine) {
      buchi[ruolo] = Math.max(0, (dati.slot[ruolo] || 0) - presi[ruolo]);
    }
    return buchi;
  }

  function caselleScoperte(dati, stato, perId) {
    return Object.values(mancanti(dati, stato, perId)).reduce((a, b) => a + b, 0);
  }

  /** Il primo reparto ancora scoperto, nell'ordine in cui si svolge l'asta. */
  function repartoInCorso(dati, stato, perId) {
    const buchi = mancanti(dati, stato, perId);
    return dati.ordine.find((ruolo) => buchi[ruolo] > 0) || null;
  }

  /**
   * Quanti crediti sono davvero disponibili per un reparto.
   *
   * Non e' il residuo: se stai comprando difensori, i crediti per centrocampo
   * e attacco vanno tenuti da parte. Il peso di un reparto e' la sua quota di
   * budget per quanto e' ancora scoperto, cosi' un reparto quasi finito
   * smette di trattenere crediti che non gli servono piu'.
   *
   * Il tetto e' comunque il residuo meno un credito per ogni altra casella
   * scoperta: senza quel vincolo si finisce l'asta con posti vuoti e zero
   * crediti, che e' il modo peggiore di finirla.
   */
  function disponibilePerReparto(ruolo, dati, stato, perId) {
    const buchi = mancanti(dati, stato, perId);
    if (!buchi[ruolo]) return 0;

    const scoperti = dati.ordine.filter((r) => buchi[r] > 0);
    const peso = (r) => (dati.quote[r] || 0.25)
                        * (buchi[r] / Math.max(1, dati.slot[r] || 1));

    const pesoOra = peso(ruolo);
    const pesoDopo = scoperti.filter((r) => r !== ruolo)
                             .reduce((somma, r) => somma + peso(r), 0);
    const slotDopo = scoperti.filter((r) => r !== ruolo)
                             .reduce((somma, r) => somma + buchi[r], 0);

    const totale = pesoOra + pesoDopo;
    const cassa = residuo(stato);
    let quota = totale > 0 ? cassa * (pesoOra / totale) : cassa;

    // Un credito da parte per ogni altra casella ancora scoperta.
    quota = Math.min(quota, cassa - slotDopo);
    // Almeno un credito per ogni casella di questo reparto - ma solo se in
    // cassa ci sono. Se hai speso troppo presto, il conto deve dirtelo:
    // promettere crediti che non esistono e' il modo per arrivare all'ultimo
    // reparto con tre caselle vuote e la sorpresa.
    quota = Math.max(quota, Math.min(buchi[ruolo], cassa));
    quota = Math.min(quota, cassa);

    return Math.floor(Math.max(0, quota));
  }

  /**
   * Come spartire i crediti del reparto fra le caselle che restano.
   *
   * Con quattro difensori da fare e quaranta crediti non ti servono quattro
   * giocatori da dieci: te ne serve uno buono e poi dei tappabuchi. Le fasce
   * sono decrescenti, e l'eccedenza degli arrotondamenti va sulla prima.
   */
  function pianoSpesa(ruolo, dati, stato, perId, decadimento = 0.55) {
    const buchi = mancanti(dati, stato, perId)[ruolo];
    if (!buchi) return [];

    const disponibile = disponibilePerReparto(ruolo, dati, stato, perId);

    // Sotto un credito a casella non ci sono scelte da fare: si dice quante
    // caselle riesci ancora a coprire, e le altre restano a zero. E' brutto
    // da vedere, ed e' esattamente l'informazione che serve in quel momento.
    if (disponibile <= buchi) {
      return Array.from({ length: buchi }, (_, i) => (i < disponibile ? 1 : 0));
    }

    const pesi = Array.from({ length: buchi }, (_, i) => decadimento ** i);
    const sommaPesi = pesi.reduce((a, b) => a + b, 0);

    const fasce = pesi.map((p) => Math.max(1, Math.floor(disponibile * p / sommaPesi)));
    const avanzo = disponibile - fasce.reduce((a, b) => a + b, 0);
    if (avanzo > 0) fasce[0] += avanzo;
    return fasce;
  }

  /** Il massimo che puoi mettere su UNA casella di questo ruolo, adesso. */
  function massimoAdesso(ruolo, dati, stato, perId) {
    const piano = pianoSpesa(ruolo, dati, stato, perId);
    return piano.length ? piano[0] : 0;
  }

  /** Gli id gia' assegnati, tuoi o di altri. */
  function occupati(stato) {
    const ids = new Set();
    for (const voce of stato.rosa) ids.add(voce.id);
    for (const voce of stato.venduti) ids.add(voce.id);
    return ids;
  }

  function liberi(dati, stato) {
    const presi = occupati(stato);
    return dati.giocatori.filter((g) => !presi.has(g.id));
  }

  /**
   * Chi puo' riempire una casella entro un tetto.
   * Il prezzo e' un vincolo, non il criterio: fra quelli che ci stanno
   * vengono prima quelli che rendono di piu'. Ordinare per prezzo nascondeva
   * gli affari veri, che stanno sempre a meta' classifica.
   */
  function candidati(ruolo, tetto, dati, stato, quanti = 5) {
    return liberi(dati, stato)
      .filter((g) => g.r === ruolo
                     && prezzo(g, stato.lega) <= tetto
                     && !(g.out && g.out.grave))
      .sort((a, b) => (b.y ?? -1) - (a.y ?? -1)
                      || prezzo(a, stato.lega) - prezzo(b, stato.lega))
      .slice(0, quanti);
  }

  return {
    chiaveLega, prezzo, fascia, slotTotali,
    speso, residuo, presiPerRuolo, mancanti, caselleScoperte,
    repartoInCorso, disponibilePerReparto, pianoSpesa, massimoAdesso,
    occupati, liberi, candidati,
  };
})();

// In Node serve per i test; nel browser resta la variabile globale Conti.
if (typeof module !== 'undefined' && module.exports) module.exports = Conti;
