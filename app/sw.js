/* ------------------------------------------------------------------
   sw.js - Fa funzionare FantaMind senza rete.

   All'asta la linea va e viene: e' il motivo per cui l'app e' statica.
   Il guscio (pagina, stile, codice, icone) si serve dalla cache, sempre.
   Il listone si prova dalla rete e, se non risponde, si prende dalla
   cache: cosi' prende gli aggiornamenti quando puo' e non si blocca
   mai quando non puo'.
   ------------------------------------------------------------------ */

const VERSIONE = 'fantamind-v7';

const GUSCIO = [
  './',
  'index.html',
  'stile.css',
  'conti.js',
  'app.js',
  'strategie.json',
  'manifest.webmanifest',
  'icona-180.png',
  'icona-192.png',
  'icona-512.png',
  'icona-maskable-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSIONE)
      .then((cache) => cache.addAll([...GUSCIO, 'dati_asta.json']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(
        chiavi.filter((chiave) => chiave !== VERSIONE)
              .map((chiave) => caches.delete(chiave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;

  const indirizzo = new URL(richiesta.url);

  // Le foto dei giocatori stanno su un altro dominio: se non ci sono,
  // la scheda mostra le iniziali. Non vanno messe in cache né attese.
  if (indirizzo.origin !== self.location.origin) return;

  // Il listone: prima la rete, poi la cache.
  if (indirizzo.pathname.endsWith('dati_asta.json')) {
    evento.respondWith(
      fetch(richiesta)
        .then((risposta) => {
          const copia = risposta.clone();
          caches.open(VERSIONE).then((cache) => cache.put(richiesta, copia));
          return risposta;
        })
        .catch(() => caches.match(richiesta))
    );
    return;
  }

  // Tutto il resto: prima la cache.
  evento.respondWith(
    caches.match(richiesta).then((trovata) => trovata || fetch(richiesta))
  );
});
