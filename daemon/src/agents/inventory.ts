import type { AgentKind, Inventory, InventoryItem, InventoryNote, Session } from '@aubergine/shared';

/**
 * What is switched on for an agent, by kind of agent.
 *
 * An `AgentInventory` reads what one kind of agent's configuration says:
 * the items and what could not be told. There is one implementation, for
 * Claude Code. Another agent is another class beside it; nothing else
 * changes.
 *
 * Nothing found is stored or logged: it is read when asked for, and given
 * to the owner in the browser only.
 */

/** What an implementation is told about the session. */
export interface InventoryContext {
  sessionId: string;
  /** The session's folder, as last known. */
  folder: string | null;
  /** The settings file Aubergine generates for the agents it starts (its hooks). */
  aubergineSettingsFile: string | null;
  /** The file of tools Aubergine made for this session, when the owner chose any. */
  aubergineToolsFile: string | null;
}

export interface InventoryFound {
  items: InventoryItem[];
  notes: InventoryNote[];
}

export interface AgentInventory {
  kind: AgentKind;
  read(context: InventoryContext): Promise<InventoryFound>;
}

export class NotAnAgentError extends Error {}

export interface InventoriesOptions {
  /** The settings file with Aubergine's hooks, if it has been generated. */
  settingsFile: () => Promise<string | null>;
  /** The file of tools made for a session, if any. */
  toolsFile: (sessionId: string) => Promise<string | null>;
  /** Whether that file holds a token of its own (the owner chose "more") or not (the session's own credential). */
  toolsChoice: (sessionId: string) => Promise<'own' | 'token' | null>;
}

export class Inventories {
  private readonly byKind = new Map<AgentKind, AgentInventory>();

  constructor(
    implementations: readonly AgentInventory[],
    private readonly options: InventoriesOptions,
  ) {
    for (const implementation of implementations) this.byKind.set(implementation.kind, implementation);
  }

  async of(session: Session): Promise<Inventory> {
    if (session.agent === null) throw new NotAnAgentError('No agent is known to run in this terminal.');
    const implementation = this.byKind.get(session.agent.kind);
    if (!implementation) throw new NotAnAgentError(`What is switched on cannot be read for this kind of agent (${session.agent.kind}).`);
    const settingsFile = await this.options.settingsFile();
    const toolsFile = await this.options.toolsFile(session.id);
    const choice = await this.options.toolsChoice(session.id);
    const found = await implementation.read({ sessionId: session.id, folder: session.cwd, aubergineSettingsFile: settingsFile, aubergineToolsFile: toolsFile });
    return {
      sessionId: session.id,
      agent: session.agent.kind === 'claude-code' ? 'Claude Code' : session.agent.kind,
      folder: session.cwd,
      readAt: new Date().toISOString(),
      aubergine: whatAubergineAdded(settingsFile !== null, choice),
      items: found.items,
      notes: found.notes,
    };
  }
}

/**
 * What Aubergine gives an agent it starts, in sentences. Aubergine does not
 * record how each agent was started, so this says what it does when it is
 * the one that starts it, and what it certainly made for this session.
 */
export function whatAubergineAdded(hasSettings: boolean, tools: 'own' | 'token' | null): string[] {
  const lines = [
    hasSettings
      ? 'When Aubergine starts this agent ("+ Claude Code", "Resume agent", aubergine here --claude), it passes its own settings file: four hooks that tell the canvas when the agent starts working, needs you, or has finished. They are listed below as from Aubergine.'
      : 'Aubergine has not generated its hooks settings yet: no agent has been started by it on this server.',
    tools === 'token'
      ? 'Aubergine tools: you chose "More…" for this session. An API token was made for it, and the agent was pointed at the MCP server "aubergine" with that token.'
      : tools === 'own'
        ? 'Aubergine tools: you chose "its own work only" for this session. The agent was pointed at the MCP server "aubergine", which uses the session\'s own credential.'
        : 'Aubergine tools: none were given to this session.',
    'A workflow is started with one fixed sentence typed into the terminal, when you start a run here. Nothing else is typed or added to its prompt by Aubergine.',
    'If you started this agent yourself by typing its command, none of the above was passed to it, and what was on its command line is not known here.',
  ];
  return lines;
}
