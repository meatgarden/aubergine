import { z } from 'zod';
import { Id, RULE_EVENT_WORDS, WebhookName, type AppState, type Occasion, type Rule, type RuleAction } from '@aubergine/shared';

/**
 * Kinds of action a rule can take. Registered, like kinds of element and
 * kinds of environment: nothing that stores, lists or fires a rule knows an
 * action by name. Three kinds today: a notification in the open page, a
 * run of one shelf element on a terminal, whose agent uses its own tools,
 * and a webhook: a small signed message to an address the owner wrote into
 * the settings file by hand, which the rule names by its name only. That
 * last one is the only thing here that reaches outside this computer by
 * Aubergine's own hand, and it does so through one module
 * (`webhooks/send.ts`).
 *
 * Not here, on purpose: an action that takes an address of its own, and one
 * that runs a command.
 */

/** How an action ended, for the record: a few words, or those with the status and the webhook's name where it has them. */
export type ActionDone = string | { says: string; status: number; outcome: 'ok' | 'error'; webhook?: string };

/** What an action may name that is not in the state: the names of the webhooks in the settings file. */
export interface ActionKnown {
  webhooks: readonly string[];
}

/** What an action is given to work with. It cannot type, and cannot reach anything but these. */
export interface ActionContext {
  state: AppState;
  /** Asks every open page to notify the owner. Returns how many pages were asked. */
  notify(title: string, body: string): number;
  /** Starts a run of one shelf element, by the existing start. Returns the run's ID. */
  runElement(elementId: string, on: { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string }, task: string): Promise<string>;
  /**
   * Sends the webhook of that name one message about what happened: once, with a body made of IDs, names and fixed
   * words. The action gives a name and nothing else: not an address, not a word of the message.
   */
  sendWebhook(name: string, occasion: Occasion): Promise<ActionDone>;
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
  /** The name of what the action names outside the state (a webhook's name), for the record of a firing; undefined when it names nothing. */
  named?(action: RuleAction): string | undefined;
  /** What the action names outside the state that is not there, in a sentence that stands by itself; null when nothing is missing. */
  missing?(action: RuleAction, known: ActionKnown): string | null;
  /**
   * True for an action that waits on something outside this computer. It is not put in the line the other actions
   * and the starting of tasks wait in: a receiver that is slow holds up nothing but its own message.
   */
  apart?: boolean;
  /** Does it. Returns what it did, in a few words, for the record. */
  run(action: RuleAction, occasion: Occasion, context: ActionContext): Promise<ActionDone>;
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

const Webhook = z.object({ kind: z.literal('webhook'), webhook: WebhookName });

/** Why a rule's webhook cannot be sent because it is not among those the server took at its start. Fixed words and the name the owner wrote. */
export const webhookMissingWords = (name: string): string => `There is no webhook named “${name}” that can be used, so the rule that names it sends nothing. Either none is written under "webhooks" in config.json, or its entry was refused when the server started: aubergine doctor says which.`;

registerActionKind({
  kind: 'webhook',
  title: 'Send a webhook',
  says: 'Sends one small signed message to an address you wrote into the settings file under a name. It says what happened, where and when: IDs, names and fixed words, never what a terminal showed or a task said. One attempt, no second.',
  apart: true,
  problem: (action) => (Webhook.safeParse(action).success ? null : 'Say which webhook to send, by the name it has in the settings file.'),
  missing: (action, known) => {
    const parsed = Webhook.safeParse(action);
    return parsed.success && !known.webhooks.includes(parsed.data.webhook) ? webhookMissingWords(parsed.data.webhook) : null;
  },
  named: (action) => {
    const parsed = Webhook.safeParse(action);
    return parsed.success ? parsed.data.webhook : undefined;
  },
  words: (action) => {
    const parsed = Webhook.safeParse(action);
    return parsed.success ? `send the webhook “${parsed.data.webhook}”` : 'send a webhook';
  },
  run: (action, occasion, context) => context.sendWebhook(Webhook.parse(action).webhook, occasion),
});
