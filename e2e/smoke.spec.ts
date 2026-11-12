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

  await terminal.click();
  await page.keyboard.type('echo hello');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'hello')).toHaveCount(1);

  // After a reload the screen comes back by itself, promptly and without a click.
  await page.reload();
  await expect(node).toHaveCount(1);
  await expect(outputLine(page, 'hello')).toHaveCount(1, { timeout: 3000 });
  await expect(terminal).toHaveAttribute('data-link', 'open');

  // Still the same shell, not a new one: it remembers what ran before.
  await terminal.click();
  await page.keyboard.type('echo "again-$((20 + 3))"');
  await page.keyboard.press('Enter');
  await expect(outputLine(page, 'again-23')).toHaveCount(1);

  // Closing asks first, then removes the node.
  await page.getByRole('button', { name: /^Close Terminal/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText('ends the shell');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(node).toHaveCount(1);
  await page.getByRole('button', { name: /^Close Terminal/ }).click();
  await page.getByRole('button', { name: 'Close terminal', exact: true }).click();
  await expect(node).toHaveCount(0);
});
