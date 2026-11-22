import { useEffect, useMemo, useState } from 'react';
import { sessionsWaiting, shortId, showControl, undescribed, type Session, type WaitingSession } from '@aubergine/shared';
import { api } from '../../api';
import { LinkChip } from '../../links/LinkChip';
import { LinksPart } from '../../links/LinksPart';
import { NotePanel } from '../../NotePanel';
import { RecapBlock } from '../../Recap';
import { SessionMessages } from '../../Messages';
import { TerminalInput } from '../../TerminalInput';
import { markNotesSeen, useUnseenNotes } from '../../notes-seen';
import { atThisComputer, useApp } from '../../store';
import { DOT_WORD, dotTone, rowState } from '../../terminal-rows';
import { MenuButton, MenuItem, StateDot, Tabs } from '../../ui';
import { actOnTerminal, chipOf, terminalActions } from './terminals';

/**
 * The details of one terminal, beside the list. In this order: what the terminal is (its mark, its name, its state)
 * with the one thing most people came to do, going to it; then what it asks of the owner, if anything, and how to
 * answer; then what is known about it, as a list of facts; then its note, its messages and a box that types into it,
 * one of them at a time.
 */

const session = (id: string) => (s: ReturnType<typeof useApp.getState>) => s.app?.sessions.find((x) => x.id === id);

/** What was found about its folder, and the conversation its agent is in, as facts: each a chip, or a short id that is copied whole. */
function foundFacts(found: Session): { key: string; label: string; value: React.ReactNode }[] {
  const facts: { key: string; label: string; value: React.ReactNode }[] = [];
  const at = found.found;
  if (at?.repository) facts.push({ key: 'repository', label: 'Repository', value: at.repositoryUrl ? <LinkChip url={at.repositoryUrl} kind="repository" label={at.repository} about="Found in its folder" testid="fact-repository" /> : showControl(at.repository) });
  if (at?.branch)
    facts.push({
      key: 'branch',
      label: 'Branch',
      value: (
        <button type="button" className="ui-chip fact-copy" title={`${showControl(at.branch)}\nPress to copy`} onClick={() => void navigator.clipboard.writeText(at.branch ?? '').then(() => useApp.getState().say('Copied the branch’s name.'), () => {})} data-testid="fact-branch">
          {showControl(at.branch)}
        </button>
      ),
    });
  if (at?.pullRequest) facts.push({ key: 'pull-request', label: 'Pull request', value: <LinkChip url={at.pullRequest.url} kind="pull-request" label={`PR ${at.pullRequest.number}`} about={showControl(at.pullRequest.title)} state={at.pullRequest.state} testid="fact-pull-request" /> });
  const conversation = found.agent?.conversationId;
  if (conversation)
    facts.push({
      key: 'conversation',
      label: 'Conversation',
      value: (
        <button type="button" className="ui-chip fact-copy" title={`${conversation}\nPress to copy its id`} onClick={() => void navigator.clipboard.writeText(conversation).then(() => useApp.getState().say('Copied the conversation’s id.'), () => {})} data-testid="fact-conversation">
          {shortId(conversation)}
        </button>
      ),
    });
  return facts;
}

/** The head: the same mark and chip as the row, Go to terminal, the row's own menu, and the way out. */
export function DetailsHead({ id, onClose }: { id: string; onClose: () => void }) {
  const found = useApp(session(id));
  const parked = found?.state === 'parked';
  const here = useApp((s) => (s.app ? s.app.canvases.find((c) => c.id === s.canvasId)?.layout.nodes.some((n) => n.sessionId === id) === true : false));
  const canMove = useApp((s) => (s.app?.canvases.length ?? 0) > 1);
  const desktop = useApp(atThisComputer);
  if (!found) return null;
  const tone = dotTone(found, parked);
  const chip = chipOf({ session: found, state: rowState(found) });
  return (
    <header className="panel-drawer-head details-head">
      <StateDot tone={tone} word={tone === 'hollow' ? (found.state === 'exited' ? 'ended' : 'parked') : DOT_WORD[tone]} />
      <h2 className="panel-drawer-title" data-testid="details-name">
        {found.name}
      </h2>
      <span className="details-head-actions">
        {/* Shows the terminal and makes it the selected one. The details stay open. */}
        <button type="button" className="primary" onClick={() => useApp.getState().showSession(id)} title={parked ? 'Brings it back onto this canvas and goes to it' : 'Shows the terminal on its canvas and selects it'} data-testid="details-go">
          Go to terminal
        </button>
        {/* Its state in words stands with the buttons, so that the name has its line to itself. */}
        {chip && (
          <span className={`ui-badge is-${chip.tone}`} data-testid="details-chip">
            {chip.text}
          </span>
        )}
        {/* Against the window: under the button inside the drawer, the menu would lie under the side panel beside it. */}
        <MenuButton more againstWindow label={`More for ${found.name}`} testid="details-more" menuTestid="details-menu">
          {terminalActions(found, { here, parked, canMove, hasNotes: true, desktop })
            .filter((action) => action.command !== undefined)
            .map((action) => (
              <MenuItem key={action.key} onClick={() => action.command && actOnTerminal(id, action.command)}>
                {action.label}
              </MenuItem>
            ))}
        </MenuButton>
        <button type="button" className="quiet" aria-label="Close the details" title="Close (Esc)" onClick={onClose} data-testid="details-close">
          Close
        </button>
      </span>
    </header>
  );
}

/** What a terminal asks of the owner, in its own words, and the way to answer said plainly. Nothing where it asks nothing. */
function Asks({ waiting, onMessages }: { waiting: WaitingSession; onMessages: () => void }) {
  const { session: found, run, why } = waiting;
  const go = (): void => useApp.getState().showSession(found.id);
  const said = found.attention.message;
  const [words, how]: [string, React.ReactNode] =
    why === 'question'
      ? [said ?? 'It waits for your answer.', <>Go to the terminal and type your answer there.</>]
      : why === 'approval'
        ? [said ?? 'Its run waits for your approval.', run ? <button type="button" onClick={() => useApp.getState().viewRun(run.id)} data-testid="details-decide">Review and decide</button> : null]
        : why === 'blocked'
          ? [run?.blockedReason ?? 'Its run is blocked.', <>Go to the terminal to help it on, or see its run.</>]
          : why === 'message'
            ? [found.messages.paused > 0 ? 'It and another terminal have exchanged many messages. Let them go on?' : 'It sent you a message.', <button type="button" onClick={onMessages} data-testid="details-read-message">Read it under Messages</button>]
            : [said ?? 'It has finished.', <>Go to the terminal to see what it did.</>];
  return (
    <section className={`details-asks is-${why === 'finished' ? 'ok' : 'attention'}`} aria-label="What it asks of you" data-testid="details-asks" data-why={why} onDoubleClick={go}>
      <p className="details-asks-words">{words}</p>
      {how && <p className="details-asks-how">{how}</p>}
    </section>
  );
}

export function Details({ id, onClose }: { id: string; onClose: () => void }) {
  const found = useApp(session(id));
  const exists = found !== undefined;
  const run = useApp((s) => s.app?.runs.find((r) => r.sessionId === id));
  // Why it waits for the owner, if it does: the same function the owner's list is made with.
  const waiting = useMemo(() => (found ? (sessionsWaiting([found], run ? [run] : [])[0] ?? null) : null), [found, run]);
  // On its messages where those were asked for, or are what it waits with; on its note otherwise.
  const asked = useApp((s) => (s.drawer?.id === id ? s.drawer.part : undefined));
  const [tab, setTab] = useState<'note' | 'messages' | 'type'>(asked === 'messages' ? 'messages' : 'note');
  useEffect(() => {
    if (asked === 'messages') setTab('messages');
  }, [asked]);
  // The details have one text box in view at a time: while a link is added or changed, the note's summary is read.
  const [linking, setLinking] = useState(false);
  const missing = found ? undescribed(found) : [];
  const entries = found?.noteLog.length ?? 0;
  const unseen = useUnseenNotes(id, entries);
  const forOwner = found?.messages.forOwner ?? 0;
  // The note's entries are seen once its tab has been looked at.
  useEffect(() => {
    if (tab === 'note') markNotesSeen(id, entries);
  }, [id, entries, tab]);
  useEffect(() => {
    if (!exists) onClose();
  }, [exists, onClose]);
  if (!found) return null;
  return (
    <div className="details" data-testid="details">
      {waiting && <Asks waiting={waiting} onMessages={() => setTab('messages')} />}
      <RecapBlock sessionId={id} omit={['note']} more={foundFacts(found)} />
      {/* What its agent would have written where your own words stand: yours stay until you say otherwise. */}
      {(found.suggested.name || found.suggested.summary) && (
        <div className="details-suggested" data-testid="details-suggested">
          {found.suggested.name && (
            <p>
              <span>
                The agent would name it <strong>{showControl(found.suggested.name.value)}</strong>.
              </span>
              <button type="button" className="quiet" onClick={() => void api.useSuggestion(id, { what: 'name' }).catch(() => {})} data-testid="use-name">
                Use this
              </button>
            </p>
          )}
          {found.suggested.summary && (
            <p>
              <span title={showControl(found.suggested.summary.value)}>The agent wrote a summary of its own: “{showControl(found.suggested.summary.value).split('\n')[0]?.slice(0, 120)}”</span>
              <button type="button" className="quiet" onClick={() => void api.useSuggestion(id, { what: 'summary' }).catch(() => {})} data-testid="use-summary">
                Use this
              </button>
            </p>
          )}
        </div>
      )}
      {/* Quietly: its agent has not described it. Nothing is wrong; the name and the summary can be filled in by hand. */}
      {found.agent != null && missing.length > 0 && (
        <p className="details-undescribed" data-testid="details-undescribed">
          Not described by its agent yet: {missing.map((what) => (what === 'name' ? 'it has the name it was made with' : 'it has no summary, or an old one')).join(', and ')}. You can fill these in yourself.
        </p>
      )}
      <LinksPart sessionId={id} typing={linking} onTyping={setLinking} />
      {found.agent != null && (
        <div className="details-links" data-testid="drawer-switched-on">
          <button type="button" className="quiet" onClick={() => useApp.getState().openHistory({ folder: found.cwd ?? null, query: '' })} data-testid="drawer-history">
            Past conversations in this folder…
          </button>
          <button type="button" className="quiet" onClick={() => useApp.getState().showInventory(id)}>
            How this agent is set up…
          </button>
        </div>
      )}
      <div className="details-tabs">
        <Tabs
          label="The note, the messages and typing into this terminal"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'note', label: `Note${tab !== 'note' && unseen > 0 ? ` ${unseen}` : ''}`, testid: 'details-tab-note' },
            { value: 'messages', label: `Messages${forOwner > 0 ? ` ${forOwner}` : ''}`, testid: 'details-tab-messages' },
            { value: 'type', label: 'Type', testid: 'details-tab-type' },
          ]}
        />
      </div>
      {tab === 'note' ? <NotePanel sessionId={id} onClose={onClose} embedded reading={linking} onTyping={() => setLinking(false)} /> : tab === 'messages' ? <SessionMessages sessionId={id} /> : <TerminalInput sessionId={id} reading={linking} onTyping={() => setLinking(false)} />}
    </div>
  );
}
