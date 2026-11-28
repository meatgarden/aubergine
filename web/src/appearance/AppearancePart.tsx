import {
  CURSOR_STYLES,
  CURSOR_WORDS,
  DEFAULT_SETTINGS,
  FontFamilyChoice,
  THEMES,
  THEME_WORDS,
  colorThemeShown,
  mayBeHardToRead,
  resolveColors,
  themeChoices,
  themeFallbacks,
  themeOf,
  type ThemeKind,
  type ThemeOf,
  type ThemeProposal,
  type UserTheme,
} from '@aubergine/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { useApp } from '../store';
import { chooseColorTheme, chooseTheme, readThemesAgain, setCursor, setCursorBlink, setFontFamily, setFontSize, setTerminalFont, setTerminalTheme, usePageThemeFrom, useThemeShown } from '../theme';
import { currentProjectId } from '../store';
import { ByTag } from './ByTag';
import { TitlesPart } from './TitlesPart';
import { ThemeSelect } from '../TerminalTheme';
import { Banner, Button, RadioRow, RadioRows, Segmented, TextField } from '../ui';

const NO_PROPOSALS: readonly ThemeProposal[] = [];
const nameOf = (id: string, themes: readonly UserTheme[] = []): string => themeOf(id, themes)?.name ?? id;
const KIND_WORDS: Record<ThemeKind, string> = { light: 'Light', dark: 'Dark' };
const MIN_SIZE = 8;
const MAX_SIZE = 32;

/** What is the case about the two color themes, in one sentence. Pure. */
export function colorThemeSays(setting: (typeof THEMES)[number], light: string, dark: string, themes: readonly UserTheme[] = []): string {
  const [l, d] = [nameOf(light, themes), nameOf(dark, themes)];
  if (setting === 'system') return `${l} is used while the system is light, ${d} while it is dark.`;
  if (setting === 'light') return `The page is drawn in ${l}. ${d} is the theme of the dark page.`;
  return `The page is drawn in ${d}. ${l} is the theme of the light page.`;
}

/** What is said in Settings while the project looked at draws the page in a theme of its own, so that a choice here is not taken for having no effect. Pure. */
export function projectThemeSays(project: string, theme: string, themes: readonly UserTheme[] = []): string {
  return `While you look at ${project} the page is drawn in ${nameOf(theme, themes)}: that is the project’s. What you choose here is the page’s own, drawn everywhere else.`;
}

/** What is said in Settings while themes proposed by agents and programs wait to be read. Pure. */
export function proposedWords(count: number): string {
  return `${count === 1 ? 'One color theme was' : `${count} color themes were`} proposed by an agent or a program, to read before ${count === 1 ? 'it' : 'they'} can be chosen.`;
}

/** Where the theme files are, from where the settings file is: `themes` beside `config.json`. Pure. */
export function themesFolderOf(settingsFile: string | null): string | null {
  if (settingsFile === null || !/config\.json$/.test(settingsFile)) return null;
  return settingsFile.replace(/config\.json$/, 'themes');
}

/** What is said under the list of themes about those of the owner's that may be hard to read: advice, nothing more. Pure. */
export function hardToReadSays(themes: readonly UserTheme[]): string[] {
  return themeChoices(themes)
    .filter((theme) => theme.own && mayBeHardToRead(theme))
    .map((theme) => `${theme.name} may be hard to read: its text is less than 4.5 to 1 on its background or its surface.`);
}

/** A theme's own colors as values of the tokens, for a preview drawn over its base. Only names and `#rrggbb` come from `themeOf`. */
const ownColors = (theme: ThemeOf): CSSProperties | undefined =>
  theme.own ? (Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--${name}`, value])) as CSSProperties) : undefined;

/** Why a size written in the field is not taken, or null when it is. Pure. */
export function sizeProblem(text: string): string | null {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isInteger(value)) return `The size is a whole number of pixels, from ${MIN_SIZE} to ${MAX_SIZE}.`;
  if (value < MIN_SIZE || value > MAX_SIZE) return `The size is from ${MIN_SIZE} to ${MAX_SIZE} pixels.`;
  return null;
}

/** Why a font-family list written in the field is not taken, or null when it is. Pure. */
export function familyProblem(text: string): string | null {
  if (text.trim() === '') return 'A font is needed: at least one name, such as monospace.';
  const checked = FontFamilyChoice.safeParse(text);
  if (checked.success) return null;
  if (text.trim().length > 300) return 'A font-family list is at most 300 characters.';
  return 'A font-family list is one line, without control characters or any of ; { } < >.';
}

/**
 * Settings → Appearance: light, dark or matching the system; the color theme of each kind; a terminal's text and
 * cursor; and how colors are set by hand in the settings file. Everything here is the page's own: it is written to the
 * own server whatever server is shown.
 */
export function AppearancePart() {
  const theme = useApp((s) => s.settings.theme);
  const appearance = useApp((s) => s.settings.appearance);
  const font = useApp((s) => s.settings.font);
  const userThemes = useApp((s) => s.themes.themes);
  const fileProblems = useApp((s) => s.themes.problems);
  const settingsFile = useApp((s) => s.ownSettingsFile);
  const [reading, setReading] = useState(false);
  const shown = useThemeShown();
  const drawn = colorThemeShown(appearance, shown, userThemes);
  const problems = resolveColors(appearance.colors, drawn, userThemes).problems;
  const setByHand = Object.keys(resolveColors(appearance.colors, drawn, userThemes).colors);
  const fallbacks = themeFallbacks(appearance, userThemes);
  const hard = hardToReadSays(userThemes);
  const folder = themesFolderOf(settingsFile);
  // Themes proposed by agents and programs, of the page's own server: said here only while one waits.
  const proposed = useApp((s) => (s.server === null ? (s.whole?.themeProposals.waiting ?? NO_PROPOSALS) : NO_PROPOSALS));
  // The project looked at may draw the page in a theme of its own: said, so that a choice here is not taken for having no effect.
  const pageNow = usePageThemeFrom();
  const projectName = useApp((s) => s.whole?.projects.find((project) => project.id === currentProjectId(s))?.name ?? null);
  return (
    <section data-testid="settings-appearance">
      <h3>Appearance</h3>
      <div className="ui-segmented" role="radiogroup" aria-label="Theme" data-testid="theme-switch">
        {THEMES.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={choice === theme} aria-pressed={choice === theme} onClick={() => chooseTheme(choice)} data-testid={`theme-${choice}`}>
            {THEME_WORDS[choice]}
          </button>
        ))}
      </div>
      <p className="ui-meta" data-testid="theme-says">
        {theme === 'system' ? `The system is set to ${shown} now; the page follows it when that changes.` : 'It changes at once, and is the same in every browser you open this in.'}
      </p>

      <div className="appearance-part">
        <h4>Color theme</h4>
        <div className="appearance-themes" data-testid="color-themes">
          {(['light', 'dark'] as const).map((kind) => {
            // What is drawn for that kind: the theme chosen, or the one in its place where that is not there now.
            const ofKind = colorThemeShown(appearance, kind, userThemes);
            return (
              <div key={kind} className="appearance-kind">
                <div className="appearance-kind-name" aria-hidden="true">
                  {KIND_WORDS[kind]}
                </div>
                <RadioRows label={`${KIND_WORDS[kind]} theme`} data-testid={`color-themes-${kind}`}>
                  {themeChoices(userThemes, kind).map((one) => (
                    <RadioRow
                      key={one.id}
                      checked={ofKind === one.id}
                      marked={drawn === one.id}
                      onChoose={() => chooseColorTheme(one.id)}
                      data-testid={`color-theme-${one.id}`}
                      data-drawn={drawn === one.id || undefined}
                      data-autofocus={drawn === one.id || undefined}
                    >
                      <span className="ui-theme-preview" data-theme-preview={one.base} data-theme-id={one.own ? one.id : undefined} style={ownColors(one)} aria-hidden="true">
                        <span className="ui-theme-preview-surface">
                          <span className="ui-theme-preview-text" />
                          <span className="ui-theme-preview-accent" />
                        </span>
                        <span className="ui-theme-preview-dots">
                          <span className="is-attention" />
                          <span className="is-working" />
                          <span className="is-ok" />
                          <span className="is-danger" />
                        </span>
                      </span>
                      <span>
                        {one.name}
                        {one.own && <span className="ui-meta"> · yours</span>}
                      </span>
                    </RadioRow>
                  ))}
                </RadioRows>
              </div>
            );
          })}
        </div>
        <p className="ui-meta" data-testid="color-theme-says">
          {colorThemeSays(theme, colorThemeShown(appearance, 'light', userThemes), colorThemeShown(appearance, 'dark', userThemes), userThemes)}
        </p>
        {pageNow.from === 'project' && projectName !== null && (
          <p className="ui-meta" data-testid="project-theme-says">
            {projectThemeSays(projectName, pageNow.id, userThemes)}
          </p>
        )}
        {fallbacks.length > 0 && (
          <p className="ui-meta" role="status" data-testid="theme-fallbacks">
            {fallbacks.join(' ')}
          </p>
        )}
        {hard.length > 0 && (
          <p className="ui-meta" data-testid="theme-hard-to-read">
            {hard.join(' ')}
          </p>
        )}
        {proposed.length > 0 && (
          <Banner
            action="Read"
            onAction={() => {
              useApp.getState().wantReview(`theme-proposals:${proposed[0]?.id ?? ''}`);
              useApp.getState().togglePanel('review');
            }}
            testid="themes-proposed"
            actionTestid="themes-proposed-read"
          >
            {proposedWords(proposed.length)}
          </Banner>
        )}
        <p className="ui-meta" data-testid="theme-files-says">
          Themes of your own are files in {folder ? <code>{folder}</code> : <>the folder <code>themes</code> in the data folder</>}: <code>aubergine theme new &lt;name&gt;</code> writes one to start from. Nothing in a theme file is run.
        </p>
        <div className="settings-line">
          <Button
            kind="quiet"
            className="ui-start"
            busy={reading}
            onClick={() => {
              setReading(true);
              void readThemesAgain().finally(() => setReading(false));
            }}
            data-testid="themes-read-again"
          >
            Read themes again
          </Button>
        </div>
        {fileProblems.length > 0 && (
          <div className="appearance-problems" data-testid="theme-file-problems">
            <p>Some of the theme files are not read, or not all of them:</p>
            <ul>
              {fileProblems.map((problem, i) => (
                <li key={i}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="appearance-part">
        <h4>
          <label htmlFor="appearance-terminal-theme">Terminal theme</label>
        </h4>
        <div className="settings-line">
          <ThemeSelect id="appearance-terminal-theme" value={appearance.terminal} onChange={setTerminalTheme} none="Same as the page" aria-describedby="appearance-terminal-theme-says" data-testid="terminal-theme-default" />
        </div>
        <p className="ui-meta" id="appearance-terminal-theme-says" data-testid="terminal-theme-says">
          {appearance.terminal && themeOf(appearance.terminal, userThemes) ? `Every terminal is drawn in ${nameOf(appearance.terminal, userThemes)}, whatever the page is drawn in.` : `Every terminal is drawn as the page is, now in ${nameOf(pageNow.id, userThemes)}.`} A terminal can also have a theme of its own, from the menu in its title.
        </p>
        <ByTag />
      </div>

      <TerminalText family={font.family} size={font.size} />

      <TitlesPart />

      <div className="appearance-part">
        <h4>Cursor</h4>
        <div className="settings-line">
          <Segmented label="Cursor" value={appearance.cursor} options={CURSOR_STYLES.map((style) => ({ value: style, label: CURSOR_WORDS[style], testid: `cursor-${style}` }))} onChange={setCursor} />
          <label className="ui-check">
            <input type="checkbox" checked={appearance.cursorBlink} onChange={(e) => setCursorBlink(e.target.checked)} data-testid="cursor-blink" />
            <span>Blink</span>
          </label>
        </div>
      </div>

      <div className="appearance-part">
        <details className="ui-fold" data-testid="colors-by-hand">
          <summary>Set colors by hand</summary>
          <p>
            Colors are set in <code>config.json</code> in the data folder, under <code>appearance.colors</code>: <code>"accent": "#rrggbb"</code> for every theme, or <code>"[nord]": {'{ … }'}</code> for one theme alone (a theme of your own too). The names are the
            page’s color tokens, listed in docs/design.md, and only six-digit colors are taken. They are laid over a theme file’s own colors.
          </p>
          {setByHand.length > 0 && (
            <p data-testid="colors-set">
              Set by hand for {nameOf(drawn, userThemes)}: {setByHand.join(', ')}.
            </p>
          )}
        </details>
        {problems.length > 0 && (
          <div className="appearance-problems" data-testid="colors-problems">
            <p>Some colors in the settings file are skipped:</p>
            <ul>
              {problems.map((problem, i) => (
                <li key={i}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** The size and the font of a terminal's text: each taken when it is right, on Enter or on leaving the field. */
function TerminalText({ family, size }: { family: string; size: number }) {
  const [sizeText, setSizeText] = useState(String(size));
  const [familyText, setFamilyText] = useState(family);
  const [problem, setProblem] = useState<string | null>(null);
  // What the settings say, once changed elsewhere (another browser, a failure put back), is what the fields hold.
  useEffect(() => setSizeText(String(size)), [size]);
  useEffect(() => setFamilyText(family), [family]);
  const takeSize = (text: string): void => {
    const wrong = sizeProblem(text);
    setProblem(wrong);
    if (wrong === null && Number(text) !== size) setFontSize(Number(text));
  };
  const takeFamily = (): void => {
    const wrong = familyProblem(familyText);
    setProblem(wrong);
    if (wrong === null && familyText.trim() !== family) setFontFamily(familyText.trim());
  };
  const defaults = DEFAULT_SETTINGS.font;
  const differs = family !== defaults.family || size !== defaults.size;
  return (
    <div className="appearance-part">
      <h4>Terminal text</h4>
      <div className="settings-line appearance-font">
        <label htmlFor="appearance-font-size">Size</label>
        <TextField
          id="appearance-font-size"
          className="appearance-size"
          type="number"
          inputMode="numeric"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={sizeText}
          onChange={(e) => {
            setSizeText(e.target.value);
            // The arrows of the field, and a number that is already right, are taken at once; a wrong one waits to be left.
            if (sizeProblem(e.target.value) === null) takeSize(e.target.value);
          }}
          onBlur={() => takeSize(sizeText)}
          onKeyDown={(e) => e.key === 'Enter' && takeSize(sizeText)}
          aria-describedby="appearance-font-says"
          data-testid="font-size"
        />
        <label htmlFor="appearance-font-family">Font</label>
        <TextField
          id="appearance-font-family"
          className="appearance-family"
          value={familyText}
          spellCheck={false}
          onChange={(e) => setFamilyText(e.target.value)}
          onBlur={takeFamily}
          onKeyDown={(e) => e.key === 'Enter' && takeFamily()}
          aria-describedby="appearance-font-says"
          data-testid="font-family"
        />
        {differs && (
          <Button
            kind="quiet"
            onClick={() => {
              setProblem(null);
              setTerminalFont(defaults.family, defaults.size);
            }}
            data-testid="font-reset"
          >
            Reset
          </Button>
        )}
      </div>
      <p className="ui-meta" id="appearance-font-says" role={problem ? 'alert' : undefined} data-testid="font-says">
        {problem ?? 'A terminal’s text, in pixels and as a list of fonts, the first one found used.'}
      </p>
    </div>
  );
}
