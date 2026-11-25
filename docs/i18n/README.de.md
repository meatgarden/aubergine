# Aubergine

*Maschinelle Übersetzung des Anfangs der README. Die App selbst ist auf Englisch. Die vollständige README auf Englisch: [README.md](../../README.md).*

**Alle deine Terminals auf einem Canvas in deinem Browser.** Lass mehrere Coding-Agenten nebeneinander laufen und sieh auf einen Blick, welcher auf dich wartet, bei welchem Schritt jeder ist und was jeder für dich geschrieben hat.

- Läuft auf deinem eigenen Rechner und nirgends sonst.
- Terminals laufen weiter, wenn du den Browser schließt oder Aubergine neu startest.
- Funktioniert mit einfachen Shells und mit Agenten.
- So viele Terminals, wie du willst, nebeneinander.
- Bring deine eigenen Agenten und Modelle mit: Aubergine hat kein eigenes Modell, hält keinen Schlüssel und hat kein Konto.

<img src="../../site/screenshots/canvas.png" alt="Das Aubergine-Canvas: links drei Canvases in einer Spalte, die Liste der Terminals mit dem, was jedes gerade tut, und sechs laufende Terminals, vier davon in eigenen Farben, eines wartet auf eine Antwort.">

<sub>Die Demo, die mit Aubergine kommt: Platzhalter-Agenten, keine echten. Mehr unter <a href="#what-it-looks-like">So sieht es aus</a>.</sub>

---

<a id="what-it-looks-like"></a>

## So sieht es aus

| | |
|---|---|
| ![Runs: vier Spalten, wartet auf Start, läuft, wartet auf dich, erledigt](../../site/screenshots/runs.png) | ![By step: jeder Workflow mit einer Spalte pro Schritt](../../site/screenshots/by-step.png) |
| **Runs.** Arbeit wandert von links nach rechts: wartet auf Start, läuft, wartet auf dich, erledigt. | **By step.** Jeder Workflow mit einer Spalte pro Schritt, und jeder Lauf dort, wo er steht. |
| ![Workflows: Listen von Schritten als Karten](../../site/screenshots/workflows.png) | ![Library: was einem Agenten gesagt würde, vor dem Installieren zu lesen](../../site/screenshots/library.png) |
| **Workflows.** Listen von Schritten, die ein Agent nacheinander abarbeitet. | **Library.** Lies genau, was einem Agenten gesagt würde, bevor du irgendetwas installierst. |

---

## In zwei Minuten loslegen

**1. Installieren** (macOS mit tmux 3.2 oder neuer und Node.js 22 oder neuer; `brew install tmux node` holt beides)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

Oder mit dem Installer, der zusätzlich pnpm braucht und aus dem Quellcode baut:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. Starten und Browser öffnen**

```sh
aubergine start --open
```

**3. Klick auf „Show me around“** in der Mitte des leeren Canvas.

Das legt ein Canvas namens „Demo“ mit ein paar Platzhalter-Agenten an und führt dich in acht kurzen Schritten herum, etwa fünf Minuten. Nichts darin ist echt, und **Remove the demo** entfernt es wieder.

Etwas stimmt nicht? Führ `aubergine doctor` aus oder sieh unter [If something goes wrong](../../README.md#if-something-goes-wrong) nach. Der Installer ist unter [Quick start](../../README.md#quick-start) vollständig beschrieben.

---

Für alles Weitere siehe die [englische README](../../README.md).
