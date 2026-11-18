import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_CANVAS_NAME, DEMO_LABEL, DEMO_PARTS, Element, NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, WORKFLOW_TEMPLATES, demoLabel, demoOf, needsUser, type DemoPart, type DemoStatus, type OwnerCaller } from '@aubergine/shared';
import type { Drafts } from './drafts';
import { ConflictError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { Workflows } from './workflows';

/**
 * The demo: a canvas named "Demo" with a small scene on it, made entirely of
 * stand-ins. Nothing in it is a real agent, nothing leaves this computer,
 * and everything it uses is in a folder of its own in the data folder.
 *
 * What it made is written on the canvas itself (its labels), so removing
 * the demo removes exactly that and nothing else: its sessions, the runs on
 * them, the drafts they proposed, the canvas, the folder.
 *
 * The stand-ins are scripts in `daemon/demo/`. They use the commands a real
 * agent uses (`aubergine workflow`, `aubergine note`, the hooks), so the
 * demo also shows that those work.
 */

type Part = DemoPart;
const PARTS = DEMO_PARTS;
const labelOf = demoLabel;

/** The one element the third stand-in is given to do by itself. */
const WHAT_IS_LEFT = Element.parse({
  id: 'list-what-is-left',
  name: 'List what is left',
  instructions: 'Read the project and list what still has to be done before the sign-in bug can be called fixed.',
  doneWhen: 'Every open item is on the list, one line each.',
  produces: 'checklist',
  origin: { kind: 'demo' },
});

/** Whether something was made by accepting a draft one of these sessions proposed. */
function cameFrom(origin: { kind: string; sessionId?: unknown }, sessions: ReadonlySet<string>): boolean {
  return origin.kind === 'draft' && typeof origin.sessionId === 'string' && sessions.has(origin.sessionId);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Where the stand-ins and the made-up project are, in this checkout. */
export function demoSource(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo');
}

export interface DemoOptions {
  /** The folder the demo may use and remove: `demo` in the data folder. */
  folder: string;
  /** Where the stand-in scripts are. For tests. */
  source?: string;
}

export class Demo {
  private making: Promise<DemoStatus> | null = null;

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly workflows: Workflows,
    private readonly drafts: Drafts,
    private readonly options: DemoOptions,
  ) {}

  private canvas(): { id: string; labels: Record<string, string> } | null {
    return this.hub.state.canvases.find((canvas) => canvas.labels[DEMO_LABEL] !== undefined) ?? null;
  }

  /** What the demo is made of, and whether the scene has settled: every stand-in has done its opening part. */
  status(): DemoStatus {
    const parts = demoOf(this.hub.state);
    if (!parts) return { present: false, ready: false, canvasId: null, sessions: {}, runId: null, checklistRunId: null, draftId: null };
    const state = this.hub.state;
    const run = state.runs.find((r) => r.id === parts.runId);
    const waiting = state.sessions.find((session) => session.id === parts.sessions.waiting);
    const ready =
      // The first stand-in has reported its first step; the second has asked; the third has handed in its list and its draft.
      run !== undefined && run.elements.some((e) => e.state === 'done') && waiting !== undefined && needsUser(waiting.attention) && parts.checklistRunId !== null && !state.runs.some((r) => r.id === parts.checklistRunId) && parts.draftId !== null;
    return { present: true, ready, ...parts };
  }

  /** Makes the demo. Asked again while it is there, it makes nothing and says what is there. */
  make(): Promise<DemoStatus> {
    if (this.canvas()) return Promise.resolve(this.status());
    // Two requests at once make one demo.
    this.making ??= this.build().finally(() => {
      this.making = null;
    });
    return this.making;
  }

  private async build(): Promise<DemoStatus> {
    const source = this.options.source ?? demoSource();
    const project = path.join(this.options.folder, 'project');
    await rm(this.options.folder, { recursive: true, force: true });
    await mkdir(this.options.folder, { recursive: true, mode: 0o700 });
    await cp(path.join(source, 'project'), project, { recursive: true });

    const canvas = this.sessions.createCanvas({ name: DEMO_CANVAS_NAME, labels: { [DEMO_LABEL]: '1' } });
    const labels: Record<string, string> = { [DEMO_LABEL]: '1' };
    const remember = (key: Part | 'run' | 'checklistRun', id: string): void => {
      labels[labelOf(key)] = id;
      // Written down at once, so that a demo that fails half-way can still be removed whole.
      this.sessions.updateCanvas(canvas.id, { labels: { ...labels } });
    };
    try {
      const gap = 40;
      const width = NODE_DEFAULT_WIDTH;
      const height = NODE_DEFAULT_HEIGHT;
      const at = (column: number, row: number): { x: number; y: number; width: number; height: number } => ({ x: column * (width + gap), y: row * (height + gap), width, height });
      const standIn = (script: string): string => `sh ${shellQuote(path.join(source, script))}`;
      // The command is typed the way any new session's is, once its shell is ready. A stand-in's run is started
      // straight after, well before its script gets as far as asking for it; the script waits for it all the same.
      const start = async (part: Part, name: string, rect: ReturnType<typeof at>, command: string, then?: (sessionId: string) => Promise<void>): Promise<string> => {
        const made = await this.sessions.create({ name, canvasId: canvas.id, cwd: project, rect, tags: ['demo'], command });
        remember(part, made.session.id);
        if (then) await then(made.session.id);
        return made.session.id;
      };

      await start('shell', 'Shell · demo project', at(0, 0), 'clear; ls; ./run-tests.sh');

      const fixABug = WORKFLOW_TEMPLATES.find((template) => template.name === 'fix-a-bug');
      if (!fixABug) throw new ConflictError('The "Fix a bug" workflow is missing');
      await start('fixing', 'Stand-in agent · fixing a bug', at(1, 0), standIn('fixing.sh'), async (sessionId) => {
        const run = await this.workflows.startContent({ ...fixABug.content, name: 'Fix a bug (demo)' }, { sessionId, inputs: { task: 'Signing in redirects twice' }, replace: false, typeKickoff: false }, { kind: 'person' }, { kind: 'demo' });
        remember('run', run.run.id);
      });

      await start('waiting', 'Stand-in agent · has a question', at(0, 1), standIn('waiting.sh'));

      await start('checklist', 'Stand-in agent · made a list', at(1, 1), standIn('checklist.sh'), async (sessionId) => {
        const run = await this.workflows.startElement(WHAT_IS_LEFT, { sessionId, inputs: {}, replace: false, typeKickoff: false }, { kind: 'person' });
        remember('checklistRun', run.run.id);
      });

      const parked = await start('parked', 'Parked · yesterday’s logs', at(2, 0), 'clear; echo "A terminal you set aside. Its shell is still running."');
      this.sessions.park(parked);
    } catch (error) {
      await this.remove({ kind: 'owner', sessionId: null }).catch(() => {});
      throw error;
    }
    return this.status();
  }

  /** Removes everything the demo made, and nothing else. A terminal of the owner's own that was put on the demo's canvas is moved to another canvas, running. */
  async remove(by: OwnerCaller): Promise<void> {
    if (this.making) await this.making.catch(() => {});
    const canvas = this.canvas();
    if (!canvas) {
      await rm(this.options.folder, { recursive: true, force: true });
      return;
    }
    const mine = new Set(PARTS.map((part) => canvas.labels[labelOf(part)]).filter((id): id is string => id !== undefined));
    // The drafts its stand-ins handed in.
    for (const draft of [...this.hub.state.drafts]) {
      if (draft.sessionId !== null && mine.has(draft.sessionId)) this.drafts.discard(draft.id, by);
    }
    // The runs on its sessions end with them; ended here first, so that they are gone when this returns.
    for (const run of [...this.hub.state.runs]) {
      if (run.sessionId !== null && mine.has(run.sessionId)) await this.workflows.report(run.id, { type: 'stop' }, { kind: 'person' });
    }
    for (const sessionId of mine) {
      if (this.sessions.has(sessionId)) await this.sessions.close(sessionId);
    }
    // What the owner accepted from a stand-in's draft was the demo's too: an element on the shelf, or a workflow.
    for (const item of [...this.hub.state.shelf]) {
      if (cameFrom(item.element.origin, mine)) this.drafts.removeFromShelf(item.id);
    }
    for (const workflow of [...this.hub.state.workflows]) {
      if (workflow.listed && cameFrom(workflow.origin, mine) && !this.hub.state.runs.some((run) => run.workflowId === workflow.id)) this.workflows.remove(workflow.id);
    }
    // The records that only grow: the demo's past runs and what became of its drafts are taken back, so that
    // no list shows them. Nothing is deleted; a later line says so, and only for what these sessions made.
    await this.workflows.withdrawRuns(mine);
    await this.drafts.withdrawRecords(mine);
    // Whatever else is on the canvas is the owner's: it goes to another canvas and keeps running.
    const now = this.hub.state.canvases.find((c) => c.id === canvas.id);
    if (now) {
      const other = this.sessions.listCanvases().find((c) => c.id !== canvas.id);
      if (!other) throw new ConflictError('The demo canvas is the only canvas; make another first');
      this.sessions.removeCanvas(canvas.id, now.layout.nodes.length > 0 ? { sessions: 'move', to: other.id } : null);
    }
    await rm(this.options.folder, { recursive: true, force: true });
  }
}
