import { useMemo } from 'react';
import { forYou } from '@aubergine/shared';
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
  const count = useMemo(() => (whole ? forYou(whole, Date.now(), ended).items.length : 0), [whole, ended]);
  // Workflow files in repositories that were never accepted, or changed since: read from the Workflows screen.
  const files = itemsOfListing(useRepositoryListing()).length;
  const waiting = useWaitingWords();
  // Said apart for whoever asks: how many terminals wait, and how many things wait to be read.
  const waitingCount = useApp((s) => waitingQueue(s.whole?.sessions ?? [], s.whole?.runs ?? []).length);
  const reviews = useApp((s) => (s.whole?.drafts ?? []).filter((d) => d.status === 'waiting').length);
  const total = count + files;
  return (
    <button type="button" className={total > 0 ? 'attention-button' : 'quiet'} onClick={() => runCommand('queue.open')} title={hint('queue.open', [`Everything that waits on you${total > 0 ? `: ${total}` : ''}`, waiting, files > 0 ? `${files} workflow ${files === 1 ? 'file' : 'files'} to read, on the Workflows screen` : ''].filter(Boolean).join('. '))} data-testid="for-you" data-count={total} data-waiting={waitingCount} data-review={reviews + files}>
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
  const screen = (command: Parameters<typeof runCommand>[0], words: string, title: string, testid: string): React.ReactElement => (
    <Button kind="quiet" onClick={() => runCommand(command)} title={hint(command, title)} data-testid={testid}>
      {words}
    </Button>
  );
  return (
    <header className="appbar" data-testid="appbar">
      <span className="brand" data-testid="brand">
        Aubergine
      </span>
      <ProjectSwitcher />
      <span className="appbar-group" role="group" aria-label="Screens of this project">
        {screen('queue.open', 'Queue', 'The tasks for agents, and everything that waits on you', 'toolbar-queue')}
        {screen('board.open', 'Board', 'Every run that is going, by workflow and step; approve or send back from there', 'toolbar-board')}
        {screen('workflows.open', 'Workflows', 'Make, change and run workflows', 'toolbar-workflows')}
        {screen('library.open', 'Library', 'Workflows and steps others published, to read and install', 'toolbar-library')}
      </span>
      <span className="appbar-group appbar-status" role="group" aria-label="What needs you">
        {!live && <span className="warning">Reconnecting…</span>}
        <ForYou />
        {screen('help.show', 'Help', 'What you can do here, and the keyboard shortcuts', 'toolbar-help')}
      </span>
    </header>
  );
}
