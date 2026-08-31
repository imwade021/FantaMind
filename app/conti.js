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


  /* ------------------------------------------------ ALLENATORE ------- */

  /** I giocatori della tua rosa, come oggetti completi. */
  function rosaCompleta(stato, perId) {
    return stato.rosa
      .map((voce) => {
        const g = perId.get(voce.id);
        return g ? Object.assign({}, g, { pagato: voce.prezzo }) : null;
      })
      .filter(Boolean);
  }

  /** Chi della tua rosa e' fermo adesso. Prima i casi gravi. */
  function allarmi(stato, perId) {
    return rosaCompleta(stato, perId)
      .filter((g) => g.out)
      .sort((a, b) => (b.out.grave ? 1 : 0) - (a.out.grave ? 1 : 0));
  }

  /**
   * L'undici migliore che la tua rosa permette con questo modulo.
   *
   * Il criterio e' la resa, e chi e' fermo non si schiera. Se un reparto non
   * ha abbastanza uomini disponibili si dice quanti ne mancano, invece di
   * riempire il buco con qualcuno fuori ruolo.
   */
  function undici(modulo, dati, stato, perId) {
    // dati.moduli puo' mancare se il JSON e' stato generato da un core vecchio.
    const reparti = dati.moduli && dati.moduli[modulo];
    if (!reparti) return null;

    const richiesti = { P: 1, D: reparti[0], C: reparti[1], A: reparti[2] };
    const disponibili = rosaCompleta(stato, perId).filter((g) => !(g.out && g.out.grave));

    const schierati = [];
    const buchi = {};
    for (const ruolo of dati.ordine) {
      const candidati = disponibili
        .filter((g) => g.r === ruolo)
        .sort((a, b) => (b.y ?? -1) - (a.y ?? -1));
      const presi = candidati.slice(0, richiesti[ruolo]);
      schierati.push(...presi);
      if (presi.length < richiesti[ruolo]) {
        buchi[ruolo] = richiesti[ruolo] - presi.length;
      }
    }

    const schieratiId = new Set(schierati.map((g) => g.id));
    const panchina = rosaCompleta(stato, perId)
      .filter((g) => !schieratiId.has(g.id))
      .sort((a, b) => (b.y ?? -1) - (a.y ?? -1));

    const conResa = schierati.filter((g) => g.y !== null && g.y !== undefined);
    const media = conResa.length
      ? conResa.reduce((somma, g) => somma + g.y, 0) / conResa.length
      : null;

    return { schierati, panchina, buchi, media, richiesti };
  }

  /**
   * Il modificatore di difesa: media voto di portiere piu' i tre migliori
   * difensori. Conta la MEDIA VOTO, non la fantamedia: il bonus lo fa la
   * solidita' della retroguardia, non i gol dei terzini.
   */
  function modificatoreDifesa(dati, stato, perId) {
    const rosa = rosaCompleta(stato, perId).filter((g) => g.mvp !== null && g.mvp !== undefined);
    const portiere = rosa.filter((g) => g.r === 'P').sort((a, b) => b.mvp - a.mvp)[0];
    const difensori = rosa.filter((g) => g.r === 'D').sort((a, b) => b.mvp - a.mvp).slice(0, 3);

    if (!portiere || difensori.length < 3) {
      return {
        pronto: false,
        mancaPortiere: !portiere,
        difensori: difensori.length,
      };
    }

    const scelti = [portiere, ...difensori];
    const media = scelti.reduce((somma, g) => somma + g.mvp, 0) / scelti.length;
    const tabella = dati.modificatore || [];
    const scaglione = tabella.find((riga) => media >= riga.da);

    return {
      pronto: true,
      media: Math.round(media * 100) / 100,
      bonus: scaglione ? scaglione.bonus : 0,
      scelti,
    };
  }

  /**
   * Il confronto fra due giocatori, in numeri.
   *
   * Non dice "conviene": dice di quanto cambiano resa, certezza e prezzo.
   * La convenienza dipende da cosa ti serve in quel momento, e quello lo sai
   * solo tu.
   */
  function confrontoScambio(cedutoId, ricevutoId, lega, perId) {
    const ceduto = perId.get(cedutoId);
    const ricevuto = perId.get(ricevutoId);
    if (!ceduto || !ricevuto) return null;

    const differenza = (a, b) => (a === null || a === undefined
                                  || b === null || b === undefined) ? null : b - a;

    return {
      ceduto,
      ricevuto,
      stessoRuolo: ceduto.r === ricevuto.r,
      resa: differenza(ceduto.y, ricevuto.y),
      certezza: differenza(ceduto.c, ricevuto.c),
      prezzo: prezzo(ricevuto, lega) - prezzo(ceduto, lega),
    };
  }


  /* ------------------------------------------------- MERCATO ATTESO --- */

  /**
   * Quanto pagherà la stanza, secondo le liste dei creator.
   *
   * Il campo che si usa e' il PMA: il prezzo medio d'asta in PERCENTUALE di
   * budget. E' l'unico confrontabile fra leghe diverse - il "prezzo" scritto
   * da un creator vale sulla lega che aveva in mente lui, la percentuale vale
   * sulla tua. Qui si moltiplica per il tuo budget e basta.
   *
   * Torna null se nessuna lista nomina quel giocatore: e' un'informazione
   * anche quella, e non va confusa con "costa poco".
   */
  function mercato(g, strategie, lega) {
    if (!strategie || !strategie.giocatori) return null;
    const voce = strategie.giocatori[String(g.id)];
    if (!voce || !voce.pma) return null;

    const inCrediti = (quota) => (quota === null || quota === undefined
                                  ? null : Math.round(quota * lega.budget));
    return {
      atteso: inCrediti(voce.pma),
      min: inCrediti(voce.pma_min),
      max: inCrediti(voce.pma_max),
      liste: voce.liste,
      obiettivo: voce.obiettivo,
      voci: voce.voci || [],
    };
  }

  /**
   * La distanza fra il tuo prezzo e quello che pagherà la stanza.
   *
   * Positiva: il mercato paga PIU' di quanto valga secondo i tuoi numeri -
   * lascialo agli altri, o mettici sopra solo se ti serve davvero.
   * Negativa: la stanza lo sottovaluta. Li' c'e' l'affare.
   */
  function divergenza(g, strategie, lega) {
    const atteso = mercato(g, strategie, lega);
    if (!atteso || atteso.atteso === null) return null;
    return atteso.atteso - prezzo(g, lega);
  }

  /**
   * I giocatori che la stanza sottovaluta, fra quelli ancora liberi.
   * Si guardano solo quelli con una resa nota: un affare su un giocatore
   * di cui non si sa niente non e' un affare, e' una scommessa.
   */
  function affari(dati, stato, strategie, quanti = 8) {
    return liberi(dati, stato)
      .filter((g) => g.y !== null && g.y !== undefined && !(g.out && g.out.grave))
      .map((g) => ({ g, delta: divergenza(g, strategie, stato.lega) }))
      .filter((x) => x.delta !== null && x.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, quanti);
  }

  return {
    chiaveLega, prezzo, fascia, slotTotali,
    speso, residuo, presiPerRuolo, mancanti, caselleScoperte,
    repartoInCorso, disponibilePerReparto, pianoSpesa, massimoAdesso,
    occupati, liberi, candidati,
    rosaCompleta, allarmi, undici, modificatoreDifesa, confrontoScambio,
    mercato, divergenza, affari,
  };
})();

// In Node serve per i test; nel browser resta la variabile globale Conti.
if (typeof module !== 'undefined' && module.exports) module.exports = Conti;
