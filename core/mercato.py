"""
mercato.py - Prezzi e fasce.

Il prezzo che la stanza paghera', non quello che il giocatore vale.
"""

from .costanti import SLOT_ROSA


def prezzi_di_mercato(df, squadre, budget):
    """
    Il FVM del listone e' la scala che hanno in mano tutti: si normalizza sul
    monte crediti reale della lega, in modo che la somma dei giocatori che
    verranno effettivamente venduti pareggi i crediti in circolazione.

    Cambiando squadre o budget cambiano tutti i prezzi insieme: e' l'unico
    modo perche' la somma continui a tornare.
    """
    slot_totali = sum(SLOT_ROSA.values()) * squadre
    monte = squadre * budget
    fvm = df['FVM'].clip(lower=0)

    # Solo i primi slot_totali giocatori verranno venduti a piu' di un credito.
    soglia = fvm.nlargest(min(slot_totali, len(fvm))).min()
    venduti = fvm >= soglia
    crediti_a_un_credito = int(venduti.sum())
    da_distribuire = max(1, monte - crediti_a_un_credito)

    quota = fvm.where(venduti, 0)
    somma = quota.sum()
    fattore = da_distribuire / somma if somma > 0 else 0
    prezzo = (quota * fattore + 1).round()
    return prezzo.clip(lower=1).astype(int)


def fasce(df, ruolo, squadre):
    """
    Le fasce non sono percentuali: sono la fila d'attesa.

    Con {squadre} squadre in asta, i primi {squadre} giocatori del ruolo se li
    spartiscono le squadre - uno a testa. Quelli sono la fascia 1. I successivi
    {squadre} la fascia 2, e via cosi'. La fascia dice quanti ne restano prima
    che tocchi a te: e' l'unica definizione che non dipende da un giudizio.

    Torna (etichette allineate all'indice del df, punti di rottura).
    """
    gruppo = df[df['R'] == ruolo].sort_values('prezzo_mercato', ascending=False)
    etichette = [min(5, posto // squadre + 1) for posto in range(len(gruppo))]
    gruppo = gruppo.assign(fascia=etichette)

    punti_rottura = []
    for f in range(1, 6):
        blocco = gruppo[gruppo['fascia'] == f]
        if blocco.empty:
            continue
        punti_rottura.append({
            'fascia': f,
            'da': int(blocco['prezzo_mercato'].max()),
            'a': int(blocco['prezzo_mercato'].min()),
            'quanti': int(len(blocco)),
            # Quanto costa, in media, una casella riempita a questo livello:
            # e' il mattone su cui si costruisce il piano di spesa.
            'rif': int(round(blocco['prezzo_mercato'].median())),
        })
    return gruppo['fascia'], punti_rottura
