#!/usr/bin/env python3
# ── IL SET "SURVIVAL HORROR" ────────────────────────────────────────────────
#
# PERCHE' QUESTI QUATTRO FILE SONO GENERATI E NON SCARICATI.
#
# Giovanni ha chiesto i suoni dell'HUD dei primi Resident Evil per PlayStation
# (22 settembre 2026). Quei campioni sono di Capcom: scaricarli da un sito di
# rip e metterli in questo repository vorrebbe dire pubblicare roba di altri su
# un sito pubblico (il repo e' pubblico e va su GitHub Pages). Quindi si
# rifanno da zero, in quello stile, e restano roba nostra.
#
# COSA RENDE UN SUONO "DA PS1", che poi e' tutto il mestiere qui dentro:
# non la melodia ma la CATENA DI DEGRADO. I campioni di quei giochi stavano
# in pochi kilobyte, quindi erano a bassa frequenza di campionamento e a pochi
# bit. Per rifarli si sintetizza pulito a 44100 Hz e poi si rovina apposta:
#
#   1) si tiene un campione ogni quattro (→ 11025 Hz) SENZA filtrare prima.
#      E' l'errore che nessuno farebbe oggi, ed e' esattamente quello che da'
#      l'aliasing metallico di quei blip: le armoniche alte si ripiegano
#      dentro la banda invece di sparire.
#   2) si arrotonda a 8 bit, con un filo di rumore per non far "gradinare" le
#      code: e' la grana, il fruscio sotto il suono.
#   3) si risale a 44100 tenendo ogni campione per quattro posizioni (nessuna
#      interpolazione): gli scalini aggiungono la durezza di quei DAC.
#
# LE ONDE SONO QUADRE perche' il chip della PS1 suonava campioni brevissimi e
# durissimi: una sinusoide qui suonerebbe come un telefono, non come un menu.
#
# Per rigenerarli: python3 sfx/re/genera-suoni.py
import math, wave, array, random, os

SR = 44100
CARTELLA = os.path.dirname(os.path.abspath(__file__))
random.seed(7)          # gli stessi file ad ogni esecuzione

def quadra(f, t):
    """Onda quadra a frequenza f al tempo t. Il segno della sinusoide, che e'
    il modo piu' corto di dire 'o tutto su o tutto giu''."""
    return 1.0 if math.sin(2*math.pi*f*t) >= 0 else -1.0

def triangolo(f, t):
    x = (f*t) % 1.0
    return 4*abs(x - 0.5) - 1

def nota(dur, freq, forma=quadra, tau=0.045, vol=1.0, da=0.0):
    """Una nota con decadimento esponenziale. freq puo' essere un numero o una
    funzione del tempo, per i glissati."""
    n = int(dur*SR)
    fuori = []
    fase = 0.0
    for i in range(n):
        t = i/SR
        f = freq(t/dur) if callable(freq) else freq
        # si integra la fase invece di usare f*t: cambiando frequenza in corsa,
        # f*t fa saltare l'onda e si sente uno schiocco.
        fase += f/SR
        a = math.exp(-t/tau)
        fuori.append(forma(1.0, fase) * a * vol)
    return fuori

def click(dur=0.004, vol=0.5):
    """Il transiente secco davanti al suono: senza, un blip di menu sembra
    arrivare da lontano invece che da sotto il dito."""
    n = int(dur*SR)
    return [random.uniform(-1,1)*math.exp(-i/(n*0.35))*vol for i in range(n)]

def somma(*tracce):
    n = max(len(t) for t in tracce)
    out = [0.0]*n
    for t in tracce:
        for i,v in enumerate(t): out[i] += v
    return out

def dopo(ritardo, traccia):
    return [0.0]*int(ritardo*SR) + list(traccia)

def coda(x, ritardo=0.085, quanto=0.26, volte=3):
    """Un'eco cortissima: quei giochi avevano un riverbero digitale sempre
    acceso, ed e' una delle ragioni per cui i loro menu suonano 'in una
    stanza' invece che in faccia."""
    out = list(x)
    for k in range(1, volte+1):
        out = somma(out, dopo(ritardo*k, [v*(quanto**k) for v in x]))
    return out

def ps1(x, salto=4, bit=8):
    """La catena di degrado descritta in cima."""
    giu = x[::salto]                                   # 1) sottocampiona
    passi = 2**(bit-1)
    grana = []
    for v in giu:                                      # 2) quantizza
        v = max(-1.0, min(1.0, v))
        grana.append(round(v*passi + random.uniform(-0.5, 0.5))/passi)
    su = []
    for v in grana: su.extend([v]*salto)               # 3) tiene il campione
    return su

def rifinisci(x, picco=0.72, attacco=0.002, rilascio=0.012):
    m = max(1e-9, max(abs(v) for v in x))
    x = [v*picco/m for v in x]
    na, nr = int(attacco*SR), int(rilascio*SR)
    for i in range(min(na, len(x))): x[i] *= i/na
    for i in range(min(nr, len(x))): x[-1-i] *= i/nr
    return x

def scrivi(nome, x):
    dati = array.array('h', [int(max(-1.0, min(1.0, v))*32767) for v in x])
    with wave.open(os.path.join(CARTELLA, nome), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(dati.tobytes())
    print(nome, len(x)*1000//SR, 'ms')

# ── NAV · il cursore che si sposta ──
# Corto e asciutto. Si sente decine di volte al minuto: un decimo di secondo
# qui sarebbe un martello pneumatico dopo due minuti d'uso.
scrivi('nav.wav', rifinisci(ps1(somma(
    click(0.003, 0.45),
    nota(0.055, 620, quadra, tau=0.013),
    nota(0.055, 1240, quadra, tau=0.006, vol=0.3),
)), picco=0.55))

# ── DONE · la conferma ──
# Due gradini che salgono: la conferma e' la sola cosa che deve suonare
# CHIUSA, come una porta che si aggancia.
scrivi('done.wav', rifinisci(ps1(coda(somma(
    click(0.004, 0.4),
    nota(0.07, 740, quadra, tau=0.03),
    dopo(0.062, nota(0.13, 1108, quadra, tau=0.045)),
    dopo(0.062, nota(0.13, 554, triangolo, tau=0.05, vol=0.35)),
), ritardo=0.07, quanto=0.2, volte=2))))

# ── CANCEL · indietro ──
# Scende, ed e' l'unica del pacchetto che scende: e' il verso che fa una cosa
# che si annulla.
scrivi('cancel.wav', rifinisci(ps1(somma(
    click(0.003, 0.35),
    nota(0.10, lambda p: 520 - 230*p, quadra, tau=0.035),
)), picco=0.6))

# ── REWARD · la serata chiusa ──
# Il momento clou, quindi e' l'unico lungo: tre note che salgono e l'ultima
# che resta, col riverbero dietro. E' il "file trovato" di quei giochi.
scrivi('reward.wav', rifinisci(ps1(coda(somma(
    nota(0.12, 523, quadra, tau=0.05),
    dopo(0.105, nota(0.12, 659, quadra, tau=0.05)),
    dopo(0.210, nota(0.12, 784, quadra, tau=0.05)),
    dopo(0.315, nota(0.34, 1046, quadra, tau=0.14)),
    dopo(0.315, nota(0.34, 523, triangolo, tau=0.16, vol=0.4)),
), ritardo=0.11, quanto=0.3, volte=3))))
