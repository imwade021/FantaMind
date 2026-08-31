#!/usr/bin/env python3
"""
piano_asta.py - Il foglio da avere in mano al tavolo.

    python3 pipeline/piano_asta.py
    python3 pipeline/piano_asta.py --squadre 10 --budget 1000

Produce dati/Piano_Asta.txt: per ogni reparto, casella per casella, chi
puntare e chi prendere se te lo soffiano.

COME SONO ORDINATE LE CASELLE
Il budget del reparto si divide in fasce decrescenti: con otto difensori da
fare non ti servono otto giocatori uguali, te ne servono due buoni e poi dei
riempitivi. La prima casella prende la fetta piu' grande, e cosi' a scendere.

COSA VUOL DIRE "ALTERNATIVA"
Stesso ruolo, prezzo entro il tetto di QUELLA casella, la resa piu' alta fra
quelli che restano. Non e' un giocatore simile per caratteristiche: e' il
migliore che quel budget ti compra ancora.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))

from core.costanti import (BUDGET_DEFAULT, NOMI_RUOLO, ORDINE_ASTA,  # noqa: E402
                           QUOTE_REPARTO, SLOT_ROSA, SQUADRE_DEFAULT,
                           chiave_lega)

USCITA = RADICE / 'dati' / 'Piano_Asta.txt'
LARGHEZZA = 66
ALTERNATIVE = 3
DECADIMENTO = 0.55


def carica_dati():
    dati = json.loads((RADICE / 'app' / 'dati_asta.json').read_text(encoding='utf-8'))
    percorso_strategie = RADICE / 'app' / 'strategie.json'
    strategie = (json.loads(percorso_strategie.read_text(encoding='utf-8'))
                 if percorso_strategie.exists() else None)
    return dati, strategie


def prezzo(g, chiave):
    return g['pz'].get(chiave, g['p']) if g.get('pz') else g['p']


def mercato(g, strategie, budget):
    """Quanto pagherà la stanza, dalle liste dei creator. None se non c'è."""
    if not strategie:
        return None
    voce = strategie['giocatori'].get(str(g['id']))
    if not voce or not voce.get('pma'):
        return None
    return round(voce['pma'] * budget)


def piano_spesa(ruolo, budget):
    """Le fasce di spesa del reparto, decrescenti, somma = quota del reparto."""
    caselle = SLOT_ROSA[ruolo]
    disponibile = round(budget * QUOTE_REPARTO[ruolo])
    pesi = [DECADIMENTO ** i for i in range(caselle)]
    somma = sum(pesi)
    tetti = [max(1, int(disponibile * p / somma)) for p in pesi]
    tetti[0] += disponibile - sum(tetti)
    return tetti


def note(g, atteso, mio):
    """Le due o tre cose che cambiano la decisione, non tutte quelle vere."""
    voci = []
    if g.get('out'):
        stop = g['out']
        voci.append(('FERMO: ' + stop['motivo']) if stop['grave']
                    else ('salta una giornata: ' + stop['motivo']))
    if g.get('rig') and g['rig']['livello'] == 'titolare':
        voci.append(f"rigorista ({g['rig']['calciati']} tirati)")
    if g['c'] is None:
        voci.append('nessuno storico in Serie A')
    elif g['c'] >= 80:
        voci.append(f"certezza {g['c']}")
    elif g['c'] < 55:
        voci.append(f"certezza bassa {g['c']}")
    if atteso is not None:
        scarto = atteso - mio
        if scarto >= 8:
            voci.append(f'la stanza lo paga ~{atteso}: sopra il tuo prezzo')
        elif scarto <= -8:
            voci.append(f'la stanza lo paga ~{atteso}: sotto il tuo prezzo')
    return voci


def riga_giocatore(g, chiave, strategie, budget, marcatore):
    mio = prezzo(g, chiave)
    atteso = mercato(g, strategie, budget)
    resa = f"{g['y']:.2f}" if g['y'] is not None else '  — '
    voto = f"{g['mv']:.2f}" if g.get('mv') is not None else '  — '
    fm = f"{g['fm']:.2f}" if g.get('fm') is not None else '  — '

    righe = [f"  {marcatore} {g['n'][:20]:<20} {g['s'][:11]:<11} "
             f"{mio:>4} cr"]
    righe.append(f"      fm {fm}  voto {voto}  resa {resa}  "
                 f"{g['pv']:>2} pres"
                 + (f"  mercato ~{atteso}" if atteso is not None else ''))
    for voce in note(g, atteso, mio)[:3]:
        righe.append(f"      · {voce}")
    return righe


def scegli(candidati, tetto, quanti, gia_presi):
    """
    I migliori che stanno nel tetto e non sono già stati elencati.

    Prima i TITOLARI: chi ha giocato abbastanza da rendere confrontabile il
    suo rendimento. Ordinare per sola resa metteva in cima portieri con due
    presenze, perché su un campione così piccolo la resa viene tirata verso
    la media del ruolo e tutti si assomigliano. Un giocatore da due partite
    non è un obiettivo d'asta, è un tappabuchi.

    I non titolari non spariscono: vengono dopo. A fine reparto, quando i
    crediti sono finiti, spesso sono tutto quello che resta.
    """
    dentro = [g for g in candidati
              if g['prezzo'] <= tetto and g['id'] not in gia_presi
              and not (g.get('out') and g['out']['grave'])]

    def per_resa(gruppo):
        return sorted(gruppo, key=lambda g: (g['y'] is None, -(g['y'] or 0),
                                             g['prezzo']))

    titolari = [g for g in dentro
                if g['pv'] >= 10 and g['c'] is not None and g['c'] >= 60]
    altri = [g for g in dentro if g not in titolari]
    return (per_resa(titolari) + per_resa(altri))[:quanti]


def componi(dati, strategie, squadre, budget):
    chiave = chiave_lega(squadre, budget)
    righe = []
    A = righe.append

    A('=' * LARGHEZZA)
    A('PIANO D\'ASTA — FantaMind')
    A('=' * LARGHEZZA)
    A(f"Lega: {squadre} squadre · {budget} crediti · rosa da "
      f"{sum(SLOT_ROSA.values())}")
    A(f"Listone aggiornato al {dati['aggiornato']} · "
      f"{len(dati['giocatori'])} giocatori")
    if strategie:
        A(f"Prezzi di mercato da {len(strategie['fonti'])} liste di creator")
    A(f"Generato il {date.today().strftime('%d/%m/%Y')}")
    A('')
    A('COME SI LEGGE')
    A('  Ogni casella ha un TETTO: oltre quello stai togliendo crediti')
    A('  a un\'altra casella. Sotto il target trovi le alternative,')
    A('  cioè il meglio che quel tetto ti compra ancora.')
    A('  "mercato" è quanto pagherà la stanza secondo i creator.')
    A('')

    # --- come si spartisce il budget ---
    A('-' * LARGHEZZA)
    A('IL BUDGET')
    A('-' * LARGHEZZA)
    for ruolo in ORDINE_ASTA:
        quota = round(budget * QUOTE_REPARTO[ruolo])
        A(f"  {NOMI_RUOLO[ruolo].capitalize():<16} {SLOT_ROSA[ruolo]} caselle"
          f"  {quota:>4} cr   ({', '.join(str(t) for t in piano_spesa(ruolo, budget))})")
    A('')

    for ruolo in ORDINE_ASTA:
        tetti = piano_spesa(ruolo, budget)
        candidati = []
        for g in dati['giocatori']:
            if g['r'] != ruolo:
                continue
            copia = dict(g)
            copia['prezzo'] = prezzo(g, chiave)
            candidati.append(copia)

        A('=' * LARGHEZZA)
        A(f"{NOMI_RUOLO[ruolo].upper()} — {SLOT_ROSA[ruolo]} caselle, "
          f"{round(budget * QUOTE_REPARTO[ruolo])} crediti")
        A('=' * LARGHEZZA)

        gia_presi = set()
        for numero, tetto in enumerate(tetti, start=1):
            scelti = scegli(candidati, tetto, 1 + ALTERNATIVE, gia_presi)
            A('')
            A(f"CASELLA {numero}   tetto {tetto} crediti")
            if not scelti:
                A(f"  Nessuno libero sotto i {tetto} crediti.")
                continue

            for indice, g in enumerate(scelti):
                marcatore = '►' if indice == 0 else ' '
                righe_g = riga_giocatore(g, chiave, strategie, budget, marcatore)
                if indice == 1:
                    A('  se te lo soffiano:')
                for r in righe_g:
                    A(r)
                gia_presi.add(g['id'])
        A('')

    # --- le trappole e gli affari ---
    if strategie:
        A('=' * LARGHEZZA)
        A('DA NON PAGARE — la stanza li sopravvaluta')
        A('=' * LARGHEZZA)
        scarti = []
        for g in dati['giocatori']:
            mio = prezzo(g, chiave)
            atteso = mercato(g, strategie, budget)
            if atteso is None or mio < 8:
                continue
            scarti.append((atteso - mio, g, mio, atteso))
        scarti.sort(key=lambda x: -x[0])
        for delta, g, mio, atteso in scarti[:10]:
            A(f"  {g['n'][:20]:<20} {g['r']} {g['s'][:10]:<10} "
              f"tuo {mio:>3} · asta ~{atteso:<3} (+{delta})")
        A('')

        A('=' * LARGHEZZA)
        A('OCCASIONI — la stanza li sottovaluta')
        A('=' * LARGHEZZA)
        affari = []
        for g in dati['giocatori']:
            if g['y'] is None or (g.get('out') and g['out']['grave']):
                continue
            mio = prezzo(g, chiave)
            atteso = mercato(g, strategie, budget)
            if atteso is None:
                continue
            if atteso - mio < 0:
                affari.append((atteso - mio, g, mio, atteso))
        affari.sort(key=lambda x: x[0])
        for delta, g, mio, atteso in affari[:12]:
            A(f"  {g['n'][:20]:<20} {g['r']} {g['s'][:10]:<10} "
              f"tuo {mio:>3} · asta ~{atteso:<3} ({delta})  "
              f"resa {g['y']:.2f}")
        A('')

    # --- chi è fermo ---
    fermi = [g for g in dati['giocatori']
             if g.get('out') and g['out']['grave'] and prezzo(g, chiave) >= 5]
    if fermi:
        A('=' * LARGHEZZA)
        A('FERMI ADESSO — non riempiono una casella')
        A('=' * LARGHEZZA)
        for g in sorted(fermi, key=lambda x: -prezzo(x, chiave))[:15]:
            dal = f" dal {g['out']['dal']}" if g['out'].get('dal') else ''
            A(f"  {g['n'][:20]:<20} {g['r']} {g['s'][:10]:<10} "
              f"{prezzo(g, chiave):>3} cr")
            A(f"      {g['out']['motivo']}{dal}")
        A('')

    A('=' * LARGHEZZA)
    A('I numeri di resa, voto e certezza vengono dal tuo Master e sono')
    A('ricalcolabili dal CSV. I prezzi di mercato sono opinioni di')
    A('creator: dicono cosa faranno gli altri, non quanto vale uno.')
    A('=' * LARGHEZZA)
    return '\n'.join(righe)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--squadre', type=int, default=SQUADRE_DEFAULT)
    parser.add_argument('--budget', type=int, default=BUDGET_DEFAULT)
    parser.add_argument('--uscita', default=None)
    argomenti = parser.parse_args()

    dati, strategie = carica_dati()
    testo = componi(dati, strategie, argomenti.squadre, argomenti.budget)

    percorso = Path(argomenti.uscita) if argomenti.uscita else USCITA
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(testo, encoding='utf-8')
    print(f'{percorso}  ({len(testo.splitlines())} righe)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
