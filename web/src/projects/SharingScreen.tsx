import { useEffect, useState } from 'react';
import { openProjects, type SharingPage } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { ScreenHead } from '../ui';

/**
 * What is shared between projects. For each kind of thing that is shared or
 * owned: what a new one is, and where each existing one belongs. The kinds
 * and their words are the server's: a kind added there appears here.
 */
export function SharingScreen() {
  const open = useApp((s) => s.panel === 'sharing');
  const whole = useApp((s) => s.whole);
  // Changes whenever something that can be shared is made, moved or removed.
  const stamp = useApp((s) => (s.whole ? `${JSON.stringify(s.whole.sharing)} ${s.whole.workflows.map((w) => `${w.id}${w.projectId}`).join()} ${s.whole.shelf.map((e) => `${e.id}${e.projectId}`).join()} ${s.whole.library.sources.map((x) => `${x.id}${x.projectId}`).join()} ${s.whole.library.installed.map((x) => `${x.id}${x.projectId}`).join()} ${s.whole.tokens.map((t) => `${t.id}${t.projectId}${t.revokedAt}`).join()}` : ''));
  const [page, setPage] = useState<SharingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.getSharing().then(
      (found) => !cancelled && setPage(found),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [open, stamp]);
  if (!open || !whole) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const doing = (work: Promise<SharingPage>): void => {
    setError(null);
    void work.then(setPage, (e: unknown) => setError((e as Error).message));
  };
  const projects = openProjects(whole);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet sharing-screen" role="dialog" data-part="dialog" aria-label="Sharing" data-testid="sharing-screen">
        <ScreenHead title="Sharing" onClose={close} closeTestid="sharing-close" />
        <p className="sheet-note">
          What is listed here can be shared with every project or kept to one. Canvases, terminals, tasks, schedules and rules are always one project’s. Moving something here never stops a run that is going.
        </p>
        {(page?.kinds ?? []).map((kind) => (
          <section key={kind.kind} className="sharing-kind" data-testid="sharing-kind" data-kind={kind.kind}>
            <h3>{kind.title}</h3>
            <p className="sheet-note">{kind.says}</p>
            <label className="wf-inline">
              <span>New ones are</span>
              <select value={kind.default} aria-label={`${kind.title}: what new ones are`} onChange={(e) => doing(api.changeSharing(kind.kind, e.target.value as 'shared' | 'project'))} data-testid="sharing-default">
                <option value="shared">shared with every project</option>
                <option value="project">kept to the project they are made in</option>
              </select>
            </label>
            <ul className="sharing-things">
              {kind.things.length === 0 && <li className="sheet-note">None yet.</li>}
              {kind.things.map((thing) => (
                <li key={thing.id} data-testid="sharing-thing" data-name={thing.name}>
                  <span>{thing.name}</span>
                  <select value={thing.projectId ?? ''} aria-label={`Where “${thing.name}” belongs`} onChange={(e) => doing(api.moveSharedThing(kind.kind, thing.id, e.target.value || null))} data-testid="sharing-where">
                    <option value="">Shared with every project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} only
                      </option>
                    ))}
                    {thing.projectId !== null && !projects.some((p) => p.id === thing.projectId) && <option value={thing.projectId}>{whole.projects.find((p) => p.id === thing.projectId)?.name ?? 'A project that is gone'} only (archived)</option>}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="sheet-note" data-testid="sharing-server">
          {page?.perServer}
        </p>
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
