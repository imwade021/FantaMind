#!/usr/bin/env python3
"""
importa_strategie.py - Le liste dei creator, abbinate al tuo listone.

    python3 pipeline/importa_strategie.py

Legge ogni .xlsx dentro dati/strategie/ e produce app/strategie.json.

PERCHE' RESTA SEPARATO DAL MASTER
Il Master contiene solo numeri ricalcolabili dal CSV. Questi sono giudizi:
quanto un creator pensa che valga un giocatore. Sono utili proprio perche'
sono un'altra cosa - il Master dice quanto rende, i creator dicono quanto
pagherai. Mescolarli farebbe sparire l'informazione che sta nella distanza
fra i due.

IL NUMERO CHE CONTA
La colonna PMA e' il prezzo medio d'asta in PERCENTUALE di budget. E' l'unico
campo confrontabile fra leghe diverse: il "Prezzo" di un creator vale sulla
lega che aveva in mente lui, il PMA vale sulla tua. Il prezzo atteso in
crediti lo calcola l'app: PMA x il tuo budget.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

RADICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RADICE))

from core.lettura import carica, testo          # noqa: E402

CARTELLA = RADICE / 'dati' / 'strategie'
USCITA = RADICE / 'app' / 'strategie.json'
FOGLI = ('P', 'D', 'C', 'A')


def normalizza(nome):
    """
    Il nome ridotto all'osso, per l'abbinamento.

    Via accenti, punti, spazi e maiuscole: 'Cissè A.' e 'CISSE A' devono
    diventare la stessa cosa, altrimenti l'abbinamento fallisce su meta'
    dei nomi stranieri.
    """
    senza_accenti = unicodedata.normalize('NFKD', str(nome))
    senza_accenti = senza_accenti.encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Z]', '', senza_accenti.upper())


def percentuale(valore):
    """'14.5%' -> 0.145. None se non e' leggibile."""
    grezzo = testo(valore).replace('%', '').replace(',', '.').strip()
    if not grezzo:
        return None
    try:
        return round(float(grezzo) / 100, 5)
    except ValueError:
        return None


def numero(valore):
    try:
        return int(float(valore))
    except (TypeError, ValueError):
        return None


def leggi_strategia(percorso):
    """Un file di un creator: i quattro fogli uniti, col ruolo dal foglio."""
    pezzi = []
    for foglio in FOGLI:
        try:
            df = pd.read_excel(percorso, sheet_name=foglio)
        except ValueError:
            continue                      # foglio assente: si tira dritto
        df['R'] = foglio
        pezzi.append(df)
    if not pezzi:
        raise ValueError(f'{percorso.name}: nessun foglio P/D/C/A trovato.')
    return pd.concat(pezzi, ignore_index=True)


def nome_fonte(percorso):
    """Dal nome del file a un'etichetta leggibile."""
    grezzo = percorso.stem.replace('_', ' ').strip()
    return re.sub(r'\s+', ' ', grezzo)


def mediana(valori):
    puliti = sorted(v for v in valori if v is not None)
    if not puliti:
        return None
    meta = len(puliti) // 2
    if len(puliti) % 2:
        return puliti[meta]
    return (puliti[meta - 1] + puliti[meta]) / 2


def main():
    if not CARTELLA.exists() or not list(CARTELLA.glob('*.xlsx')):
        print(f'Nessun file in {CARTELLA}. Mettici gli .xlsx dei creator.')
        return 1

    master = carica()
    indice = {}
    for _, riga in master.iterrows():
        indice[(normalizza(riga['Nome']), riga['R'])] = int(riga['Id'])

    per_giocatore = {}
    # I giocatori che le liste hanno e il Master no: quasi tutti arrivi
    # dall'estero, senza storico in Serie A. Alcuni pero' sono titolari veri,
    # e all'asta non averli in lista significa non poterli nemmeno cercare.
    # Restano SEPARATI dal Master e dichiarati come tali: di loro sappiamo
    # solo quello che dicono i creator.
    aggiunti = {}
    fonti = []
    scartati = {}

    for percorso in sorted(CARTELLA.glob('*.xlsx')):
        fonte = nome_fonte(percorso)
        df = leggi_strategia(percorso)
        fonti.append(fonte)
        fuori = []

        for _, riga in df.iterrows():
            chiave = (normalizza(riga.get('Nome')), riga['R'])
            identificativo = indice.get(chiave)
            voce = {
                'fonte': fonte,
                'prezzo': numero(riga.get('Prezzo')),
                'pma': percentuale(riga.get('PMA')),
                'fascia': testo(riga.get('Fascia')) or None,
                'obiettivo': testo(riga.get('Obiett.')).lower().startswith('s'),
            }
            commento = testo(riga.get('Commento'))
            if commento:
                voce['commento'] = commento[:400]

            note = [testo(riga.get(f'Nota {n}')) for n in range(1, 6)]
            note = [n for n in note if n]
            if note:
                voce['note'] = note

            if identificativo is None:
                # Non e' un errore: le liste hanno piu' giocatori del Master.
                fuori.append(testo(riga.get('Nome')))
                dati_extra = aggiunti.setdefault(chiave, {
                    'nome': testo(riga.get('Nome')),
                    'squadra': testo(riga.get('Team')),
                    'ruolo': riga['R'],
                    'quotazione': numero(riga.get('Quo')),
                    'presenze': numero(riga.get('Presenze')) or 0,
                    'mv': None, 'fm': None,
                    'gol': numero(riga.get('Gol')) or 0,
                    'assist': numero(riga.get('Assist')) or 0,
                    'voci': [],
                })
                # MV e FMV valgono solo se qualcuno li ha davvero: nei file
                # sono zero per chi non ha mai giocato in Serie A, e uno zero
                # sembra un rendimento pessimo invece di un dato assente.
                for campo, chiave_file in (('mv', 'MV'), ('fm', 'FMV')):
                    grezzo = riga.get(chiave_file)
                    try:
                        valore = float(grezzo)
                    except (TypeError, ValueError):
                        valore = 0.0
                    if valore > 0 and dati_extra[campo] is None:
                        dati_extra[campo] = round(valore, 2)
                dati_extra['voci'].append(voce)
                continue

            per_giocatore.setdefault(identificativo, []).append(voce)

        scartati[fonte] = fuori
        print(f'{fonte}: {len(df) - len(fuori)}/{len(df)} abbinati')

    # --- il consenso: cosa dicono le liste messe insieme ---
    consenso = {}
    for identificativo, voci in per_giocatore.items():
        pma = [v['pma'] for v in voci]
        prezzi = [v['prezzo'] for v in voci]
        pma_validi = [p for p in pma if p is not None]

        consenso[str(identificativo)] = {
            'liste': len(voci),
            'pma': mediana(pma),
            # La forbice fra il creator piu' prudente e il piu' aggressivo:
            # dove e' larga, la stanza non ha un'idea condivisa, e li' si fanno
            # gli affari e i disastri.
            'pma_min': min(pma_validi) if pma_validi else None,
            'pma_max': max(pma_validi) if pma_validi else None,
            'prezzo_mediano': mediana(prezzi),
            'obiettivo': sum(1 for v in voci if v['obiettivo']),
            'voci': voci,
        }

    # --- i giocatori che il Master non ha ---
    # Gli id sono negativi: non possono collidere con quelli del listone, e
    # a colpo d'occhio si capisce che vengono da un'altra fonte.
    extra = []
    for numero_progressivo, (chiave, dati_extra) in enumerate(
            sorted(aggiunti.items()), start=1):
        pma = [v['pma'] for v in dati_extra['voci']]
        pma_validi = [p for p in pma if p is not None]
        prezzi = [v['prezzo'] for v in dati_extra['voci']]
        pma_mediano = mediana(pma)

        # Chi nessuna lista prezza sopra un credito non serve a niente in asta.
        if not pma_mediano and not any(p for p in prezzi if p):
            continue

        extra.append({
            'id': -numero_progressivo,
            'nome': dati_extra['nome'],
            'squadra': dati_extra['squadra'],
            'ruolo': dati_extra['ruolo'],
            'quotazione': dati_extra['quotazione'],
            'presenze': dati_extra['presenze'],
            'mv': dati_extra['mv'],
            'fm': dati_extra['fm'],
            'gol': dati_extra['gol'],
            'assist': dati_extra['assist'],
            'liste': len(dati_extra['voci']),
            'pma': pma_mediano,
            'pma_min': min(pma_validi) if pma_validi else None,
            'pma_max': max(pma_validi) if pma_validi else None,
            'prezzo_mediano': mediana(prezzi),
            'obiettivo': sum(1 for v in dati_extra['voci'] if v['obiettivo']),
            'voci': dati_extra['voci'],
        })

    extra.sort(key=lambda x: -(x['pma'] or 0))

    dati = {
        'fonti': fonti,
        'aggiunti': extra,
        'giocatori': consenso,
        'coperti': len(consenso),
        'totale_master': len(master),
    }

    USCITA.parent.mkdir(parents=True, exist_ok=True)
    USCITA.write_text(
        json.dumps(dati, ensure_ascii=False, separators=(',', ':'), allow_nan=False),
        encoding='utf-8')

    print(f'\n{len(fonti)} liste -> {USCITA}')
    print(f'  giocatori del Master coperti: {len(consenso)}/{len(master)}')
    senza = len(master) - len(consenso)
    if senza:
        print(f'  senza consiglio: {senza} (nessuna lista li nomina)')
    print(f'  aggiunti dalle liste (non nel Master): {len(extra)}')
    for voce in extra[:8]:
        atteso = round((voce['pma'] or 0) * 500)
        print(f"    {voce['nome']:<16} {voce['ruolo']} {voce['squadra']:<4} "
              f"~{atteso} crediti su 500")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
