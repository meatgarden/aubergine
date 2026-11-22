import { Fragment, useCallback, useMemo, useState } from 'react';
import { colorClass, colorStyle } from '../color';
import { runCommand } from '../commands';
import { readProjects, type ProjectsKnown } from '../linking/linking';
import { findServer, hostOf, loadServers, type LinkedServer } from '../servers';
import { currentProjectId, useApp } from '../store';
import { goToProject, switcherRows } from './projects';
import { Switcher } from '../ui';

/** The key under which what is known of the own server's projects is kept while a linked server is shown. */
const OWN = '';

/**
 * To the left of the canvas tabs: the project being looked at, and a menu of
 * the others with how many things wait in each, so that nothing that waits
 * is out of sight. Making a project, the page that lists them and the page
 * that says what is shared are one click from here. Under the projects of
 * the server shown come those of every other server: this page's own, and
 * each one this browser linked, read when the menu opens.
 */
export function ProjectSwitcher() {
  const whole = useApp((s) => s.whole);
  const projectId = useApp(currentProjectId);
  const shownServer = useApp((s) => s.server);
  const rows = useMemo(() => (whole ? switcherRows(whole) : []), [whole]);
  const [servers, setServers] = useState<LinkedServer[]>(loadServers);
  const [known, setKnown] = useState<Record<string, ProjectsKnown>>({});

  // Each time the menu opens: the servers this browser links, and the projects of those that are not shown. Kept in memory only.
  const opened = useCallback(() => {
    const now = loadServers();
    setServers(now);
    const others: (LinkedServer | null)[] = [...(shownServer === null ? [] : [null]), ...now.filter((s) => s.id !== shownServer)];
    setKnown(Object.fromEntries(others.map((s) => [s?.id ?? OWN, { state: 'reading' } as ProjectsKnown])));
    for (const server of others) {
      void readProjects(server).then((found) => setKnown((was) => ({ ...was, [server?.id ?? OWN]: found })));
    }
  }, [shownServer]);

  if (!whole) return null;
  const current = rows.find((row) => row.project.id === projectId)?.project ?? whole.projects.find((p) => p.id === projectId);
  const elsewhere = rows.filter((row) => row.project.id !== projectId).reduce((sum, row) => sum + row.waiting, 0);
  const shown = findServer(servers, shownServer);
  const linked = servers.length > 0 || shown !== null;

  const shownRows = rows.map(({ project, waiting }) => (
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
  ));

  /** The projects of a server that is not shown, as read when the menu opened; one plain line where they could not be. */
  const otherRows = (server: LinkedServer | null) => {
    const found = known[server?.id ?? OWN] ?? { state: 'reading' };
    if (found.state === 'reading') return <span className="ui-menu-label" role="presentation" data-testid="server-reading">Reading its projects…</span>;
    if (found.state === 'failed') return <span className="ui-menu-label" role="presentation" data-testid="server-failed">{found.words}</span>;
    return found.projects.map((project) => (
      <button key={project.id} type="button" role="menuitem" data-testid="project-row" data-project={project.id} data-server={server?.id ?? 'own'} onClick={() => useApp.getState().showServer(server?.id ?? null, { projectId: project.id })}>
        <span className="project-row-name">{project.name}</span>
        <small>Go to this project.</small>
      </button>
    ));
  };

  const heading = (name: string, host: string, testid: string, server: string) => (
    <>
      <span className="ui-menu-divider" role="separator" />
      <span className="toolbar-menu-heading" role="presentation" data-testid={testid} data-server={server}>
        {name}
      </span>
      <span className="ui-menu-label" role="presentation" data-testid="server-host">
        {host}
      </span>
    </>
  );

  const unlink = (server: LinkedServer) => (
    <button type="button" role="menuitem" onClick={() => useApp.getState().askToUnlink(server.id)} data-testid="server-unlink" data-server={server.id}>
      Unlink…
      <small>This browser forgets it, and its device there is revoked.</small>
    </button>
  );

  return (
    <Switcher
      className="project-switcher"
      buttonClassName={`project-current ${colorClass((current?.color ?? 'none') as never)}`}
      style={colorStyle((current?.color ?? 'none') as never)}
      // Said in a word, so that a name alone is not taken for something else.
      label="Project"
      // Another server's project says whose it is first.
      name={shown ? `${shown.label} · ${current?.name ?? 'Project'}` : (current?.name ?? 'Project')}
      nameTestid="project-name"
      title={shown ? `A project of “${shown.label}” at ${hostOf(shown)}, a server this browser linked. Each project has its own canvases, terminals, queue, schedules and rules.` : 'The project you are looking at. Each project has its own canvases, terminals, queue, schedules and rules.'}
      testid="project-switcher"
      menuTestid="project-menu"
      onOpen={opened}
      extra={
        // What waits in the projects that are not being looked at: said on the button itself.
        elsewhere > 0 && (
          <span className="tab-waiting" title={`${elsewhere} waiting for you in other projects`} data-testid="project-elsewhere">
            {elsewhere}
          </span>
        )
      }
    >
      {linked && shown === null && (
        <span className="toolbar-menu-heading" role="presentation" data-testid="server-heading" data-server="own">
          This page’s server
        </span>
      )}
      {linked && shown !== null && (
        <span className="toolbar-menu-heading" role="presentation" data-testid="server-heading" data-server={shown.id}>
          {shown.label}
        </span>
      )}
      {shownRows}
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
      {shown !== null && unlink(shown)}
      {shown !== null && (
        <>
          {heading('This page’s server', location.host, 'server-heading', 'own')}
          {otherRows(null)}
        </>
      )}
      {servers
        .filter((server) => server.id !== shownServer)
        .map((server) => (
          <Fragment key={server.id}>
            {heading(server.label, hostOf(server), 'server-heading', server.id)}
            {otherRows(server)}
            {unlink(server)}
          </Fragment>
        ))}
      <span className="ui-menu-divider" role="separator" />
      <button type="button" role="menuitem" onClick={() => runCommand('server.link')} data-testid="server-link">
        Link a server…
        <small>Show the projects of another Aubergine here.</small>
      </button>
    </Switcher>
  );
}
