import { useEffect } from 'react';
import { type PageName, type Session } from '@aubergine/shared';
import { atThisComputer, currentProjectId, terminalPage, useApp } from './store';
import { rowState } from './terminal-rows';

/**
 * The hooks a stylesheet of the owner's own may rely on, as the page writes them (the list, and what each says, is
 * `UI_HOOKS` in shared/src/hooks.ts). On the root: what is shown, of which project and server, and whether the page is
 * used at this computer. On a terminal's parts: the same attributes from the same values wherever it is drawn. Every
 * value comes from what the page already holds; nothing is worked out for the hooks alone.
 */

/** What `data-page` says: the place under the top bar, or the terminal of a browser tab of its own. Pure. */
export function pageWord(page: PageName | null, alone: boolean): string {
  if (alone) return 'terminal';
  if (page === null) return 'canvas';
  // The Queue and the Board are tabs of Runs.
  return page === 'queue' || page === 'board' ? 'runs' : page;
}

/** The attributes of the root, from the store: null where one is left off. Pure. */
export function rootHooks(state: { project: string | null; page: PageName | null; alone: boolean; server: string | null; here: boolean }): Record<string, string | null> {
  return {
    'data-page': pageWord(state.page, state.alone),
    'data-project': state.project,
    'data-server': state.server === null ? 'own' : 'linked',
    'data-here': state.here ? '' : null,
  };
}

/** Keeps the root's attributes as the store says, once the state is read. Used once, at the root of the app. */
export function useRootHooks(): void {
  const ready = useApp((s) => s.phase === 'ready');
  const project = useApp(currentProjectId);
  const page = useApp((s) => s.page);
  const server = useApp((s) => s.server);
  const here = useApp(atThisComputer);
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(rootHooks({ project, page, alone: terminalPage !== null, server, here }))) {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
  }, [ready, project, page, server, here]);
}

/** A terminal's attributes, the same on its node, its row and the head of its own browser tab. Pure. */
export function terminalHooks(session: Session, color: string, marks: { selected?: boolean; focused?: boolean } = {}): Record<string, string | undefined> {
  return {
    'data-session': session.id,
    'data-name': session.name,
    'data-state': rowState(session),
    'data-tags': session.tags.map((tag) => tag.toLowerCase()).join(' '),
    'data-agent': session.agent ? session.agent.kind : undefined,
    'data-color': color,
    ...(marks.selected !== undefined ? { 'data-selected': marks.selected ? 'true' : undefined } : {}),
    ...(marks.focused !== undefined ? { 'data-focused': marks.focused ? 'true' : undefined } : {}),
  };
}
