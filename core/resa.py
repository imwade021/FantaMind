"""
resa.py - Quanto ha reso a partita. NON quanto giochera'.

Disponibilita' e rendimento sono due cose diverse e restano separate:
la disponibilita' e' la certezza, ed e' un numero suo.
"""

from .costanti import PRUDENZA


def resa(riga, media_ruolo):
    """
    La fantamedia, corretta per quante partite l'ha tenuta.

    Su poche presenze la fantamedia non e' affidabile e viene tirata verso la
    media del ruolo. Un 7.5 in otto partite diventa un 6.9; lo stesso 7.5 in
    trentotto resta 7.5.

    Non si moltiplica per la disponibilita': altrimenti un fuoriclasse con
    ventidue presenze finisce sotto un riempitivo che le ha giocate tutte.
    """
    fm, presenze = riga['Fm'], riga['Pv']
    if fm <= 0 or presenze <= 0:
        return None
    corretta = (fm * presenze + media_ruolo * PRUDENZA) / (presenze + PRUDENZA)
    return round(corretta, 2)


def gol_subiti(riga):
    """Per un portiere e' la metrica: quanti gliene fanno a partita."""
    if riga['R'] != 'P' or riga['Pv'] <= 0:
        return None
    return round(riga['Gs'] / riga['Pv'], 2)


def cartellini(riga):
    """
    Punti persi per cartellini, a partita.

    Mezzo punto ad ammonizione, un punto a espulsione. Su dodici gialli sono
    sei punti persi in una stagione: non e' rumore.
    """
    if riga['Pv'] <= 0:
        return None
    return round((riga['Amm'] * 0.5 + riga['Esp'] * 1.0) / riga['Pv'], 2)


def rigori(riga):
    """
    Rc sono i rigori CALCIATI, Rp quelli PARATI: due colonne diverse che
    riguardano due mestieri diversi. Sommarle faceva risultare rigorista il
    portiere, che di rigori ne ha parati tre e calciati zero.

    Qui non si mette un'etichetta, si mette il numero: "cinque rigori
    calciati" si spiega da solo, "rigorista" no.
    """
    calciati = int(riga['Rc']) if riga['R'] != 'P' else 0
    parati = int(riga['Rp']) if riga['R'] == 'P' else 0
    return calciati, parati


def media_ruolo(df, ruolo, colonna='Fm'):
    """La media di ruolo fra chi ha almeno una presenza. 6.0 se non c'e' nessuno."""
    gruppo = df[(df['R'] == ruolo) & (df['Pv'] > 0)][colonna]
    gruppo = gruppo[gruppo > 0]
    if gruppo.empty:
        return 6.0
    return float(gruppo.mean())
