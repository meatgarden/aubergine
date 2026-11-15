import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2e } from '../playwright.config';

const repoRoot = path.resolve(e2e.dataDir, '..');

/** A terminal row whose whole text is `text`: command output, not the typed command. */
function outputLine(page: Page, text: string) {
  return page.locator('.xterm-rows > div').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) });
}

test('a terminal on the canvas survives a reload with its output', async ({ page }) => {
  // Without the access cookie the app explains how to sign in.
  await page.goto('/');
  await expect(page.getByTestId('message')).toContainText('not signed in');

  const token = readFileSync(path.join(e2e.dataDir, 'token'), 'utf8').trim();
  await page.goto(`/auth?token=${token}`);
  // Signed in: the bare address goes to a canvas.
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/);
  await expect(page.getByTestId('terminal-node')).toHaveCount(0);

  await page.getByRole('button', { name: 'New terminal' }).click();
  const node = page.getByTestId('terminal-node');
  await expect(node).toHaveCount(1);
  const terminal = page.getByTestId('terminal');
  await expect(terminal).toHaveAttribute('data-link', 'open');

  // A shell discards what is typed while it is still starting, so wait for its prompt.
  await expect(page.locator('.xterm-rows')).toHaveText(/\S/);
  await page.getByTestId('node-body').click();
  await page.keyboard.type('echo hello');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'hello')).toHaveCount(1);

  // A failing command shows its exit code on the node; a long one shows busy, then idle.
  if ((process.env.SHELL ?? '').endsWith('/zsh')) {
    await page.keyboard.type('sleep 2; (exit 3)');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('badge-busy')).toHaveCount(1);
    await expect(page.getByTestId('badge-exit')).toHaveText('exit 3', { timeout: 8000 });
    await expect(page.getByTestId('badge-busy')).toHaveCount(0);
    await page.keyboard.type('clear; echo hello');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('badge-exit')).toHaveCount(0);
  }

  // After a reload the screen comes back by itself, promptly and without a click.
  await page.reload();
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'hello')).toHaveCount(1, { timeout: 3000 });
  await expect(terminal).toHaveAttribute('data-link', 'open');

  // Still the same shell, not a new one: it remembers what ran before.
  await page.getByTestId('node-body').click();
  await page.keyboard.type('echo "again-$((20 + 3))"');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'again-23')).toHaveCount(1);

  // The folder and command shown on the node come from the runtime.
  await page.keyboard.type('cd /tmp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('node-activity')).toContainText('tmp', { timeout: 8000 });

  // The picker finds the session by its folder and focuses it.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+Shift+K');
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('tmp');
  await expect(page.getByTestId('picker-row')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('node-shield')).toHaveCount(0);
  await page.keyboard.type('echo "picked-$((40 + 4))"');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'picked-44')).toHaveCount(1);

  // A note is saved with the session, and the picker finds the session by its text.
  await page.getByRole('button', { name: /^Note for/ }).click();
  await page.getByRole('textbox', { name: 'Session note' }).fill('# Fixing the invoice rounding bug');
  await expect(page.getByTestId('note-panel')).toContainText('Saved');

  // A program inside the session adds to the note log, and the entry appears live.
  await page.getByTestId('node-body').click();
  await page.keyboard.type(`${path.join(repoRoot, 'bin', 'aubergine.mjs')} note "deploy finished at step 4"`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('note-entry')).toContainText('deploy finished at step 4', { timeout: 15_000 });
  await expect(page.getByTestId('note-entry')).toContainText('agent');

  // An agent's hook raises attention; the queue jumps to the node, and looking at it clears it.
  await page.getByRole('button', { name: 'Hide note' }).click();
  await page.getByTestId('node-body').click();
  const aubergine = path.join(repoRoot, 'bin', 'aubergine.mjs');
  await page.keyboard.type(`echo '{"notification_type":"permission_prompt","message":"Allow the edit?"}' | ${aubergine} hook notification`);
  await page.keyboard.press('Enter');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } }); // look away
  await expect(page.getByTestId('badge-attention')).toHaveText('waiting for you', { timeout: 15_000 });
  await expect(page.getByTestId('attention-queue')).toHaveText('1 waiting');
  await page.getByTestId('attention-queue').click();
  await expect(page.getByTestId('attention-queue')).toHaveCount(0);
  await expect(page.getByTestId('badge-attention')).toHaveCount(0);


  // A hook's input names the agent's conversation; once the shell is back at its prompt the node offers to resume it.
  await page.getByTestId('node-body').click();
  await page.keyboard.type(`echo '{"session_id":"0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee"}' | ${aubergine} hook stop`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Resume agent' })).toHaveCount(1, { timeout: 15_000 });

  await page.reload();
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('rounding');
  await expect(page.getByTestId('picker-row')).toContainText('Fixing the invoice rounding bug');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('node-shield')).toHaveCount(0);

  // A frame can be added, labeled and removed.
  await page.getByRole('button', { name: '+ Frame' }).click();
  await expect(page.getByTestId('frame')).toHaveCount(1);
  await page.getByTestId('frame-label').dblclick();
  await page.getByRole('textbox', { name: 'Frame label' }).fill('Billing');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('frame-label')).toHaveText('Billing');
  await page.getByRole('button', { name: 'Remove frame Billing' }).click();
  await expect(page.getByTestId('frame')).toHaveCount(0);

  // Parking takes the node off the canvas but keeps the shell.
  await page.getByRole('button', { name: /^Park Terminal/ }).click();
  await expect(node).toHaveCount(0);
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await page.getByRole('dialog', { name: 'Parked sessions' }).getByRole('button', { name: 'Restore' }).click();
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'picked-44')).toHaveCount(1);

  // "aubergine here" asks an open canvas to bring a session into view: it gets the keyboard.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } });
  await expect(page.getByTestId('node-shield')).toHaveCount(1);
  const viewers = await page.evaluate(async () => {
    const state = await (await fetch('/api/v1/state')).json();
    const id = state.state.sessions[0].id;
    const shown = await fetch(`/api/v1/sessions/${id}/show`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return (await shown.json()).viewers;
  });
  expect(viewers).toBe(1);
  await expect(page.getByTestId('node-shield')).toHaveCount(0);

  // The picker also searches what terminals have printed, including in a parked session.
  await page.getByRole('button', { name: /^Park / }).click();
  await expect(node).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to…' }).click();
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('picked-44');
  await expect(page.getByTestId('picker-output-row').first()).toContainText('picked-44');
  await page.getByTestId('picker-output-row').first().click();
  await expect(node).toHaveCount(1);
  await expect(page.getByTestId('node-shield')).toHaveCount(0);
  await page.keyboard.press('q'); // leave the scroll-back view the match opened

  // A terminal that is open outside the canvas can be brought over from the panel, one at a time.
  // The stand-in is a plain shell this test starts in its own folder.
  const outsideFolder = mkdtempSync(path.join(tmpdir(), 'aubergine-outside-'));
  // The daemon package already has a pseudo-terminal library; borrow it instead of adding a dependency here.
  const nodePty = createRequire(path.join(repoRoot, 'daemon', 'package.json'))('node-pty') as {
    spawn(file: string, args: string[], options: Record<string, unknown>): { kill(): void };
  };
  const standIn = nodePty.spawn('/bin/sh', [], { name: 'xterm-256color', cols: 80, rows: 24, cwd: outsideFolder, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '/' } });
  try {
    await page.getByRole('button', { name: /^Outside terminals/ }).click();
    const row = page.getByTestId('outside-row').filter({ hasText: path.basename(outsideFolder) });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await row.getByRole('button', { name: 'Add to canvas' }).click();
    await expect(page.getByTestId('node-name').filter({ hasText: path.basename(outsideFolder) })).toHaveCount(1);
    await expect(row).toContainText('aubergine attach');
    // The new node has the keyboard: it is the only one without a shield.
    await expect(page.getByTestId('node-shield')).toHaveCount(1);
    // The canvas glides to the new node; wait for that before touching anything, since a click interrupts it.
    const parkNew = page.getByRole('button', { name: new RegExp(`^Park ${path.basename(outsideFolder)}`) });
    await expect(parkNew).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: /^Outside terminals/ }).click(); // close the panel, which lies over the node
    await expect(page.getByTestId('outside-panel')).toHaveCount(0);
    await parkNew.click();
    await page.getByRole('button', { name: 'Parked (1)' }).click();
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByRole('button', { name: /^Parked \(/ })).toHaveCount(0);
  } finally {
    standIn.kill();
    rmSync(outsideFolder, { recursive: true, force: true });
  }

  // Canvases are tabs. A new canvas starts empty; terminals stay on the canvas they are on.
  const tabs = page.getByTestId('tab');
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toContainText('Main');
  const mainAddress = page.url();
  expect(mainAddress).toMatch(/\/c\/[0-9a-f-]+$/);
  await page.getByRole('button', { name: 'New canvas' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(node).toHaveCount(0);
  expect(page.url()).not.toBe(mainAddress);

  // A terminal started here is on this canvas only, and comes back when the canvas is reopened by its address.
  await page.getByRole('button', { name: '+ New terminal' }).click();
  await expect(node).toHaveCount(1);
  await expect(page.locator('.xterm-rows')).toHaveText(/\S/);
  await page.getByTestId('node-body').click();
  await page.keyboard.type('echo "second-$((1 + 1))"');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'second-2')).toHaveCount(1);
  const secondAddress = page.url();
  await tabs.first().click();
  await expect(page).toHaveURL(mainAddress);
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'second-2')).toHaveCount(0);
  await page.goto(secondAddress);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(outputLine(page, 'second-2')).toHaveCount(1);

  // Renaming a tab, and going back with the browser.
  await tabs.nth(1).dblclick();
  await page.getByRole('textbox', { name: 'Canvas name' }).fill('Deploys');
  await page.keyboard.press('Enter');
  await expect(tabs.nth(1)).toContainText('Deploys');

  // A session that starts waiting on a canvas nobody is looking at shows on that canvas's tab,
  // and the queue, which covers every canvas, goes there.
  await page.getByTestId('node-body').click();
  await page.keyboard.type(`sleep 2; echo '{"notification_type":"permission_prompt","message":"Go on?"}' | ${aubergine} hook notification`);
  await page.keyboard.press('Enter');
  await tabs.first().click();
  await expect(page).toHaveURL(mainAddress);
  await expect(tabs.nth(1).getByTestId('tab-waiting')).toHaveText('1', { timeout: 15_000 });
  await expect(page.getByTestId('attention-queue')).toHaveText('1 waiting');
  await page.getByTestId('attention-queue').click();
  await expect(page).toHaveURL(secondAddress);
  await expect(page.getByTestId('attention-queue')).toHaveCount(0);
  await expect(page.getByTestId('tab-waiting')).toHaveCount(0);

  // Closing a canvas with terminals asks what to do with them; moving brings them to the other canvas.
  await page.getByRole('button', { name: 'Close canvas Deploys' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('never ends a shell');
  await page.getByRole('button', { name: 'Close canvas', exact: true }).click();
  await expect(tabs).toHaveCount(1);
  await expect(page).toHaveURL(mainAddress);
  await expect(node).toHaveCount(2);
  // "Move to canvas…" puts a terminal on another canvas, with its shell untouched.
  const movedName = await page.getByTestId('node-name').nth(1).textContent();
  await page.getByRole('button', { name: 'New canvas' }).click();
  await expect(tabs).toHaveCount(2);
  await tabs.first().click();
  await expect(node).toHaveCount(2);
  await page.getByRole('button', { name: `Move ${movedName} to another canvas` }).click();
  await page.getByRole('menuitem', { name: 'Canvas 2' }).click();
  await expect(node).toHaveCount(1);
  await tabs.nth(1).click();
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'second-2')).toHaveCount(1);

  // Closing that canvas with "park" takes the terminal off every canvas, still running.
  await page.getByRole('button', { name: 'Close canvas Canvas 2' }).click();
  await page.getByRole('alertdialog').getByLabel(/^Park it/).check();
  await page.getByRole('button', { name: 'Close canvas', exact: true }).click();
  await expect(tabs).toHaveCount(1);
  await expect(node).toHaveCount(1);
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await expect(page.getByTestId('parked-row')).toContainText(movedName ?? '');
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('button', { name: /^Parked \(/ })).toHaveCount(0);
  await expect(node).toHaveCount(1);

  // When the shell exits, the node says so and offers a restart.
  await page.getByTestId('node-body').click();
  await page.keyboard.type('exit');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('node-ended')).toContainText('This shell has ended');
  await page.getByRole('button', { name: 'Restart here' }).click();
  await expect(terminal).toHaveAttribute('data-link', 'open');

  // Ending a parked session for good asks first.
  await page.getByRole('button', { name: /^Park Terminal/ }).dispatchEvent('click'); // it may sit under the minimap, so no aiming at a point
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('ends the shell');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('button', { name: /^Parked \(/ })).toHaveCount(0);
  await expect(node).toHaveCount(0);

  // A whole pass without the mouse: a canvas, two terminals, moving between them, switching
  // canvas, parking, the shortcut sheet and the palette.
  const mac = process.platform === 'darwin';
  const chord = (key: string): string => `${mac ? 'Control+Meta' : 'Control+Shift'}+${key}`;
  const firstCanvas = page.url();
  await page.keyboard.press('t');
  await expect(tabs).toHaveCount(2);
  await expect(page).not.toHaveURL(firstCanvas);
  const secondCanvas = page.url();

  await page.keyboard.press('n');
  await expect(node).toHaveCount(1);
  await expect(node.first()).toHaveAttribute('data-focused', 'true');
  await expect(node.first().locator('.xterm-rows')).toHaveText(/\S/);
  // Inside a terminal the plain keys are typing: this line has n, t, p and f in it.
  await page.keyboard.type('printf "tn-pf-%s\\n" $((40+2))');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'tn-pf-42')).toHaveCount(1);
  await expect(node).toHaveCount(1);
  await expect(tabs).toHaveCount(2);

  // Leaving the terminal keeps it selected; a plain key works again.
  await page.keyboard.press(chord('Period'));
  await expect(node.first()).toHaveAttribute('data-selected', 'true');
  await expect(node.first()).not.toHaveAttribute('data-focused', 'true');
  // Enter goes back into the selected terminal.
  await page.keyboard.press('Enter');
  await expect(node.first()).toHaveAttribute('data-focused', 'true');
  await page.keyboard.type('echo in-$((3+4))');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'in-7')).toHaveCount(1);
  await page.keyboard.press(chord('Period'));
  await expect(node.first()).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('n');
  await expect(node).toHaveCount(2);
  await expect(node.nth(1)).toHaveAttribute('data-focused', 'true');
  await expect(node.nth(1).locator('.xterm-rows')).toHaveText(/\S/);
  await page.keyboard.type('echo second-$((1+1))');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'second-2')).toHaveCount(1);

  // From inside one terminal straight into its neighbour, and nothing is typed on the way.
  const a = await node.first().boundingBox();
  const b = await node.nth(1).boundingBox();
  if (!a || !b) throw new Error('The terminals are not on screen');
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const toFirst = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'ArrowLeft' : 'ArrowRight') : dy < 0 ? 'ArrowUp' : 'ArrowDown';
  await page.keyboard.type('echo left-');
  await page.keyboard.press(chord(toFirst));
  await expect(node.first()).toHaveAttribute('data-focused', 'true');
  await page.keyboard.type('echo back-$((2+3))');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'back-5')).toHaveCount(1);
  // The line half typed in the other terminal is exactly as it was left.
  await expect(node.nth(1).locator('.xterm-rows')).toContainText(/echo left-\s*$/);

  // Tab walks through the terminals in the order of the list on the left, without going in.
  await page.keyboard.press(chord('Period'));
  await page.keyboard.press('Tab');
  const current = page.locator('.list-row.current .list-name');
  const tabbedTo = await current.innerText();
  await page.keyboard.press('Tab');
  await expect(current).not.toHaveText(tabbedTo);
  await page.keyboard.press('Tab');
  await expect(current).toHaveText(tabbedTo); // two terminals: it wraps
  await expect(page.locator('[data-testid="terminal-node"][data-focused="true"]')).toHaveCount(0);

  // Enter goes in. Inside a terminal Tab is the shell's: it completes a file name.
  await page.keyboard.press('Enter');
  const focusedName = page.locator('[data-testid="terminal-node"][data-focused="true"] [data-testid="node-name"]');
  await expect(focusedName).toHaveText(tabbedTo);
  const completionDir = mkdtempSync(path.join(tmpdir(), 'aubergine-tab-'));
  writeFileSync(path.join(completionDir, 'only-file-here.txt'), 'completed-77\n');
  await page.keyboard.press('Control+u');
  await page.keyboard.type(`cat ${completionDir}/only-f`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'completed-77')).toHaveCount(1);
  await expect(focusedName).toHaveText(tabbedTo); // Tab did not move the selection
  rmSync(completionDir, { recursive: true, force: true });

  // Leave, and Shift+Tab selects the one before.
  await page.keyboard.press(chord('Period'));
  await page.keyboard.press('Shift+Tab');
  await expect(current).not.toHaveText(tabbedTo);

  // The palette, then a bracket: the route to the next canvas that works in every browser.
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+Shift+K');
  await page.keyboard.press(']');
  await expect(page).toHaveURL(firstCanvas);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+Shift+K');
  await page.keyboard.press('[');
  await expect(page).toHaveURL(secondCanvas);
  await expect(node).toHaveCount(2);

  // Switching canvas from inside a terminal, then back with a plain key.
  await page.keyboard.press(chord('BracketLeft'));
  await expect(page).toHaveURL(firstCanvas);
  await expect(node).toHaveCount(0);
  await page.keyboard.press(']');
  await expect(page).toHaveURL(secondCanvas);
  await expect(node).toHaveCount(2);

  // Arrows select a terminal without going into it; P parks the selected one.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="terminal-node"][data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('p');
  await expect(node).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Parked (1)' })).toBeVisible();

  // The list on the left, by keyboard: scope, the text filter, tags, the collapsed strip.
  const listRows = page.locator('.list-rows [data-testid="list-row"]');
  await expect(listRows).toHaveCount(2); // the terminal on this canvas and the parked one
  await expect(page.getByTestId('section-count')).toHaveText('2');
  await expect(page.getByTestId('list-group')).toHaveCount(1); // only "Parked": one canvas is in scope
  await page.keyboard.press('s');
  await expect(page.getByTestId('scope-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('list-group')).toHaveCount(2); // this canvas by name, and "Parked"
  await page.keyboard.press('s');
  await expect(page.getByTestId('scope-this')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('/');
  await expect(page.getByTestId('list-search')).toBeFocused();
  await page.keyboard.type('zzz-no-such');
  await expect(page.getByTestId('list-empty')).toContainText('No terminal matches This canvas + “zzz-no-such”');
  await expect(page.getByTestId('section-count')).toHaveText('0');
  await page.keyboard.press('Escape'); // clears the text
  await expect(listRows).toHaveCount(2);
  await page.keyboard.press('Escape'); // back to the canvas
  await expect(page.getByTestId('list-search')).not.toBeFocused();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('#');
  await expect(page.getByTestId('tag-dialog')).toBeVisible();
  await page.keyboard.type('e2e-tag');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tag-dialog')).toHaveCount(0);
  await expect(page.getByTestId('list-tag')).toHaveText('#e2e-tag');
  await page.getByTestId('list-tag').click();
  await expect(listRows).toHaveCount(1);
  await expect(page.getByTestId('list-chip').last()).toContainText('#e2e-tag');
  await page.getByTestId('list-clear').click();
  await expect(page.getByTestId('scope-all')).toHaveAttribute('aria-pressed', 'true'); // clearing shows everything
  await page.keyboard.press('s');

  // Typing in a terminal is recorded, and the row says so.
  await expect(listRows.first().getByTestId('list-typed')).toContainText('typed');
  await expect(listRows.first().getByTestId('list-updated')).toContainText('updated');

  await page.keyboard.press('b');
  await expect(page.getByTestId('strip-entry')).toContainText('2');
  await expect(listRows).toHaveCount(0);
  await page.keyboard.press('b');
  await expect(listRows).toHaveCount(2);

  // F6 takes the keyboard to the list, the toolbar, the tabs and back; there Tab is the page's own.
  const keyboardIn = (): Promise<string> =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'canvas';
      return el.closest('.side-panel') ? 'list' : el.closest('.toolbar') ? 'toolbar' : el.closest('.tabbar') ? 'tabs' : 'other';
    });
  for (const expected of ['list', 'toolbar', 'tabs', 'canvas']) {
    await page.keyboard.press('F6');
    expect(await keyboardIn()).toBe(expected);
  }
  await page.keyboard.press('F6');
  await page.keyboard.press('F6');
  await page.keyboard.press('Tab');
  expect(await keyboardIn()).toBe('toolbar');
  await page.keyboard.press('Escape');
  expect(await keyboardIn()).toBe('canvas');

  // The sheet lists every command with its keys.
  await page.keyboard.press('?');
  const sheet = page.getByTestId('shortcut-sheet');
  await expect(sheet).toContainText('Park the terminal');
  await expect(sheet.locator('[data-command="terminal.park"]')).toContainText('P');
  await expect(sheet.locator('[data-command="canvas.next"]')).toContainText(mac ? '⌃⌘]' : 'Ctrl+Shift+]');
  // The browser's own tab keys are bound too, and marked as not expected to work in a browser tab.
  await expect(sheet.locator('[data-command="canvas.next"] kbd[data-expected="no"]').first()).toBeVisible();
  await expect(sheet.locator('[data-command="canvas.next"] kbd[data-expected="yes"]').first()).toBeVisible();
  await expect(sheet.locator('[data-command="select.next"]')).toContainText(mac ? '⇥' : 'Tab');
  await expect(page.getByTestId('shortcut-problems')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // M opens the list of canvases with the keyboard in it: there, Enter chooses, it is not a canvas key.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('m');
  await expect(page.getByRole('menuitem')).toHaveCount(1);
  await expect(page.getByRole('menuitem')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(node).toHaveCount(0);

  // The palette: a digit goes to that canvas, and a command runs from it.
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+Shift+K');
  await expect(page.getByTestId('picker-section-command')).toBeVisible();
  await page.keyboard.press('1');
  await expect(page).toHaveURL(firstCanvas);
  await expect(node).toHaveCount(1);
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+Shift+K');
  await page.keyboard.type('>restore');
  await expect(page.getByTestId('picker-command-row')).toHaveCount(1);
  await expect(page.getByTestId('picker-row')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(node).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Parked \(/ })).toHaveCount(0);
});
