import { useState } from 'react';
import { CUSTOM_CSS_FILE } from '@aubergine/shared';
import { plainAddress, readStylesheetAgain, shownPlain, sizeWords } from '../custom-css';
import { useApp } from '../store';
import { setCustomCssOn } from '../theme';
import { Button } from '../ui';

/** Where the owner's stylesheet is, from where the settings file is: `custom.css` beside `config.json`. Pure. */
export function stylesheetFileOf(settingsFile: string | null): string | null {
  if (settingsFile === null || !/config\.json$/.test(settingsFile)) return null;
  return settingsFile.replace(/config\.json$/, CUSTOM_CSS_FILE);
}

/** What is said of the stylesheet now, in one sentence. Pure. */
export function stylesheetSays(found: { bytes: number } | null, problem: string | null, on: boolean, plain: boolean): string {
  if (found === null) return problem ?? 'There is no stylesheet of your own yet: aubergine css new writes one to start from, with the hooks it may rely on.';
  const size = sizeWords(found.bytes);
  if (plain) return `Found (${size}), and left out of this page: it was opened without your stylesheet.`;
  return on ? `Found (${size}), and drawn on this page, after the app’s own.` : `Found (${size}), and switched off: the page is drawn without it.`;
}

/**
 * Settings → Appearance, Your stylesheet: where `custom.css` is, whether one is found and drawn, the switch, Read it
 * again, and the way out when a file breaks the page. The stylesheet is the page's own: the own server's, whatever
 * server is shown.
 */
export function StylesheetPart() {
  const settingsFile = useApp((s) => s.ownSettingsFile);
  const css = useApp((s) => s.customCss);
  const on = useApp((s) => s.settings.appearance.customCss);
  const [reading, setReading] = useState(false);
  const file = stylesheetFileOf(settingsFile);
  const plain = shownPlain();
  return (
    <div className="appearance-part" data-testid="settings-stylesheet">
      <h4>Your stylesheet</h4>
      <p className="ui-meta" data-testid="stylesheet-says">
        {stylesheetSays(css.stylesheet, css.problem, on, plain)}
      </p>
      <p className="ui-meta" data-testid="stylesheet-where">
        {file ? <code>{file}</code> : <>The file <code>{CUSTOM_CSS_FILE}</code> in the data folder</>} restyles anything on the page: it is linked after the app’s own, so a rule there wins over one of the app’s that is as specific. It may rely on the hooks listed in docs/hooks.md, and nothing it names is fetched from another address.
      </p>
      <div className="settings-line">
        <label className="ui-check">
          <input type="checkbox" checked={on} onChange={(e) => setCustomCssOn(e.target.checked)} data-testid="custom-css-on" data-autofocus />
          <span>Draw the page with it</span>
        </label>
        <Button
          kind="quiet"
          busy={reading}
          onClick={() => {
            setReading(true);
            void readStylesheetAgain().finally(() => setReading(false));
          }}
          data-testid="stylesheet-read-again"
        >
          Read it again
        </Button>
      </div>
      <p className="ui-meta">
        If it breaks the page:{' '}
        <a href={plainAddress()} data-testid="stylesheet-plain">
          Open without your stylesheet
        </a>
        , then change the file or switch it off here.
      </p>
    </div>
  );
}
