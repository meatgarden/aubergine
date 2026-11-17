import { useState } from 'react';
import type { ItemSource, TaskTaker } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';

/** What the form starts from: one task, or several lines that each become one. */
export interface TaskDraft {
  /** One title per task that will be made. */
  titles: string[];
  details: string;
  /** Where each came from, in the same order as the titles; one for all when there is one. */
  sources: ItemSource[];
  /** Called when the tasks were made. */
  after?: () => void | Promise<void>;
}

/**
 * The small form that puts something in the queue: written fresh, or sent
 * there from a line of a checklist or from something written on the owner's
 * list. What it proposes for "who takes it" is the canvas being looked at.
 */
export function TaskForm({ draft, onClose }: { draft: TaskDraft; onClose: () => void }) {
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const [titles, setTitles] = useState(draft.titles);
  const [details, setDetails] = useState(draft.details);
  const [folder, setFolder] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [taker, setTaker] = useState('any');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workflows = [...(app?.workflows ?? [])].filter((w) => w.listed).sort((a, b) => a.name.localeCompare(b.name));
  const canvas = app?.canvases.find((c) => c.id === canvasId);
  const onCanvas = new Set(canvas?.layout.nodes.map((n) => n.sessionId));
  const terminals = (app?.sessions ?? []).filter((s) => onCanvas.has(s.id));

  const add = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const who: TaskTaker = taker === 'any' ? { kind: 'any' } : taker.startsWith('c:') ? { kind: 'new', canvasId: taker.slice(2) } : { kind: 'session', sessionId: taker.slice(2) };
    try {
      for (const [index, title] of titles.entries()) {
        if (title.trim() === '') continue;
        const source = draft.sources[index] ?? draft.sources[0];
        await api.addTask({ title: title.trim().slice(0, 120), ...(details.trim() ? { details: details.trim() } : {}), ...(folder.trim() ? { folder: folder.trim() } : {}), ...(workflowId ? { workflowId } : {}), taker: who, ...(source ? { source } : {}) });
      }
      await draft.after?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="dialog agent-tools task-form" role="dialog" aria-modal="true" aria-label="To the queue" data-testid="task-form">
        <h2>{titles.length === 1 ? 'A task for the queue' : `${titles.length} tasks for the queue`}</h2>
        {titles.map((title, index) => (
          <label key={index} className="wf-field">
            <span>{titles.length === 1 ? 'Title' : `Title ${index + 1}`}</span>
            <input value={title} maxLength={120} autoFocus={index === 0} onChange={(e) => setTitles(titles.map((t, n) => (n === index ? e.target.value : t)))} data-testid="task-title" />
          </label>
        ))}
        <label className="wf-field">
          <span>What to do {titles.length > 1 ? '(for each)' : ''}</span>
          <textarea rows={4} value={details} maxLength={4000} placeholder="For an agent that knows nothing of this. Plain text." onChange={(e) => setDetails(e.target.value)} data-testid="task-details" />
        </label>
        <label className="wf-field">
          <span>Who takes it</span>
          <select value={taker} onChange={(e) => setTaker(e.target.value)} data-testid="task-taker">
            <option value="any">Any terminal whose agent is free</option>
            {canvas && <option value={`c:${canvas.id}`}>A new agent terminal on “{canvas.name}”</option>}
            {terminals.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>
                “{s.name}”, when its agent is free
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Workflow (optional)</span>
          <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} data-testid="task-workflow">
            <option value="">None: it is told as one piece of work</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="wf-field">
          <span>Folder (for a new terminal; optional)</span>
          <input value={folder} spellCheck={false} placeholder="the folder new terminals start in" onChange={(e) => setFolder(e.target.value)} data-testid="task-folder" />
        </label>
        <p className="sheet-note">A new terminal for a task works in a working copy of its own where the folder is in a repository, and in the folder itself where it is not. Nothing starts until you start it, unless you switched that on.</p>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy || titles.every((t) => t.trim() === '')} onClick={() => void add()} data-testid="task-add">
            Add to the queue
          </button>
        </div>
      </div>
    </div>
  );
}
