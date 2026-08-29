"""
lettura.py - Unico punto in cui si legge il Lista_Finale_Master.csv.

Il resto del core riceve un DataFrame gia' ripulito e non tocca mai il file.
"""

from pathlib import Path

import pandas as pd

from .costanti import COLONNE_NUMERICHE, COLONNE_OBBLIGATORIE

# La radice della repo, calcolata dal file: funziona da qualunque cartella
# si lanci lo script, che e' quello che serve alla GitHub Action.
RADICE = Path(__file__).resolve().parent.parent
MASTER = RADICE / 'dati' / 'Lista_Finale_Master.csv'


def num(serie, default=0.0):
    """Converte una colonna in numero senza esplodere su celle vuote."""
    return pd.to_numeric(serie, errors='coerce').fillna(default)


def testo(valore):
    """Una stringa pulita, o vuota. Mai NaN, mai None."""
    if valore is None or (isinstance(valore, float) and pd.isna(valore)):
        return ''
    valore = str(valore).strip()
    return '' if valore.lower() in ('nan', 'none', '<na>') else valore


def carica(percorso=None):
    """
    Legge il Master e restituisce un DataFrame pronto.

    Se manca una colonna obbligatoria si ferma qui con un errore chiaro:
    meglio un messaggio esplicito che un'app che mostra zeri ovunque.
    """
    percorso = Path(percorso) if percorso else MASTER
    if not percorso.exists():
        raise FileNotFoundError(
            f"Master non trovato in {percorso}. "
            f"Lancialo dopo pipeline/build_master.py, oppure passa il percorso."
        )

    df = pd.read_csv(percorso, sep=';')

    mancanti = [c for c in COLONNE_OBBLIGATORIE if c not in df.columns]
    if mancanti:
        raise ValueError(
            f"{percorso.name} non sembra il Master: mancano le colonne {mancanti}."
        )

    df['R'] = df['R'].astype(str).str.upper().str.strip()
    df['Nome'] = df['Nome'].astype(str).str.strip()
    df['Squadra'] = df['Squadra'].astype(str).str.strip()

    for colonna in COLONNE_NUMERICHE:
        df[colonna] = num(df[colonna]) if colonna in df.columns else 0.0

    return df
