import { useEffect, useState } from 'react';
import { sortedProjects, type Project } from '@aubergine/shared';
import { api } from '../api';
import { ColorButton } from '../ColorButton';
import { useApp } from '../store';
import { goToProject, waitingIn } from './projects';

/**
 * The projects there are: rename, color, the folder new terminals start in,
 * order; archive, reopen, remove. And a new one. Everything here is drawn
 * from the page's own state, which follows the change events.
 */
export function ProjectsScreen() {
  const open = useApp((s) => s.panel === 'projects');
  const whole = useApp((s) => s.whole);
  const wantsNew = useApp((s) => (s.ask?.kind === 'new-project' ? s.ask : null));
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The project whose running terminals need a decision before it is archived. */
  const [deciding, setDeciding] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setDeciding(null);
    }
  }, [open]);
  useEffect(() => {
    if (wantsNew) useApp.getState().asked(wantsNew.tick);
  }, [wantsNew]);
  if (!open || !whole) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const doing = (work: Promise<unknown>): void => {
    setError(null);
    void work.catch((e: unknown) => setError((e as Error).message));
  };
  const projects = sortedProjects(whole);
  const add = (): void => {
    const called = name.trim();
    if (called === '') return setError('A project needs a name.');
    doing(
      api.addProject({ name: called, ...(folder.trim() ? { defaultFolder: folder.trim() } : {}) }).then((made) => {
        setName('');
        setFolder('');
        close();
        // The state has it by the time the answer is here, or a moment later.
        window.setTimeout(() => goToProject(made.id), 50);
      }),
    );
  };
  const archive = (project: Project, sessions?: 'park' | 'end'): void => {
    const running = whole.sessions.some((s) => s.projectId === project.id && s.state === 'open');
    if (running && sessions === undefined) return setDeciding(project.id);
    setDeciding(null);
    doing(api.archiveProject(project.id, sessions));
  };
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
      <div className="dialog sheet projects-screen" role="dialog" aria-label="Projects" data-testid="projects-screen">
        <header className="sheet-head">
          <h2>Projects</h2>
          <button type="button" className="quiet" onClick={close} data-testid="projects-close">
            Close
          </button>
        </header>
        <p className="sheet-note">
          Each project has its own canvases, terminals, queue, schedules and rules, in this one server. What is shared between them is on the{' '}
          <button type="button" className="quiet" onClick={() => useApp.getState().togglePanel('sharing')}>
            Sharing
          </button>{' '}
          page.
        </p>
        <ul className="project-list">
          {projects.map((project, index) => {
            const canvases = whole.canvases.filter((c) => c.projectId === project.id).length;
            const running = whole.sessions.filter((s) => s.projectId === project.id && s.state !== 'exited').length;
            const waiting = project.state === 'open' ? waitingIn(whole, project.id) : 0;
            return (
              <li key={project.id} className="project-item" data-testid="project-item" data-project={project.id} data-state={project.state}>
                <input
                  className="project-item-name"
                  defaultValue={project.name}
                  key={project.name}
                  maxLength={80}
                  aria-label={`Name of the project ${project.name}`}
                  onBlur={(e) => e.target.value.trim() !== '' && e.target.value.trim() !== project.name && doing(api.changeProject(project.id, { name: e.target.value.trim() }))}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  data-testid="project-item-name"
                />
                <ColorButton value={project.color as never} onChange={(color) => doing(api.changeProject(project.id, { color }))} />
                <input
                  className="project-item-folder"
                  defaultValue={project.defaultFolder ?? ''}
                  key={`folder ${project.defaultFolder ?? ''}`}
                  placeholder="Folder new terminals start in (optional)"
                  aria-label={`The folder new terminals of ${project.name} start in`}
                  onBlur={(e) => (e.target.value.trim() || null) !== project.defaultFolder && doing(api.changeProject(project.id, { defaultFolder: e.target.value.trim() || null }))}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  data-testid="project-item-folder"
                />
                <span className="sheet-note project-item-facts">
                  {project.state === 'archived' ? 'archived · ' : ''}
                  {canvases} {canvases === 1 ? 'canvas' : 'canvases'}, {running} running{waiting > 0 ? `, ${waiting} waiting for you` : ''}
                </span>
                <span className="project-item-actions">
                  {project.state === 'open' && (
                    <>
                      <button type="button" className="quiet" onClick={() => (close(), goToProject(project.id))} data-testid="project-go">
                        Go to
                      </button>
                      <button type="button" className="quiet" disabled={index === 0} aria-label={`Move ${project.name} up`} onClick={() => doing(api.changeProject(project.id, { before: projects[index - 1]?.id ?? null }))}>
                        ↑
                      </button>
                      <button type="button" className="quiet" disabled={index === projects.length - 1} aria-label={`Move ${project.name} down`} onClick={() => doing(api.changeProject(project.id, { before: projects[index + 2]?.id ?? null }))}>
                        ↓
                      </button>
                      <button type="button" className="quiet" onClick={() => archive(project)} data-testid="project-archive">
                        Archive
                      </button>
                    </>
                  )}
                  {project.state === 'archived' && (
                    <>
                      <button type="button" onClick={() => doing(api.reopenProject(project.id))} data-testid="project-reopen">
                        Reopen
                      </button>
                      <button type="button" className="quiet" onClick={() => doing(api.removeProject(project.id))} data-testid="project-remove">
                        Remove for good
                      </button>
                    </>
                  )}
                </span>
                {deciding === project.id && (
                  <p className="project-deciding" role="alert" data-testid="project-deciding">
                    This project still has sessions: say whether to park them or end them.{' '}
                    <button type="button" onClick={() => archive(project, 'park')} data-testid="project-archive-park">
                      Park them
                    </button>{' '}
                    <button type="button" className="quiet" onClick={() => archive(project, 'end')} data-testid="project-archive-end">
                      End them
                    </button>{' '}
                    <button type="button" className="quiet" onClick={() => setDeciding(null)}>
                      Cancel
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="queue-rule-form project-new-form" data-testid="project-new-form">
          <input value={name} maxLength={80} placeholder="A new project’s name" aria-label="Name of the new project" autoFocus={wantsNew !== null} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="project-new-name" />
          <input value={folder} placeholder="Folder its terminals start in (optional)" aria-label="Folder of the new project" onChange={(e) => setFolder(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="project-new-folder" />
          <button type="button" onClick={add} data-testid="project-new-add">
            Add the project
          </button>
        </div>
        <p className="sheet-note">An archived project is out of the switcher and starts nothing: no task, no schedule, no rule. It can be reopened. It is removed for good only when it holds nothing.</p>
        {error && (
          <p className="dialog-error" role="alert" data-testid="projects-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
