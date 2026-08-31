"""
Controlli statici sull'interfaccia.

    python3 -m unittest tests.test_interfaccia -v

Non aprono un browser: verificano le cose che, se sbagliate, fanno morire
l'app al primo caricamento senza dire perche' - un id scritto male, un file
citato e non caricato, un pezzo del guscio fuori dalla cache offline.
"""

import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
APP = RADICE / 'app'


class RaccoglitoreId(HTMLParser):
    """Tira fuori id, attributi data- e src/href da index.html."""

    def __init__(self):
        super().__init__()
        self.ids = set()
        self.viste = set()
        self.ordini = set()
        self.risorse = set()

    def handle_starttag(self, tag, attributi):
        attributi = dict(attributi)
        if 'id' in attributi:
            self.ids.add(attributi['id'])
        if 'data-vista' in attributi:
            self.viste.add(attributi['data-vista'])
        if 'data-ordine' in attributi:
            self.ordini.add(attributi['data-ordine'])
        for chiave in ('src', 'href'):
            valore = attributi.get(chiave, '')
            if valore and not valore.startswith(('http', '#', 'data:')):
                self.risorse.add(valore)


PAGINA = (APP / 'index.html').read_text(encoding='utf-8')
CODICE = (APP / 'app.js').read_text(encoding='utf-8')
CONTI = (APP / 'conti.js').read_text(encoding='utf-8')
WORKER = (APP / 'sw.js').read_text(encoding='utf-8')

LETTORE = RaccoglitoreId()
LETTORE.feed(PAGINA)


class TestCollegamenti(unittest.TestCase):

    def test_ogni_id_cercato_dal_codice_esiste_nella_pagina(self):
        """Un getElementById che non trova niente rompe l'app in silenzio."""
        cercati = set(re.findall(r"getElementById\(['\"]([\w-]+)['\"]\)", CODICE))
        mancanti = cercati - LETTORE.ids
        self.assertFalse(mancanti, f'id cercati ma non presenti: {sorted(mancanti)}')

    def test_ogni_voce_del_menu_ha_la_sua_sezione(self):
        for nome in LETTORE.viste:
            with self.subTest(vista=nome):
                self.assertIn(f'vista-{nome}', LETTORE.ids)

    def test_ogni_file_citato_dalla_pagina_esiste(self):
        for risorsa in LETTORE.risorse:
            with self.subTest(risorsa=risorsa):
                self.assertTrue((APP / risorsa).exists(),
                                f'{risorsa} è citato ma non c\'è')

    def test_la_pagina_carica_i_conti_prima_dell_app(self):
        """conti.js definisce Conti: se arriva dopo, app.js esplode all'avvio."""
        self.assertLess(PAGINA.index('conti.js'), PAGINA.index('app.js'))

    # Queste due non sono campi del giocatore: si calcolano dalle liste dei
    # creator, che sono facoltative. Tutte le altre devono stare nel JSON.
    ORDINI_CALCOLATI = {'mkt', 'div'}

    def test_le_colonne_ordinabili_esistono_nei_dati(self):
        percorso = APP / 'dati_asta.json'
        if not percorso.exists():
            self.skipTest('dati_asta.json non generato')
        primo = json.loads(percorso.read_text(encoding='utf-8'))['giocatori'][0]
        for chiave in LETTORE.ordini - self.ORDINI_CALCOLATI:
            with self.subTest(colonna=chiave):
                self.assertIn(chiave, primo)

    def test_le_colonne_calcolate_sono_gestite_dal_codice(self):
        for chiave in LETTORE.ordini & self.ORDINI_CALCOLATI:
            with self.subTest(colonna=chiave):
                self.assertIn(f"chiave === '{chiave}'", CODICE,
                              f"l'ordinamento per {chiave} non è implementato")

    def test_intestazione_e_corpo_hanno_le_stesse_colonne(self):
        """Una colonna in più nell'intestazione sposta tutti i numeri."""
        intestazione = re.search(r'<thead>.*?</thead>', PAGINA, re.S).group(0)
        colonne = len(re.findall(r'<th[\s>]', intestazione))
        corpo = re.search(r'<tr data-id="\$\{g\.id\}">(.*?)</tr>', CODICE, re.S)
        self.assertIsNotNone(corpo, 'riga della tabella non trovata')
        celle = len(re.findall(r'<td', corpo.group(1)))
        self.assertEqual(colonne, celle,
                         f'intestazione {colonne} colonne, corpo {celle} celle')
        self.assertIn(f'colspan="{colonne}"', CODICE,
                      'il colspan della riga finale non combacia')


class TestOffline(unittest.TestCase):
    """All'asta la rete non c'è: quello che manca dalla cache non esiste."""

    def _guscio(self):
        blocco = re.search(r'const GUSCIO = \[(.*?)\];', WORKER, re.S)
        self.assertIsNotNone(blocco, 'GUSCIO non trovato in sw.js')
        return re.findall(r"'([^']+)'", blocco.group(1))

    def test_ogni_file_del_guscio_esiste(self):
        for nome in self._guscio():
            if nome == './':
                continue
            with self.subTest(file=nome):
                self.assertTrue((APP / nome).exists(), f'{nome} in cache ma assente')

    def test_ogni_file_caricato_dalla_pagina_e_in_cache(self):
        guscio = set(self._guscio())
        for risorsa in LETTORE.risorse:
            with self.subTest(risorsa=risorsa):
                self.assertIn(risorsa, guscio,
                              f'{risorsa} serve alla pagina ma non è in cache: '
                              f"offline l'app non partirebbe")

    def test_il_listone_e_nella_cache_iniziale(self):
        self.assertIn('dati_asta.json', WORKER)

    def test_nessun_file_remoto_nel_guscio(self):
        """Un font o una CDN in cache è un'app che aspetta la rete che non c'è."""
        self.assertNotIn('http', ''.join(self._guscio()))

    def test_la_pagina_non_carica_niente_da_internet(self):
        remoti = re.findall(r'(?:src|href)="(https?://[^"]+)"', PAGINA)
        self.assertFalse(remoti, f'la pagina dipende dalla rete: {remoti}')



class TestCostruzioneNodi(unittest.TestCase):
    """Regressione: le righe di tabella non si costruiscono dentro un div."""

    def test_gli_elementi_nascono_da_un_template(self):
        # Il parser HTML scarta <tr> e <td> fuori da una <table>: dentro un
        # div le righe perdevano le colonne e appendChild riceveva null.
        self.assertIn("createElement('template')", CODICE)
        self.assertIn('modello.content.firstElementChild', CODICE)

    def test_la_funzione_elemento_non_usa_un_div(self):
        blocco = re.search(r'function elemento\(html\) \{(.*?)\n\}', CODICE, re.S)
        self.assertIsNotNone(blocco, 'funzione elemento() non trovata')
        self.assertNotIn("createElement('div')", blocco.group(1))

    def test_html_senza_elementi_da_un_errore_leggibile(self):
        self.assertIn('HTML senza elementi', CODICE)



class TestSezioniNuove(unittest.TestCase):
    """Control Center e Allenatore: le parti aggiunte dopo il primo giro."""

    def test_ci_sono_cinque_sezioni(self):
        self.assertEqual(len(LETTORE.viste), 5, f'sezioni: {sorted(LETTORE.viste)}')
        for nome in ('control', 'enciclopedia', 'asta', 'strategia', 'allenatore'):
            with self.subTest(sezione=nome):
                self.assertIn(nome, LETTORE.viste)

    def test_ogni_voce_ha_etichetta_lunga_e_corta(self):
        """Cinque voci nella barra del telefono ci stanno solo abbreviate."""
        self.assertEqual(PAGINA.count('class="lungo"'), 5)
        self.assertEqual(PAGINA.count('class="breve"'), 5)

    def test_ogni_sezione_viene_disegnata(self):
        for nome in LETTORE.viste:
            with self.subTest(sezione=nome):
                self.assertIn(f"vista === '{nome}'", CODICE,
                              f'la sezione {nome} non viene mai disegnata')

    def test_moduli_e_modificatore_arrivano_dal_json(self):
        """Non devono esserci moduli o soglie scritti nel JavaScript."""
        self.assertIn('DATI.moduli', CODICE)
        self.assertIn('DATI.modificatore', CODICE)
        self.assertNotIn("'3-4-3':", CODICE)
        self.assertNotIn('6.75', CODICE)

    def test_il_json_contiene_moduli_e_modificatore(self):
        percorso = APP / 'dati_asta.json'
        if not percorso.exists():
            self.skipTest('dati_asta.json non generato')
        dati = json.loads(percorso.read_text(encoding='utf-8'))
        self.assertIn('moduli', dati)
        self.assertIn('modificatore', dati)
        for nome, reparti in dati['moduli'].items():
            with self.subTest(modulo=nome):
                self.assertEqual(sum(reparti), 10, f'{nome} non fa dieci di movimento')
        bonus = [riga['bonus'] for riga in dati['modificatore']]
        self.assertEqual(bonus, sorted(bonus, reverse=True))


class TestManifest(unittest.TestCase):

    def setUp(self):
        self.manifest = json.loads(
            (APP / 'manifest.webmanifest').read_text(encoding='utf-8'))

    def test_le_icone_esistono(self):
        for icona in self.manifest['icons']:
            with self.subTest(icona=icona['src']):
                self.assertTrue((APP / icona['src']).exists())

    def test_parte_dalla_pagina_giusta(self):
        self.assertTrue((APP / self.manifest['start_url']).exists())

    def test_si_apre_a_schermo_intero(self):
        self.assertEqual(self.manifest['display'], 'standalone')


class TestSeparazione(unittest.TestCase):
    """La regola della repo: le formule del listone stanno solo nel core."""

    def test_i_conti_non_toccano_la_pagina(self):
        for vietato in ('document.', 'window.', 'localStorage'):
            with self.subTest(vietato=vietato):
                self.assertNotIn(vietato, CONTI,
                                 f'conti.js usa {vietato}: non è più testabile da solo')

    def test_l_app_non_ricalcola_i_prezzi(self):
        """Il prezzo si legge da pz[], non si ricostruisce dal FVM."""
        self.assertNotIn('FVM', CODICE)
        self.assertNotIn('fvm *', CODICE)

    def test_i_parametri_di_lega_non_sono_riscritti_nel_codice(self):
        """Slot e quote arrivano dal JSON: due copie tornerebbero a divergere."""
        self.assertNotIn("{ P: 3, D: 8", CODICE)
        self.assertNotIn("0.28", CODICE)


if __name__ == '__main__':
    unittest.main(verbosity=2)
