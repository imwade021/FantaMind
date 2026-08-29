"""
esporta.py - Dal Master al file unico che alimenta l'app.

Tutto cio' che si puo' calcolare in anticipo si calcola qui, una volta al
giorno, e finisce in dati/dati_asta.json. L'app non ricalcola niente di
statico: legge. Quello che invece dipende dall'asta in corso - budget
residuo, caselle scoperte, chi e' gia' stato venduto - vive nell'app,
perche' cambia a ogni rilancio.
"""

import json
from datetime import date, datetime

import pandas as pd

from .certezza import assenza_oggi, certezza, posizione
from .confronti import gerarchia_rigori, occasioni, occasioni_mod, percentili_ruolo
from .costanti import (BUDGET_AMMESSI, BUDGET_DEFAULT, ORDINE_ASTA,
                       QUOTE_REPARTO, SLOT_ROSA, SQUADRE_AMMESSE,
                       SQUADRE_DEFAULT, chiave_lega)
from .lettura import RADICE, carica, testo
from .mercato import fasce, prezzi_di_mercato
from .resa import cartellini, gol_subiti, media_ruolo, resa, rigori

# Il JSON e' l'unico file che l'app legge, quindi vive dentro app/: quella
# cartella e' cio' che si pubblica. In dati/ restano solo le sorgenti.
USCITA = RADICE / 'app' / 'dati_asta.json'


def _eta(valore):
    """L'eta' in anni compiuti. None se la data non c'e' o non si legge."""
    grezzo = testo(valore)[:10]
    if not grezzo:
        return None
    for formato in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            nascita = datetime.strptime(grezzo, formato).date()
        except ValueError:
            continue
        oggi = date.today()
        return oggi.year - nascita.year - (
            (oggi.month, oggi.day) < (nascita.month, nascita.day))
    return None


def _pulisci(valore):
    """Un numero JSON-sicuro, o None. NaN non e' JSON valido."""
    if valore is None or (isinstance(valore, float) and pd.isna(valore)):
        return None
    return valore


def calcola(df, squadre=SQUADRE_DEFAULT, budget=BUDGET_DEFAULT):
    """Arricchisce il DataFrame con tutte le colonne calcolate dal core."""
    df = df.copy()

    valori, note = zip(*[certezza(r) for _, r in df.iterrows()])
    df['certezza'] = valori
    df['perche'] = list(note)

    medie = {ruolo: media_ruolo(df, ruolo) for ruolo in SLOT_ROSA}
    df['resa'] = [resa(r, medie.get(r['R'], 6.0)) for _, r in df.iterrows()]
    df['rc_calciati'], df['rp_parati'] = zip(*[rigori(r) for _, r in df.iterrows()])
    df['gol_subiti'] = [gol_subiti(r) for _, r in df.iterrows()]
    df['malus'] = [cartellini(r) for _, r in df.iterrows()]
    df['fuori'] = [assenza_oggi(r) for _, r in df.iterrows()]
    df['pos'], df['bonus'] = zip(*[posizione(r) for _, r in df.iterrows()])
    df['prezzo_mercato'] = prezzi_di_mercato(df, squadre, budget)

    df['fascia'] = 5
    rotture = {}
    for ruolo in SLOT_ROSA:
        etichette, punti = fasce(df, ruolo, squadre)
        df.loc[etichette.index, 'fascia'] = etichette.values
        rotture[ruolo] = punti

    df = occasioni(df)
    df = occasioni_mod(df)
    return df, rotture


def tutti_i_mercati(df):
    """
    Prezzi e fasce per ogni lega che l'app permette di scegliere.

    Il prezzo dipende da squadre E budget, la fascia solo dalle squadre.
    Precalcolarli qui e' cio' che evita una seconda formula dei prezzi
    scritta in JavaScript: l'app fa una lettura, non un conto.
    """
    prezzi, fasce_lega, rotture = {}, {}, {}

    for squadre in SQUADRE_AMMESSE:
        for budget in BUDGET_AMMESSI:
            chiave = chiave_lega(squadre, budget)
            lavoro = df.copy()
            lavoro['prezzo_mercato'] = prezzi_di_mercato(lavoro, squadre, budget)
            prezzi[chiave] = lavoro['prezzo_mercato']

            # La fascia e' la fila d'attesa ORDINATA PER PREZZO, e il prezzo
            # dipende anche dal budget: arrotondando ai crediti interi, leghe
            # con monte diverso spezzano le parita' in punti diversi. Va quindi
            # calcolata per ogni lega, non una volta per numero di squadre.
            rotture[chiave] = {}
            etichette_ruolo = {}
            for ruolo in SLOT_ROSA:
                etichette, punti = fasce(lavoro, ruolo, squadre)
                rotture[chiave][ruolo] = punti
                etichette_ruolo.update(etichette.to_dict())
            fasce_lega[chiave] = etichette_ruolo

    return prezzi, fasce_lega, rotture


def costruisci(squadre=SQUADRE_DEFAULT, budget=BUDGET_DEFAULT, percorso=None):
    """Legge il Master, calcola tutto e restituisce (dati, df)."""
    df = carica(percorso)
    df, rotture = calcola(df, squadre, budget)
    rigoristi = gerarchia_rigori(df)
    prezzi_lega, fasce_lega, rotture_lega = tutti_i_mercati(df)

    giocatori = []
    for _, r in df.iterrows():
        identificativo = int(r['Id'])
        percentili = percentili_ruolo(r, df)
        info_rigori = rigoristi.get(identificativo)

        giocatori.append({
            'id': identificativo,
            'n': str(r['Nome']),
            'nc': testo(r.get('Nome_Completo')) or str(r['Nome']),
            'r': r['R'],
            's': str(r['Squadra']),
            'pos': str(r['pos']),
            'bn': bool(r['bonus']),
            'eta': _eta(r.get('DataNascita')),
            'naz': testo(r.get('Nazionalita')).split(';')[0] or None,
            'foto': testo(r.get('PhotoURL')) or None,

            # --- mercato ---
            # 'p' e 'f' sono la lega di riferimento; 'pz' e 'fs' contengono
            # ogni lega selezionabile, cosi' l'app cambia lega senza ricalcolare.
            'p': int(r['prezzo_mercato']),
            'q': int(r['Qt.A']),
            'fvm': int(r['FVM']),
            'f': int(r['fascia']),
            'pz': {chiave: int(serie[r.name]) for chiave, serie in prezzi_lega.items()},
            'fs': {chiave: int(mappa[r.name]) for chiave, mappa in fasce_lega.items()},

            # --- disponibilita' ---
            'c': _pulisci(r['certezza']),
            'nc_perche': list(r['perche']),
            'out': r['fuori'],

            # --- rendimento ---
            'y': _pulisci(r['resa']),
            'pv': int(r['Pv']),
            # Chi non ha mai giocato in Serie A ha comunque un Fm nel file:
            # e' un valore di riempimento della pipeline e sembra un
            # rendimento vero. Non esce di qui.
            'mv': round(float(r['Mv']), 2) if (r['Mv'] > 0 and r['Pv'] > 0) else None,
            'fm': round(float(r['Fm']), 2) if (r['Fm'] > 0 and r['Pv'] > 0) else None,
            # La media voto grezza serve alle leghe col modificatore di difesa.
            'mvp': round(float(r['Mv']), 2) if r['Mv'] > 0 else None,
            'g': int(r['Gf']),
            'a': int(r['Ass']),
            'rc': int(r['rc_calciati']),
            'rp': int(r['rp_parati']),
            'rs': int(r['R+']),
            'rx': int(r['R-']),
            'gs': _pulisci(r['gol_subiti']),
            'ml': _pulisci(r['malus']),

            # --- confronti ---
            'v': _pulisci(r['vantaggio']),
            'vm': _pulisci(r['vantaggio_mod']),
            'vc': _pulisci(r['vantaggio_cert']),
            'pari': _pulisci(r['pari_prezzo']),
            'perc': percentili,
            'rig': info_rigori,
        })

    giocatori.sort(key=lambda g: -g['p'])

    dati = {
        'aggiornato': testo(df['Aggiornato'].max()) if 'Aggiornato' in df else '',
        'generato': date.today().isoformat(),
        'squadre': squadre,
        'budget': budget,
        'slot': SLOT_ROSA,
        # Anche queste vanno nel JSON: l'app non deve avere una sua copia
        # dei parametri di lega, o tornano i numeri divergenti di prima.
        'quote': QUOTE_REPARTO,
        'ordine': list(ORDINE_ASTA),
        'leghe': {'squadre': list(SQUADRE_AMMESSE), 'budget': list(BUDGET_AMMESSI)},
        'rotture': rotture,
        'rotture_lega': rotture_lega,
        'giocatori': giocatori,
    }
    return dati, df


def scrivi(dati, percorso=None):
    """
    Scrive il JSON, ma solo dopo aver verificato che sia valido.

    pandas produce NaN dove Python vorrebbe None, e "NaN" non e' JSON: basta
    un campo per rendere l'app impossibile da aprire. allow_nan=False fa
    fallire qui, dove l'errore si legge, invece che nel browser.
    """
    percorso = percorso or USCITA
    testo_json = json.dumps(dati, ensure_ascii=False, separators=(',', ':'),
                            allow_nan=False)
    json.loads(testo_json)
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(testo_json, encoding='utf-8')
    return percorso
