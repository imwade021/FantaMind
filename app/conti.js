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
  /**
   * Il budget di un reparto diviso in fasce decrescenti.
   *
   * Sta qui, da sola, perche' la usano sia il piano del reparto sia il tetto
   * sul singolo giocatore: due copie della stessa formula darebbero due
   * numeri diversi per la stessa domanda.
   */
  function fasceDecrescenti(disponibile, caselle, decadimento = 0.55) {
    if (caselle <= 0) return [];
    if (disponibile <= caselle) {
      return Array.from({ length: caselle },
                        (_, i) => (i < disponibile ? 1 : 0));
    }
    const pesi = Array.from({ length: caselle }, (_, i) => decadimento ** i);
    const somma = pesi.reduce((a, b) => a + b, 0);
    const fasce = pesi.map((p) => Math.max(1, Math.floor(disponibile * p / somma)));
    const avanzo = disponibile - fasce.reduce((a, b) => a + b, 0);
    if (avanzo > 0) fasce[0] += avanzo;
    return fasce;
  }

  function pianoSpesa(ruolo, dati, stato, perId, decadimento = 0.55) {
    const buchi = mancanti(dati, stato, perId)[ruolo];
    if (!buchi) return [];

    // Sotto un credito a casella non ci sono scelte da fare: si dice quante
    // caselle riesci ancora a coprire, e le altre restano a zero. E' brutto
    // da vedere, ed e' esattamente l'informazione che serve in quel momento.
    const disponibile = disponibilePerReparto(ruolo, dati, stato, perId);
    return fasceDecrescenti(disponibile, buchi, decadimento);
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


  /* ------------------------------------------------- LISTA DEI DESIDERI - */

  /**
   * Quanto costerà davvero prendere un giocatore.
   *
   * Se le liste dei creator dicono che la stanza lo paga 52, il tuo prezzo di
   * 23 non e' la cifra da mettere da parte: e' quella che serve per NON
   * prenderlo. Si riserva il piu' alto dei due.
   */
  function costoAtteso(g, strategie, lega) {
    const m = mercato(g, strategie, lega);
    const mio = prezzo(g, lega);
    return m && m.atteso !== null ? Math.max(mio, m.atteso) : mio;
  }

  function inLista(g, stato) {
    return (stato.desideri || []).includes(g.id);
  }

  /** I desiderati ancora liberi. Chi e' gia' andato via non impegna crediti. */
  function desiderati(dati, stato, perId, soloLiberi = true) {
    const presi = occupati(stato);
    return (stato.desideri || [])
      .map((id) => perId.get(id))
      .filter(Boolean)
      .filter((g) => !soloLiberi || !presi.has(g.id));
  }

  /**
   * I crediti da tenere da parte per i desiderati di un reparto.
   * Chi e' fermo non si riserva: quella casella non la riempie.
   */
  function riserva(ruolo, dati, stato, perId, strategie) {
    return desiderati(dati, stato, perId)
      .filter((g) => g.r === ruolo && !(g.out && g.out.grave))
      .reduce((somma, g) => somma + costoAtteso(g, strategie, stato.lega), 0);
  }

  /**
   * Il massimo che puoi mettere su QUESTO giocatore, adesso.
   *
   * Per un desiderato il tetto non e' piu' la casella media del reparto: e'
   * tutto il reparto meno quello che serve per gli altri desiderati e per le
   * caselle che restano. Hai deciso che lui lo vuoi, e il piano si adegua.
   *
   * Per chiunque altro il tetto SCENDE della riserva: quei crediti sono
   * gia' promessi. E' il senso della lista - se non togliesse niente a
   * nessuno, non starebbe cambiando nessuna decisione.
   */
  function massimoPer(g, dati, stato, perId, strategie) {
    const buchi = mancanti(dati, stato, perId);
    if (!buchi[g.r]) return 0;

    const disponibile = disponibilePerReparto(g.r, dati, stato, perId);
    const desiderato = inLista(g, stato);
    const altri = desiderati(dati, stato, perId)
      .filter((x) => x.r === g.r && x.id !== g.id && !(x.out && x.out.grave));
    const impegnato = altri.reduce(
      (somma, x) => somma + costoAtteso(x, strategie, stato.lega), 0);

    if (desiderato) {
      // Un credito per ogni altra casella del reparto che resterebbe vuota.
      const casellePoi = Math.max(0, buchi[g.r] - 1 - altri.length);
      return Math.max(1, Math.floor(disponibile - impegnato - casellePoi));
    }

    // Per chi non e' in lista: le stesse fasce decrescenti di sempre, ma
    // calcolate sui crediti che restano dopo la riserva e sulle caselle che
    // restano dopo i desiderati. Senza lista in memoria il conto e' identico
    // a quello del piano di reparto - ed e' giusto che lo sia.
    const caselleLibere = Math.max(1, buchi[g.r] - altri.length);
    const fasce = fasceDecrescenti(Math.max(0, disponibile - impegnato),
                                   caselleLibere);
    return fasce.length ? fasce[0] : 0;
  }

  /**
   * La lista sta in piedi con questo budget?
   *
   * Somma quello che costeranno i desiderati liberi e lascia un credito per
   * ogni altra casella. Se sfora, meglio saperlo prima dell'asta che a meta'.
   */
  function sostenibilita(dati, stato, perId, strategie) {
    const lista = desiderati(dati, stato, perId)
      .filter((g) => !(g.out && g.out.grave));
    const costo = lista.reduce(
      (somma, g) => somma + costoAtteso(g, strategie, stato.lega), 0);

    const buchi = mancanti(dati, stato, perId);
    const scoperte = Object.values(buchi).reduce((a, b) => a + b, 0);
    const altreCaselle = Math.max(0, scoperte - lista.length);
    const cassa = residuo(stato);

    return {
      quanti: lista.length,
      costo,
      residuo: cassa,
      altreCaselle,
      // Quanto resta per casella dopo aver pagato tutta la lista.
      perCasella: altreCaselle > 0
        ? Math.floor((cassa - costo) / altreCaselle) : null,
      sfora: costo + altreCaselle > cassa,
      // Piu' desiderati che caselle in un ruolo: non e' un errore, ma
      // significa che alcuni non li prenderai comunque.
      troppi: Object.fromEntries(dati.ordine.map((r) => [
        r, Math.max(0, lista.filter((g) => g.r === r).length - buchi[r]),
      ]).filter(([, quanti]) => quanti > 0)),
    };
  }

  return {
    chiaveLega, prezzo, fascia, slotTotali,
    speso, residuo, presiPerRuolo, mancanti, caselleScoperte,
    repartoInCorso, disponibilePerReparto, fasceDecrescenti, pianoSpesa,
    massimoAdesso,
    occupati, liberi, candidati,
    rosaCompleta, allarmi, undici, modificatoreDifesa, confrontoScambio,
    mercato, divergenza, affari,
    costoAtteso, inLista, desiderati, riserva, massimoPer, sostenibilita,
  };
})();

// In Node serve per i test; nel browser resta la variabile globale Conti.
if (typeof module !== 'undefined' && module.exports) module.exports = Conti;
