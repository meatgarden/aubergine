import { AttentionQueue } from './AttentionQueue';
import { runCommand } from './commands';
import { ProjectSwitcher } from './projects/ProjectSwitcher';
import { itemsOfListing, useRepositoryListing } from './review/repository-source';
import { hint } from './shortcuts';
import { useApp } from './store';
import { Button } from './ui';

/** How many things written by agents, programs or kept in a repository wait to be read. */
function DraftsWaiting() {
  const drafts = useApp((s) => (s.app?.drafts ?? []).filter((d) => d.status === 'waiting').length);
  // Workflow files in repositories that were never accepted, or changed since.
  const waiting = drafts + itemsOfListing(useRepositoryListing()).length;
  if (waiting === 0) return null;
  return (
    <button type="button" className="attention-button" onClick={() => runCommand('drafts.review')} title="Written by agents or programs, or kept in a repository: waiting for you to read them" data-testid="drafts-waiting">
      {waiting} to review
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
        {screen('queue.open', 'For you and queue', 'Everything that waits on you, and the tasks for agents', 'toolbar-queue')}
        {screen('board.open', 'Board', 'Every run that is going, by workflow and step; approve or send back from there', 'toolbar-board')}
        {screen('workflows.open', 'Workflows', 'Make, change and run workflows', 'toolbar-workflows')}
        {screen('library.open', 'Library', 'Workflows and elements others published, to read and install', 'toolbar-library')}
      </span>
      <span className="appbar-group appbar-status" role="group" aria-label="What needs you">
        {!live && <span className="warning">Reconnecting…</span>}
        <AttentionQueue />
        <DraftsWaiting />
        {screen('help.show', 'Help', 'What you can do here, and the keyboard shortcuts', 'toolbar-help')}
      </span>
    </header>
  );
}
