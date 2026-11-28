import { useEffect, useState } from 'react';
import { sortedProjects, type Project, type ProjectTemplate } from '@aubergine/shared';
import { api } from '../api';
import { ColorButton } from '../ColorButton';
import { useApp } from '../store';
import { readForReview, saveAs } from './file-store';
import { goToProject, waitingIn } from './projects';
import { colorClass, colorStyle } from '../color';
import { MenuButton, MenuItem, ScreenHead } from '../ui';
import { ThemeSelect } from '../TerminalTheme';

/**
 * The projects there are: rename, colour, the folder new terminals start in,
 * the color themes the page is drawn in while it is looked at, order;
 * archive, reopen, remove. And a new one. Everything here is drawn
 * from the page's own state, which follows the change events.
 */
export function ProjectsScreen() {
  const open = useApp((s) => s.panel === 'projects');
  const whole = useApp((s) => s.whole);
  const wantsNew = useApp((s) => (s.ask?.kind === 'new-project' || s.ask?.kind === 'project-from-template' ? s.ask : null));
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The project whose running terminals need a decision before it is archived. */
  const [deciding, setDeciding] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const loadTemplates = (): void => void api.projectTemplates().then(setTemplates, () => {});
  useEffect(() => {
    if (open) {
      setError(null);
      setDeciding(null);
      setSaid(null);
      // Read when the page opens, and after one is saved.
      loadTemplates();
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
  const last = projects.length - 1;
  /** Puts a project before the one that stands at `at` now, or at the end. */
  const move = (id: string, at: number): void => doing(api.changeProject(id, { before: projects[at]?.id ?? null }));
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
      <div className="dialog sheet projects-screen" role="dialog" data-part="dialog" aria-label="Projects" data-testid="projects-screen">
        <ScreenHead title="Projects" onClose={close} closeTestid="projects-close" />
        <p className="sheet-note">
          Each project has its own canvases, terminals, queue, schedules and rules. Workflows, saved steps and the library can be shared between them.{' '}
          <button type="button" className="ui-link" onClick={() => useApp.getState().togglePanel('sharing')} data-testid="projects-sharing">
            Sharing
          </button>
        </p>
        <ul className="project-list">
          {projects.map((project, index) => {
            const canvases = whole.canvases.filter((c) => c.projectId === project.id).length;
            const running = whole.sessions.filter((s) => s.projectId === project.id && s.state !== 'exited').length;
            const waiting = project.state === 'open' ? waitingIn(whole, project.id) : 0;
            return (
              <li
                key={project.id}
                className={`project-item${dragging === project.id ? ' dragging' : ''}`}
                data-testid="project-item"
                data-project={project.id}
                data-state={project.state}
                onDragOver={(e) => {
                  if (dragging && dragging !== project.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const moved = dragging;
                  setDragging(null);
                  // Dropped on a project, it goes before it; dropped on one further down, after it.
                  if (moved && moved !== project.id) move(moved, projects.findIndex((p) => p.id === moved) < index ? index + 1 : index);
                }}
              >
                <span
                  className="project-grip"
                  draggable
                  aria-hidden="true"
                  title="Drag to change the order"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', project.name);
                    setDragging(project.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  data-testid="project-grip"
                >
                  ⠿
                </span>
                <span className={`color-dot project-dot ${colorClass(project.color, 'swatch')}`} style={colorStyle(project.color)} aria-hidden="true" />
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
                      <MenuButton label={`More for ${project.name}`} more testid="project-more" menuTestid="project-more-menu">
                        <span className="ui-menu-line project-colour">
                          <span>Color</span>
                          <ColorButton value={project.color as never} onChange={(color) => doing(api.changeProject(project.id, { color }))} againstWindow title="Pick a color for this project" />
                        </span>
                        <MenuItem disabled={index === 0} title={index === 0 ? 'It is the first already.' : undefined} onClick={() => move(project.id, index - 1)} data-testid="project-up">
                          Move up
                        </MenuItem>
                        <MenuItem disabled={index === last} title={index === last ? 'It is the last already.' : undefined} onClick={() => move(project.id, index + 2)} data-testid="project-down">
                          Move down
                        </MenuItem>
                        <span className="ui-menu-divider" role="separator" />
                        <MenuItem
                          hint="A copy to send or keep. Nothing that ran, no credential and no path of this computer is in it."
                          onClick={() => doing(api.exportProject(project.id).then((out) => (saveAs(out.fileName, out.text), setSaid(`“${project.name}” was written to ${out.fileName}.${out.leftOut.length > 0 ? ` Not in it: ${out.leftOut.join(' ')}` : ''}`))))}
                          data-testid="project-export"
                        >
                          Export…
                        </MenuItem>
                        <MenuItem hint="To start other projects from. Its pinned notes are left out." onClick={() => doing(api.saveProjectTemplate(project.id, false).then((made) => (setSaid(`Saved as the template “${made.name}”.`), loadTemplates())))} data-testid="project-save-template">
                          Save as template
                        </MenuItem>
                        <MenuItem onClick={() => archive(project)} data-testid="project-archive">
                          Archive
                        </MenuItem>
                      </MenuButton>
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
                {project.state === 'open' && (
                  <span className="project-item-themes" data-testid="project-themes">
                    {(['light', 'dark'] as const).map((kind) => (
                      <span key={kind} className="project-item-theme">
                        <label htmlFor={`project-theme-${kind}-${project.id}`}>{kind === 'light' ? 'When light' : 'When dark'}</label>
                        <ThemeSelect
                          id={`project-theme-${kind}-${project.id}`}
                          kind={kind}
                          value={project.themes?.[kind] ?? null}
                          none="As the page"
                          onChange={(theme) => (theme ?? null) !== (project.themes?.[kind] ?? null) && doing(api.changeProject(project.id, { themes: { [kind]: theme } }))}
                          data-testid={`project-theme-${kind}`}
                        />
                      </span>
                    ))}
                  </span>
                )}
                {deciding === project.id && (
                  <p className="project-deciding" role="alert" data-testid="project-deciding">
                    This project still has terminals: say whether to park them or end them.{' '}
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
            Add project
          </button>
        </div>
        <h3 className="projects-heading">From a file, or from a template</h3>
        <p className="sheet-note">
          A project file is a copy of a project as it was when someone wrote it out. Reading one in shows you everything it holds first, and makes nothing until you accept. It starts no terminal and no agent unless you say so.
        </p>
        <label className="project-import">
          <span>Read in a project file…</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="A project file to read in"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked) doing(picked.text().then((text) => readForReview(text, `the file ${picked.name}`)));
            }}
            data-testid="project-import"
          />
        </label>
        <ul className="project-list" data-testid="project-templates">
          {templates.map((template) => (
            <li key={template.id} className="project-item" data-testid="project-template" data-template={template.id}>
              <span className="project-template-words">
                <strong>{template.name}</strong> <span className="sheet-note">{template.from === 'app' ? 'comes with Aubergine' : 'yours'} · {template.canvases} {template.canvases === 1 ? 'canvas' : 'canvases'}, {template.terminals} {template.terminals === 1 ? 'terminal' : 'terminals'}</span>
                <br />
                <span className="sheet-note">{template.description}</span>
              </span>
              <button type="button" onClick={() => doing(api.projectTemplate(template.id).then((text) => readForReview(text, `the template “${template.name}”`, name)))} data-testid="project-from-template">
                New project from this…
              </button>
            </li>
          ))}
        </ul>
        {said && (
          <p className="sheet-note" role="status" data-testid="projects-said">
            {said}
          </p>
        )}
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
