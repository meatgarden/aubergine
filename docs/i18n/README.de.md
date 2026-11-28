# Aubergine

*Maschinelle Übersetzung des Anfangs der README. Die App selbst ist auf Englisch. Die vollständige README auf Englisch: [README.md](../../README.md).*

**Die Kommandozentrale für deine Terminals und KI-Coding-Agenten.** Starte Claude Code, Codex und normale Terminals nebeneinander in einem Dashboard in deinem Browser: so viele, wie du willst, mit den Agenten und Modellen, die du schon nutzt. Sieh auf einen Blick, welches auf dich wartet, bei welchem Schritt jedes steht und was jedes für dich geschrieben hat.

Aubergine teilen: [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- Läuft auf deinem eigenen Rechner und nirgends sonst.
- Terminals laufen weiter, wenn du den Browser schließt oder Aubergine neu startest.
- Funktioniert mit einfachen Shells und mit Agenten.
- Aubergine hat kein eigenes Modell, hält keinen Schlüssel und hat kein Konto.
- Gemacht, um eine IT-Prüfung zu bestehen: Manche Firmen erlauben keine Werkzeuge, die ein Konto beim Hersteller brauchen, deinen Code in seine Cloud schicken oder deren Quellcode sich nicht lesen lässt. Aubergine hat kein Konto und keine Cloud, und alles daran ist Open Source. Die Agenten, die du darin startest, brauchen weiterhin ihre eigene Genehmigung.

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

Die Seite gibt es in zehn Farbthemen, vier hellen und sechs dunklen, gewählt unter **Settings → Appearance**. Jedes Terminal kann auch ein eigenes Thema haben (**Theme…** in seinem Menü), die anderen folgen dem Standard, den Sie für Terminals festlegen, oder der Seite. Einzelne Farben lassen sich in der [Einstellungsdatei](../../README.md#settings) von Hand setzen. Ein eigenes Thema ist eine Datei: eines der zehn mit Ihren Farben darüber, neben ihnen als Ihres aufgeführt ([docs/themes.md](../themes.md)). Ein Projekt kann für jede Art ein eigenes Thema haben, das gezeichnet wird, solange Sie es ansehen, und Terminals mit einem Tag können über diesen Tag ein Thema bekommen ([docs/themes.md](../themes.md#while-you-look-at-a-project)).

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

**Oder lass es deinen Agenten installieren.** Füg das bei dem Coding-Agenten ein, den du schon nutzt. Er prüft, was Aubergine braucht, installiert es und ergänzt die Anweisungen deines Projekts um ein paar Zeilen, damit er weiß, wie er in einem Aubergine-Terminal arbeitet.

```text
Install Aubergine on this computer for me, then learn how to work in it.
Aubergine shows my terminals and coding agents side by side in a browser page. It runs only on this computer and is built for macOS.

1. Check what it needs: tmux 3.2 or newer and Node.js 22 or newer. Run `tmux -V` and `node --version`. If one is missing or too old, tell me the command that would install it (with Homebrew: `brew install tmux node`) and wait for my answer. Do not use sudo.
2. Install it: `npm install -g @meatgarden/aubergine`
3. Run `aubergine doctor` and read what it says. Fix what is yours to fix and tell me the rest.
4. Do not start the server yourself: it runs until it is stopped, and it opens my browser. Tell me to run `aubergine start --open` in a terminal of my own, and to click "Show me around" on the empty canvas.
5. So that you and later agents know how to work in an Aubergine terminal, run `aubergine guide --snippet` and add the lines it prints to this project's instructions for agents (the file you read at the start of every conversation). Show me the change before you save it.
6. From now on, whenever the environment variable AUBERGINE_SESSION_ID is set, you are in an Aubergine terminal: run `aubergine guide` once, before other work, and report to me as it says.

Finish by telling me what you installed, what you changed, and anything that did not work.
```

Der Prompt ist auf Englisch, wie Aubergine selbst; dein Agent kann dir in deiner Sprache antworten. Er wurde noch nicht mit einem echten Agenten ausgeführt, also lies, was deiner vorschlägt, bevor du Ja sagst. Was ein Agent in einem Terminal tun kann, steht in der [Anleitung für Agenten](../for-agents.md).

Etwas stimmt nicht? Führ `aubergine doctor` aus oder sieh unter [If something goes wrong](../../README.md#if-something-goes-wrong) nach. Der Installer ist unter [Quick start](../../README.md#quick-start) vollständig beschrieben.

---

Für alles Weitere siehe die [englische README](../../README.md).
