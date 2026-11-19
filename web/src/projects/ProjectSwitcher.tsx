import { useMemo } from 'react';
import { colorClass, colorStyle } from '../color';
import { runCommand } from '../commands';
import { currentProjectId, useApp } from '../store';
import { goToProject, switcherRows } from './projects';
import { Switcher } from '../ui';

/**
 * To the left of the canvas tabs: the project being looked at, and a menu of
 * the others with how many things wait in each, so that nothing that waits
 * is out of sight. Making a project, the page that lists them and the page
 * that says what is shared are one click from here.
 */
export function ProjectSwitcher() {
  const whole = useApp((s) => s.whole);
  const projectId = useApp(currentProjectId);
  const rows = useMemo(() => (whole ? switcherRows(whole) : []), [whole]);
  if (!whole) return null;
  const current = rows.find((row) => row.project.id === projectId)?.project ?? whole.projects.find((p) => p.id === projectId);
  const elsewhere = rows.filter((row) => row.project.id !== projectId).reduce((sum, row) => sum + row.waiting, 0);
  return (
    <Switcher
      className="project-switcher"
      buttonClassName={`project-current ${colorClass((current?.color ?? 'none') as never)}`}
      style={colorStyle((current?.color ?? 'none') as never)}
      // Said in a word, so that a name alone is not taken for something else.
      label="Project"
      name={current?.name ?? 'Project'}
      nameTestid="project-name"
      title="The project you are looking at. Each project has its own canvases, terminals, queue, schedules and rules."
      testid="project-switcher"
      menuTestid="project-menu"
      extra={
        // What waits in the projects that are not being looked at: said on the button itself.
        elsewhere > 0 && (
          <span className="tab-waiting" title={`${elsewhere} waiting for you in other projects`} data-testid="project-elsewhere">
            {elsewhere}
          </span>
        )
      }
    >
          {rows.map(({ project, waiting }) => (
            <button
              key={project.id}
              type="button"
              role="menuitemradio"
              aria-checked={project.id === projectId}
              data-testid="project-row"
              data-project={project.id}
              onClick={() => project.id !== projectId && goToProject(project.id)}
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
          <button type="button" role="menuitem" onClick={() => runCommand('project.new')} data-testid="project-new">
            New project…
            <small>Its own canvases, terminals, queue, schedules and rules.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => runCommand('project.fromTemplate')} data-testid="project-from-template-open">
            New project from a template…
            <small>Or from a file someone sent you. You read what it holds first.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => runCommand('projects.open')} data-testid="projects-open">
            Projects…
            <small>Rename, color, folders, order; archive, reopen, remove.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => runCommand('sharing.open')} data-testid="sharing-open">
            Sharing…
            <small>What is shared with every project, and what is one project’s own.</small>
          </button>
    </Switcher>
  );
}
