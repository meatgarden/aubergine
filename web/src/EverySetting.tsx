import { SCHEMA_LINE, isPageWritten } from '@aubergine/shared';
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { CONTROL_OF, everySetting, findSettings, type ShownGroup, type ShownSetting } from './every-setting';
import { atThisComputer, useApp } from './store';
import { Button, Row, TextField } from './ui';

/** Words from the schema, with what is between backticks as code. Text nodes only. */
function Described({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}
    </>
  );
}

/**
 * Settings → Every setting: every key of the settings file, from its schema, with its value now. It changes nothing:
 * a key the page writes is changed by its control above, which pressing its row brings into view; a key written by
 * hand has the line to add to the file, to copy. Folded until it is asked for (`settings.all` opens it).
 */
export function EverySettingPart() {
  const settings = useApp((s) => s.settings);
  const at = useApp((s) => s.settingsAt);
  const here = useApp(atThisComputer);
  const linked = useApp((s) => s.server !== null);
  const file = useApp((s) => s.settingsFile);
  const ownFile = useApp((s) => s.ownSettingsFile);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Asked for by its command: open before Settings gives the keyboard to the search.
  useLayoutEffect(() => {
    if (at === 'all') setOpen(true);
  }, [at]);
  const groups = useMemo(() => everySetting(settings), [settings]);
  const found = findSettings(groups, search);
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const where = file ?? 'config.json in the data folder';
  return (
    <section data-testid="settings-all">
      <h3>Every setting</h3>
      <p className="ui-meta" data-testid="settings-all-says">
        {linked && ownFile !== null && ownFile !== file ? (
          <>
            The settings file is <code data-testid="settings-file">{where}</code> on the server shown, and <code>{ownFile}</code> for what is this page’s own; <code>{SCHEMA_LINE}</code> in either lets an editor describe and complete each key.
          </>
        ) : (
          <>
            The settings file is <code data-testid="settings-file">{where}</code>, and <code>{SCHEMA_LINE}</code> in it lets an editor describe and complete each key.
          </>
        )}
      </p>
      <details className="ui-fold every-setting" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="settings-all-fold">
        <summary>All {count} settings</summary>
        {open && (
          <>
            <TextField
              type="search"
              className="every-setting-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the settings"
              aria-label="Search the settings"
              spellCheck={false}
              data-autofocus
              data-testid="settings-all-search"
            />
            {found.length === 0 ? (
              <p data-testid="settings-all-none">No setting has “{search.trim()}” in its key or what it is.</p>
            ) : (
              found.map((group) => <Group key={group.key} group={group} linked={linked} here={here} />)
            )}
          </>
        )}
      </details>
    </section>
  );
}

function Group({ group, linked, here }: { group: ShownGroup; linked: boolean; here: boolean }) {
  return (
    <div className="every-setting-group" data-testid={`settings-group-${group.key}`}>
      {/* A key at the top of the file is its own row: its heading would say the same again. */}
      {(group.rows.length !== 1 || group.rows[0]?.key !== group.key || (linked && group.pageOwn)) && (
        <h4>
          <code>{group.key}</code>
          {linked && group.pageOwn && <span className="every-setting-own"> · this page’s own</span>}
        </h4>
      )}
      <div className="every-setting-list">
        {group.rows.map((row) => (
          <Setting key={row.key} row={row} here={here} />
        ))}
      </div>
    </div>
  );
}

function Setting({ row, here }: { row: ShownSetting; here: boolean }) {
  const settings = useApp((s) => s.settings);
  const [failed, setFailed] = useState(false);
  const body = (action: ReactNode) => (
    <span className="every-setting-body">
      <span className="every-setting-head">
        <code className="every-setting-key">{row.key}</code>
        <span className="every-setting-value" title={row.whole} data-testid="setting-value">
          {row.words}
        </span>
      </span>
      <span className="every-setting-action">{action}</span>
      <span className="every-setting-says">
        <Described text={row.description} />
      </span>
      <span className="every-setting-default ui-meta" data-testid="setting-default">
        {row.differs ? `Default: ${row.defaultWords}` : 'Default'}
      </span>
      {failed && (
        <span className="every-setting-says" role="alert">
          The browser did not let the line be copied: it is <code>{row.line}</code>
        </span>
      )}
    </span>
  );
  if (row.byPage && isPageWritten(row.key)) {
    const control = CONTROL_OF[row.key](settings);
    // What acts on this computer's desktop is not offered elsewhere: its row says so and is not pressed.
    const shown = row.key !== 'desktop.openNew' || here;
    if (!shown)
      return (
        <div className="every-setting-row" data-testid={`setting-${row.key}`}>
          {body('Changed in Settings at its computer')}
        </div>
      );
    return (
      <Row
        className="every-setting-row"
        onClick={() => {
          const target = document.querySelector<HTMLElement>(`[data-testid="settings-dialog"] [data-testid="${control}"]`);
          target?.scrollIntoView({ block: 'center' });
          target?.focus();
        }}
        data-testid={`setting-${row.key}`}
      >
        {body('Changed above')}
      </Row>
    );
  }
  return (
    <div className="every-setting-row" data-testid={`setting-${row.key}`}>
      {body(
        <Button
          kind="quiet"
          title={row.line}
          onClick={() => {
            void navigator.clipboard.writeText(row.line).then(
              () => {
                setFailed(false);
                useApp.getState().say(`Copied the line for ${row.key}, to add to the settings file.`);
              },
              () => setFailed(true),
            );
          }}
          aria-label={`Copy the line for ${row.key}`}
          data-testid="setting-copy"
        >
          Copy
        </Button>,
      )}
    </div>
  );
}
