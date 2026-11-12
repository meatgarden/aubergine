import { z } from 'zod';
import { Id, newId } from './ids';

const Timestamp = z.iso.datetime();
const Name = z.string().trim().min(1).max(80);

export const Organization = z.object({ id: Id, name: Name, createdAt: Timestamp });
export type Organization = z.infer<typeof Organization>;

export const Workspace = z.object({ id: Id, organizationId: Id, name: Name, createdAt: Timestamp });
export type Workspace = z.infer<typeof Workspace>;

export const Project = z.object({ id: Id, workspaceId: Id, name: Name, createdAt: Timestamp });
export type Project = z.infer<typeof Project>;

export const SessionName = Name;

/**
 * `open`: on the canvas with a running shell. `parked`: off the canvas, shell
 * still running. `exited`: the shell ended by itself; the node stays until
 * the user restarts or removes it.
 */
export const SessionState = z.enum(['open', 'parked', 'exited']);
export type SessionState = z.infer<typeof SessionState>;

export const SessionNote = z.string().max(200_000);

/** A terminal session. The running shell itself is owned by the session runtime. */
export const Session = z.object({
  id: Id,
  projectId: Id,
  name: SessionName,
  createdAt: Timestamp,
  state: SessionState.default('open'),
  /** Last known working folder of the foreground process. */
  cwd: z.string().nullable().default(null),
  /** Name of the foreground command, when known. */
  command: z.string().nullable().default(null),
  /** A Markdown note kept with the session. */
  note: SessionNote.default(''),
});
export type Session = z.infer<typeof Session>;

export const NODE_MIN_WIDTH = 280;
export const NODE_MIN_HEIGHT = 160;
export const NODE_DEFAULT_WIDTH = 720;
export const NODE_DEFAULT_HEIGHT = 440;

const Coordinate = z.number().finite().min(-1e7).max(1e7);

/** Where a node sits on the canvas, in canvas units (pixels at 100% zoom). */
export const NodeRect = z.object({
  x: Coordinate,
  y: Coordinate,
  width: z.number().finite().min(NODE_MIN_WIDTH).max(10000),
  height: z.number().finite().min(NODE_MIN_HEIGHT).max(10000),
});
export type NodeRect = z.infer<typeof NodeRect>;

/**
 * A node on the canvas. Layout is kept apart from sessions and points at a
 * session by ID, so either side can change without rewriting the other.
 */
export const LayoutNode = NodeRect.extend({ id: Id, sessionId: Id });
export type LayoutNode = z.infer<typeof LayoutNode>;

export const Layout = z.object({ nodes: z.array(LayoutNode) });
export type Layout = z.infer<typeof Layout>;

/** Everything the canvas shows: the default hierarchy, the sessions and their layout. */
export const CanvasState = z.object({
  organization: Organization,
  workspace: Workspace,
  project: Project,
  sessions: z.array(Session),
  layout: Layout,
});
export type CanvasState = z.infer<typeof CanvasState>;

/** A fresh state with one default organization, workspace and project. */
export function createInitialState(now: Date = new Date()): CanvasState {
  const createdAt = now.toISOString();
  const organization: Organization = { id: newId(), name: 'Personal', createdAt };
  const workspace: Workspace = {
    id: newId(),
    organizationId: organization.id,
    name: 'Default',
    createdAt,
  };
  const project: Project = { id: newId(), workspaceId: workspace.id, name: 'Default', createdAt };
  return { organization, workspace, project, sessions: [], layout: { nodes: [] } };
}
