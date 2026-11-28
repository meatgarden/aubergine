/**
 * Writes what is generated from the description of the API, and from the
 * guide for agents:
 *
 *   client/src/generated.ts   the typed client
 *   docs/api.md               the reference
 *   docs/for-agents.md        the guide for agents, in full
 *   docs/settings.md          the reference of the settings file
 *   docs/templates.md         the reference of the templates of titles and rows
 *   docs/config.schema.json   the schema of the settings file, for an editor
 *   docs/theme.schema.json    the schema of a theme file, for an editor
 *   shared/src/theme-colors.generated.ts
 *                             the colors of the built-in themes, read from web/src/tokens.css and themes.css
 *   shared/src/token-names.generated.ts
 *                             the name of every token, read from web/src/tokens.css
 *   docs/hooks.md             the hooks a stylesheet of the owner's own may rely on
 *
 *   pnpm generate            write them
 *   pnpm generate --check    change nothing; fail if any is out of date
 *
 * All are committed, so that nothing has to be generated when Aubergine is
 * installed. `pnpm check` fails when a declaration has changed and they have
 * not been written again.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedFiles } from '../src/describe/generated-files';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const check = process.argv.includes('--check');
let stale = 0;

for (const [file, text] of Object.entries(generatedFiles())) {
  const target = path.join(root, file);
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current === text) continue;
  if (check) {
    stale += 1;
    console.error(`${file} is out of date. Run: pnpm generate`);
  } else {
    await writeFile(target, text);
    console.log(`wrote ${file}`);
  }
}
if (check && stale === 0) console.log('The generated client, reference and guide are up to date.');
process.exit(stale > 0 ? 1 : 0);
