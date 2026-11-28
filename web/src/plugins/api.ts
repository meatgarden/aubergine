import * as React from 'react';
import { createElement, type ComponentType } from 'react';
import { COMMAND_IDS, PLUGIN_API_VERSION, UI_HOOKS, registerTemplatePart, unregisterTemplatePart, type AppState, type ChangeEvent, type CommandId, type Element, type Session, type Settings, type Tick } from '@aubergine/shared';
import { api, ownApi } from '../api';
import { onChange } from '../change-listeners';
import { runCommand as runPageCommand } from '../commands';
import { registerFilter, unregisterFilter } from '../list-filters';
import { registerSection, unregisterSection } from '../panel/registry';
import { useApp } from '../store';
import { addPartDrawing } from '../templates/TemplateSays';
import * as ui from '../ui';
import { registerElementView, registerOutputView, registerRunView, unregisterElementView, unregisterOutputView, unregisterRunView, type RunViewProps } from '../workflows/registries';
import { PluginBoundary } from './boundary';
import { PLUGIN_COMMAND_NAME, addPluginCommand, pluginCommandId, runPluginCommand } from './commands';

/**
 * The plugin API, version 1: the one object a plugin's `activate` is given. Everything in it is promised to stay
 * from one version of the page to the next, and is only added to; everything else on the page (its elements, its
 * classes, its modules, the store) is there to be reached as well, since a plugin runs in the page as the owner, and
 * may change in any release. `docs/plugins.md` lists these members, and a test holds it to them (`API_MEMBERS`).
 *
 * Whatever a plugin adds through it is taken away again when the plugin is switched off: each `add…` gives back the
 * function that takes it away, and the page keeps them too. What a plugin draws is drawn inside an element that says
 * whose it is (`data-plugin="<id>"`), and inside a boundary: a component that throws is said in Settings, and the page
 * carries on. Nothing here keeps a plugin apart from anything: it is not a sandbox, and nothing says it is.
 */

/** A section of the side panel, from a plugin. Its ID becomes `plugin.<plugin ID>.<id>`. */
export interface PluginSection {
  id: string;
  title: string;
  /** What it shows, in one line, for the panel's menu of sections. */
  says: string;
  /** One or two characters that stand for it. */
  icon?: string;
  /** Lower numbers come first; the page's own sections are 0 to 60. */
  order?: number;
  Component: ComponentType;
}

/** A filter of the list of terminals: a pure test of one terminal. Its ID becomes `plugin.<plugin ID>.<id>`. */
export interface PluginFilter {
  id: string;
  /** On its line in the Filter menu, and its chip. */
  label: string;
  order?: number;
  test: (session: Session, where: { canvasId: string | null; parked: boolean }) => boolean;
}

/** A placeholder for a terminal's title and its row: `{name}`. What it says is text, drawn as words (or with its addresses as chips: `field`). */
export interface PluginTemplatePart {
  name: string;
  says: string;
  where?: readonly ('title' | 'row')[];
  kind?: 'words' | 'field';
  say: (session: Session, where: 'title' | 'row') => string | null | undefined;
}

/** A command, in the palette under the plugin's name. Its ID becomes `plugin.<plugin ID>.<id>`; no key is bound to it. */
export interface PluginCommandSpec {
  id: string;
  title: string;
  description?: string;
  run: () => void;
}

/** Another way of looking at a run, as a tab of the run's dialog. Its ID becomes `plugin.<plugin ID>.<id>`. */
export interface PluginRunView {
  id: string;
  title: string;
  order?: number;
  Component: ComponentType<RunViewProps>;
}

/** How a step of a kind there is is edited and read: drawn over the page's own until it is taken away. */
export interface PluginStepView {
  kind: string;
  Editor: ComponentType<{ element: Element; onChange: (element: Element) => void }>;
  Detail: ComponentType<{ element: Element; inputs: Record<string, string> }>;
}

/** How an output of a kind there is is drawn: over the page's own until it is taken away. */
export interface PluginOutputView {
  kind: string;
  View: ComponentType<{ value: unknown; ticks: readonly Tick[]; onTick?: (item: number, ticked: boolean) => void }>;
}

/** The pieces of the page's look (`web/src/ui`), under their names. */
const PIECES = {
  Badge: ui.Badge,
  Banner: ui.Banner,
  Button: ui.Button,
  Card: ui.Card,
  EmptyState: ui.EmptyState,
  FirstSteps: ui.FirstSteps,
  FoldHeading: ui.FoldHeading,
  HowThisWorks: ui.HowThisWorks,
  IconButton: ui.IconButton,
  Menu: ui.Menu,
  MenuButton: ui.MenuButton,
  MenuItem: ui.MenuItem,
  RadioRow: ui.RadioRow,
  RadioRows: ui.RadioRows,
  Row: ui.Row,
  SectionTitle: ui.SectionTitle,
  Segmented: ui.Segmented,
  Select: ui.Select,
  StateDot: ui.StateDot,
  Switcher: ui.Switcher,
  Tabs: ui.Tabs,
  TextField: ui.TextField,
};

/** The plugin the API is made for: what its manifest says, and where the page reports what went wrong. */
export interface PluginIdentity {
  id: string;
  name: string;
  version: string;
}

/** Makes the `aubergine` object for one plugin. `onFailure` is told of anything of the plugin's that throws after `activate`. */
export function makePluginApi(plugin: PluginIdentity, onFailure: (error: unknown) => void) {
  const removers: (() => void)[] = [];
  const keep = (remove: () => void): (() => void) => {
    let done = false;
    const once = (): void => {
      if (done) return;
      done = true;
      const at = removers.indexOf(once);
      if (at >= 0) removers.splice(at, 1);
      remove();
    };
    removers.push(once);
    return once;
  };
  const named = (kind: string, id: string): string => {
    if (typeof id !== 'string' || !PLUGIN_COMMAND_NAME.test(id)) throw new Error(`A ${kind}'s id is lowercase letters, digits and hyphens, beginning with a letter: ${String(id).slice(0, 40)}`);
    return pluginCommandId(plugin.id, id);
  };
  /** A plugin's component, inside its boundary. */
  const guarded = <P extends object>(Inner: ComponentType<P>, inline = false): ComponentType<P> => {
    const Guarded = (props: P) => createElement(PluginBoundary, { plugin: plugin.id, name: plugin.name, onFailure, inline, children: createElement(Inner, props) });
    Guarded.displayName = `Plugin(${plugin.id})`;
    return Guarded;
  };

  const aubergine = {
    apiVersion: PLUGIN_API_VERSION,
    plugin: { id: plugin.id, name: plugin.name, version: plugin.version },
    ui: { React, ...PIECES },

    panel: {
      addSection(section: PluginSection): () => void {
        const id = named('section', section.id);
        registerSection({ id, title: String(section.title), says: String(section.says ?? ''), icon: String(section.icon ?? section.title).slice(0, 2), order: section.order ?? 80, Component: guarded(section.Component) });
        return keep(() => unregisterSection(id));
      },
    },

    list: {
      addFilter(filter: PluginFilter): () => void {
        const id = named('filter', filter.id);
        registerFilter({
          id,
          label: String(filter.label),
          order: filter.order ?? 80,
          test: (row) => {
            try {
              return filter.test(row.session, { canvasId: row.canvasId, parked: row.parked }) === true;
            } catch (error) {
              onFailure(error);
              return true;
            }
          },
        });
        return keep(() => {
          unregisterFilter(id);
          // A filter that went narrows nothing: it is taken out of the list's filters too.
          const view = useApp.getState().listView;
          if (view.filters.includes(id)) useApp.getState().setListView({ filters: view.filters.filter((f) => f !== id) });
        });
      },
    },

    templates: {
      addPart(part: PluginTemplatePart): () => void {
        const kind = part.kind ?? 'words';
        if (kind !== 'words' && kind !== 'field') throw new Error(`A plugin's placeholder is drawn as words or as a field's value: ${String(kind).slice(0, 20)}`);
        registerTemplatePart({ name: part.name, says: String(part.says), where: part.where ?? ['title', 'row'], kind });
        const undraw = addPartDrawing(part.name, { kind, say: part.say, plugin: plugin.id, onFailure });
        return keep(() => {
          undraw();
          unregisterTemplatePart(part.name);
        });
      },
    },

    commands: {
      add(command: PluginCommandSpec): () => void {
        const id = named('command', command.id);
        return keep(addPluginCommand({ id, pluginId: plugin.id, pluginName: plugin.name, title: String(command.title), description: String(command.description ?? ''), run: command.run }));
      },
    },

    runs: {
      addView(view: PluginRunView): () => void {
        const id = named('view', view.id);
        registerRunView({ id, title: String(view.title), order: view.order ?? 80, Component: guarded(view.Component) });
        return keep(() => unregisterRunView(id));
      },
    },

    steps: {
      addView(view: PluginStepView): () => void {
        const drawn = { kind: view.kind, Editor: guarded(view.Editor), Detail: guarded(view.Detail) };
        registerElementView(drawn);
        return keep(() => unregisterElementView(view.kind, drawn));
      },
    },

    outputs: {
      addView(view: PluginOutputView): () => void {
        const drawn = { kind: view.kind, View: guarded(view.View) };
        registerOutputView(drawn);
        return keep(() => unregisterOutputView(view.kind, drawn));
      },
    },

    state: {
      /** The page's view of the state now: the project looked at, of the server shown. Read it; change things through `api`. */
      get: (): AppState | null => useApp.getState().app,
      /** The same, in a component: drawn again whenever it changes. */
      use: (): AppState | null => useApp((s) => s.app),
      subscribe(listener: (state: AppState | null) => void): () => void {
        return keep(
          useApp.subscribe((now, before) => {
            if (now.app === before.app) return;
            try {
              listener(now.app);
            } catch (error) {
              onFailure(error);
            }
          }),
        );
      },
      onEvent(listener: (event: ChangeEvent) => void): () => void {
        return keep(onChange(listener, onFailure));
      },
    },

    /** The page's own calls to the server shown, as the page makes them: as the owner. */
    api,
    /** The page's own calls to its own server, whatever is shown. */
    ownApi,

    settings: {
      get: (): Settings => useApp.getState().settings,
    },

    /** Runs one of the page's commands (`COMMAND_IDS`) or a plugin's (`plugin.<id>.<name>`). Answers whether it ran. */
    runCommand(id: string): boolean {
      if ((COMMAND_IDS as readonly string[]).includes(id)) return runPageCommand(id as CommandId);
      return runPluginCommand(id, (message) => useApp.getState().setNotice(message));
    },
    /** Says one line where the page says what just happened. */
    say(text: string): void {
      useApp.getState().say(String(text).slice(0, 300));
    },
    /** Opens a terminal's details beside the side panel. */
    openDetails(sessionId: string): void {
      const state = useApp.getState();
      if (!state.app?.sessions.some((s) => s.id === sessionId)) return;
      if (!state.side.open) state.setSide({ open: true });
      state.openDrawer({ section: 'terminals', kind: 'notes', id: sessionId });
    },
    /** Goes to a terminal: its canvas, and the terminal in view with the keyboard. */
    goTo(sessionId: string): void {
      useApp.getState().showSession(sessionId);
    },

    /** What the page promises a stylesheet may rely on: tokens, the root's attributes, parts. Only added to. */
    hooks: UI_HOOKS,
    /** The element the app is drawn in. */
    root: typeof document === 'undefined' ? null : (document.getElementById('root') ?? document.body),
  };

  const removeAll = (): void => {
    for (const remove of [...removers].reverse()) {
      try {
        remove();
      } catch (error) {
        onFailure(error);
      }
    }
  };
  return { aubergine, removeAll };
}

/** What the page keeps of a plugin's API: the object, and what takes away everything added through it, the latest first. */
export type MadeApi = ReturnType<typeof makePluginApi>;
export type PluginApi = MadeApi['aubergine'];

/** The members of the API at version 1, each with the members beneath it: what `docs/plugins.md` lists, and a test compares. */
export function apiMembers(made: PluginApi): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(made)) {
    out.push(key);
    if (value && typeof value === 'object' && key !== 'api' && key !== 'ownApi' && key !== 'hooks' && key !== 'root' && key !== 'plugin') {
      for (const inner of Object.keys(value)) out.push(`${key}.${inner}`);
    }
  }
  return out;
}
