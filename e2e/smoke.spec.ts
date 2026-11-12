import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2e } from '../playwright.config';

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
  await expect(page).toHaveURL(/\/$/);
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
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'picked-44')).toHaveCount(1);

  // When the shell exits, the node says so and offers a restart.
  await page.getByTestId('node-body').click();
  await page.keyboard.type('exit');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('node-ended')).toContainText('This shell has ended');
  await page.getByRole('button', { name: 'Restart here' }).click();
  await expect(terminal).toHaveAttribute('data-link', 'open');

  // Ending a parked session for good asks first.
  await page.getByRole('button', { name: /^Park Terminal/ }).click();
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('ends the shell');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Parked (1)' }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('button', { name: /Parked/ })).toHaveCount(0);
  await expect(node).toHaveCount(0);
});
