import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FOLLOW, PLUGINS_FOLDER, pluginStanding, showControl, type PluginFound, type PluginStanding, type PluginsAnswer } from '@aubergine/shared';
import { ownApi, isSuperseded } from '../api';
import { plainAddress, shownPlain, sizeWords } from '../custom-css';
import { useApp } from '../store';
import { Button, ScreenHead } from '../ui';
import { reportsNow, subscribeToReports, type PluginReport } from './reports';

/** The sentence said at the top of the part and again before one is switched on. It is the plain truth: keep it so. */
export const PLUGIN_WARNING = 'A plugin is code that runs in this page as you. It can read and type into every terminal. Switch on only what you wrote or have read.';

/** What is said of a plugin's state, in words, from where the settings put it and what became of it in this page. Pure. */
export function pluginStateWords(found: Pick<PluginFound, 'notLoaded'>, standing: PluginStanding, report: PluginReport | undefined, plain: boolean): string {
  if (standing === 'not-loaded') return `not loaded: ${showControl(found.notLoaded ?? 'its files could not all be read.')}`;
  if (standing === 'changed') return 'changed since you switched it on: not loaded';
  if (standing === 'off') return report?.state === 'unloaded' ? 'off. Reload the page to be sure it is gone' : 'off';
  if (report?.state === 'failed') return `failed: ${report.message}`;
  if (plain) return `${standing === 'following' ? 'on, following changes' : 'on'}, and left out of this page: it was opened without plugins`;
  return standing === 'following' ? 'on, following changes' : 'on';
}

/** A plugin's files in words: how many, and their size together. Pure. */
export const filesWords = (found: Pick<PluginFound, 'files'>): string => {
  const bytes = found.files.reduce((sum, file) => sum + file.bytes, 0);
  return `${found.files.length} ${found.files.length === 1 ? 'file' : 'files'}, ${sizeWords(bytes)}`;
};

/** Switches one on or off on the own server, and takes what it answered. A refusal is said. */
async function change(id: string, on: string | null): Promise<boolean> {
  try {
    const answer = await ownApi.changePlugin({ id, on });
    useApp.getState().setPlugins(answer);
    return true;
  } catch (error) {
    if (!isSuperseded(error)) useApp.getState().setNotice(`The plugin was not switched ${on === null ? 'off' : 'on'}: ${(error as Error).message}`);
    // What is there now is read again, so that what is shown is what the server has.
    void readAgain(false);
    return false;
  }
}

/** Reads the plugins again on the own server. */
async function readAgain(say: boolean): Promise<void> {
  try {
    const answer: PluginsAnswer = await ownApi.readPlugins();
    useApp.getState().setPlugins(answer);
    if (say) useApp.getState().say(answer.plugins.length === 0 ? 'There are no plugins in the folder.' : `Read ${answer.plugins.length} ${answer.plugins.length === 1 ? 'plugin' : 'plugins'}.`);
  } catch (error) {
    if (!isSuperseded(error)) useApp.getState().setNotice(`The plugins could not be read again: ${(error as Error).message}`);
  }
}

/**
 * Settings → Plugins: the owner's own code that runs in the page. What a plugin can do, said first; then each plugin
 * found with its state and the one thing to do; switching one on asks once, with its files. Plugins are the page's
 * own: the own server's, whatever server is shown.
 */
export function PluginsPart() {
  const answer = useApp((s) => s.plugins);
  const reports = useSyncExternalStore(subscribeToReports, reportsNow, reportsNow);
  const [asking, setAsking] = useState<PluginFound | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const plain = shownPlain();
  const unloaded = answer.plugins.some((found) => reports.get(found.id)?.state === 'unloaded' && answer.on[found.id] === undefined);

  const act = (id: string, on: string | null): void => {
    setBusy(id);
    void change(id, on).finally(() => setBusy(null));
  };

  return (
    <section className="settings-plugins" data-testid="settings-plugins">
      <h3>Plugins</h3>
      <p data-testid="plugins-warning">{PLUGIN_WARNING}</p>
      <p className="ui-meta" data-testid="plugins-where">
        Each is a folder in {answer.folder ? <code>{answer.folder}</code> : <><code>{PLUGINS_FOLDER}</code> in the data folder</>}, with a plugin.json. <code>aubergine plugin new &lt;id&gt;</code> writes one to start from. A plugin whose files change does not run until you switch it on again.
      </p>
      {answer.problems.length > 0 && (
        <ul className="ui-meta plugin-problems" data-testid="plugins-problems">
          {answer.problems.map((problem) => (
            <li key={problem}>{showControl(problem)}</li>
          ))}
        </ul>
      )}
      {answer.plugins.length === 0 ? (
        <p data-testid="plugins-none">There are no plugins in the folder yet.</p>
      ) : (
        <ul className="device-list" data-testid="plugin-list">
          {answer.plugins.map((found) => {
            const switched = answer.on[found.id];
            const standing = pluginStanding(found, switched);
            const words = pluginStateWords(found, standing, reports.get(found.id), plain);
            const isOn = standing === 'on' || standing === 'following';
            return (
              <li key={found.id} className="device-row plugin-row" data-testid="plugin-row" data-plugin-id={found.id} data-standing={standing}>
                <div className="device-text">
                  <span className="device-name">
                    {showControl(found.name)}
                    {found.manifest ? ` ${showControl(found.manifest.version)}` : ''}
                  </span>
                  <span className="ui-meta">
                    {PLUGINS_FOLDER}/{found.id} · {filesWords(found)}
                  </span>
                  <span className="ui-meta" data-testid="plugin-state">
                    {words}
                  </span>
                  {found.problems.map((problem) => (
                    <span key={problem} className="ui-meta" data-testid="plugin-problem">
                      {showControl(problem)}
                    </span>
                  ))}
                  {isOn && (
                    <label className="ui-check">
                      <input type="checkbox" checked={standing === 'following'} disabled={busy === found.id} onChange={(e) => act(found.id, e.target.checked ? FOLLOW : found.digest)} data-testid="plugin-follow" />
                      <span>Follow changes while I write it</span>
                    </label>
                  )}
                </div>
                {standing === 'off' && (
                  <Button onClick={() => setAsking(found)} aria-label={`Switch on ${found.name}`} data-testid="plugin-switch-on">
                    Switch on…
                  </Button>
                )}
                {standing === 'changed' && (
                  <Button onClick={() => setAsking(found)} aria-label={`Switch on ${found.name} again`} data-testid="plugin-switch-on">
                    Switch on again…
                  </Button>
                )}
                {isOn && (
                  <Button kind="quiet" busy={busy === found.id} onClick={() => act(found.id, null)} aria-label={`Switch off ${found.name}`} data-testid="plugin-switch-off">
                    Switch off
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {unloaded && (
        <p className="settings-line" data-testid="plugins-reload">
          <span>What a plugin did past the plugin API stays on the page until it is loaded again. Reload the page to be sure it is gone.</span>
          <Button onClick={() => location.reload()} data-testid="plugins-reload-button">
            Reload
          </Button>
        </p>
      )}
      <div className="settings-line">
        <Button
          kind="quiet"
          busy={reading}
          onClick={() => {
            setReading(true);
            void readAgain(true).finally(() => setReading(false));
          }}
          data-testid="plugins-read-again"
        >
          Read the plugins again
        </Button>
        <a href={plainAddress()} data-testid="plugins-plain">
          Open without plugins and your stylesheet
        </a>
      </div>
      {asking && (
        <SwitchOnDialog
          found={asking}
          close={() => setAsking(null)}
          confirm={async () => {
            const ok = asking.digest !== null && (await change(asking.id, asking.digest));
            if (ok) setAsking(null);
          }}
        />
      )}
    </section>
  );
}

/** The one question before a plugin runs: its files and their sizes, and the sentence again. */
function SwitchOnDialog({ found, close, confirm }: { found: PluginFound; close: () => void; confirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    returnTo.current = document.activeElement;
    box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => (returnTo.current as HTMLElement | null)?.focus?.();
  }, []);
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet plugin-dialog" role="dialog" data-part="dialog" aria-label={`Switch on ${found.name}`} ref={box} data-testid="plugin-dialog">
        <ScreenHead title={`Switch on ${showControl(found.name)}`} onClose={close} closeTestid="plugin-dialog-close" />
        <p data-testid="plugin-dialog-warning">{PLUGIN_WARNING}</p>
        <p className="ui-meta">
          These files in {PLUGINS_FOLDER}/{found.id} run as they are now. If any of them changes, the plugin is not loaded until you switch it on again.
        </p>
        <ul className="plugin-files" data-testid="plugin-files">
          {found.files.map((file) => (
            <li key={file.name}>
              <code>{file.name}</code> <span className="ui-meta">{sizeWords(file.bytes)}</span>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <Button
            kind="primary"
            busy={busy}
            data-autofocus
            onClick={() => {
              setBusy(true);
              void confirm().finally(() => setBusy(false));
            }}
            data-testid="plugin-dialog-confirm"
          >
            Switch on
          </Button>
          <Button kind="quiet" onClick={close} data-testid="plugin-dialog-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
