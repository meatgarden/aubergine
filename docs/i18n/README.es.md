# Aubergine

<sub>Esta es una traducción automática de la parte inicial del README. La aplicación en sí está en inglés. El README completo, en inglés: <a href="../../README.md">README.md</a>.</sub>

**Un centro de control para tus terminales y agentes de programación con IA.** Ejecuta Claude Code, Codex y terminales normales una al lado de la otra en un solo panel en tu navegador: tantas como quieras, con los agentes y modelos que ya usas. Mira de un vistazo cuál te está esperando, en qué paso está cada uno y qué ha escrito cada uno para ti.

Compartir Aubergine: [X](https://x.com/intent/post?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.&url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Bluesky](https://bsky.app/intent/compose?text=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.%20https%3A%2F%2Fthirstyeggplant.com%2F) · [LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fthirstyeggplant.com%2F) · [Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fthirstyeggplant.com%2F&title=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.) · [Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fthirstyeggplant.com%2F&t=Aubergine%3A%20mission%20control%20for%20your%20terminals%20and%20AI%20coding%20agents.%20Free%2C%20local%2C%20open%20source.)

- Se ejecuta en tu propio ordenador, y en ningún otro sitio.
- Las terminales siguen en marcha cuando cierras el navegador o reinicias Aubergine.
- Funciona con shells normales y con agentes.
- Aubergine no tiene modelo propio, no guarda ninguna clave y no tiene cuentas.
- Pensado para pasar una revisión de TI: algunas empresas no permiten herramientas que necesitan una cuenta con quien las hace, envían tu código a su nube o cuyo código fuente no se puede leer. Aubergine no tiene cuenta ni nube, y todo él es de código abierto. Los agentes que ejecutas en él siguen necesitando su propia aprobación.

<img src="../../site/screenshots/canvas.png" alt="El lienzo de Aubergine: tres lienzos en una columna a la izquierda, la lista de terminales con lo que hace cada una, y seis terminales en vivo, cuatro con colores propios y una esperando una respuesta.">

<sub>La demo que viene con Aubergine: agentes simulados, ninguno real. Más en <a href="#what-it-looks-like">Cómo se ve</a>.</sub>

---

<a id="what-it-looks-like"></a>

## Cómo se ve

| | |
|---|---|
| ![Runs: cuatro columnas, esperando para empezar, en marcha, esperándote, hecho](../../site/screenshots/runs.png) | ![By step: cada flujo de trabajo con una columna por paso](../../site/screenshots/by-step.png) |
| **Runs.** El trabajo avanza de izquierda a derecha: esperando para empezar, en marcha, esperándote, hecho. | **By step.** Cada flujo de trabajo con una columna por paso, y cada ejecución donde está. |
| ![Workflows: listas de pasos como tarjetas](../../site/screenshots/workflows.png) | ![Library: lo que se le diría a un agente, para leerlo antes de instalar](../../site/screenshots/library.png) |
| **Workflows.** Listas de pasos que un agente recorre, de uno en uno. | **Library.** Lee exactamente lo que se le diría a un agente antes de instalar nada. |

### Temas de color

La página viene en diez temas de color, cuatro claros y seis oscuros, que se eligen en **Settings → Appearance**. Cualquier terminal puede tener además un tema propio (**Theme…** en su menú), y las demás siguen el tema predeterminado que elijas para las terminales, o el de la página. Los colores sueltos se pueden ajustar a mano en el [archivo de configuración](../../README.md#settings). Un tema propio es un archivo: uno de los diez con tus colores encima, listado junto a ellos como tuyo ([docs/themes.md](../themes.md)).

| | | |
|---|---|---|
| ![El lienzo con seis terminales en el tema Light](../../site/screenshots/themes-light.png) | ![El mismo lienzo en el tema Solarized light](../../site/screenshots/themes-solarized-light.png) | ![El mismo lienzo en el tema Gruvbox light](../../site/screenshots/themes-gruvbox-light.png) |
| **Light** | **Solarized light** | **Gruvbox light** |
| ![El mismo lienzo en el tema Nord](../../site/screenshots/themes-nord.png) | ![El mismo lienzo en el tema Dracula](../../site/screenshots/themes-dracula.png) | ![El mismo lienzo en el tema Gruvbox dark](../../site/screenshots/themes-gruvbox-dark.png) |
| **Nord** | **Dracula** | **Gruvbox dark** |

También [Dark](../../site/screenshots/themes-dark.png), [High contrast light](../../site/screenshots/themes-high-contrast-light.png), [High contrast dark](../../site/screenshots/themes-high-contrast-dark.png) y [Solarized dark](../../site/screenshots/themes-solarized-dark.png).

<img src="../../site/screenshots/terminal-themes.png" alt="Una página oscura con seis terminales, cada una en un tema propio: Solarized light, Dracula, Gruvbox dark, Nord, Gruvbox light y Solarized dark.">

<sub>Seis terminales en una página oscura, cada una en un tema propio. Un proyecto inventado en shells normales.</sub>

---

## Empieza en dos minutos

**1. Instala** (macOS con tmux 3.2 o posterior y Node.js 22 o posterior; `brew install tmux node` instala ambos)

```sh
# Node.js 22 or newer
npm install -g @meatgarden/aubergine
```

O con el instalador, que también necesita pnpm y compila desde el código fuente:

```sh
curl -fsSL https://raw.githubusercontent.com/thirstyeggplant/aubergine/main/install.sh | sh
```

**2. Inícialo y abre tu navegador**

```sh
aubergine start --open
```

**3. Haz clic en «Show me around»** (enséñame cómo funciona) en el centro del lienzo vacío.

Crea un lienzo llamado «Demo» con unos cuantos agentes simulados y te guía en ocho pasos cortos, unos cinco minutos. Nada de él es real, y **Remove the demo** (quitar la demo) lo vuelve a quitar.

**O haz que tu agente lo instale.** Pega esto en el agente de programación que ya usas. Comprueba lo que Aubergine necesita, lo instala y añade unas líneas a las instrucciones de tu proyecto para saber cómo trabajar en una terminal de Aubergine.

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

El prompt está en inglés, como Aubergine; tu agente puede responderte en tu idioma. Todavía no se ha ejecutado con un agente real, así que lee lo que propone el tuyo antes de decir que sí. Lo que un agente puede hacer en una terminal está en la [guía para agentes](../for-agents.md).

¿Algo no va bien? Ejecuta `aubergine doctor`, o mira [If something goes wrong](../../README.md#if-something-goes-wrong) (si algo sale mal). El instalador se describe por completo en [Quick start](../../README.md#quick-start).

---

Para todo lo demás, lee el [README completo en inglés](../../README.md).
