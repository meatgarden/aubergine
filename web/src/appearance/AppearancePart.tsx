import { COLOR_THEMES, CURSOR_STYLES, CURSOR_WORDS, DEFAULT_SETTINGS, FontFamilyChoice, THEMES, THEME_WORDS, colorTheme, colorThemeShown, resolveColors, type ColorThemeId, type ThemeKind } from '@aubergine/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { chooseColorTheme, chooseTheme, setCursor, setCursorBlink, setFontFamily, setFontSize, setTerminalFont, useThemeShown } from '../theme';
import { Button, RadioRow, RadioRows, Segmented, TextField } from '../ui';

const nameOf = (id: ColorThemeId): string => colorTheme(id)?.name ?? id;
const KIND_WORDS: Record<ThemeKind, string> = { light: 'Light', dark: 'Dark' };
const MIN_SIZE = 8;
const MAX_SIZE = 32;

/** What is the case about the two color themes, in one sentence. Pure. */
export function colorThemeSays(setting: (typeof THEMES)[number], light: ColorThemeId, dark: ColorThemeId): string {
  if (setting === 'system') return `${nameOf(light)} is used while the system is light, ${nameOf(dark)} while it is dark.`;
  if (setting === 'light') return `The page is drawn in ${nameOf(light)}. ${nameOf(dark)} is the theme of the dark page.`;
  return `The page is drawn in ${nameOf(dark)}. ${nameOf(light)} is the theme of the light page.`;
}

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
  const shown = useThemeShown();
  const drawn = colorThemeShown(appearance, shown);
  const problems = resolveColors(appearance.colors, drawn).problems;
  const setByHand = Object.keys(resolveColors(appearance.colors, drawn).colors);
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
          {(['light', 'dark'] as const).map((kind) => (
            <div key={kind} className="appearance-kind">
              <div className="appearance-kind-name" aria-hidden="true">
                {KIND_WORDS[kind]}
              </div>
              <RadioRows label={`${KIND_WORDS[kind]} theme`} data-testid={`color-themes-${kind}`}>
                {COLOR_THEMES.filter((one) => one.kind === kind).map((one) => (
                  <RadioRow
                    key={one.id}
                    checked={appearance[kind] === one.id}
                    marked={drawn === one.id}
                    onChoose={() => chooseColorTheme(one.id)}
                    data-testid={`color-theme-${one.id}`}
                    data-drawn={drawn === one.id || undefined}
                    data-autofocus={drawn === one.id || undefined}
                  >
                    <span className="ui-theme-preview" data-theme-preview={one.id} aria-hidden="true">
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
                    <span>{one.name}</span>
                  </RadioRow>
                ))}
              </RadioRows>
            </div>
          ))}
        </div>
        <p className="ui-meta" data-testid="color-theme-says">
          {colorThemeSays(theme, appearance.light, appearance.dark)}
        </p>
      </div>

      <TerminalText family={font.family} size={font.size} />

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
            Colors are set in <code>config.json</code> in the data folder, under <code>appearance.colors</code>: <code>"accent": "#rrggbb"</code> for every theme, or <code>"[nord]": {'{ … }'}</code> for one theme alone. The names are the
            page’s color tokens, listed in docs/design.md, and only six-digit colors are taken.
          </p>
          {setByHand.length > 0 && (
            <p data-testid="colors-set">
              Set by hand for {nameOf(drawn)}: {setByHand.join(', ')}.
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
