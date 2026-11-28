# Aubergine

*Traduction automatique du début du README. L’application elle-même est en anglais. Le README complet est en anglais : [README.md](../../README.md).*

**Le centre de contrôle de vos terminaux et agents de code IA.** Lancez Claude Code, Codex et des terminaux ordinaires côte à côte dans un seul tableau de bord, dans votre navigateur : autant que vous voulez, avec les agents et les modèles que vous utilisez déjà. Voyez d’un coup d’œil lequel vous attend, à quelle étape en est chacun, et ce que chacun a écrit pour vous.

Partager Aubergine : [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- Tourne sur votre propre ordinateur, et nulle part ailleurs.
- Les terminaux continuent de tourner quand vous fermez le navigateur ou redémarrez Aubergine.
- Fonctionne avec de simples shells comme avec des agents.
- Aubergine n’a pas de modèle à elle, ne détient aucune clé et n’a pas de compte.
- Conçue pour passer une revue informatique : certaines entreprises n’autorisent pas les outils qui exigent un compte chez leur éditeur, envoient votre code vers son cloud, ou dont le code source ne peut pas être lu. Aubergine n’a ni compte ni cloud, et elle est entièrement open source. Les agents que vous y lancez demandent toujours leur propre approbation.

<img src="../../site/screenshots/canvas.png" alt="Le canevas d’Aubergine : trois canevas en colonne à gauche, la liste des terminaux avec ce que fait chacun, et six terminaux en direct, dont quatre dans leurs propres couleurs et un qui attend une réponse.">

<sub>La démo fournie avec Aubergine : des agents factices, pas de vrais agents. Plus d’images dans <a href="#what-it-looks-like">À quoi ça ressemble</a>.</sub>

---

<a id="what-it-looks-like"></a>

## À quoi ça ressemble

| | |
|---|---|
| ![Runs : quatre colonnes, en attente de démarrage, en cours, en attente de vous, terminé](../../site/screenshots/runs.png) | ![By step : chaque workflow avec une colonne par étape](../../site/screenshots/by-step.png) |
| **Runs.** Le travail avance de gauche à droite : en attente de démarrage, en cours, en attente de vous, terminé. | **By step.** Chaque workflow avec une colonne par étape, et chaque exécution là où elle en est. |
| ![Workflows : des listes d’étapes sous forme de cartes](../../site/screenshots/workflows.png) | ![Library : ce qu’un agent recevrait comme consignes, à lire avant d’installer](../../site/screenshots/library.png) |
| **Workflows.** Des listes d’étapes qu’un agent suit, une à la fois. | **Library.** Lisez exactement ce qu’un agent recevrait comme consignes avant d’installer quoi que ce soit. |

### Thèmes de couleurs

La page existe en dix thèmes de couleurs, quatre clairs et six sombres, choisis dans **Settings → Appearance**. Chaque terminal peut aussi avoir son propre thème (**Theme…** dans son menu), et les autres suivent le thème par défaut que vous choisissez pour les terminaux, ou la page. Des couleurs isolées se règlent à la main dans le [fichier de réglages](../../README.md#settings). Un thème à vous est un fichier : l’un des dix avec vos couleurs par-dessus, listé à côté d’eux comme le vôtre ([docs/themes.md](../themes.md)).

| | | |
|---|---|---|
| ![Le canevas avec six terminaux dans le thème Light](../../site/screenshots/themes-light.png) | ![Le même canevas dans le thème Solarized light](../../site/screenshots/themes-solarized-light.png) | ![Le même canevas dans le thème Gruvbox light](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![Le même canevas dans le thème Nord](../../site/screenshots/themes-nord.png) | ![Le même canevas dans le thème Dracula](../../site/screenshots/themes-dracula.png) | ![Le même canevas dans le thème Gruvbox dark](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

Et aussi [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) et [Solarized dark](../../site/screenshots/themes-solarized-dark.png).

<img src="../../site/screenshots/terminal-themes.png" alt="Une page sombre avec six terminaux, chacun dans son propre thème : Solarized light, Dracula, Gruvbox dark, Nord, Gruvbox light et Solarized dark.">

<sub>Six terminaux sur une page sombre, chacun dans son propre thème. Un projet inventé, dans de simples shells.</sub>

---

## Démarrer en deux minutes

**1. Installer** (macOS avec tmux 3.2 ou plus récent et Node.js 22 ou plus récent ; `brew install tmux node` installe les deux)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

Ou avec le script d’installation, qui a aussi besoin de pnpm et compile depuis le code source :

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. Lancez-la et ouvrez votre navigateur**

```sh
aubergine start --open
```

**3. Cliquez sur « Show me around »** au milieu du canevas vide.

Cela crée un canevas nommé « Demo » avec quelques agents factices et vous fait faire le tour en huit courtes étapes, environ cinq minutes. Rien n’y est réel, et **Remove the demo** le retire.

**Ou faites-la installer par votre agent.** Collez ceci dans l’agent de code que vous utilisez déjà. Il vérifie ce dont Aubergine a besoin, l’installe et ajoute quelques lignes aux instructions de votre projet pour savoir comment travailler dans un terminal Aubergine.

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

Le prompt est en anglais, comme Aubergine ; votre agent peut vous répondre dans votre langue. Il n’a encore jamais été lancé avec un vrai agent : lisez donc ce que le vôtre propose avant de dire oui. Ce qu’un agent peut faire dans un terminal est dans le [guide pour les agents](../for-agents.md).

Quelque chose ne va pas ? Exécutez `aubergine doctor`, ou voyez [If something goes wrong](../../README.md#if-something-goes-wrong). Le script d’installation est décrit en entier sous [Quick start](../../README.md#quick-start).

---

Pour tout le reste, voir le [README en anglais](../../README.md).
