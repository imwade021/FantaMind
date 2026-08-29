"""
costanti.py - L'unico posto in cui vivono i parametri di lega.

Prima esistevano in tre copie (build_master.py, motore.py, config.py del bot)
con valori diversi: 8 squadre di qua, 12 di la'. Due schermate davano numeri
diversi sullo stesso giocatore. Qui ce n'e' una sola: se un numero va cambiato,
si cambia qui e cambia ovunque.
"""

# Giornate di un campionato di Serie A.
GIORNATE = 38

# Le caselle di una rosa. Somma: 25.
SLOT_ROSA = {'P': 3, 'D': 8, 'C': 8, 'A': 6}
ROSA_COMPLETA = sum(SLOT_ROSA.values())

# La lega di riferimento su cui e' tarato il Master.
SQUADRE_DEFAULT = 8
BUDGET_DEFAULT = 500

# Le leghe che l'app permette di scegliere. I prezzi e le fasce di ognuna
# vengono precalcolati qui e messi nel JSON: l'app li legge, non li ricalcola.
# E' il motivo per cui non esiste una seconda formula dei prezzi in JavaScript.
SQUADRE_AMMESSE = (8, 10, 12)
BUDGET_AMMESSI = (300, 500, 1000, 1500)


def chiave_lega(squadre, budget):
    """L'etichetta di una lega dentro il JSON: '8x500'."""
    return f'{int(squadre)}x{int(budget)}'

# L'asta si svolge per reparti, in quest'ordine.
ORDINE_ASTA = ('P', 'D', 'C', 'A')

# Come si spartisce il budget fra i reparti.
QUOTE_REPARTO = {'P': 0.08, 'D': 0.14, 'C': 0.28, 'A': 0.50}

# Partite "fittizie" di media di ruolo aggiunte a chi ne ha giocate poche.
# E' il freno alle meteore: sparisce da solo per chi ha giocato una stagione.
PRUDENZA = 8

# Presenze minime perche' un confronto fra due giocatori sia onesto.
# Una media su 3 partite non e' paragonabile a una su 34.
PRESENZE_CONFRONTO = 15

NOMI_RUOLO = {'P': 'portieri', 'D': 'difensori',
              'C': 'centrocampisti', 'A': 'attaccanti'}

NOME_RUOLO_SINGOLARE = {'P': 'portiere', 'D': 'difensore',
                        'C': 'centrocampista', 'A': 'attaccante'}

# I motivi degli stop arrivano dall'API in inglese. Tradotti servono a
# spiegare, non a decorare: "ha saltato 4 partite per un problema muscolare"
# e' un'informazione, "GareSaltate: 4" non lo e'.
MOTIVI = {
    'thigh injury': 'un problema alla coscia', 'hamstring injury': 'un flessore',
    'muscle injury': 'un problema muscolare', 'muscle bruise': 'una contusione muscolare',
    'knee injury': 'un problema al ginocchio', 'jumpers knee': 'un problema al ginocchio',
    'calf injury': 'un problema al polpaccio', 'groin injury': "un problema all'inguine",
    'ankle injury': 'una caviglia', 'sprained ankle': 'una distorsione alla caviglia',
    'foot injury': 'un piede', 'toe injury': 'un dito del piede', 'heel pain': 'un tallone',
    'leg injury': 'un problema a una gamba', 'hip injury': "un problema all'anca",
    'back injury': 'la schiena', 'shoulder injury': 'una spalla',
    'hand injury': 'una mano', 'wrist injury': 'un polso', 'finger injury': 'un dito',
    'broken cheekbone': 'uno zigomo fratturato', 'broken jawbone': 'una mascella fratturata',
    'concussion': 'un trauma cranico', 'contusion': 'una contusione',
    'knock': 'una botta', 'wound': 'una ferita',
    'injury': 'un infortunio', 'injured': 'un infortunio', 'illness': 'una malattia',
    'fitness': 'una condizione fisica non a posto', 'unfit': 'una condizione fisica non a posto',
    'lacking match fitness': 'la mancanza di condizione',
    'rest': 'un turno di riposo', 'inactive': 'una scelta tecnica',
    'suspension': 'una squalifica', 'suspended': 'una squalifica',
    'red card': "un'espulsione", 'red card suspended': "un'espulsione",
    'yellow cards': 'una squalifica per cartellini',
    'personal reasons': 'motivi personali',
    'international duty': 'la nazionale', 'national team': 'la nazionale',
    'missing fixture': 'un forfait', 'coach decision': 'una scelta tecnica',
    'transfer negotiations': 'una trattativa di mercato in corso',
    'health problems': 'problemi di salute', 'broken leg': 'una gamba rotta',
    'hernia': "un'ernia", 'muscle strain': 'uno stiramento',
}

# Uno stop per questi motivi non e' un infortunio: passa da solo.
STOP_NON_GRAVI = ('yellow cards', 'suspended', 'red card', 'transfer negotiations')

# Il ruolo che conta davvero non e' P/D/C/A: e' se quel giocatore sta dove
# arrivano i bonus. Un difensore centrale e un terzino che gioca da esterno
# alto valgono cose diverse e nel listone hanno la stessa lettera.
# L'ordine conta: si prende il primo prefisso che combacia.
POSIZIONI = [
    ('Por',   'portiere', False),
    ('B;',    'braccetto in difesa a tre', False),
    ('E;W',   'esterno offensivo', True),
    ('Dd;E',  'terzino che gioca alto', True),
    ('Ds;E',  'terzino che gioca alto', True),
    ('Dd;Ds;E', 'terzino che gioca alto', True),
    ('Dd;Ds;Dc', 'difensore adattabile', False),
    ('Dd;Dc', 'terzino o centrale', False),
    ('Ds;Dc', 'terzino o centrale', False),
    ('Dc',    'difensore centrale', False),
    ('W;A',   'ala offensiva', True),
    ('W;T',   'ala o trequartista', True),
    ('T;A',   'seconda punta', True),
    ('Pc',    'punta centrale', True),
    ('W',     'ala', True),
    ('T',     'trequartista', True),
    ('C;T',   'mezzala offensiva', True),
    ('M;C',   'mediano', False),
    ('E;C',   'esterno di centrocampo', True),
    ('E',     'esterno', True),
    ('C',     'centrocampista', False),
    ('A',     'attaccante', True),
]

# Colonne senza le quali il file non e' il Master.
COLONNE_OBBLIGATORIE = ('Id', 'Nome', 'R', 'Squadra', 'Qt.A', 'FVM')

# Colonne numeriche del Master: quelle mancanti diventano zero, mai NaN.
COLONNE_NUMERICHE = [
    'Pv', 'Mv', 'Fm', 'Gf', 'Ass', 'Rc', 'Rp', 'Amm', 'Esp',
    'Min', 'Tit', 'PvTot', 'GareSaltate', 'GareSaltateAltro',
    'FVM', 'Qt.A', 'SquadreStag', 'Gs', 'R+', 'R-',
]
