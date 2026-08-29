#!/usr/bin/env python3
"""
genera_json.py - Dal Master al dati_asta.json che l'app legge.

    python3 pipeline/genera_json.py
    python3 pipeline/genera_json.py --squadre 12 --budget 1000

Si lancia dopo build_master.py. La GitHub Action fa questi due, in quest'ordine.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.costanti import BUDGET_DEFAULT, SQUADRE_DEFAULT
from core.esporta import costruisci, scrivi


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--squadre', type=int, default=SQUADRE_DEFAULT,
                        help=f'squadre nella lega (default {SQUADRE_DEFAULT})')
    parser.add_argument('--budget', type=int, default=BUDGET_DEFAULT,
                        help=f'crediti a squadra (default {BUDGET_DEFAULT})')
    parser.add_argument('--master', default=None,
                        help='percorso del Lista_Finale_Master.csv')
    argomenti = parser.parse_args()

    dati, df = costruisci(argomenti.squadre, argomenti.budget, argomenti.master)
    percorso = scrivi(dati)

    senza_storico = sum(1 for g in dati['giocatori'] if g['c'] is None)
    fermi = sum(1 for g in dati['giocatori'] if g['out'])
    print(f"{len(dati['giocatori'])} giocatori -> {percorso}")
    print(f"  aggiornato al {dati['aggiornato']}")
    print(f"  lega di riferimento: {dati['squadre']} squadre, {dati['budget']} crediti")
    print(f"  senza storico: {senza_storico}")
    print(f"  fermi adesso: {fermi}")
    for ruolo, punti in dati['rotture'].items():
        righe = ', '.join(f"F{p['fascia']} {p['da']}-{p['a']} ({p['quanti']})"
                          for p in punti)
        print(f"  {ruolo}: {righe}")


if __name__ == '__main__':
    main()
