/* ------------------------------------------------------------------
   FantaMind - l'applicazione.

   Che cosa NON si calcola qui: prezzi, fasce, certezza, resa, percentili,
   rigoristi. Arrivano gia' fatti dentro dati_asta.json, che li prende dal
   core Python. Se un numero e' sbagliato, il posto da correggere e' core/,
   non questo file. E' la regola che tiene allineate tutte le schermate.

   Che cosa si calcola qui, perche' non si puo' fare prima: tutto quello che
   dipende dall'asta in corso - crediti residui, caselle scoperte, quanto
   puoi ancora mettere su questa casella, chi e' ancora libero.
   ------------------------------------------------------------------ */

'use strict';

const CHIAVE_SALVATAGGIO = 'fantamind:asta:v1';
const NOMI_RUOLO = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };

let DATI = null;                 // il contenuto di dati_asta.json
let PER_ID = new Map();          // id -> giocatore, per non filtrare ogni volta
let vista = 'control';

let stato = {
  lega: { squadre: 8, budget: 500 },
  rosa: [],        // { id, prezzo } - i miei
  venduti: [],     // { id, prezzo } - quelli degli altri
  storia: [],      // per Annulla: copie dello stato precedente
};

/* ============================================================ SALVATAGGIO */

function salva() {
  try {
    const { lega, rosa, venduti } = stato;
    localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify({ lega, rosa, venduti }));
  } catch (errore) {
    // Safari in navigazione privata rifiuta di scrivere. L'asta continua
    // in memoria: meglio senza salvataggio che con l'app bloccata.
    console.warn('Salvataggio non riuscito:', errore);
  }
}

function ripristina() {
  try {
    const grezzo = localStorage.getItem(CHIAVE_SALVATAGGIO);
    if (!grezzo) return;
    const letto = JSON.parse(grezzo);
    if (letto.lega) stato.lega = letto.lega;
    if (Array.isArray(letto.rosa)) stato.rosa = letto.rosa;
    if (Array.isArray(letto.venduti)) stato.venduti = letto.venduti;
  } catch (errore) {
    console.warn('Salvataggio illeggibile, si riparte puliti:', errore);
  }
}

function ricorda() {
  // Dieci passi indietro bastano: piu' in la' non ci si ricorda comunque
  // che cosa si stava facendo.
  stato.storia.push(JSON.stringify({ rosa: stato.rosa, venduti: stato.venduti }));
  if (stato.storia.length > 10) stato.storia.shift();
}

/* ============================================================ CONTI D'ASTA */
/* La matematica dell'asta vive in conti.js: qui ci sono solo le scorciatoie
   che gli passano DATI, stato e l'indice per id. */

const chiaveLega = () => Conti.chiaveLega(stato.lega);
const prezzo = (g) => Conti.prezzo(g, stato.lega);
const fascia = (g) => Conti.fascia(g, stato.lega);
const slotRuolo = (ruolo) => DATI.slot[ruolo] || 0;
const slotTotali = () => Conti.slotTotali(DATI);
const speso = () => Conti.speso(stato);
const residuo = () => Conti.residuo(stato);
const presiPerRuolo = () => Conti.presiPerRuolo(DATI, stato, PER_ID);
const mancanti = () => Conti.mancanti(DATI, stato, PER_ID);
const caselleScoperte = () => Conti.caselleScoperte(DATI, stato, PER_ID);
const repartoInCorso = () => Conti.repartoInCorso(DATI, stato, PER_ID);
const occupati = () => Conti.occupati(stato);
const liberi = () => Conti.liberi(DATI, stato);
const disponibilePerReparto = (r) => Conti.disponibilePerReparto(r, DATI, stato, PER_ID);
const pianoSpesa = (r) => Conti.pianoSpesa(r, DATI, stato, PER_ID);
const massimoAdesso = (r) => Conti.massimoAdesso(r, DATI, stato, PER_ID);
const candidati = (r, tetto, quanti) => Conti.candidati(r, tetto, DATI, stato, quanti);
const rosaCompleta = () => Conti.rosaCompleta(stato, PER_ID);
const allarmi = () => Conti.allarmi(stato, PER_ID);
const undici = (modulo) => Conti.undici(modulo, DATI, stato, PER_ID);
const modificatoreDifesa = () => Conti.modificatoreDifesa(DATI, stato, PER_ID);

/* ============================================================= FORMATTAZIONE */

function elemento(html) {
  // Deve essere un <template>, non un <div>: il parser HTML BUTTA VIA <tr> e
  // <td> che non stiano dentro una <table>, quindi in un div le righe della
  // tabella perdevano le colonne e l'ultima riga spariva del tutto. Il
  // contenuto di un template viene invece parsato senza quella regola.
  const modello = document.createElement('template');
  modello.innerHTML = html.trim();
  const nodo = modello.content.firstElementChild;
  if (!nodo) {
    // Meglio un errore che dice quale pezzo di HTML e' malformato, che un
    // appendChild(null) con un messaggio del browser da decifrare.
    throw new Error(`HTML senza elementi: ${html.trim().slice(0, 60)}…`);
  }
  return nodo;
}

function testoSicuro(valore) {
  return String(valore ?? '').replace(/[&<>"']/g, (carattere) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[carattere]));
}

function ritratto(g, classe = '') {
  if (g.foto) {
    // Se la foto non c'e' piu' sul sito, o si e' offline, resta il posto
    // vuoto invece dell'icona rotta del browser.
    return `<img class="faccia ${classe}" src="${testoSicuro(g.foto)}" alt=""
            loading="lazy" onerror="this.replaceWith(inizialiDi(${g.id}))">`;
  }
  return inizialiDi(g.id).outerHTML;
}

function inizialiDi(id) {
  const g = PER_ID.get(id);
  const sigla = (g ? g.n : '?').slice(0, 2).toUpperCase();
  const nodo = document.createElement('div');
  nodo.className = 'iniziali';
  nodo.textContent = sigla;
  return nodo;
}
window.inizialiDi = inizialiDi;

function statoBreve(g) {
  if (g.out) {
    const classe = g.out.grave ? 'ko' : 'ignoto';
    return `<span class="stato ${classe}">${testoSicuro(g.out.motivo)}</span>`;
  }
  if (g.c === null || g.c === undefined) {
    return '<span class="stato ignoto">nessuno storico</span>';
  }
  if (g.c >= 70) return `<span class="stato ok">certezza ${g.c}</span>`;
  return `<span class="stato ignoto">certezza ${g.c}</span>`;
}

function rigaGiocatore(g, valore, etichetta) {
  const nodo = elemento(`
    <button class="riga-gioc" data-id="${g.id}">
      <span class="ruolo ${g.r}">${g.r}</span>
      <span class="chi">
        <b>${testoSicuro(g.n)}</b>
        <small>${testoSicuro(g.s)} · ${prezzo(g)} crediti · ${testoSicuro(g.pos)}</small>
      </span>
      <span class="cifra-dx">${valore}<small>${etichetta}</small></span>
    </button>`);
  nodo.addEventListener('click', () => apriScheda(g.id));
  return nodo;
}

function avviso(testo, durata = 2600) {
  const nodo = document.getElementById('messaggio');
  nodo.textContent = testo;
  nodo.hidden = false;
  clearTimeout(avviso._timer);
  avviso._timer = setTimeout(() => { nodo.hidden = true; }, durata);
}

/* ============================================================ CONTROL CENTER */

function disegnaControl() {
  const fermi = DATI.giocatori.filter((g) => g.out && g.out.grave).length;
  document.getElementById('kpi-listone').textContent = DATI.giocatori.length;
  document.getElementById('kpi-residuo').textContent = residuo();
  document.getElementById('kpi-slot').textContent = `${stato.rosa.length}/${slotTotali()}`;
  document.getElementById('kpi-fermi').textContent = fermi;

  // --- la rosa, reparto per reparto ---
  const presi = presiPerRuolo();
  const contenitore = document.getElementById('rosa-reparti');
  contenitore.innerHTML = '';
  for (const ruolo of DATI.ordine) {
    const spesaRuolo = stato.rosa
      .filter((voce) => (PER_ID.get(voce.id) || {}).r === ruolo)
      .reduce((somma, voce) => somma + voce.prezzo, 0);
    contenitore.appendChild(elemento(`
      <div class="reparto">
        <span class="ruolo ${ruolo}">${ruolo}</span>
        <span class="nome">${NOMI_RUOLO[ruolo]}</span>
        <span class="conto">${presi[ruolo]}/${slotRuolo(ruolo)} · ${spesaRuolo} cr</span>
      </div>`));
  }

  const quota = stato.lega.budget ? Math.min(100, 100 * speso() / stato.lega.budget) : 0;
  document.getElementById('barra-rosa').style.width = `${quota}%`;
  document.getElementById('rosa-spesa').textContent =
    `${speso()} di ${stato.lega.budget} crediti`;

  // --- occasioni ---
  const radar = document.getElementById('radar-home');
  radar.innerHTML = '';
  const migliori = liberi()
    .filter((g) => g.v !== null && g.v !== undefined && g.c !== null && g.c >= 60)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (!migliori.length) {
    radar.appendChild(elemento('<div class="vuoto">Nessuna occasione libera.</div>'));
  } else {
    migliori.forEach((g) => radar.appendChild(
      rigaGiocatore(g, `+${g.v.toFixed(2)}`, 'sui pari prezzo')));
  }

  // --- griglia portieri: i migliori otto, come nel colpo d'occhio dell'asta ---
  const griglia = document.getElementById('griglia-portieri');
  griglia.innerHTML = '';
  const portieri = DATI.giocatori
    .filter((g) => g.r === 'P' && g.y !== null && g.y !== undefined && g.pv >= 5)
    .sort((a, b) => b.y - a.y)
    .slice(0, 8);

  if (!portieri.length) {
    griglia.appendChild(elemento('<div class="vuoto">Nessun portiere con storico.</div>'));
  } else {
    for (const g of portieri) {
      const card = elemento(`
        <button class="card-portiere" data-id="${g.id}">
          <span class="alto">
            <span>${testoSicuro(g.s.slice(0, 3).toUpperCase())}</span>
            <b>${g.y.toFixed(2)}</b>
          </span>
          <span class="chi">${testoSicuro(g.n)}</span>
          <span class="misure">
            <span class="misura">${g.gs === null || g.gs === undefined
              ? 'GS —' : `GS ${g.gs.toFixed(2)}`}</span>
            <span class="misura">${g.c === null || g.c === undefined
              ? 'CRT —' : `CRT ${g.c}`}</span>
            <span class="misura">${prezzo(g)} cr</span>
          </span>
        </button>`);
      card.addEventListener('click', () => apriScheda(g.id));
      griglia.appendChild(card);
    }
  }

  // --- top fantamedia ---
  const classifica = document.getElementById('top-fantamedia');
  classifica.innerHTML = '';
  const migliori5 = DATI.giocatori
    .filter((g) => g.fm !== null && g.fm !== undefined && g.pv >= 15)
    .sort((a, b) => b.fm - a.fm)
    .slice(0, 6);

  migliori5.forEach((g, indice) => {
    const riga = elemento(`
      <button class="posto" data-id="${g.id}">
        <span class="numero">${indice + 1}</span>
        <span class="ruolo ${g.r}">${g.r}</span>
        <span class="chi">
          <b>${testoSicuro(g.n)}</b>
          <small>${testoSicuro(g.s)} · ${g.pv} presenze</small>
        </span>
        <span class="valore">${g.fm.toFixed(2)}</span>
      </button>`);
    riga.addEventListener('click', () => apriScheda(g.id));
    classifica.appendChild(riga);
  });

  // --- chi e' fermo fra i primi cento ---
  const elencoFermi = document.getElementById('infortunati-home');
  elencoFermi.innerHTML = '';
  const cari = DATI.giocatori.slice(0, 100).filter((g) => g.out && g.out.grave);
  if (!cari.length) {
    elencoFermi.appendChild(elemento(
      '<div class="vuoto">Nessuno dei primi cento è fermo. Buon segno.</div>'));
  } else {
    cari.slice(0, 8).forEach((g) => elencoFermi.appendChild(
      rigaGiocatore(g, prezzo(g), 'crediti')));
  }

  // --- scorciatoie alle altre sezioni ---
  const scorciatoie = document.getElementById('scorciatoie');
  scorciatoie.innerHTML = '';
  const destinazioni = [
    ['enciclopedia', '▤', 'Enciclopedia', 'Tutto il listone, con i filtri.'],
    ['asta', '◈', 'Asta Live', "Registra gli acquisti e vedi quanto puoi spendere."],
    ['strategia', '◱', 'Strategia', 'Come spartire il budget e chi puntare.'],
    ['allenatore', '◇', 'Allenatore', 'Chi schierare e quanto vale la difesa.'],
  ];
  for (const [dove, segno, titolo, testo] of destinazioni) {
    const card = elemento(`
      <button class="scorciatoia" data-va="${dove}">
        <span class="bollo">${segno}</span>
        <b>${titolo}</b>
        <small>${testo}</small>
      </button>`);
    card.addEventListener('click', () => cambiaVista(dove));
    scorciatoie.appendChild(card);
  }
}

/* ============================================================= ENCICLOPEDIA */

let filtri = { testo: '', ruolo: '', stato: '', fascia: '', ordine: 'p' };

function filtrati() {
  const cerca = filtri.testo.trim().toLowerCase();
  const presi = occupati();

  let elenco = DATI.giocatori.filter((g) => {
    if (filtri.ruolo && g.r !== filtri.ruolo) return false;
    if (filtri.fascia && String(fascia(g)) !== filtri.fascia) return false;
    if (filtri.stato === 'liberi' && presi.has(g.id)) return false;
    if (filtri.stato === 'sani' && g.out && g.out.grave) return false;
    if (filtri.stato === 'storico' && (g.c === null || g.c === undefined)) return false;
    if (cerca) {
      const dove = `${g.n} ${g.nc} ${g.s}`.toLowerCase();
      if (!dove.includes(cerca)) return false;
    }
    return true;
  });

  const chiave = filtri.ordine;
  elenco.sort((a, b) => {
    const valoreA = chiave === 'p' ? prezzo(a) : a[chiave];
    const valoreB = chiave === 'p' ? prezzo(b) : b[chiave];
    // Chi non ha il dato va in fondo, sempre: mescolarlo coi bassi
    // farebbe sembrare scarso chi semplicemente non ha numeri.
    if (valoreA === null || valoreA === undefined) return 1;
    if (valoreB === null || valoreB === undefined) return -1;
    return valoreB - valoreA;
  });
  return elenco;
}

function disegnaEnciclopedia() {
  const elenco = filtrati();
  const corpo = document.getElementById('corpo-tabella');
  corpo.innerHTML = '';

  document.getElementById('enc-conteggio').textContent =
    `${elenco.length} giocatori su ${DATI.giocatori.length}, aggiornati al ${DATI.aggiornato}.`;
  document.getElementById('tabella-vuota').hidden = elenco.length > 0;

  // Oltre le duecento righe il telefono comincia a soffrire e nessuno
  // scorre cosi' in basso: si filtra, non si scorre.
  const mostrati = elenco.slice(0, 200);
  const frammento = document.createDocumentFragment();

  for (const g of mostrati) {
    const riga = elemento(`
      <tr data-id="${g.id}">
        <td>
          <span class="cella-nome">
            ${ritratto(g)}
            <span><b>${testoSicuro(g.n)}</b><small>${testoSicuro(g.s)}</small></span>
          </span>
        </td>
        <td class="no-mobile"><span class="ruolo ${g.r}">${g.r}</span></td>
        <td><b>${prezzo(g)}</b></td>
        <td>${g.y === null || g.y === undefined ? '—' : g.y.toFixed(2)}</td>
        <td class="no-mobile">${g.c === null || g.c === undefined ? '—' : g.c}</td>
        <td class="no-mobile">${g.v === null || g.v === undefined
          ? '—' : (g.v > 0 ? '+' : '') + g.v.toFixed(2)}</td>
        <td class="no-mobile">F${fascia(g)}</td>
        <td>${statoBreve(g)}</td>
      </tr>`);
    riga.addEventListener('click', () => apriScheda(g.id));
    frammento.appendChild(riga);
  }
  corpo.appendChild(frammento);

  if (elenco.length > mostrati.length) {
    const avanzo = elenco.length - mostrati.length;
    corpo.appendChild(elemento(`
      <tr><td colspan="8" style="text-align:center;color:var(--ink-basso)">
        Altri ${avanzo} non mostrati. Restringi la ricerca.
      </td></tr>`));
  }
}

/* ================================================================ ASTA LIVE */

function disegnaAsta() {
  const ruolo = repartoInCorso();
  document.getElementById('asta-residuo').textContent = residuo();
  document.getElementById('asta-slot').textContent = `${stato.rosa.length}/${slotTotali()}`;

  const scoperte = caselleScoperte();
  document.getElementById('asta-medio').textContent =
    scoperte ? Math.floor(residuo() / scoperte) : '—';

  if (ruolo) {
    document.getElementById('asta-max').textContent = massimoAdesso(ruolo);
    document.getElementById('asta-max-etichetta').textContent =
      `Massimo su un ${NOMI_RUOLO[ruolo].toLowerCase().slice(0, -1)}`;
  } else {
    document.getElementById('asta-max').textContent = '—';
    document.getElementById('asta-max-etichetta').textContent = 'Rosa completa';
  }

  // --- il piano di spesa del reparto in corso ---
  const piano = document.getElementById('piano-spesa');
  piano.innerHTML = '';
  document.getElementById('piano-reparto').textContent =
    ruolo ? `${NOMI_RUOLO[ruolo]} · ${disponibilePerReparto(ruolo)} crediti` : '—';

  if (!ruolo) {
    piano.appendChild(elemento(
      '<div class="vuoto">Rosa completa. Non ti serve più un piano.</div>'));
  } else {
    pianoSpesa(ruolo).forEach((tetto, indice) => {
      const scelti = candidati(ruolo, tetto, 2);
      const nomi = scelti.length
        ? scelti.map((g) => `${testoSicuro(g.n)} (${prezzo(g)})`).join(', ')
        : 'nessuno libero a questa cifra';
      piano.appendChild(elemento(`
        <div class="consiglio-riga">
          <span>Casella ${indice + 1} · fino a <b>${tetto}</b></span>
          <span style="color:var(--ink-medio);text-align:right">${nomi}</span>
        </div>`));
    });
  }

  // --- occasioni ancora libere ---
  const radar = document.getElementById('radar-asta');
  radar.innerHTML = '';
  const migliori = liberi()
    .filter((g) => g.v !== null && g.v !== undefined && !(g.out && g.out.grave))
    .filter((g) => !ruolo || g.r === ruolo)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (!migliori.length) {
    radar.appendChild(elemento('<div class="vuoto">Nessuna occasione libera.</div>'));
  } else {
    migliori.forEach((g) => radar.appendChild(
      rigaGiocatore(g, `+${g.v.toFixed(2)}`, 'sui pari prezzo')));
  }

  // --- la rosa ---
  const rosa = document.getElementById('asta-rosa');
  rosa.innerHTML = '';
  document.getElementById('asta-rosa-nota').textContent =
    `${stato.rosa.length} acquisti · ${speso()} crediti`;

  if (!stato.rosa.length) {
    rosa.appendChild(elemento(
      '<div class="vuoto">Ancora niente. Cerca chi è all\'asta e registra il prezzo.</div>'));
  } else {
    for (const voce of [...stato.rosa].reverse()) {
      const g = PER_ID.get(voce.id);
      if (!g) continue;
      rosa.appendChild(rigaGiocatore(g, voce.prezzo, 'pagati'));
    }
  }
}

function cercaPerAsta(testo) {
  const contenitore = document.getElementById('asta-risultati');
  contenitore.innerHTML = '';
  const cerca = testo.trim().toLowerCase();
  if (cerca.length < 2) return;

  const trovati = liberi()
    .filter((g) => `${g.n} ${g.nc}`.toLowerCase().includes(cerca))
    .slice(0, 6);

  if (!trovati.length) {
    contenitore.appendChild(elemento(
      '<div class="vuoto">Nessuno con questo nome fra quelli ancora liberi.</div>'));
    return;
  }

  for (const g of trovati) {
    const nodo = elemento(`
      <button class="riga-gioc" data-scelto="${g.id}">
        <span class="ruolo ${g.r}">${g.r}</span>
        <span class="chi">
          <b>${testoSicuro(g.n)}</b>
          <small>${testoSicuro(g.s)} · fascia ${fascia(g)} · ${testoSicuro(g.pos)}</small>
        </span>
        <span class="cifra-dx">${prezzo(g)}<small>consigliato</small></span>
      </button>`);
    nodo.addEventListener('click', () => scegliPerAsta(g));
    contenitore.appendChild(nodo);
  }
}

let sceltoPerAsta = null;

function scegliPerAsta(g) {
  sceltoPerAsta = g;
  document.getElementById('asta-cerca').value = g.n;
  const campoPrezzo = document.getElementById('asta-prezzo');
  if (!campoPrezzo.value) campoPrezzo.value = prezzo(g);
  document.getElementById('asta-risultati').innerHTML = '';

  const ruolo = repartoInCorso();
  const tetto = ruolo === g.r ? massimoAdesso(g.r) : null;
  document.getElementById('asta-suggerito').textContent = tetto
    ? `${g.n}: consigliato ${prezzo(g)}, il tuo tetto adesso è ${tetto}`
    : `${g.n}: consigliato ${prezzo(g)} crediti`;
}

function registra(mio) {
  if (!sceltoPerAsta) {
    avviso('Prima scegli chi è all\'asta.');
    return;
  }
  const campoPrezzo = document.getElementById('asta-prezzo');
  const valore = parseInt(campoPrezzo.value, 10);
  if (!Number.isFinite(valore) || valore < 1) {
    avviso('Serve il prezzo: quanto è stato pagato?');
    campoPrezzo.focus();
    return;
  }
  if (mio && valore > residuo()) {
    avviso(`Non ci arrivi: ti restano ${residuo()} crediti.`);
    return;
  }
  if (mio && mancanti()[sceltoPerAsta.r] === 0) {
    avviso(`Hai già tutti i ${NOMI_RUOLO[sceltoPerAsta.r].toLowerCase()}.`);
    return;
  }

  ricorda();
  const voce = { id: sceltoPerAsta.id, prezzo: valore };
  (mio ? stato.rosa : stato.venduti).push(voce);
  avviso(mio
    ? `${sceltoPerAsta.n} è tuo per ${valore}.`
    : `${sceltoPerAsta.n} va a un altro per ${valore}.`);

  sceltoPerAsta = null;
  document.getElementById('asta-cerca').value = '';
  campoPrezzo.value = '';
  document.getElementById('asta-suggerito').textContent = '—';
  salva();
  disegnaTutto();
}

function annulla() {
  if (!stato.storia.length) {
    avviso('Non c\'è niente da annullare.');
    return;
  }
  const passato = JSON.parse(stato.storia.pop());
  stato.rosa = passato.rosa;
  stato.venduti = passato.venduti;
  salva();
  disegnaTutto();
  avviso('Tornato indietro di un passo.');
}

/* ================================================================ STRATEGIA */

function disegnaStrategia() {
  // --- come si spartisce il budget ---
  const riparto = document.getElementById('riparto-reparti');
  riparto.innerHTML = '';
  for (const ruolo of DATI.ordine) {
    const crediti = Math.round(stato.lega.budget * DATI.quote[ruolo]);
    const perCasella = Math.round(crediti / slotRuolo(ruolo));
    riparto.appendChild(elemento(`
      <div class="pannello cifra">
        <div><span class="ruolo ${ruolo}">${ruolo}</span></div>
        <div class="valore">${crediti}</div>
        <div class="etichetta">${NOMI_RUOLO[ruolo]} ·
          ${slotRuolo(ruolo)} caselle · ~${perCasella} l'una</div>
      </div>`));
  }

  // --- chi puntare ---
  const target = document.getElementById('top-target');
  target.innerHTML = '';
  for (const ruolo of DATI.ordine) {
    const colonna = elemento(`<div><p class="nota" style="margin:0 0 9px">
      ${NOMI_RUOLO[ruolo]}</p><div class="elenco"></div></div>`);
    const elenco = colonna.querySelector('.elenco');
    const scelti = liberi()
      .filter((g) => g.r === ruolo && g.y !== null && g.y !== undefined
                     && !(g.out && g.out.grave))
      .sort((a, b) => b.y - a.y)
      .slice(0, 4);
    if (!scelti.length) {
      elenco.appendChild(elemento('<div class="vuoto">Nessuno libero.</div>'));
    } else {
      scelti.forEach((g) => elenco.appendChild(
        rigaGiocatore(g, g.y.toFixed(2), 'resa')));
    }
    target.appendChild(colonna);
  }

  // --- le fasce della lega scelta ---
  const tabella = document.getElementById('tabella-fasce');
  tabella.innerHTML = '';
  document.getElementById('fasce-nota').textContent =
    `${stato.lega.squadre} squadre · ${stato.lega.budget} crediti`;

  const rotture = (DATI.rotture_lega || {})[chiaveLega()] || DATI.rotture;
  for (const ruolo of DATI.ordine) {
    const punti = (rotture[ruolo] || [])
      .map((p) => `F${p.fascia}: ${p.da}–${p.a} cr (${p.quanti})`)
      .join('  ·  ');
    tabella.appendChild(elemento(`
      <div class="consiglio-riga">
        <span><span class="ruolo ${ruolo}">${ruolo}</span> ${NOMI_RUOLO[ruolo]}</span>
        <span style="color:var(--ink-medio);text-align:right">${punti}</span>
      </div>`));
  }

  // --- cosa dicono i numeri, non massime generiche ---
  const consigli = document.getElementById('consigli-operativi');
  consigli.innerHTML = '';
  for (const testo of consigliCalcolati()) {
    consigli.appendChild(elemento(`
      <div class="suggerimento"><span class="ico">▸</span><span>${testo}</span></div>`));
  }
}

/**
 * I consigli escono dai numeri di QUESTA lega e di QUESTA rosa.
 * "Non spendere più del 35% su un giocatore" vale per chiunque e quindi non
 * serve a nessuno: qui si dice cosa succede nella stanza in cui sei tu.
 */
function consigliCalcolati() {
  const righe = [];
  const rotture = (DATI.rotture_lega || {})[chiaveLega()] || DATI.rotture;
  const disponibili = liberi();

  // Quanto costa il piu' caro rispetto al budget.
  const piuCaro = DATI.giocatori.reduce(
    (massimo, g) => Math.max(massimo, prezzo(g)), 0);
  righe.push(`Il giocatore più caro del listone vale <b>${piuCaro}</b> crediti,
    il <b>${Math.round(100 * piuCaro / stato.lega.budget)}%</b> del tuo budget.`);

  // Quante caselle di fascia 1 esistono in tutta la lega.
  for (const ruolo of DATI.ordine) {
    const primaFascia = (rotture[ruolo] || []).find((p) => p.fascia === 1);
    if (!primaFascia) continue;
    const rimasti = disponibili.filter(
      (g) => g.r === ruolo && fascia(g) === 1).length;
    righe.push(`${NOMI_RUOLO[ruolo]} di fascia 1: ne restano
      <b>${rimasti}</b> su ${primaFascia.quanti}, fra ${primaFascia.a} e
      ${primaFascia.da} crediti.`);
  }

  // Quanti giocatori non hanno storico: la parte di listone su cui nessuno sa niente.
  const senzaStorico = disponibili.filter(
    (g) => g.c === null || g.c === undefined).length;
  righe.push(`<b>${senzaStorico}</b> giocatori liberi non hanno storico in Serie A:
    neopromossi e arrivi dall'estero. Su di loro nessuno ha numeri, nemmeno gli altri.`);

  // Chi e' fermo adesso fra quelli ancora in asta.
  const fermi = disponibili.filter((g) => g.out && g.out.grave).length;
  if (fermi) {
    righe.push(`<b>${fermi}</b> giocatori ancora liberi sono fermi adesso.
      Costano meno per un motivo che è scritto nella loro scheda.`);
  }

  // Rigoristi ancora liberi: valgono crediti in piu'.
  const rigoristi = disponibili.filter(
    (g) => g.rig && g.rig.livello === 'titolare').length;
  if (rigoristi) {
    righe.push(`Restano <b>${rigoristi}</b> rigoristi titolari.
      Un rigore è il bonus più prevedibile che esista.`);
  }

  return righe;
}

/* =============================================================== ALLENATORE */

let moduloScelto = '3-4-3';
let scambioCedi = null;
let scambioRicevi = null;

function disegnaAllenatore() {
  disegnaAllarmi();
  disegnaUndici();
  disegnaModificatore();
  disegnaScambio();
}

function disegnaAllarmi() {
  const contenitore = document.getElementById('allarmi');
  contenitore.innerHTML = '';

  if (!stato.rosa.length) {
    contenitore.appendChild(elemento(
      '<div class="vuoto">La rosa è vuota. Registra gli acquisti nell\'Asta Live.</div>'));
    return;
  }

  const fermi = allarmi();
  if (!fermi.length) {
    contenitore.appendChild(elemento(
      '<div class="vuoto">Nessun allarme: tutta la rosa è disponibile.</div>'));
    return;
  }

  for (const g of fermi) {
    const quando = g.out.dal ? ` dal ${testoSicuro(g.out.dal)}` : '';
    const nodo = elemento(`
      <div class="avviso ${g.out.grave ? '' : 'lieve'}">
        <b>${testoSicuro(g.n)}</b> (${testoSicuro(g.s)}):
        ${testoSicuro(g.out.motivo)}${quando}.
        ${g.out.grave ? 'Non schierarlo.' : 'Salta una giornata.'}
      </div>`);
    contenitore.appendChild(nodo);
  }
}

function disegnaUndici() {
  // I moduli disponibili arrivano dal JSON: nessuna lista scritta qui dentro.
  const scelte = document.getElementById('scelta-modulo');
  scelte.innerHTML = '';
  for (const nome of Object.keys(DATI.moduli)) {
    const bottone = elemento(`<button class="scelta"
      aria-pressed="${nome === moduloScelto}">${nome}</button>`);
    bottone.addEventListener('click', () => {
      moduloScelto = nome;
      disegnaUndici();
    });
    scelte.appendChild(bottone);
  }

  const campo = document.getElementById('undici');
  campo.innerHTML = '';
  const esito = undici(moduloScelto);

  document.getElementById('undici-media').textContent = esito && esito.media
    ? `resa media ${esito.media.toFixed(2)}`
    : '—';

  if (!stato.rosa.length) {
    campo.appendChild(elemento(
      '<div class="vuoto">Nessun giocatore in rosa: non c\'è un undici da comporre.</div>'));
    return;
  }

  for (const ruolo of DATI.ordine) {
    const schierati = esito.schierati.filter((g) => g.r === ruolo);
    const buchi = esito.buchi[ruolo] || 0;
    if (!schierati.length && !buchi) continue;

    const blocco = elemento(`
      <div class="reparto-campo">
        <div class="titolo">${NOMI_RUOLO[ruolo]}</div>
        <div class="fila"></div>
      </div>`);
    const fila = blocco.querySelector('.fila');

    for (const g of schierati) {
      const maglia = elemento(`
        <button class="maglia" data-id="${g.id}">
          <b>${testoSicuro(g.n)}</b>
          <small>${testoSicuro(g.s)} · resa ${g.y === null || g.y === undefined
            ? '—' : g.y.toFixed(2)}</small>
        </button>`);
      maglia.addEventListener('click', () => apriScheda(g.id));
      fila.appendChild(maglia);
    }

    for (let i = 0; i < buchi; i += 1) {
      fila.appendChild(elemento(
        '<div class="maglia buco">manca un disponibile</div>'));
    }
    campo.appendChild(blocco);
  }

  if (esito.panchina.length) {
    const nomi = esito.panchina.slice(0, 8)
      .map((g) => testoSicuro(g.n)).join(', ');
    campo.appendChild(elemento(`
      <div class="reparto-campo">
        <div class="titolo">in panchina</div>
        <p style="margin:0;color:var(--ink-medio);font-size:13px">${nomi}</p>
      </div>`));
  }
}

function disegnaModificatore() {
  const contenitore = document.getElementById('modificatore');
  contenitore.innerHTML = '';
  const esito = modificatoreDifesa();

  if (!esito.pronto) {
    const manca = [];
    if (esito.mancaPortiere) manca.push('un portiere');
    if (esito.difensori < 3) manca.push(`${3 - esito.difensori} difensori`);
    contenitore.appendChild(elemento(`
      <div class="vuoto">Servono ${manca.join(' e ')} con media voto
      per calcolare il modificatore.</div>`));
    return;
  }

  contenitore.appendChild(elemento(`
    <div class="griglia q2">
      <div class="cifra">
        <div class="valore verde">${esito.media.toFixed(2)}</div>
        <div class="etichetta">Media voto della difesa</div>
      </div>
      <div class="cifra">
        <div class="valore ambra">${esito.bonus > 0 ? '+' : ''}${esito.bonus}</div>
        <div class="etichetta">Punti a giornata</div>
      </div>
    </div>`));

  const chi = esito.scelti
    .map((g) => `${testoSicuro(g.n)} (${g.mvp.toFixed(2)})`).join(' · ');
  contenitore.appendChild(elemento(`
    <p style="margin:12px 0 0;color:var(--ink-medio);font-size:13px">${chi}</p>`));

  // La scala completa, con lo scaglione in cui ti trovi acceso: cosi' si vede
  // quanto manca al gradino successivo, che e' l'unica cosa azionabile.
  const scala = elemento('<div class="scaglioni"></div>');
  for (const riga of [...DATI.modificatore].reverse()) {
    const attivo = riga.bonus === esito.bonus;
    scala.appendChild(elemento(`
      <div class="scaglione ${attivo ? 'attivo' : ''}">
        <b>${riga.bonus > 0 ? '+' : ''}${riga.bonus}</b>
        ${riga.da > 0 ? riga.da.toFixed(2) : 'sotto 6'}
      </div>`));
  }
  contenitore.appendChild(scala);

  contenitore.appendChild(elemento(`
    <p class="nota" style="margin-top:10px;text-transform:none;letter-spacing:0">
      Le soglie cambiano da lega a lega: se la tua è diversa, si correggono in
      core/costanti.py.</p>`));
}

function disegnaScambio() {
  const esito = document.getElementById('scambio-esito');
  esito.innerHTML = '';

  if (!scambioCedi || !scambioRicevi) {
    esito.appendChild(elemento(
      '<div class="vuoto">Scegli due giocatori per vedere le differenze.</div>'));
    return;
  }

  const confronto = Conti.confrontoScambio(
    scambioCedi.id, scambioRicevi.id, stato.lega, PER_ID);
  if (!confronto) return;

  const piatto = (valore, etichetta, decimali = 2, alContrario = false) => {
    if (valore === null || valore === undefined) {
      return `<div class="piatto"><div class="n">—</div><div class="e">${etichetta}</div></div>`;
    }
    const buono = alContrario ? valore < 0 : valore > 0;
    const classe = valore === 0 ? '' : (buono ? 'su' : 'giu');
    const segno = valore > 0 ? '+' : '';
    return `<div class="piatto">
      <div class="n ${classe}">${segno}${valore.toFixed(decimali)}</div>
      <div class="e">${etichetta}</div></div>`;
  };

  esito.appendChild(elemento(`
    <p style="margin:14px 0 0;color:var(--ink-medio);font-size:13.5px">
      Cedi <b>${testoSicuro(confronto.ceduto.n)}</b>,
      ricevi <b>${testoSicuro(confronto.ricevuto.n)}</b>.
      ${confronto.stessoRuolo ? '' : 'Ruoli diversi: cambia anche la struttura della rosa.'}
    </p>`));

  esito.appendChild(elemento(`
    <div class="bilancia">
      ${piatto(confronto.resa, 'Resa a partita')}
      ${piatto(confronto.certezza, 'Certezza', 0)}
      ${piatto(confronto.prezzo, 'Valore di mercato', 0)}
    </div>`));

  esito.appendChild(elemento(`
    <p class="nota" style="margin-top:12px;text-transform:none;letter-spacing:0">
      Sono differenze, non un verdetto: se lo scambio convenga dipende da quale
      casella ti serve coprire, e quello lo sai solo tu.</p>`));
}

function cercaPerScambio(testo, quale) {
  const contenitore = document.getElementById('scambio-risultati');
  contenitore.innerHTML = '';
  const cerca = testo.trim().toLowerCase();
  if (cerca.length < 2) return;

  const trovati = DATI.giocatori
    .filter((g) => `${g.n} ${g.nc}`.toLowerCase().includes(cerca))
    .slice(0, 5);

  for (const g of trovati) {
    const nodo = elemento(`
      <button class="riga-gioc">
        <span class="ruolo ${g.r}">${g.r}</span>
        <span class="chi">
          <b>${testoSicuro(g.n)}</b>
          <small>${testoSicuro(g.s)} · ${prezzo(g)} crediti</small>
        </span>
        <span class="cifra-dx">${g.y === null || g.y === undefined
          ? '—' : g.y.toFixed(2)}<small>resa</small></span>
      </button>`);
    nodo.addEventListener('click', () => {
      if (quale === 'cedi') {
        scambioCedi = g;
        document.getElementById('scambio-cedi').value = g.n;
      } else {
        scambioRicevi = g;
        document.getElementById('scambio-ricevi').value = g.n;
      }
      contenitore.innerHTML = '';
      disegnaScambio();
    });
    contenitore.appendChild(nodo);
  }
}

/* ========================================================= SCHEDA GIOCATORE */

function apriScheda(id) {
  const g = PER_ID.get(id);
  if (!g) return;

  const inRosa = stato.rosa.find((voce) => voce.id === id);
  const daAltri = stato.venduti.find((voce) => voce.id === id);
  const tetto = massimoAdesso(g.r);

  const dato = (numero, etichetta) =>
    `<div class="dato"><div class="n">${numero}</div><div class="e">${etichetta}</div></div>`;

  let html = `
    <div class="scheda-testa">
      ${ritratto(g)}
      <div>
        <h2 id="scheda-nome">${testoSicuro(g.nc)}</h2>
        <div class="meta">
          <span class="ruolo ${g.r}">${g.r}</span>
          ${testoSicuro(g.s)} · ${testoSicuro(g.pos)}${g.eta ? ` · ${g.eta} anni` : ''}
        </div>
      </div>
      <button class="chiudi" id="chiudi-scheda" aria-label="Chiudi">×</button>
    </div>

    <div class="dati-scheda">
      ${dato(prezzo(g), 'Prezzo')}
      ${dato('F' + fascia(g), 'Fascia')}
      ${dato(g.y === null || g.y === undefined ? '—' : g.y.toFixed(2), 'Resa')}
      ${dato(g.c === null || g.c === undefined ? '—' : g.c, 'Certezza')}
      ${dato(g.pv, 'Presenze')}
      ${g.r === 'P'
        ? dato(g.gs === null || g.gs === undefined ? '—' : g.gs.toFixed(2), 'Gol subiti/gara')
        : dato(g.g + ' / ' + g.a, 'Gol / assist')}
    </div>`;

  if (g.out) {
    html += `
      <div class="avviso ${g.out.grave ? '' : 'lieve'}">
        <b>Fermo adesso:</b> ${testoSicuro(g.out.motivo)}${g.out.dal
          ? `, dal ${testoSicuro(g.out.dal)}` : ''}.
        ${g.out.grave
          ? 'Finché non rientra, questa casella resta vuota.'
          : 'Passa da sola: salta una giornata, non un mese.'}
      </div>`;
  }

  html += `
    <div class="blocco">
      <h3>Quanto è certo che giochi</h3>
      <ul>${g.nc_perche.map((r) => `<li>${testoSicuro(r)}</li>`).join('')}</ul>
    </div>`;

  if (g.perc) {
    const pillole = [
      ...g.perc.forze.map((f) =>
        `<span class="pillola forte">${testoSicuro(f.metrica)} ${f.rango}°</span>`),
      ...g.perc.debolezze.map((d) =>
        `<span class="pillola debole">${testoSicuro(d.metrica)} ${d.rango}°</span>`),
    ].join('');
    html += `
      <div class="blocco">
        <h3>Dove sta fra i ${testoSicuro(g.perc.nome_ruolo)}</h3>
        <p>Confronto fra i ${g.perc.totale} con almeno quindici presenze.</p>
        <div class="pillole">${pillole || '<span class="pillola">Nella media</span>'}</div>
      </div>`;
  }

  const bonus = [];
  if (g.g || g.a) bonus.push(`${g.g} gol e ${g.a} assist`);
  if (g.rig) {
    bonus.push(`${g.rig.livello === 'titolare' ? 'rigorista' : 'vice-rigorista'}
      del ${testoSicuro(g.rig.squadra)} (${g.rig.calciati} su ${g.rig.totale_squadra})`);
  }
  if (g.rs || g.rx) bonus.push(`${g.rs} rigori segnati, ${g.rx} sbagliati`);
  if (g.rp) bonus.push(`${g.rp} rigori parati`);
  if (g.ml) bonus.push(`${g.ml.toFixed(2)} punti a partita persi per cartellini`);

  if (bonus.length) {
    html += `<div class="blocco"><h3>Da dove arriva il bonus</h3>
      <p>${bonus.join(' · ')}</p></div>`;
  }

  if (g.v !== null && g.v !== undefined) {
    const verso = g.v > 0 ? 'più' : 'meno';
    html += `
      <div class="blocco">
        <h3>Contro chi costa uguale</h3>
        <p>Fra i ${g.pari} ${testoSicuro(NOMI_RUOLO[g.r].toLowerCase())} che costano
        più o meno come lui, rende <b>${Math.abs(g.v).toFixed(2)}</b> di ${verso} a partita${
          g.vc !== null && g.vc !== undefined
            ? `, con ${g.vc > 0 ? '+' : ''}${g.vc} di certezza` : ''}.</p>
      </div>`;
  }

  // Il consiglio d'asta non e' un'opinione: e' il tuo tetto, spiegato.
  html += `
    <div class="blocco">
      <h3>All'asta, adesso</h3>
      <p>${consiglioAsta(g, tetto, inRosa, daAltri)}</p>
    </div>

    <div class="azioni-scheda">
      ${inRosa || daAltri ? '' : `
        <button class="bottone" data-azione="mio">L'ho preso io</button>
        <button class="bottone fantasma" data-azione="altri">Preso da altri</button>`}
      ${inRosa || daAltri ? '<button class="bottone fantasma" data-azione="libera">Rimettilo in asta</button>' : ''}
      <button class="bottone fantasma" data-azione="chiudi">Chiudi</button>
    </div>`;

  const scheda = document.getElementById('scheda');
  scheda.innerHTML = html;
  scheda.scrollTop = 0;

  scheda.querySelector('#chiudi-scheda').addEventListener('click', chiudiScheda);
  scheda.querySelectorAll('[data-azione]').forEach((bottone) => {
    bottone.addEventListener('click', () => azioneScheda(bottone.dataset.azione, g));
  });

  document.getElementById('velo').hidden = false;
  document.body.style.overflow = 'hidden';
}

function consiglioAsta(g, tetto, inRosa, daAltri) {
  if (inRosa) return `È tuo, pagato ${inRosa.prezzo} crediti.`;
  if (daAltri) return `Preso da un altro per ${daAltri.prezzo} crediti.`;

  const suo = prezzo(g);
  const buchi = mancanti()[g.r];
  if (!buchi) return `Hai già tutti i ${NOMI_RUOLO[g.r].toLowerCase()}: non ti serve.`;
  if (g.out && g.out.grave) {
    return `Vale ${suo} crediti, ma è fermo. Comprarlo adesso significa
      una casella vuota finché non rientra.`;
  }
  if (suo > tetto) {
    return `Vale ${suo} crediti, ma il tuo tetto per questa casella è ${tetto}:
      con ${residuo()} crediti e ${caselleScoperte()} caselle da riempire,
      spenderne di più significa toglierli a un'altra casella.`;
  }
  return `Vale ${suo} crediti e ci stai: il tuo tetto per questa casella è ${tetto}.
    Sopra ${Math.round(suo * 1.15)} stai pagando la concorrenza, non il giocatore.`;
}

function azioneScheda(azione, g) {
  if (azione === 'chiudi') { chiudiScheda(); return; }

  ricorda();
  if (azione === 'libera') {
    stato.rosa = stato.rosa.filter((voce) => voce.id !== g.id);
    stato.venduti = stato.venduti.filter((voce) => voce.id !== g.id);
    avviso(`${g.n} è di nuovo in asta.`);
  } else {
    const suggerito = prezzo(g);
    const inserito = window.prompt(`A quanto è stato preso ${g.n}?`, suggerito);
    if (inserito === null) { stato.storia.pop(); return; }
    const valore = parseInt(inserito, 10);
    if (!Number.isFinite(valore) || valore < 1) {
      stato.storia.pop();
      avviso('Prezzo non valido.');
      return;
    }
    if (azione === 'mio' && valore > residuo()) {
      stato.storia.pop();
      avviso(`Non ci arrivi: ti restano ${residuo()} crediti.`);
      return;
    }
    (azione === 'mio' ? stato.rosa : stato.venduti).push({ id: g.id, prezzo: valore });
    avviso(azione === 'mio' ? `${g.n} è tuo per ${valore}.` : `${g.n} va via per ${valore}.`);
  }

  salva();
  chiudiScheda();
  disegnaTutto();
}

function chiudiScheda() {
  document.getElementById('velo').hidden = true;
  document.body.style.overflow = '';
}

/* ================================================================ BACKUP */

function salvaCopia() {
  const contenuto = JSON.stringify({
    lega: stato.lega, rosa: stato.rosa, venduti: stato.venduti,
    salvato: new Date().toISOString(),
  }, null, 2);

  const url = URL.createObjectURL(new Blob([contenuto], { type: 'application/json' }));
  const collegamento = document.createElement('a');
  collegamento.href = url;
  collegamento.download = `fantamind-asta-${new Date().toISOString().slice(0, 10)}.json`;
  collegamento.click();
  URL.revokeObjectURL(url);
  avviso('Copia salvata.');
}

function rimettiDentro(file) {
  const lettore = new FileReader();
  lettore.onload = () => {
    try {
      const letto = JSON.parse(lettore.result);
      if (!Array.isArray(letto.rosa)) throw new Error('file senza rosa');
      ricorda();
      if (letto.lega) stato.lega = letto.lega;
      stato.rosa = letto.rosa;
      stato.venduti = Array.isArray(letto.venduti) ? letto.venduti : [];
      salva();
      disegnaTutto();
      avviso(`Rimessa dentro: ${stato.rosa.length} acquisti.`);
    } catch (errore) {
      avviso('Questo file non è una copia dell\'asta.');
    }
  };
  lettore.readAsText(file);
}

function copiaRosa() {
  if (!stato.rosa.length) { avviso('La rosa è vuota.'); return; }

  const righe = [`FantaMind · ${stato.lega.squadre} squadre · ${stato.lega.budget} crediti`, ''];
  for (const ruolo of DATI.ordine) {
    const suoi = stato.rosa
      .map((voce) => ({ voce, g: PER_ID.get(voce.id) }))
      .filter((x) => x.g && x.g.r === ruolo);
    if (!suoi.length) continue;
    righe.push(NOMI_RUOLO[ruolo].toUpperCase());
    suoi.forEach((x) => righe.push(`  ${x.g.n} (${x.g.s}) — ${x.voce.prezzo}`));
    righe.push('');
  }
  righe.push(`Spesi ${speso()} di ${stato.lega.budget}, restano ${residuo()}.`);

  const testo = righe.join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(testo)
      .then(() => avviso('Rosa copiata negli appunti.'))
      .catch(() => window.prompt('Copia da qui:', testo));
  } else {
    window.prompt('Copia da qui:', testo);
  }
}

function azzera() {
  if (!window.confirm('Cancello rosa, acquisti e cronologia. Sicuro?')) return;
  ricorda();
  stato.rosa = [];
  stato.venduti = [];
  salva();
  disegnaTutto();
  avviso('Ricominciamo.');
}

/* ================================================================= EVENTI */

function cambiaVista(nome) {
  vista = nome;
  for (const sezione of document.querySelectorAll('.vista')) {
    sezione.hidden = sezione.id !== `vista-${nome}`;
  }
  for (const voce of document.querySelectorAll('.voce')) {
    if (voce.dataset.vista === nome) voce.setAttribute('aria-current', 'page');
    else voce.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  disegnaTutto();
}

function costruisciScelteLega() {
  const perSquadre = document.getElementById('scelta-squadre');
  const perBudget = document.getElementById('scelta-budget');
  perSquadre.innerHTML = '';
  perBudget.innerHTML = '';

  for (const numero of DATI.leghe.squadre) {
    const bottone = elemento(`<button class="scelta" data-squadre="${numero}"
      aria-pressed="${numero === stato.lega.squadre}">${numero}</button>`);
    bottone.addEventListener('click', () => cambiaLega({ squadre: numero }));
    perSquadre.appendChild(bottone);
  }
  for (const numero of DATI.leghe.budget) {
    const bottone = elemento(`<button class="scelta" data-budget="${numero}"
      aria-pressed="${numero === stato.lega.budget}">${numero}</button>`);
    bottone.addEventListener('click', () => cambiaLega({ budget: numero }));
    perBudget.appendChild(bottone);
  }
}

function cambiaLega(modifica) {
  if (stato.rosa.length || stato.venduti.length) {
    if (!window.confirm(
      'Cambiare lega ricalcola tutti i prezzi. Gli acquisti già registrati restano '
      + 'ai prezzi che hai pagato. Procedo?')) return;
  }
  Object.assign(stato.lega, modifica);
  salva();
  costruisciScelteLega();
  disegnaTutto();
  avviso(`Lega: ${stato.lega.squadre} squadre, ${stato.lega.budget} crediti.`);
}

function collegaEventi() {
  document.querySelectorAll('.voce').forEach((voce) => {
    voce.addEventListener('click', () => cambiaVista(voce.dataset.vista));
  });

  // --- enciclopedia ---
  document.getElementById('cerca').addEventListener('input', (evento) => {
    filtri.testo = evento.target.value;
    disegnaEnciclopedia();
  });

  const gruppi = [
    ['filtro-ruolo', 'ruolo'],
    ['filtro-stato', 'stato'],
    ['filtro-fascia', 'fascia'],
  ];
  for (const [contenitore, campo] of gruppi) {
    document.getElementById(contenitore).addEventListener('click', (evento) => {
      const bottone = evento.target.closest('.scelta');
      if (!bottone) return;
      filtri[campo] = bottone.dataset[campo] || '';
      document.querySelectorAll(`#${contenitore} .scelta`).forEach((altro) => {
        altro.setAttribute('aria-pressed', altro === bottone);
      });
      disegnaEnciclopedia();
    });
  }

  document.querySelectorAll('[data-ordine]').forEach((bottone) => {
    bottone.addEventListener('click', () => {
      filtri.ordine = bottone.dataset.ordine;
      document.querySelectorAll('[data-ordine]').forEach((altro) => {
        if (altro === bottone) altro.setAttribute('aria-sort', 'descending');
        else altro.removeAttribute('aria-sort');
      });
      disegnaEnciclopedia();
    });
  });

  // --- asta ---
  document.getElementById('asta-cerca').addEventListener('input', (evento) => {
    sceltoPerAsta = null;
    cercaPerAsta(evento.target.value);
  });
  document.getElementById('asta-mio').addEventListener('click', () => registra(true));
  document.getElementById('asta-altri').addEventListener('click', () => registra(false));
  document.getElementById('annulla').addEventListener('click', annulla);

  document.getElementById('scambio-cedi').addEventListener('input', (evento) => {
    scambioCedi = null;
    cercaPerScambio(evento.target.value, 'cedi');
    disegnaScambio();
  });
  document.getElementById('scambio-ricevi').addEventListener('input', (evento) => {
    scambioRicevi = null;
    cercaPerScambio(evento.target.value, 'ricevi');
    disegnaScambio();
  });

  document.getElementById('salva-copia').addEventListener('click', salvaCopia);
  document.getElementById('copia-rosa').addEventListener('click', copiaRosa);
  document.getElementById('azzera').addEventListener('click', azzera);
  document.getElementById('rimetti-dentro').addEventListener('click', () => {
    document.getElementById('file-backup').click();
  });
  document.getElementById('file-backup').addEventListener('change', (evento) => {
    if (evento.target.files[0]) rimettiDentro(evento.target.files[0]);
    evento.target.value = '';
  });

  // --- scheda ---
  document.getElementById('velo').addEventListener('click', (evento) => {
    if (evento.target.id === 'velo') chiudiScheda();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') chiudiScheda();
  });
}

/* ================================================================= AVVIO */

function disegnaTutto() {
  if (!DATI) return;
  try {
    if (vista === 'control') disegnaControl();
    if (vista === 'enciclopedia') disegnaEnciclopedia();
    if (vista === 'asta') disegnaAsta();
    if (vista === 'strategia') disegnaStrategia();
    if (vista === 'allenatore') disegnaAllenatore();
  } catch (errore) {
    // A meta' asta una schermata bianca senza spiegazione e' il peggio che
    // possa capitare: meglio dire cosa e' successo e lasciare l'asta salvata.
    console.error(errore);
    avviso(`Qualcosa non ha funzionato: ${errore.message}. L'asta è salvata.`, 8000);
  }
}

async function avvia() {
  try {
    const risposta = await fetch('dati_asta.json', { cache: 'no-cache' });
    if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
    DATI = await risposta.json();
  } catch (errore) {
    document.querySelector('.tela').innerHTML = `
      <p class="occhiello">Manca il listone</p>
      <h1>Non trovo dati_asta.json</h1>
      <p class="sottotitolo">
        Il file deve stare in questa stessa cartella. Si genera con
        <code>python3 pipeline/genera_json.py</code> e si copia in <code>app/</code>.
      </p>`;
    console.error(errore);
    return;
  }

  PER_ID = new Map(DATI.giocatori.map((g) => [g.id, g]));

  ripristina();
  // Una lega salvata che non esiste piu' nel listone manderebbe prezzo() in
  // fallback silenzioso: meglio riportarla a un valore che c'e'.
  if (!DATI.leghe.squadre.includes(stato.lega.squadre)) {
    stato.lega.squadre = DATI.squadre;
  }
  if (!DATI.leghe.budget.includes(stato.lega.budget)) {
    stato.lega.budget = DATI.budget;
  }

  document.getElementById('pie-data').textContent = DATI.aggiornato;
  costruisciScelteLega();
  collegaEventi();
  disegnaTutto();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((errore) => {
      console.warn('Service worker non registrato:', errore);
    });
  }
}

avvia();
