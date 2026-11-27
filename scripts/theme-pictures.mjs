// The pictures of the color themes for the README and the site (site-src/screenshots/themes-*.png and the others below).
//
//   pnpm build && node scripts/theme-pictures.mjs [--out <folder>] [--only <name>,<name>…]
//
// It starts a throwaway server of its own (a port, a data folder and a tmux socket made for this run, set before the
// server starts), with a home folder made up for it: a plain prompt and a small made-up project, "shop", with a Git
// history. Nothing of this computer's own home, names or settings is in the pictures. Six terminals are made on one
// canvas, laid out as in the canvas picture at the top of the README, and the page is taken at 1920×1200 at twice the
// density, as canvas.png is. The server and its tmux server are stopped at the end, and the folders removed.
//
// The browser is Playwright's Chromium; set AUBERGINE_PICTURES_CHROMIUM to a Chromium of the same version to use
// another. Look at every picture before keeping it.
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, lutimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const out = path.resolve(argument('--out') ?? path.join(root, 'site-src', 'screenshots'));
const only = argument('--only')?.split(',');
const wanted = (name) => !only || only.includes(name);

/** The page in each of these themes: `themes-<id>.png`. */
const PAGE_THEMES = ['light', 'high-contrast-light', 'solarized-light', 'gruvbox-light', 'dark', 'high-contrast-dark', 'solarized-dark', 'gruvbox-dark', 'nord', 'dracula'];
/** On a dark page, each terminal in a theme of its own, in the order they are made. */
const OWN_THEMES = ['solarized-light', 'dracula', 'gruvbox-dark', 'nord', 'gruvbox-light', 'solarized-dark'];
const KIND = { light: 'light', 'high-contrast-light': 'light', 'solarized-light': 'light', 'gruvbox-light': 'light' };

const ESC = '\u001b[';
const paint = (code, text) => `${ESC}${code}m${text}${ESC}0m`;

/** A folder made up for this run: the home of its shells, and in it the project they work on. */
function makeHome(home) {
  mkdirSync(home, { recursive: true });
  // A plain prompt: the folder's name and a %. Written into this made-up home only.
  writeFileSync(path.join(home, '.zshrc'), ["PROMPT='%1~ %% '", "RPROMPT=''", 'export GIT_PAGER=cat PAGER=cat', "alias ls='ls --color=auto'", ''].join('\n'));
  const shop = path.join(home, 'code', 'shop');
  const files = {
    'README.md': '# Shop\n\nA small shop: a product list, a cart and a checkout.\n',
    'api/server.js': "export const routes = ['/products', '/cart', '/checkout'];\n",
    'api/products.js': 'export const products = [];\n',
    'web/index.html': '<!doctype html>\n<title>Shop</title>\n',
    'web/src/cart.js': [
      'export function total(items) {',
      '  let sum = 0;',
      '  for (const item of items) sum += item.price * item.count;',
      '  return sum;',
      '}',
      '',
      'export function add(items, product) {',
      '  return [...items, { ...product, count: 1 }];',
      '}',
      '',
    ].join('\n'),
    'web/src/checkout.js': 'export const steps = ["address", "payment", "done"];\n',
    'test/cart.test.js': '// The cart\n',
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(shop, name)), { recursive: true });
    writeFileSync(path.join(shop, name), text);
  }
  // What the site serves as it is, with sizes, for a long listing (`ls -gGhF`: no owner or group is shown).
  const assets = { 'banner.webp': 186_000, 'favicon.svg': 1_400, 'hero.jpg': 241_000, 'logo.png': 18_300, 'manifest.json': 620, 'old-site.tar.gz': 3_900_000, 'photos.zip': 12_400_000, 'robots.txt': 24, 'sprite.png': 52_700, 'optimize.sh': 880, 'fonts/inter.woff2': 1, 'icons/cart.svg': 1, 'images/.keep': 0 };
  for (const [name, size] of Object.entries(assets)) {
    mkdirSync(path.dirname(path.join(shop, 'web/public', name)), { recursive: true });
    writeFileSync(path.join(shop, 'web/public', name), Buffer.alloc(size, 32));
  }
  chmodSync(path.join(shop, 'web/public/optimize.sh'), 0o755);
  symlinkSync('logo.png', path.join(shop, 'web/public/logo-latest.png'));
  // What the test and the build print, with the colors a real run has.
  const tick = paint('32', '✓');
  const testLines = [
    '',
    paint('1', ' cart'),
    `   ${tick} adds an item ${paint('2', '(2 ms)')}`,
    `   ${tick} removes an item ${paint('2', '(1 ms)')}`,
    `   ${tick} keeps the total in cents ${paint('2', '(1 ms)')}`,
    paint('1', ' checkout'),
    `   ${tick} asks for an address ${paint('2', '(3 ms)')}`,
    `   ${paint('31', '✗ refuses an empty postcode')}`,
    `       ${paint('31', 'expected')} "Postcode is needed"${paint('31', ', got')} undefined`,
    paint('1', ' prices'),
    `   ${tick} formats 0.99 as 0.99 EUR ${paint('2', '(1 ms)')}`,
    `   ${paint('33', '○ rounds half up (skipped)')}`,
    '',
    ` Tests: ${paint('1;32', '5 passed')}, ${paint('1;31', '1 failed')}, ${paint('33', '1 skipped')}`,
  ];
  const buildLines = [
    paint('36', 'building for production…'),
    `${paint('32', '✓')} 142 modules transformed`,
    `${paint('2', 'dist/')}${paint('32', 'index.html')}              ${paint('1', '0.46 kB')} ${paint('2', '│ gzip:  0.30 kB')}`,
    `${paint('2', 'dist/assets/')}${paint('35', 'index.css')}       ${paint('1', '12.81 kB')} ${paint('2', '│ gzip:  3.12 kB')}`,
    `${paint('2', 'dist/assets/')}${paint('36', 'index.js')}       ${paint('1', '148.20 kB')} ${paint('2', '│ gzip: 47.95 kB')}`,
    '',
    `${paint('33', '!')} ${paint('33', 'src/checkout.js imports ./cart.js twice')}`,
    `${paint('1;32', '✓ built in 1.84s')}`,
  ];
  const printer = (lines) => `#!/bin/sh\ncat <<'EOF'\n${lines.join('\n')}\nEOF\n`;
  writeFileSync(path.join(shop, 'test.sh'), printer(testLines));
  writeFileSync(path.join(shop, 'web/build.sh'), printer(buildLines));
  chmodSync(path.join(shop, 'test.sh'), 0o755);
  chmodSync(path.join(shop, 'web/build.sh'), 0o755);

  // A short history with a branch merged and one still open, by a made-up author at fixed times.
  let minute = 0;
  const git = (...args) => {
    minute += 37;
    const when = new Date(Date.UTC(2026, 10, 20, 9, minute)).toISOString();
    execFileSync('git', args, {
      cwd: shop,
      stdio: 'ignore',
      env: { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 'Sam', GIT_AUTHOR_EMAIL: 'sam@example.com', GIT_COMMITTER_NAME: 'Sam', GIT_COMMITTER_EMAIL: 'sam@example.com', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
    });
  };
  const change = (name, text) => writeFileSync(path.join(shop, name), readFileSync(path.join(shop, name), 'utf8') + text);
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'Start the shop: products, cart and README');
  change('api/products.js', 'export const currency = "EUR";\n');
  git('commit', '-qam', 'Products: prices in one currency');
  git('switch', '-q', '-c', 'cart');
  change('web/src/cart.js', '// add and remove\n');
  git('commit', '-qam', 'Cart: add and remove items');
  change('test/cart.test.js', '// in cents\n');
  git('commit', '-qam', 'Cart: keep the total in cents');
  git('switch', '-q', 'main');
  change('README.md', '\nPrices are in euros.\n');
  git('commit', '-qam', 'Fix rounding of prices under one euro');
  git('merge', '-q', '--no-ff', '-m', "Merge branch 'cart'", 'cart');
  git('tag', 'v0.3.0');
  change('web/src/checkout.js', 'export const needs = ["postcode"];\n');
  git('commit', '-qam', 'Checkout: ask for an address');
  git('switch', '-q', '-c', 'login');
  change('api/server.js', "routes.push('/login');\n");
  git('commit', '-qam', 'Login: remember the last email');
  change('api/server.js', '// follow the redirect once\n');
  git('commit', '-qam', 'Login: follow the redirect once');
  git('switch', '-q', 'main');
  change('api/products.js', 'export const pageSize = 24;\n');
  git('commit', '-qam', 'Products: 24 to a page');
  // Something changed and not yet committed, for git diff and git status.
  writeFileSync(
    path.join(shop, 'web/src/cart.js'),
    [
      'export function total(items) {',
      '  return items.reduce((sum, item) => sum + item.cents * item.count, 0);',
      '}',
      '',
      'export function add(items, product) {',
      '  const there = items.find((item) => item.id === product.id);',
      '  if (there) return bump(items, there);',
      '  return [...items, { ...product, count: 1 }];',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(path.join(shop, 'web/src/address.js'), 'export const fields = ["street", "postcode", "city"];\n');
  git('add', 'web/src/address.js');
  change('README.md', '\nRun ./test.sh before you push.\n');
  writeFileSync(path.join(shop, 'notes.txt'), 'ask about delivery\n');
  // The listing's times: the days the files were made, not this run's.
  for (const [at, name] of readdirSync(path.join(shop, 'web/public')).sort().entries()) {
    const when = new Date(Date.UTC(2026, 10, 12 + (at % 9), 8 + at, 14 + 3 * at));
    lutimesSync(path.join(shop, 'web/public', name), when, when);
  }
  return shop;
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function waitFor(what, test, timeout = 60_000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      if (await test()) return;
    } catch {
      // Not there yet.
    }
    if (Date.now() > until) throw new Error(`Gave up waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 250));
  }
}

async function main() {
  if (!existsSync(path.join(root, 'web', 'dist', 'index.html'))) throw new Error('Build the web app first: pnpm build');
  mkdirSync(out, { recursive: true });
  const run = mkdtempSync(path.join(tmpdir(), 'aubergine-pictures-'));
  const home = path.join(run, 'home');
  const dataDir = path.join(run, 'data');
  mkdirSync(dataDir, { recursive: true });
  const shop = makeHome(home);
  const port = await freePort();
  const socket = `aubergine-pictures-${process.pid}`;
  const base = `http://127.0.0.1:${port}`;

  // The server's port, data folder and tmux socket are set here, before it starts; nothing of this computer's own is passed on.
  // What `pnpm serve` runs, started directly: pnpm itself would look for its own version under the made-up home.
  const server = spawn(path.join(root, 'daemon', 'node_modules', '.bin', 'tsx'), ['src/main.ts'], {
    cwd: path.join(root, 'daemon'),
    detached: true,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      PATH: process.env.PATH,
      HOME: home,
      SHELL: execFileSync('sh', ['-c', 'command -v zsh || command -v bash'], { encoding: 'utf8' }).trim(),
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      AUBERGINE_PORT: String(port),
      AUBERGINE_DATA_DIR: dataDir,
      AUBERGINE_TMUX_SOCKET: socket,
      CLAUDE_CONFIG_DIR: path.join(dataDir, 'stand-in-agent-config'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      AUBERGINE_GH_BIN: path.join(root, 'e2e', 'gh-stand-in.sh'),
    },
  });
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    try {
      execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore' });
    } catch {
      // No tmux server was left.
    }
    rmSync(path.join(process.env.TMUX_TMPDIR ?? '/tmp', `tmux-${process.getuid()}`, socket), { force: true });
  };

  try {
    await waitFor('the server', async () => (await fetch(`${base}/`)).status < 500 && existsSync(path.join(dataDir, 'token')));
    const token = readFileSync(path.join(dataDir, 'token'), 'utf8').trim();
    const browser = await chromium.launch(process.env.AUBERGINE_PICTURES_CHROMIUM ? { executablePath: process.env.AUBERGINE_PICTURES_CHROMIUM } : {});
    const context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' });
    // A browser that has been used before: the side panel open, the tour put away, the hints said once.
    await context.addInitScript(() => {
      try {
        if (localStorage.getItem('aubergine.panel') === null) localStorage.setItem('aubergine.panel', JSON.stringify({ open: true }));
        localStorage.setItem('aubergine.tour', JSON.stringify({ status: 'dismissed', stepId: null }));
        localStorage.setItem('aubergine.hint.full-size', 'said');
        localStorage.setItem('aubergine.hint.desktop-size', 'said');
      } catch {
        // No storage: nothing to remember.
      }
    });
    const page = await context.newPage();
    await page.goto(`${base}/auth?token=${token}`);
    await page.waitForURL(/\/c\//);
    // As the page itself calls.
    const headers = { origin: base, 'sec-fetch-site': 'same-origin' };
    const call = async (method, address, data) => {
      const answer = await page.request.fetch(`${base}${address}`, { method, headers, data });
      if (!answer.ok()) throw new Error(`${method} ${address}: ${answer.status()} ${await answer.text()}`);
      return answer.status() === 204 ? null : answer.json();
    };
    const look = (data) => call('PUT', '/v1/settings/appearance', data);
    await look({ cursorBlink: false });

    // Three canvases; the terminals are on the first.
    const canvases = (await call('GET', '/v1/canvases')).items;
    const canvasId = canvases[0].id;
    await call('PATCH', `/v1/canvases/${canvasId}`, { name: 'Shop' });
    await call('POST', '/v1/canvases', { name: 'Website' });
    await call('POST', '/v1/canvases', { name: 'Release' });

    // Two columns of three, filling the canvas as the README's canvas picture does.
    await page.reload();
    const pane = await page.locator('.react-flow').boundingBox();
    const margin = 88;
    const gap = 24;
    const top = 44;
    const width = Math.floor((pane.width - 2 * margin - gap) / 2);
    const height = Math.floor((pane.height - top - 56 - 2 * gap) / 3);
    await page.evaluate(([id]) => localStorage.setItem(`aubergine.viewport.${id}`, JSON.stringify({ x: 0, y: 0, zoom: 1 })), [canvasId]);
    const terminals = [
      { name: 'api', cwd: 'api', command: 'git log --oneline --graph --decorate --all', shows: /Start the shop/ },
      { name: 'review', cwd: '', command: 'git diff', shows: /bump\(items/ },
      { name: 'tests', cwd: '', command: './test.sh', shows: /Tests:/ },
      { name: 'web', cwd: 'web', command: './build.sh', shows: /built in/ },
      { name: 'assets', cwd: 'web/public', command: 'ls -gGhF', shows: /sprite\.png/ },
      { name: 'release', cwd: '', command: 'git status', shows: /Untracked/ },
    ];
    const made = [];
    for (const [at, terminal] of terminals.entries()) {
      const rect = { x: margin + (at % 2) * (width + gap), y: top + Math.floor(at / 2) * (height + gap), width, height };
      const answer = await call('POST', '/api/v1/sessions', { name: terminal.name, cwd: path.join(shop, terminal.cwd), command: terminal.command, rect, canvasId });
      made.push({ ...terminal, id: answer.session.id });
    }

    // Their notes are empty and stay closed, as in the canvas picture.
    await page.evaluate((ids) => localStorage.setItem('aubergine.notes.closed', JSON.stringify(ids)), made.map((terminal) => terminal.id));

    const settle = async () => {
      await page.getByTestId('appbar').waitFor();
      for (const terminal of made) await page.locator('.xterm-rows').filter({ hasText: terminal.shows }).first().waitFor({ timeout: 30_000 });
      // Out of the way of every control, on the empty canvas under the terminals.
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 20);
      await page.waitForTimeout(1200);
    };
    const shoot = async (name, options = {}) => {
      await page.screenshot({ path: path.join(out, name), ...options });
      console.log(`wrote ${path.join(out, name)}`);
    };

    // 1. The page in each theme.
    for (const id of PAGE_THEMES) {
      if (!wanted(`themes-${id}`)) continue;
      const kind = KIND[id] ?? 'dark';
      await look({ theme: kind, [kind]: id });
      await page.reload();
      await settle();
      await shoot(`themes-${id}.png`);
    }

    // 2. A dark page, each terminal in a theme of its own; and closer, two of them.
    await look({ theme: 'dark', dark: 'dark', light: 'light' });
    for (const [at, terminal] of made.entries()) await call('PATCH', `/v1/sessions/${terminal.id}`, { theme: OWN_THEMES[at] });
    await page.reload();
    await settle();
    if (wanted('terminal-themes')) await shoot('terminal-themes.png');
    if (wanted('terminal-themes-close')) {
      const nodes = page.getByTestId('terminal-node');
      const a = await nodes.nth(0).boundingBox();
      const b = await nodes.nth(1).boundingBox();
      await shoot('terminal-themes-close.png', { clip: { x: a.x - 16, y: a.y - 16, width: b.x + b.width - a.x + 32, height: Math.max(a.height, b.height) + 32 } });
    }

    // 3. Where a terminal's theme is chosen: its menu, then Theme…
    if (wanted('terminal-theme-menu')) {
      const node = page.getByTestId('terminal-node').nth(1);
      await node.getByTestId('node-more').click();
      await node.getByTestId('terminal-theme').click();
      const menu = page.getByTestId('terminal-theme-menu');
      await menu.waitFor();
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 20);
      await page.waitForTimeout(400);
      const n = await node.boundingBox();
      const m = await menu.boundingBox();
      const x = Math.min(n.x, m.x) - 24;
      const y = n.y - 24;
      const right = Math.max(n.x + n.width, m.x + m.width) + 24;
      // Down to the end of a whole line of the terminal under it, so that no line is cut through.
      const rows = await page.getByTestId('terminal-node').nth(3).locator('.xterm-rows > div').evaluateAll((lines) => lines.map((line) => line.getBoundingClientRect().bottom));
      const bottom = rows.find((end) => end >= m.y + m.height + 16) ?? m.y + m.height + 24;
      await shoot('terminal-theme-menu.png', { clip: { x, y, width: right - x, height: bottom - y } });
      await page.keyboard.press('Escape');
    }

    // 4. Settings → Appearance, with the themes and their previews.
    if (wanted('themes-settings')) {
      for (const terminal of made) await call('PATCH', `/v1/sessions/${terminal.id}`, { theme: null });
      await look({ theme: 'dark', dark: 'nord', light: 'solarized-light' });
      await page.reload();
      await settle();
      await page.getByTestId('toolbar-settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.waitFor();
      await page.getByTestId('color-themes').scrollIntoViewIfNeeded();
      await page.mouse.move(4, 1196);
      await page.waitForTimeout(600);
      // The part about the page's themes, from its heading to the line under the list, as wide as its words.
      const box = await dialog.boundingBox();
      const head = await dialog.getByRole('heading', { name: 'Appearance', exact: true }).boundingBox();
      const end = await page.getByTestId('color-theme-says').boundingBox();
      await shoot('themes-settings.png', { clip: { x: box.x, y: head.y - 24, width: end.x - box.x + 520, height: end.y + end.height + 24 - (head.y - 24) } });
    }
    await browser.close();
  } finally {
    stop();
    rmSync(run, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
