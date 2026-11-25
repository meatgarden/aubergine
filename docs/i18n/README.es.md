# Aubergine

<sub>Esta es una traducción automática de la parte inicial del README. La aplicación en sí está en inglés. El README completo, en inglés: <a href="../../README.md">README.md</a>.</sub>

**Todas tus terminales, una al lado de la otra. Trae tus propios agentes.** Aubergine pone todas tus terminales en un solo lienzo, en tu navegador. Ejecuta tantas como quieras, con los agentes y modelos que ya usas, y mira de un vistazo cuál te está esperando, en qué paso está cada uno y qué ha escrito cada uno para ti.

- Se ejecuta en tu propio ordenador, y en ningún otro sitio.
- Las terminales siguen en marcha cuando cierras el navegador o reinicias Aubergine.
- Funciona con shells normales y con agentes.
- Aubergine no tiene modelo propio, no guarda ninguna clave y no tiene cuentas.

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

¿Algo no va bien? Ejecuta `aubergine doctor`, o mira [If something goes wrong](../../README.md#if-something-goes-wrong) (si algo sale mal). El instalador se describe por completo en [Quick start](../../README.md#quick-start).

---

Para todo lo demás, lee el [README completo en inglés](../../README.md).
