# Aubergine

*Maschinelle Übersetzung des Anfangs der README. Die App selbst ist auf Englisch. Die vollständige README auf Englisch: [README.md](../../README.md).*

**Die Kommandozentrale für deine Terminals und KI-Coding-Agenten.** Starte Claude Code, Codex und normale Terminals nebeneinander in einem Dashboard in deinem Browser: so viele, wie du willst, mit den Agenten und Modellen, die du schon nutzt. Sieh auf einen Blick, welches auf dich wartet, bei welchem Schritt jedes steht und was jedes für dich geschrieben hat.

- Läuft auf deinem eigenen Rechner und nirgends sonst.
- Terminals laufen weiter, wenn du den Browser schließt oder Aubergine neu startest.
- Funktioniert mit einfachen Shells und mit Agenten.
- Aubergine hat kein eigenes Modell, hält keinen Schlüssel und hat kein Konto.

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

### Farbthemen

Die Seite gibt es in zehn Farbthemen, vier hellen und sechs dunklen, gewählt unter **Settings → Appearance**. Jedes Terminal kann auch ein eigenes Thema haben (**Theme…** in seinem Menü), die anderen folgen dem Standard, den Sie für Terminals festlegen, oder der Seite. Einzelne Farben lassen sich in der [Einstellungsdatei](../../README.md#settings) von Hand setzen.

| | | |
|---|---|---|
| ![Der Canvas mit sechs Terminals im Thema Light](../../site/screenshots/themes-light.png) | ![Derselbe Canvas im Thema Solarized light](../../site/screenshots/themes-solarized-light.png) | ![Derselbe Canvas im Thema Gruvbox light](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![Derselbe Canvas im Thema Nord](../../site/screenshots/themes-nord.png) | ![Derselbe Canvas im Thema Dracula](../../site/screenshots/themes-dracula.png) | ![Derselbe Canvas im Thema Gruvbox dark](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

Außerdem [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) und [Solarized dark](../../site/screenshots/themes-solarized-dark.png).

<img src="../../site/screenshots/terminal-themes.png" alt="Eine dunkle Seite mit sechs Terminals, jedes in einem eigenen Thema: Solarized light, Dracula, Gruvbox dark, Nord, Gruvbox light und Solarized dark.">

<sub>Sechs Terminals auf einer dunklen Seite, jedes in einem eigenen Thema. Ein ausgedachtes Projekt in einfachen Shells.</sub>

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
