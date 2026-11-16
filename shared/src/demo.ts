import type { AppState } from './entities';

/**
 * The demo is found by what is written on its canvas: a label that marks the
 * canvas, and one label for each thing the demo made. Both the server (to
 * remove exactly that) and the browser (to point at it) read them here.
 */

export const DEMO_CANVAS_NAME = 'Demo';
/** The label that marks the demo's canvas. */
export const DEMO_LABEL = 'aubergine.demo';
/** The sessions of the demo, by the part each plays. */
export const DEMO_PARTS = ['shell', 'fixing', 'waiting', 'checklist', 'parked'] as const;
export type DemoPart = (typeof DEMO_PARTS)[number];
export const demoLabel = (what: DemoPart | 'run' | 'checklistRun'): string => `${DEMO_LABEL}.${what}`;

export interface DemoParts {
  canvasId: string;
  /** Its sessions that still exist. */
  sessions: Partial<Record<DemoPart, string>>;
  /** The run of the "Fix a bug" workflow the first stand-in is on. */
  runId: string | null;
  /** The run of one element that produced a checklist. */
  checklistRunId: string | null;
  /** The draft a stand-in proposed, while it is still there. */
  draftId: string | null;
}

/** What the demo is made of, or null when there is no demo. */
export function demoOf(state: Pick<AppState, 'canvases' | 'sessions' | 'drafts'>): DemoParts | null {
  const canvas = state.canvases.find((c) => c.labels[DEMO_LABEL] !== undefined);
  if (!canvas) return null;
  const sessions: DemoParts['sessions'] = {};
  for (const part of DEMO_PARTS) {
    const id = canvas.labels[demoLabel(part)];
    if (id !== undefined && state.sessions.some((session) => session.id === id)) sessions[part] = id;
  }
  const ids = new Set(Object.values(sessions));
  const draft = state.drafts.find((d) => d.sessionId !== null && ids.has(d.sessionId));
  return { canvasId: canvas.id, sessions, runId: canvas.labels[demoLabel('run')] ?? null, checklistRunId: canvas.labels[demoLabel('checklistRun')] ?? null, draftId: draft?.id ?? null };
}
