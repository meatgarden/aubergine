import { useEffect, useState } from 'react';
import { bytesWords, countsWords } from '@aubergine/shared';
import { api } from '../../api';
import { runCommand } from '../../commands';
import { useApp } from '../../store';
import { registerSection } from '../registry';

/** Every working copy there is, on whichever canvas its terminal is, or with its terminal gone: branch, what changed, size. */
function CopiesSection() {
  const environments = useApp((s) => s.app?.environments);
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const sorted = [...(environments ?? [])].sort((a, b) => Number(a.sessionId === null) - Number(b.sessionId === null) || a.sessionName.localeCompare(b.sessionName) || a.id.localeCompare(b.id));
  // Sizes are measured when the list of copies changes, not on a timer.
  const ids = sorted.map((e) => e.id).join(' ');
  useEffect(() => {
    if (ids === '') return;
    let cancelled = false;
    void api.listEnvironments().then((list) => {
      if (!cancelled) setSizes(Object.fromEntries(list.items.flatMap((item) => (item.bytes !== null ? [[item.id, `${item.bytesAtLeast ? 'at least ' : ''}${bytesWords(item.bytes)}`]] : []))));
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return (
    <div className="runs-section" data-testid="copies-section">
      {sorted.length === 0 ? (
        <p className="list-empty">Terminals that work in their own copy of a repository will be listed here.</p>
      ) : (
        <ul className="runs-list">
          {sorted.map((environment) => (
            <li key={environment.id}>
              <button type="button" className="runs-row" title={`${environment.title}. ${environment.words}`} onClick={() => useApp.getState().viewEnvironment(environment.id)} data-testid="copies-row" data-gone={environment.sessionId === null ? 'true' : undefined}>
                <span className="list-state" aria-hidden="true">
                  ⑂
                </span>
                <span className="runs-name">
                  {environment.sessionName}
                  {environment.sessionId === null ? ' (its terminal is gone)' : ''}
                </span>
                <span className="runs-where">
                  {environment.branch ?? environment.title}
                  {' · '}
                  {environment.broken ? 'broken' : environment.changes ? countsWords(environment.changes) : 'not read yet'}
                  {sizes[environment.id] ? ` · ${sizes[environment.id]}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="runs-foot">
        <button type="button" className="quiet" onClick={() => runCommand('terminal.newIn')} data-testid="copies-new">
          New terminal in a working copy…
        </button>
      </div>
    </div>
  );
}

registerSection({
  more: true,
  id: 'copies',
  title: 'Working copies',
  tab: 'Copies',
  order: 25,
  icon: '⑂',
  useCount: () => useApp((s) => s.app?.environments.length ?? 0) || null,
  Component: CopiesSection,
});
