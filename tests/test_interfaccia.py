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

    def test_le_colonne_ordinabili_esistono_nei_dati(self):
        percorso = APP / 'dati_asta.json'
        if not percorso.exists():
            self.skipTest('dati_asta.json non generato')
        primo = json.loads(percorso.read_text(encoding='utf-8'))['giocatori'][0]
        for chiave in LETTORE.ordini:
            with self.subTest(colonna=chiave):
                self.assertIn(chiave, primo)


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
