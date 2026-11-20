import { useMemo } from 'react';
import { forYou, type PageName } from '@aubergine/shared';
import { useWaitingWords } from './AttentionQueue';
import { waitingQueue } from './attention';
import { runCommand } from './commands';
import { ProjectSwitcher } from './projects/ProjectSwitcher';
import { itemsOfListing, useRepositoryListing } from './review/repository-source';
import { hint } from './shortcuts';
import { useApp } from './store';
import { useEndedRuns } from './workflows/ended-runs';
import { Button } from './ui';

/**
 * The one thing in the bar for what waits on the owner: a count, in the colour of waiting while it is not zero.
 * It opens the owner's list, which holds the terminals that wait, the drafts to read and the rest.
 */
function ForYou() {
  const whole = useApp((s) => s.whole);
  const ended = useEndedRuns((e) => e.items);
  // One number from one source: the items of the owner's list, over every project. The Queue's list is the same function.
  const list = useMemo(() => (whole ? forYou(whole, Date.now(), ended) : null), [whole, ended]);
  const total = list?.items.length ?? 0;
  const waiting = useWaitingWords();
  // Said apart for whoever asks: how many terminals wait, and how many things wait to be read.
  const waitingCount = useApp((s) => waitingQueue(s.whole?.sessions ?? [], s.whole?.runs ?? []).length);
  const reviews = useApp((s) => (s.whole?.drafts ?? []).filter((d) => d.status === 'waiting').length);
  // Workflow files in repositories that were never accepted, or changed since: they are read from the Workflows page, and are not items of the list.
  const files = itemsOfListing(useRepositoryListing()).length;
  return (
    <button type="button" className={total > 0 ? 'attention-button' : 'quiet'} onClick={() => runCommand('queue.open')} title={hint('queue.open', [`Everything that waits on you${total > 0 ? `: ${total}` : ''}`, waiting].filter(Boolean).join('. '))} data-testid="for-you" data-count={total} data-waiting={waitingCount} data-review={reviews + files}>
      For you
      {total > 0 && (
        <span className="for-you-count" data-testid="for-you-count">
          {total}
        </span>
      )}
    </button>
  );
}

/**
 * The top of the page: where you are (the name, the project), the screens that are
 * about the whole project, and at the right what waits for you. The canvases have
 * the row below to themselves, and the bar over a canvas holds only what acts on that canvas.
 */
export function AppBar() {
  const live = useApp((s) => s.live);
  useApp((s) => s.settings.shortcuts);
  const page = useApp((s) => s.page);
  // A place in the app: the one being looked at is marked, and pressing it again leads back to the canvas.
  const screen = (command: Parameters<typeof runCommand>[0], words: string, title: string, testid: string, place?: PageName | null): React.ReactElement => (
    <Button kind="quiet" className={place !== undefined ? 'appbar-place' : undefined} aria-current={place !== undefined && place === page ? 'page' : undefined} onClick={() => runCommand(command)} title={hint(command, title)} data-testid={testid}>
      {words}
    </Button>
  );
  return (
    <header className="appbar" data-testid="appbar">
      <span className="brand" data-testid="brand">
        Aubergine
      </span>
      <ProjectSwitcher />
      {/* One line under all of the places, from the first to the last; the stretch under the one being looked at is the accent. */}
      <nav className="appbar-group appbar-places" aria-label="Places of this project">
        {screen('canvas.show', 'Canvas', 'The canvas, as you left it', 'toolbar-canvas', null)}
        {screen('queue.open', 'Queue', 'The tasks for agents, and everything that waits on you', 'toolbar-queue', 'queue')}
        {screen('board.open', 'Board', 'Every run that is going, by workflow and step; approve or send back from there', 'toolbar-board', 'board')}
        {screen('workflows.open', 'Workflows', 'Make, change and run workflows', 'toolbar-workflows', 'workflows')}
        {screen('library.open', 'Library', 'Workflows and steps others published, to read and install', 'toolbar-library', 'library')}
      </nav>
      <span className="appbar-group appbar-status" role="group" aria-label="What needs you">
        {!live && <span className="warning">Reconnecting…</span>}
        <ForYou />
        {screen('settings.show', 'Settings', 'How the page looks, and notifications', 'toolbar-settings')}
        {screen('help.show', 'Help', 'What you can do here, and the keyboard shortcuts', 'toolbar-help')}
      </span>
    </header>
  );
}
