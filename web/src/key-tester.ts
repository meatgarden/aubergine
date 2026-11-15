/**
 * The key tester: a page for development only (`/key-tester.html` on the Vite
 * server; it is not part of the built app). It records which chords reach a
 * page, so the choice of default keys rests on what browsers really deliver.
 */
import {
  chordId,
  chordOfPress,
  defaultShortcuts,
  formatChord,
  isPlainKey,
  keptChords,
  parseChord,
  type Chord,
  type Platform,
  type WindowMode,
} from '@aubergine/shared';

const platform: Platform = /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other';
const mode: WindowMode = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(
  (name) => window.matchMedia(`(display-mode: ${name})`).matches,
)
  ? 'app'
  : 'tab';
const STORE = `aubergine.keytester.${mode}`;

/** Chords worth knowing about beyond the defaults: candidates for more keys. */
const EXTRA: Record<Platform, string[]> = {
  mac: [
    'Meta+[', 'Meta+]', 'Meta+Shift+ArrowLeft', 'Meta+Shift+ArrowRight', 'Meta+Shift+ArrowUp', 'Meta+Shift+ArrowDown',
    'Meta+Escape', 'Meta+.', 'Meta+J', 'Meta+E', 'Meta+P', 'Meta+Enter', 'Ctrl+Meta+Enter', 'Ctrl+Meta+N', 'Ctrl+Meta+P',
    'Meta+Alt+ArrowUp', 'Meta+Alt+ArrowDown', 'Meta+Alt+[', 'Meta+Alt+]',
  ],
  other: [
    'Ctrl+Shift+Enter', 'Ctrl+Shift+E', 'Ctrl+Shift+U', 'Ctrl+Shift+L', 'Ctrl+Shift+P', 'Ctrl+Shift+M', 'Ctrl+Shift+;',
    'Ctrl+Alt+ArrowLeft', 'Ctrl+Alt+ArrowRight', 'Ctrl+Alt+ArrowUp', 'Ctrl+Alt+ArrowDown', 'Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowRight',
  ],
};

const wanted: Chord[] = [];
for (const text of [...Object.values(defaultShortcuts(platform)).flat(), ...EXTRA[platform]]) {
  const chord = parseChord(text);
  if (!isPlainKey(chord) && !wanted.some((c) => chordId(c) === chordId(chord))) wanted.push(chord);
}
const kept = keptChords(platform);
const closesTab = (chord: Chord): boolean => ['W', 'Q', 'F4'].includes(chord.key);

const seen = new Set<string>(JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[]);

function row(chord: Chord, note: string): string {
  const id = chordId(chord);
  const state = seen.has(id) ? 'delivered' : 'not seen';
  return `<tr class="${seen.has(id) ? 'seen' : ''}" data-chord="${id}"><td><kbd>${formatChord(chord, platform)}</kbd></td><td class="state">${state}</td><td class="note">${note}</td></tr>`;
}

function markdown(): string {
  const line = (chord: Chord, note: string): string =>
    `| \`${chordId(chord)}\` | ${formatChord(chord, platform)} | ${seen.has(chordId(chord)) ? 'delivered' : 'not seen'} | ${note} |`;
  const known = new Set([...wanted, ...kept.map((k) => k.chord)].map(chordId));
  const others = [...seen].filter((id) => !known.has(id)).map((id) => line(parseChord(id), ''));
  return [
    `Browser: ${navigator.userAgent}`,
    `Platform: ${navigator.platform} · window: ${mode === 'app' ? 'app window' : 'browser tab'}`,
    '',
    '| Chord | Shown as | Result | Note |',
    '|---|---|---|---|',
    ...wanted.map((chord) => line(chord, 'candidate')),
    ...kept.map((k) => line(k.chord, `known to be kept: ${k.why}`)),
    ...others,
  ].join('\n');
}

function render(): void {
  const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
  byId('where').textContent = `This is ${mode === 'app' ? 'an app window' : 'a browser tab'} on ${platform === 'mac' ? 'macOS' : 'Linux or Windows'}. ${navigator.userAgent}`;
  byId('wanted').innerHTML = wanted.map((chord) => row(chord, '')).join('');
  byId('kept').innerHTML = kept
    .map((k) => row(k.chord, `${k.why}${closesTab(k.chord) ? ' · may close this tab' : ''}${k.modes.includes(mode) ? '' : ' · may be free in this kind of window'}`))
    .join('');
  const known = new Set([...wanted, ...kept.map((k) => k.chord)].map(chordId));
  byId('other').innerHTML = [...seen].filter((id) => !known.has(id)).map((id) => row(parseChord(id), '')).join('');
  (byId('out') as HTMLTextAreaElement).value = markdown();
}

window.addEventListener(
  'keydown',
  (event) => {
    const chord = chordOfPress(event);
    if (!chord) return;
    // Take everything, so a chord that is delivered does nothing else.
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('last')!.textContent = `Last key: ${formatChord(chord, platform)}  (key "${event.key}", code "${event.code}")`;
    if (isPlainKey(chord)) return;
    seen.add(chordId(chord));
    localStorage.setItem(STORE, JSON.stringify([...seen]));
    render();
  },
  true,
);

document.getElementById('copy')!.addEventListener('click', () => void navigator.clipboard.writeText(markdown()).catch(() => {}));
document.getElementById('reset')!.addEventListener('click', () => {
  seen.clear();
  localStorage.removeItem(STORE);
  render();
});

render();
// For scripts that drive this page.
(window as unknown as { keyTester: unknown }).keyTester = { markdown, seen: () => [...seen], mode, platform };
