import { describe, expect, it } from 'vitest';
import type { ChangeEvent } from './events';
import { RULE_EVENT_WORDS, Rule, RuleEvent, occasionOfTerminal } from './tasks';
import { FileRule } from './project-file';
import { NOTHING_BEFORE, terminalBefore, terminalHappening, type TerminalBefore } from './terminal-happenings';

const A = '01900000-0000-7000-8000-0000000000a1';
const P = '01900000-0000-7000-8000-0000000000f1';
const at = (minute: number): string => `2026-03-10T10:${String(minute).padStart(2, '0')}:00.000Z`;
const attention = (state: string, message: string | null = null): ChangeEvent => ({ type: 'session.attention', sessionId: A, attention: { state, message, at: at(0) } }) as ChangeEvent;
const status = (lastExit: number | null, lastFinishedAt: string | null, commandLine: string | null = null): ChangeEvent => ({ type: 'session.status', sessionId: A, status: { state: 'idle', commandLine, startedAt: null, lastExit, lastFinishedAt, unread: false } }) as ChangeEvent;
const was = (state: TerminalBefore['attention'], finishedAt: string | null = null): TerminalBefore => ({ attention: state, finishedAt });

describe('what a change event means for a terminal', () => {
  const cases: [string, TerminalBefore | undefined, ChangeEvent, { waiting: unknown; finished: unknown; failedWith: unknown } | null, TerminalBefore?][] = [
    ['a terminal nothing is known of starts waiting', undefined, attention('waiting', 'Which branch?'), { waiting: 'began', finished: null, failedWith: null }, was('waiting')],
    ['it still waits, with other words', was('waiting'), attention('waiting', 'Well?'), { waiting: null, finished: null, failedWith: null }, was('waiting')],
    ['it works again', was('waiting'), attention('working'), { waiting: 'ended', finished: null, failedWith: null }, was('working')],
    ['it is looked at', was('waiting'), attention('none'), { waiting: 'ended', finished: null, failedWith: null }, was('none')],
    ['it works and worked', was('working'), attention('working'), { waiting: null, finished: null, failedWith: null }, was('working')],
    ['it waits again after it stopped', was('working'), attention('waiting'), { waiting: 'began', finished: null, failedWith: null }, was('waiting')],
    ['its agent finishes', was('working'), attention('done', 'All green.'), { waiting: null, finished: 'began', failedWith: null }, was('done')],
    ['its agent says so once more', was('done'), attention('done', 'Still green.'), { waiting: null, finished: 'again', failedWith: null }, was('done')],
    ['it finishes from waiting: no longer waiting, and finished', was('waiting'), attention('done'), { waiting: 'ended', finished: 'began', failedWith: null }, was('done')],
    ['it waits after it finished', was('done'), attention('waiting'), { waiting: 'began', finished: null, failedWith: null }, was('waiting')],
    ['a finished one is looked at', was('done'), attention('none'), { waiting: null, finished: null, failedWith: null }, was('none')],
    ['a command ends well', was('none'), status(0, at(1)), { waiting: null, finished: null, failedWith: null }, was('none', at(1))],
    ['a command fails', was('none', at(1)), status(2, at(2), 'make test'), { waiting: null, finished: null, failedWith: 2 }, was('none', at(2))],
    ['the same report again', was('none', at(2)), status(2, at(2), 'make test'), { waiting: null, finished: null, failedWith: null }, was('none', at(2))],
    ['the next command fails too', was('none', at(2)), status(1, at(3)), { waiting: null, finished: null, failedWith: 1 }, was('none', at(3))],
    ['a first report of an old failure, of a terminal not known', undefined, status(1, at(3)), { waiting: null, finished: null, failedWith: 1 }, was('none', at(3))],
    ['a shell that started afresh', was('none', at(3)), status(null, null), { waiting: null, finished: null, failedWith: null }, was('none', null)],
    ['a command running, the last exit still on record', was('none', at(3)), status(1, at(3), 'sleep 5'), { waiting: null, finished: null, failedWith: null }, was('none', at(3))],
    ['a failure keeps what is known of its attention', was('waiting', at(3)), status(7, at(4)), { waiting: null, finished: null, failedWith: 7 }, was('waiting', at(4))],
    ['a rename is none of this', was('waiting'), { type: 'session.renamed', sessionId: A, name: 'x' } as ChangeEvent, null],
    ['a note is none of this', undefined, { type: 'session.noted', sessionId: A, note: 'x' } as ChangeEvent, null],
  ];
  for (const [name, before, event, expected, after] of cases) {
    it(name, () => {
      const happening = terminalHappening(() => before, event);
      if (expected === null) return expect(happening).toBeNull();
      expect(happening).toEqual({ sessionId: A, after, ...expected });
    });
  }

  it('says nothing a terminal showed: not the command, not what the agent said', () => {
    const said = [terminalHappening(() => undefined, status(2, at(2), 'curl MARKER')), terminalHappening(() => undefined, attention('waiting', 'MARKER'))];
    expect(JSON.stringify(said)).not.toContain('MARKER');
  });

  it('starts from what a terminal is', () => {
    expect(terminalBefore({ attention: { state: 'waiting', message: null, at: at(1) }, status: { state: 'idle', commandLine: null, startedAt: null, lastExit: 1, lastFinishedAt: at(1), unread: false } } as never)).toEqual(was('waiting', at(1)));
    expect(NOTHING_BEFORE).toEqual(was('none'));
  });
});

describe('what a rule is told about a terminal', () => {
  const session = { id: A, name: 'Fix login', projectId: P };
  it('is fixed words and the name of the terminal', () => {
    expect(occasionOfTerminal(session, 'terminal.waiting', 1)).toEqual({ id: `terminal.waiting ${A} 1`, event: 'terminal.waiting', sentence: 'The terminal “Fix login” is waiting for you', taskId: null, askId: null, sessionId: A, projectId: P });
    expect(occasionOfTerminal(session, 'terminal.finished', 2).sentence).toBe('The terminal “Fix login” finished');
    expect(occasionOfTerminal(session, 'command.failed', 3).sentence).toBe('A command failed in the terminal “Fix login”');
    // One happening is told from the next.
    expect(occasionOfTerminal(session, 'command.failed', 4).id).not.toBe(occasionOfTerminal(session, 'command.failed', 3).id);
  });
  it('leaves out of a name what is not plain text', () => {
    expect(occasionOfTerminal({ ...session, name: 'Te\u001b[31msts‮' }, 'command.failed', 1).sentence).toBe('A command failed in the terminal “Te[31msts”');
  });
  it('the three events have words, are kept in a rule, and are taken from a project file', () => {
    for (const event of ['terminal.waiting', 'terminal.finished', 'command.failed'] as const) {
      expect(RuleEvent.options).toContain(event);
      expect(RULE_EVENT_WORDS[event]).toMatch(/terminal/);
      expect(Rule.safeParse({ id: A, projectId: P, event, action: { kind: 'notify' }, createdAt: at(1) }).success).toBe(true);
      expect(FileRule.parse({ event, action: { kind: 'notify' } })).toEqual({ event, action: { kind: 'notify' } });
    }
    expect(Object.fromEntries(RuleEvent.options.slice(-3).map((event) => [event, RULE_EVENT_WORDS[event]]))).toEqual({ 'terminal.waiting': 'a terminal starts waiting for you', 'terminal.finished': 'an agent in a terminal finished', 'command.failed': 'a command failed in a terminal' });
    // What was a rule's event before still is: the list only grew.
    expect(RuleEvent.options.slice(0, 6)).toEqual(['task.done', 'task.failed', 'task.needs-owner', 'ask.added', 'schedule.fired', 'schedule.failed']);
  });
});
