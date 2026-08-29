"""
confronti.py - Il confronto fra giocatori dello stesso ruolo.

Un numero da solo non dice niente: "fantamedia 6.62" e' muto, "4o fra 97
difensori" si capisce. Qui vive tutto cio' che ha senso solo per confronto.
"""

import pandas as pd

from .costanti import (NOMI_RUOLO, PRESENZE_CONFRONTO, PRUDENZA, SLOT_ROSA)


def _pari_prezzo(blocco, idx, prezzo):
    """
    I concorrenti diretti: chi costa piu' o meno quanto lui, nel suo ruolo.

    La banda si allarga finche' non ce ne sono almeno sei. Con meno il
    confronto e' rumore: la mediana di due giocatori non e' una mediana.
    """
    banda = 0.30
    while True:
        pari = blocco[(blocco['prezzo_mercato'] >= prezzo * (1 - banda)) &
                      (blocco['prezzo_mercato'] <= prezzo * (1 + banda)) &
                      (blocco.index != idx)]
        if len(pari) >= 6 or banda >= 1.0:
            return pari
        banda += 0.15


def occasioni(df):
    """
    L'unica domanda che l'asta ti pone davvero: a parita' di crediti spesi,
    chi rende di piu' e chi gioca di piu'?

    Non "quanto vale in assoluto". Quel conto si puo' fare, ma finisce sempre
    per dire che i primi dieci nomi sono tutti sottopagati - il che e' inutile,
    perche' il prezzo dei fuoriclasse non lo fa il rendimento: lo fa il fatto
    che sono uno solo e li vogliono in dodici.
    """
    df['pari_prezzo'] = None      # quanti concorrenti diretti ha
    df['vantaggio'] = None        # fantamedia in piu' rispetto a loro
    df['vantaggio_cert'] = None   # certezza in piu' rispetto a loro

    for ruolo in SLOT_ROSA:
        blocco = df[(df['R'] == ruolo) & df['resa'].notna()].copy()
        if len(blocco) < 6:
            continue
        for idx, riga in blocco.iterrows():
            pari = _pari_prezzo(blocco, idx, max(1, riga['prezzo_mercato']))
            if pari.empty:
                continue
            df.at[idx, 'pari_prezzo'] = int(len(pari))
            df.at[idx, 'vantaggio'] = round(riga['resa'] - pari['resa'].median(), 2)
            certezze = pari['certezza'].dropna()
            if pd.notna(riga['certezza']) and not certezze.empty:
                df.at[idx, 'vantaggio_cert'] = int(round(
                    riga['certezza'] - certezze.median()))
    return df


def occasioni_mod(df):
    """
    Con il modificatore di difesa attivo il metro cambia: per portiere e
    difensori conta la MEDIA VOTO, non la fantamedia, perche' il bonus lo fa
    la media della retroguardia. Un difensore da 6.2 di voto senza un gol
    vale piu' di uno da 5.8 che ne ha fatti tre.

    Per centrocampisti e attaccanti non cambia nulla.
    """
    df['vantaggio_mod'] = None
    for ruolo in ('P', 'D'):
        blocco = df[(df['R'] == ruolo) & (df['Pv'] > 0) & (df['Mv'] > 0)].copy()
        if len(blocco) < 6:
            continue
        media = float(blocco['Mv'].mean())
        voto = ((blocco['Mv'] * blocco['Pv'] + media * PRUDENZA)
                / (blocco['Pv'] + PRUDENZA))
        for idx, riga in blocco.iterrows():
            pari = _pari_prezzo(blocco, idx, max(1, riga['prezzo_mercato']))
            if pari.empty:
                continue
            df.at[idx, 'vantaggio_mod'] = round(
                float(voto[idx]) - float(voto[pari.index].median()), 3)
    return df


def _metriche_ruolo(gruppo, ruolo):
    """
    Le metriche su cui ha senso confrontare due giocatori dello stesso ruolo.
    Su un portiere il gol non significa niente e i gol subiti si'.

    L'ultimo campo dice se la metrica puo' finire fra i DIFETTI. Non tutte
    possono: quasi ogni portiere ha zero rigori parati e quasi ogni difensore
    zero assist, quindi segnalarli come punti deboli e' solo rumore. Un
    primato invece resta un primato.
    """
    presenze = gruppo['Pv'].replace(0, pd.NA)
    if ruolo == 'P':
        return [
            ('gol subiti/gara', gruppo['Gs'] / presenze, False, True),
            ('voto puro', gruppo['Mv'], True, True),
            ('fantamedia', gruppo['Fm'], True, True),
            ('rigori parati', gruppo['Rp'], True, False),
        ]
    return [
        ('gol', gruppo['Gf'], True, False),
        ('assist', gruppo['Ass'], True, False),
        ('fantamedia', gruppo['Fm'], True, True),
        ('bonus/gara', gruppo['Fm'] - gruppo['Mv'], True, True),
        ('ammonizioni/gara', gruppo['Amm'] / presenze, False, True),
    ]


def percentili_ruolo(riga, df, presenze_minime=PRESENZE_CONFRONTO):
    """
    In che posizione sta, dentro il suo ruolo, su ogni metrica.

    E' lo stesso principio delle fasce - contano la scarsita' e il confronto,
    non il valore assoluto - applicato al rendimento invece che al prezzo.
    Il confronto e' solo fra chi ha almeno {presenze_minime} presenze.
    """
    if df is None or df.empty:
        return None

    ruolo = str(riga.get('R', '')).strip().upper()
    identificativo = riga.get('Id')

    gruppo = df[(df['R'] == ruolo) & (df['Pv'] >= presenze_minime)
                & (df['Fm'] > 0)].copy()
    totale = len(gruppo)
    if totale < 12 or identificativo not in set(gruppo['Id']):
        return None      # troppo pochi per un confronto onesto

    mio_posto = gruppo['Id'] == identificativo
    forze, debolezze = [], []

    for etichetta, valori, piu_e_meglio, vale_come_difetto in _metriche_ruolo(gruppo, ruolo):
        valori = pd.to_numeric(valori, errors='coerce').fillna(0.0)
        mio = float(valori[mio_posto].iloc[0])
        migliori = int((valori > mio).sum() if piu_e_meglio else (valori < mio).sum())
        rango = migliori + 1

        if rango <= max(3, totale / 3):
            forze.append({'metrica': etichetta, 'rango': rango, 'valore': round(mio, 2)})
        elif vale_come_difetto and rango > totale * 2 / 3:
            debolezze.append({'metrica': etichetta, 'rango': rango,
                              'valore': round(mio, 2)})

    forze.sort(key=lambda x: x['rango'])
    debolezze.sort(key=lambda x: -x['rango'])
    return {
        'totale': totale,
        'ruolo': ruolo,
        'nome_ruolo': NOMI_RUOLO.get(ruolo, 'giocatori'),
        'forze': forze[:2],
        'debolezze': debolezze[:1],
    }


def gerarchia_rigori(df, minimo=2, quota_titolare=0.40):
    """
    Chi calcia davvero i rigori, squadra per squadra.

    Un rigore calciato in tutta la stagione non fa di uno il rigorista: chi ne
    ha tirato 1 dei 9 della squadra non e' il rigorista, e' quello che ne ha
    tirato uno. Serve essere il primo della propria squadra, con almeno
    {minimo} rigori e una quota significativa; chi sta dietro e' il vice.

    Torna un dizionario indicizzato per Id: i nomi si ripetono, gli Id no.
    """
    if df is None or df.empty:
        return {}

    lavoro = df[df['Rc'] > 0]
    if lavoro.empty:
        return {}

    gerarchia = {}
    for squadra, gruppo in lavoro.groupby('Squadra'):
        gruppo = gruppo.sort_values('Rc', ascending=False)
        totale = float(gruppo['Rc'].sum())
        if totale <= 0:
            continue
        for posto, (_, riga) in enumerate(gruppo.iterrows()):
            calciati = int(riga['Rc'])
            quota = calciati / totale
            if posto == 0 and calciati >= minimo and quota >= quota_titolare:
                livello = 'titolare'
            elif calciati >= minimo:
                livello = 'vice'
            else:
                continue          # un rigore isolato non e' una gerarchia
            gerarchia[int(riga['Id'])] = {
                'livello': livello,
                'calciati': calciati,
                'squadra': str(squadra),
                'totale_squadra': int(totale),
            }
    return gerarchia
