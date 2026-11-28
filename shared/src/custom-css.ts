import { z } from 'zod';
import { ATTRIBUTE_HOOKS, HOOK_EXAMPLES, PART_HOOKS, ROOT_HOOKS, TOKEN_HOOKS } from './hooks';

/**
 * The owner's own stylesheet: `custom.css` directly in the data folder. The server reads it (`daemon/src/custom-css.ts`),
 * serves it to the signed-in owner alone at `CUSTOM_CSS_PATH`, and links it as the last thing in the page's `<head>`,
 * so that it wins over the app's own rules of the same specificity and is there from the first paint. It is left out
 * of a page asked for with `?plain`, and while `appearance.customCss` is off.
 */

/** The file's name, directly in the data folder. */
export const CUSTOM_CSS_FILE = 'custom.css';
/** How large it may be. A larger file is not read. */
export const CUSTOM_CSS_MAX_BYTES = 256 * 1024;
/** The address it is served at, to the signed-in owner only: under `/api`, so the one hook's sign-in rule applies. */
export const CUSTOM_CSS_PATH = '/api/v1/custom.css';
/**
 * The parameter of a page's address that leaves out everything of the owner's own on that page: the stylesheet now.
 * Honoured by the server when it sends the page; kept by nothing, never written into an address by the page.
 */
export const PLAIN_PARAM = 'plain';

/** What the server found of the file, without anything it says: a short hash of its content and its size. */
export const CustomCss = z.object({
  version: z
    .string()
    .regex(/^[0-9a-f]{12}$/)
    .describe('A short hash of the file’s content: it changes when the content does, and is put in the address of the stylesheet so that a browser takes the new one.'),
  bytes: z.number().int().min(0).describe('The file’s size, in bytes.'),
});
export type CustomCss = z.infer<typeof CustomCss>;

/** What reading the file again found: the stylesheet, or none, and why not where there is a file that could not be read. */
export const CustomCssAnswer = z.object({
  stylesheet: CustomCss.nullable().describe('The stylesheet found now: null when there is none to link.'),
  problem: z.string().max(1000).nullable().describe('Why a file that is there was not read (a link, a folder, too large), in one sentence; null otherwise.'),
});
export type CustomCssAnswer = z.infer<typeof CustomCssAnswer>;

/** The address the page links the stylesheet at: the version in it, so that a changed file is fetched again. */
export const customCssHref = (version: string): string => `${CUSTOM_CSS_PATH}?v=${version}`;

/** The same page without the owner's own stylesheet: `?plain` after the address, its fragment left out. */
export function plainHref(address: string): string {
  const url = new URL(address);
  url.hash = '';
  url.searchParams.delete(PLAIN_PARAM);
  url.searchParams.append(PLAIN_PARAM, '');
  return url.href.replace(new RegExp(`([?&])${PLAIN_PARAM}=(&|$)`), `$1${PLAIN_PARAM}$2`);
}

/** Whether an address asks for the page without the owner's own: `?plain` among its parameters, with or without a value. */
export const asksPlain = (search: string): boolean => new URLSearchParams(search).has(PLAIN_PARAM);

const comment = (text: string): string => text.replace(/\*\//g, '* /');

/**
 * What `aubergine css new` writes: a comment that lists the hooks (made from `UI_HOOKS`, never typed again) and three of
 * the examples, commented out. Nothing in it is switched on.
 */
export function customCssStarter(): string {
  const width = 100;
  const wrap = (words: string, indent = ' *   '): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of words.split(' ')) {
      if (line && `${indent}${line} ${word}`.length > width) {
        lines.push(`${indent}${line}`);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(`${indent}${line}`);
    return lines;
  };
  return [
    '/*',
    ' * Your own stylesheet. Aubergine links it last on the page, after its own, so a rule here wins over one of the',
    ' * app’s of the same specificity, and it is there from the first paint. Save it, then press “Read it again” in',
    ' * Settings → Appearance (or reload the page). If it breaks the page, open the page with ?plain after its address,',
    ' * or switch it off in Settings.',
    ' *',
    ' * Rely on the hooks below, and only on them: class names and how elements are nested may change in any release.',
    ' * docs/hooks.md says what each one is. Nothing this file names is fetched from another address.',
    ' *',
    ' * Tokens (set them on :root, read them with var(--name)):',
    ...wrap(TOKEN_HOOKS.map((hook) => `--${hook.name}`).join(' ')),
    ' *',
    ' * On the root (<html>):',
    ...wrap(ROOT_HOOKS.map((hook) => `[${hook.name}]`).join(' ')),
    ' *',
    ' * Parts ([data-part="…"]):',
    ...wrap(PART_HOOKS.map((hook) => hook.name).join(' ')),
    ' *',
    ' * Attributes of a part:',
    ...ATTRIBUTE_HOOKS.map((hook) => ` *   [${hook.name}] on ${hook.on.join(', ')}`),
    ' */',
    '',
    ...HOOK_EXAMPLES.slice(0, 3).flatMap((example) => [`/* ${comment(example.says)}:`, '', comment(example.css), '*/', '']),
  ].join('\n');
}
