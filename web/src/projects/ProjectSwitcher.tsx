import { useEffect, useMemo, useRef, useState } from 'react';
import { colorClass, colorStyle } from '../color';
import { runCommand } from '../commands';
import { currentProjectId, useApp } from '../store';
import { goToProject, switcherRows } from './projects';

/**
 * To the left of the canvas tabs: the project being looked at, and a menu of
 * the others with how many things wait in each, so that nothing that waits
 * is out of sight. Making a project, the page that lists them and the page
 * that says what is shared are one click from here.
 */
export function ProjectSwitcher() {
  const whole = useApp((s) => s.whole);
  const projectId = useApp(currentProjectId);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState({ left: 8, top: 42 });
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const rows = useMemo(() => (whole ? switcherRows(whole) : []), [whole]);
  if (!whole) return null;
  const current = rows.find((row) => row.project.id === projectId)?.project ?? whole.projects.find((p) => p.id === projectId);
  // What waits in the projects that are not being looked at: said on the button itself.
  const elsewhere = rows.filter((row) => row.project.id !== projectId).reduce((sum, row) => sum + row.waiting, 0);
  const go = (command: Parameters<typeof runCommand>[0]): void => {
    setOpen(false);
    runCommand(command);
  };
  return (
    <span className="project-switcher" ref={root}>
      <button
        type="button"
        className={`project-current ${colorClass((current?.color ?? 'none') as never)}`}
        style={colorStyle((current?.color ?? 'none') as never)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="The project you are looking at. Each project has its own canvases, terminals, queue, schedules and rules."
        ref={button}
        onClick={() => {
          // The tab bar scrolls sideways and cuts off what hangs below it, so the menu is placed against the window.
          const box = button.current?.getBoundingClientRect();
          if (box) setAt({ left: box.left, top: box.bottom + 6 });
          setOpen((v) => !v);
        }}
        data-testid="project-switcher"
      >
        <span className="project-name" data-testid="project-name">
          {current?.name ?? 'Project'}
        </span>
        {elsewhere > 0 && (
          <span className="tab-waiting" title={`${elsewhere} waiting for you in other projects`} data-testid="project-elsewhere">
            {elsewhere}
          </span>
        )}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <span className="toolbar-menu project-menu" role="menu" style={{ left: at.left, top: at.top }} data-testid="project-menu">
          {rows.map(({ project, waiting }) => (
            <button
              key={project.id}
              type="button"
              role="menuitemradio"
              aria-checked={project.id === projectId}
              data-testid="project-row"
              data-project={project.id}
              onClick={() => {
                setOpen(false);
                if (project.id !== projectId) goToProject(project.id);
              }}
            >
              <span className="project-row-name">
                {project.id === projectId ? '● ' : ''}
                {project.name}
                {waiting > 0 && (
                  <span className="tab-waiting" title={`${waiting} waiting for you`} data-testid="project-waiting">
                    {waiting}
                  </span>
                )}
              </span>
              <small>{project.defaultFolder ?? (project.id === projectId ? 'You are here.' : 'Go to this project.')}</small>
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => go('project.new')} data-testid="project-new">
            New project…
            <small>Its own canvases, terminals, queue, schedules and rules.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => go('project.fromTemplate')} data-testid="project-from-template-open">
            New project from a template…
            <small>Or from a file someone sent you. You read what it holds first.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => go('projects.open')} data-testid="projects-open">
            Projects…
            <small>Rename, color, folders, order; archive, reopen, remove.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => go('sharing.open')} data-testid="sharing-open">
            Sharing…
            <small>What is shared with every project, and what is one project’s own.</small>
          </button>
        </span>
      )}
    </span>
  );
}
