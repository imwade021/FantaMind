"""
Test di coerenza sul Master vero, non su dati finti.

    python3 -m unittest discover -s tests -v

Servono a una cosa sola: garantire che due schermate non diano mai numeri
diversi sullo stesso giocatore, e che il JSON si apra sempre.
Solo libreria standard: niente da installare.
"""

import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.certezza import partite_possibili, traduci
from core.costanti import (BUDGET_AMMESSI, BUDGET_DEFAULT, PRUDENZA, SLOT_ROSA,
                          SQUADRE_AMMESSE, SQUADRE_DEFAULT, chiave_lega)
from core.esporta import calcola, costruisci
from core.lettura import carica
from core.mercato import fasce, prezzi_di_mercato
from core.resa import media_ruolo, resa

RADICE = Path(__file__).resolve().parent.parent

# Il Master si legge una volta sola: 501 righe per ogni test sarebbero minuti.
DF = carica()
DATI, DF_CALCOLATO = costruisci()
GIOCATORI = DATI['giocatori']


class TestLettura(unittest.TestCase):

    def test_il_master_si_legge(self):
        self.assertGreater(len(DF), 400, 'il Master ha meno righe del previsto')

    def test_nessun_id_duplicato(self):
        self.assertEqual(int(DF['Id'].duplicated().sum()), 0)

    def test_solo_ruoli_validi(self):
        self.assertLessEqual(set(DF['R'].unique()), set(SLOT_ROSA))

    def test_le_colonne_numeriche_non_hanno_buchi(self):
        for colonna in ('Pv', 'Mv', 'Fm', 'FVM', 'Qt.A'):
            with self.subTest(colonna=colonna):
                self.assertEqual(int(DF[colonna].isna().sum()), 0)

    def test_master_mancante_da_errore_chiaro(self):
        with self.assertRaises(FileNotFoundError):
            carica('/tmp/non-esiste-nessun-master.csv')


class TestCertezza(unittest.TestCase):

    def test_certezza_nel_range_o_assente(self):
        for g in GIOCATORI:
            if g['c'] is not None:
                self.assertTrue(0 <= g['c'] <= 100,
                                f"{g['n']}: certezza {g['c']}")

    def test_ogni_certezza_ha_almeno_un_perche(self):
        for g in GIOCATORI:
            self.assertGreaterEqual(len(g['nc_perche']), 1,
                                    f"{g['n']}: nessun perche'")

    def test_partite_possibili_non_supera_il_campionato(self):
        for _, riga in DF.iterrows():
            possibili, _ = partite_possibili(riga)
            self.assertTrue(1 <= possibili <= 38)

    def test_traduzione_motivi(self):
        self.assertEqual(traduci('Ankle Injury'), 'una caviglia')
        self.assertIsNone(traduci('   '))
        self.assertEqual(traduci('Motivo Ignoto XYZ'), 'motivo ignoto xyz')

    def test_ogni_giocatore_ha_una_posizione(self):
        for g in GIOCATORI:
            self.assertTrue(g['pos'], f"{g['n']}: posizione vuota")


class TestResa(unittest.TestCase):

    def test_la_resa_e_tirata_verso_la_media_su_poche_presenze(self):
        media = media_ruolo(DF, 'A')
        poche = resa({'Fm': 7.5, 'Pv': 8}, media)
        tante = resa({'Fm': 7.5, 'Pv': 38}, media)
        self.assertLess(poche, tante)
        atteso = round((7.5 * 8 + media * PRUDENZA) / (8 + PRUDENZA), 2)
        self.assertAlmostEqual(poche, atteso, places=2)

    def test_senza_presenze_niente_resa(self):
        self.assertIsNone(resa({'Fm': 7.5, 'Pv': 0}, 6.0))
        self.assertIsNone(resa({'Fm': 0.0, 'Pv': 20}, 6.0))

    def test_la_fantamedia_di_chi_non_ha_giocato_non_esce(self):
        """Il Master ha un Fm di riempimento anche per chi non ha mai giocato."""
        for g in GIOCATORI:
            if g['pv'] == 0:
                self.assertIsNone(g['fm'], f"{g['n']}: fantamedia senza presenze")
                self.assertIsNone(g['y'], f"{g['n']}: resa senza presenze")

    def test_gol_subiti_solo_ai_portieri(self):
        for g in GIOCATORI:
            if g['r'] != 'P':
                self.assertIsNone(g['gs'], f"{g['n']}: gol subiti a un {g['r']}")

    def test_rigori_calciati_e_parati_non_si_confondono(self):
        for g in GIOCATORI:
            if g['r'] == 'P':
                self.assertEqual(g['rc'], 0, f"{g['n']}: portiere che calcia rigori")
            else:
                self.assertEqual(g['rp'], 0, f"{g['n']}: movimento che para rigori")


class TestMercato(unittest.TestCase):

    def test_prezzo_minimo_un_credito(self):
        for g in GIOCATORI:
            self.assertGreaterEqual(g['p'], 1, f"{g['n']}: prezzo {g['p']}")

    def test_i_prezzi_pareggiano_il_monte_crediti(self):
        prezzi = prezzi_di_mercato(DF.copy(), SQUADRE_DEFAULT, BUDGET_DEFAULT)
        monte = SQUADRE_DEFAULT * BUDGET_DEFAULT
        slot = sum(SLOT_ROSA.values()) * SQUADRE_DEFAULT
        venduti = int(prezzi.nlargest(slot).sum())
        self.assertTrue(0.90 * monte <= venduti <= 1.10 * monte,
                        f'venduti {venduti} contro un monte di {monte}')

    def test_cambiando_lega_cambiano_i_prezzi(self):
        piccola = prezzi_di_mercato(DF.copy(), 8, 500).sum()
        grande = prezzi_di_mercato(DF.copy(), 12, 1000).sum()
        self.assertGreater(grande, piccola)

    def test_le_fasce_sono_la_fila_dattesa(self):
        """Con N squadre ogni fascia sotto la quinta ha esattamente N giocatori."""
        lavoro, _ = calcola(DF, squadre=SQUADRE_DEFAULT, budget=BUDGET_DEFAULT)
        for ruolo in SLOT_ROSA:
            _, punti = fasce(lavoro, ruolo, SQUADRE_DEFAULT)
            for punto in punti:
                if punto['fascia'] < 5:
                    with self.subTest(ruolo=ruolo, fascia=punto['fascia']):
                        self.assertEqual(punto['quanti'], SQUADRE_DEFAULT)

    def test_le_fasce_non_si_scavalcano(self):
        """Un giocatore di fascia 1 non puo' costare meno di uno di fascia 2."""
        for ruolo in SLOT_ROSA:
            punti = {p['fascia']: p for p in DATI['rotture'][ruolo]}
            for f in range(1, 5):
                if f in punti and f + 1 in punti:
                    with self.subTest(ruolo=ruolo, fascia=f):
                        self.assertGreaterEqual(punti[f]['a'], punti[f + 1]['da'])

    def test_ogni_giocatore_ha_una_fascia(self):
        for g in GIOCATORI:
            self.assertTrue(1 <= g['f'] <= 5, f"{g['n']}: fascia {g['f']}")


class TestConfronti(unittest.TestCase):

    def test_il_vantaggio_e_relativo_ai_pari_prezzo(self):
        for g in GIOCATORI:
            if g['v'] is not None:
                self.assertTrue(g['pari'] and g['pari'] >= 1,
                                f"{g['n']}: vantaggio senza concorrenti")

    def test_i_percentili_confrontano_solo_lo_stesso_ruolo(self):
        for g in GIOCATORI:
            if g['perc']:
                self.assertEqual(g['perc']['ruolo'], g['r'])
                for voce in g['perc']['forze'] + g['perc']['debolezze']:
                    self.assertTrue(1 <= voce['rango'] <= g['perc']['totale'])

    def test_un_solo_rigorista_titolare_per_squadra(self):
        titolari = {}
        for g in GIOCATORI:
            if g['rig'] and g['rig']['livello'] == 'titolare':
                squadra = g['rig']['squadra']
                self.assertNotIn(squadra, titolari,
                                 f"{squadra}: due rigoristi titolari")
                titolari[squadra] = g['n']

    def test_chi_e_rigorista_ha_calciato_rigori(self):
        for g in GIOCATORI:
            if g['rig']:
                self.assertGreaterEqual(g['rig']['calciati'], 2)
                self.assertEqual(g['rig']['calciati'], g['rc'])


class TestUscita(unittest.TestCase):

    def test_il_json_e_valido(self):
        testo = json.dumps(DATI, ensure_ascii=False, allow_nan=False)
        riletto = json.loads(testo)
        self.assertEqual(len(riletto['giocatori']), len(GIOCATORI))

    def test_nessun_nan_nascosto(self):
        """Un solo NaN rende il file impossibile da aprire nel browser."""
        def cerca(valore, dove):
            if isinstance(valore, float):
                self.assertFalse(math.isnan(valore), f'NaN in {dove}')
            elif isinstance(valore, dict):
                for chiave, sotto in valore.items():
                    cerca(sotto, f'{dove}.{chiave}')
            elif isinstance(valore, list):
                for indice, sotto in enumerate(valore):
                    cerca(sotto, f'{dove}[{indice}]')

        cerca(DATI, 'dati')

    def test_i_giocatori_sono_ordinati_per_prezzo(self):
        prezzi = [g['p'] for g in GIOCATORI]
        self.assertEqual(prezzi, sorted(prezzi, reverse=True))

    def test_l_infortunio_ha_sempre_un_motivo(self):
        for g in GIOCATORI:
            if g['out']:
                self.assertTrue(g['out']['motivo'], f"{g['n']}: fuori senza motivo")
                self.assertIsInstance(g['out']['grave'], bool)

    def test_una_squalifica_non_e_un_infortunio(self):
        for g in GIOCATORI:
            if g['out'] and 'squalifica' in (g['out']['motivo'] or ''):
                self.assertFalse(g['out']['grave'],
                                 f"{g['n']}: squalifica marcata come infortunio")

    def test_il_file_generato_si_apre(self):
        percorso = RADICE / 'app' / 'dati_asta.json'
        if not percorso.exists():
            self.skipTest('dati_asta.json non ancora generato')
        dati = json.loads(percorso.read_text(encoding='utf-8'))
        self.assertTrue(dati['giocatori'])
        self.assertEqual(dati['slot'], SLOT_ROSA)

    def test_ogni_giocatore_ha_i_campi_che_l_app_legge(self):
        obbligatori = ('id', 'n', 'r', 's', 'p', 'f', 'pos', 'q')
        for g in GIOCATORI:
            for campo in obbligatori:
                self.assertIn(campo, g, f"{g['n']}: manca {campo}")


class TestMultiLega(unittest.TestCase):
    """L'app cambia lega leggendo, non ricalcolando: i valori devono esserci tutti."""

    def test_ogni_giocatore_ha_il_prezzo_di_ogni_lega(self):
        attese = {chiave_lega(s, b)
                  for s in SQUADRE_AMMESSE for b in BUDGET_AMMESSI}
        for g in GIOCATORI:
            self.assertEqual(set(g['pz']), attese, f"{g['n']}: leghe mancanti")

    def test_ogni_giocatore_ha_la_fascia_di_ogni_lega(self):
        attese = {chiave_lega(s, b)
                  for s in SQUADRE_AMMESSE for b in BUDGET_AMMESSI}
        for g in GIOCATORI:
            self.assertEqual(set(g['fs']), attese, f"{g['n']}: fasce mancanti")

    def test_il_prezzo_di_riferimento_coincide_con_la_sua_lega(self):
        chiave = chiave_lega(DATI['squadre'], DATI['budget'])
        for g in GIOCATORI:
            self.assertEqual(g['p'], g['pz'][chiave],
                             f"{g['n']}: prezzo di riferimento incoerente")
            self.assertEqual(g['f'], g['fs'][chiave],
                             f"{g['n']}: fascia di riferimento incoerente")

    def test_piu_crediti_significa_prezzi_piu_alti(self):
        for squadre in SQUADRE_AMMESSE:
            basso = sum(g['pz'][chiave_lega(squadre, 300)] for g in GIOCATORI)
            alto = sum(g['pz'][chiave_lega(squadre, 1500)] for g in GIOCATORI)
            with self.subTest(squadre=squadre):
                self.assertGreater(alto, basso)

    def test_ogni_prezzo_e_almeno_un_credito(self):
        for g in GIOCATORI:
            for chiave, prezzo in g['pz'].items():
                self.assertGreaterEqual(prezzo, 1, f"{g['n']} in {chiave}")

    def test_ogni_lega_ha_i_suoi_punti_di_rottura(self):
        for s in SQUADRE_AMMESSE:
            for b in BUDGET_AMMESSI:
                chiave = chiave_lega(s, b)
                self.assertIn(chiave, DATI['rotture_lega'])
                self.assertEqual(set(DATI['rotture_lega'][chiave]), set(SLOT_ROSA))


if __name__ == '__main__':
    unittest.main(verbosity=2)
