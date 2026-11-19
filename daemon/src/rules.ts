import { z } from 'zod';
import { Id, RULE_EVENT_WORDS, type AppState, type Occasion, type Rule, type RuleAction } from '@aubergine/shared';

/**
 * Kinds of action a rule can take. Registered, like kinds of element and
 * kinds of environment: nothing that stores, lists or fires a rule knows an
 * action by name. Two kinds today, and neither reaches outside this
 * computer by Aubergine's own hand: a notification in the open page, and a
 * run of one shelf element on a terminal, whose agent uses its own tools.
 *
 * Not here, on purpose: an action that calls an address, and one that runs
 * a command.
 */

/** What an action is given to work with. It cannot type, and cannot reach anything but these. */
export interface ActionContext {
  state: AppState;
  /** Asks every open page to notify the owner. Returns how many pages were asked. */
  notify(title: string, body: string): number;
  /** Starts a run of one shelf element, by the existing start. Returns the run's ID. */
  runElement(elementId: string, on: { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string }, task: string): Promise<string>;
}

export interface ActionKind {
  kind: string;
  title: string;
  /** What this kind does, in a sentence, for whoever chooses it. */
  says: string;
  /** What is wrong with an action of this kind; null when it can be kept. */
  problem(action: RuleAction, state: AppState): string | null;
  /** The action in words, as part of "When …, …". */
  words(action: RuleAction, state: AppState): string;
  /** Does it. Returns what it did, in a few words, for the record. */
  run(action: RuleAction, occasion: Occasion, context: ActionContext): Promise<string>;
}

const kinds = new Map<string, ActionKind>();
export function registerActionKind(kind: ActionKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterActionKind(kind: string): void {
  kinds.delete(kind);
}
export const actionKind = (kind: string): ActionKind | undefined => kinds.get(kind);
export const actionKinds = (): ActionKind[] => [...kinds.values()];

/** A rule in a sentence: `When a task is done, notify me in the open page.` */
export function ruleWords(rule: Pick<Rule, 'event' | 'action'>, state: AppState): string {
  const kind = kinds.get(rule.action.kind);
  return `When ${RULE_EVENT_WORDS[rule.event]}, ${kind ? kind.words(rule.action, state) : `do something this version does not know (${rule.action.kind})`}.`;
}

registerActionKind({
  kind: 'notify',
  title: 'Notify me',
  says: 'A notification from the open Aubergine page, with the sentence of what happened. Nothing leaves this computer. The browser asks your permission once, when you switch notifications on.',
  problem: () => null,
  words: () => 'notify me in the open page',
  run: async (_action, occasion, context) => {
    const pages = context.notify('Aubergine', occasion.sentence);
    return pages > 0 ? `asked ${pages} open ${pages === 1 ? 'page' : 'pages'} to notify` : 'no page was open to notify';
  },
});

const RunElement = z.object({
  kind: z.literal('run-element'),
  elementId: Id,
  on: z.discriminatedUnion('kind', [z.object({ kind: z.literal('session'), sessionId: Id }), z.object({ kind: z.literal('new'), canvasId: Id })]),
});

registerActionKind({
  kind: 'run-element',
  title: 'Run a step',
  says: 'Starts a run of one of your saved steps, on a terminal you name or a new one, with a short account of what happened as its task. The agent there does the rest with its own tools; Aubergine holds no credential for any app.',
  problem: (action, state) => {
    const parsed = RunElement.safeParse(action);
    if (!parsed.success) return 'Say which saved step to run, and on which terminal or on a new one on which canvas.';
    if (!state.shelf.some((item) => item.id === parsed.data.elementId)) return 'There is no such saved step.';
    const on = parsed.data.on;
    if (on.kind === 'session' && !state.sessions.some((s) => s.id === on.sessionId)) return 'There is no such terminal.';
    if (on.kind === 'new' && !state.canvases.some((c) => c.id === on.canvasId)) return 'There is no such canvas.';
    return null;
  },
  words: (action, state) => {
    const parsed = RunElement.safeParse(action);
    if (!parsed.success) return 'run a step';
    const element = state.shelf.find((item) => item.id === parsed.data.elementId)?.element.name ?? 'a step that is gone';
    const on = parsed.data.on;
    const where = on.kind === 'session' ? `on “${state.sessions.find((s) => s.id === on.sessionId)?.name ?? 'a terminal that is gone'}”` : `on a new terminal on “${state.canvases.find((c) => c.id === on.canvasId)?.name ?? 'a canvas that is gone'}”`;
    return `run “${element}” ${where}`;
  },
  run: async (action, occasion, context) => {
    const parsed = RunElement.parse(action);
    const runId = await context.runElement(parsed.elementId, parsed.on, occasion.sentence);
    return `started run ${runId}`;
  },
});
