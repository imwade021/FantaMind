"""
certezza.py - Quanto e' certo che sia in campo. NON quanto e' forte.

Regola della casa: ogni numero prodotto qui deve essere ricalcolabile dal CSV.
Niente internet, niente stime di rendimento futuro, niente opinioni. Quello
che non e' noto resta dichiarato come non noto.
"""

from .costanti import (GIORNATE, MOTIVI, NOME_RUOLO_SINGOLARE, POSIZIONI,
                       STOP_NON_GRAVI)
from .lettura import testo


def traduci(motivo):
    """Il motivo di uno stop, in italiano. None se non c'e'."""
    motivo = testo(motivo)
    if not motivo:
        return None
    return MOTIVI.get(motivo.lower(), motivo.lower())


def assenza_oggi(riga):
    """
    Chi e' fuori ADESSO.

    E' l'unica informazione del file che parla del presente invece che della
    stagione scorsa, e vale piu' di tutte le altre messe insieme: un
    fuoriclasse infortunato ad agosto e' una casella vuota per due mesi.

    La colonna InfortunioTipo dice sempre 'Missing Fixture' e non serve: il
    motivo vero sta in Infortunio, la data in InfortunioDal.
    """
    grezzo = testo(riga.get('Infortunio'))
    if not grezzo:
        return None
    data = testo(riga.get('InfortunioDal'))[:10] or None
    return {
        'motivo': traduci(grezzo),
        'dal': data,
        'grave': grezzo.lower() not in STOP_NON_GRAVI,
    }


def posizione(riga):
    """
    Il ruolo vero e se e' una posizione da bonus.

    Nessun ruolo resta senza nome: un None qui diventa NaN in pandas, e NaN
    non e' JSON valido - il file non si aprirebbe nemmeno.
    """
    esteso = testo(riga.get('Ruolo_Esteso'))
    for chiave, nome, bonus in POSIZIONI:
        if esteso.startswith(chiave):
            return nome, bonus
    generico = NOME_RUOLO_SINGOLARE.get(testo(riga.get('R')), 'giocatore')
    return generico, False


def partite_possibili(riga):
    """
    Quante partite AVREBBE POTUTO giocare con questa squadra.

    Non sono trentotto per tutti, ed e' l'errore che fa sembrare panchinari i
    giocatori arrivati a gennaio: tredici presenze su trentotto sono un terzo,
    tredici su diciannove sono due terzi. SquadreStag dice in quante maglie ha
    giocato quella stagione; il campionato si divide fra quelle.
    """
    maglie = max(1, int(riga['SquadreStag']))
    if maglie == 1:
        return GIORNATE, False
    quota = max(int(riga['Pv']), round(GIORNATE / maglie))
    return min(GIORNATE, quota), True


def certezza(riga):
    """
    Tre cose gia' successe e verificabili:
      - quante delle partite che poteva giocare ha giocato
      - quante delle sue presenze erano da titolare (non spezzoni)
      - quante ne ha saltate, e per cosa

    Se non esiste storico -> None. Non si inventa un numero: si dichiara che
    non si sa, ed e' un'informazione utile quanto le altre.

    Torna anche i PERCHE': un punteggio senza motivo non e' verificabile, e a
    un tetto che non sai spiegare, a meta' asta, non credi.
    """
    presenze, minuti = riga['Pv'], riga['Min']
    presenze_tot, titolari = riga['PvTot'], riga['Tit']
    saltate = riga['GareSaltate'] + riga['GareSaltateAltro']

    if presenze <= 0 and minuti <= 0:
        return None, ['Nessun dato utile: neopromosso, arrivato da fuori, '
                      'o mai impiegato.']

    possibili, cambiato = partite_possibili(riga)
    perche = []

    # 1. Disponibilita': presenze sulle partite che poteva davvero giocare.
    disponibilita = min(1.0, presenze / possibili) if possibili > 0 else 0.0
    if cambiato and presenze >= possibili:
        perche.append(f'Ha cambiato squadra a stagione in corso e ha giocato '
                      f'tutte le {possibili} partite che poteva giocare.')
    elif cambiato:
        perche.append(f'Ha cambiato squadra a stagione in corso: '
                      f'{int(presenze)} presenze sulle {possibili} che poteva '
                      f'giocare, non su 38.')
    elif presenze > 0:
        perche.append(f'{int(presenze)} presenze su 38.')

    # 2. Titolarita'. Il minutaggio medio e' il controllo: chi parte titolare
    #    ma esce sempre al 60' non e' un titolare.
    if presenze_tot > 0 and titolari > 0:
        titolarita = min(1.0, titolari / presenze_tot)
        per_gara = minuti / presenze_tot
        if titolarita >= 0.8:
            perche.append(f'Titolare fisso: {int(titolari)} volte dall\'inizio '
                          f'su {int(presenze_tot)} apparizioni.')
        elif titolarita >= 0.45:
            perche.append(f'A mezzo servizio: {int(titolari)} volte titolare su '
                          f'{int(presenze_tot)}, {int(per_gara)} minuti a partita.')
        else:
            perche.append(f'Quasi sempre subentrato: solo {int(titolari)} volte '
                          f'titolare su {int(presenze_tot)}, {int(per_gara)} '
                          f'minuti a partita.')
    elif minuti > 0 and presenze_tot > 0:
        per_gara = minuti / presenze_tot
        titolarita = max(0.0, min(1.0, (per_gara - 15) / 65))
        perche.append(f'{int(per_gara)} minuti a partita.')
    else:
        # L'API gratuita non copre tutti: per una trentina di giocatori i
        # minuti non ci sono. Tacere e' peggio che dirlo.
        titolarita = disponibilita
        perche.append('Minutaggio non disponibile: il punteggio esce dalle '
                      'sole presenze.')

    # 3. Continuita': le partite saltate, col motivo quando si sa.
    giocabili = presenze_tot + saltate
    continuita = 1.0 - (saltate / giocabili) if giocabili > 0 else 1.0
    if saltate > 0:
        motivo = traduci(riga.get('MotivoStop')) or traduci(riga.get('MotivoAltro'))
        quante = int(saltate)
        parola = 'una partita' if quante == 1 else f'{quante} partite'
        perche.append(f'Ha saltato {parola}' + (f' per {motivo}.' if motivo else '.'))

    valore = 100 * (0.45 * disponibilita + 0.40 * titolarita + 0.15 * continuita)

    if presenze <= 0 and minuti > 0:
        valore *= 0.80
        perche.insert(0, "Lo storico che ha e' fuori dalla Serie A: vale, ma meno.")

    return round(valore), perche
