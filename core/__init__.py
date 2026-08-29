"""
core - La logica di FantaMind. Una sola volta, per tutti.

Regola della casa: ogni numero prodotto qui deve essere ricalcolabile dal
Lista_Finale_Master.csv. Niente internet, niente stime di rendimento futuro,
niente opinioni. Quello che non e' noto resta dichiarato come non noto.
"""

from .lettura import carica
from .esporta import costruisci, scrivi, calcola

__all__ = ['carica', 'costruisci', 'scrivi', 'calcola']
