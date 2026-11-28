import { z } from 'zod';
import { PLAIN_LINE } from './workflows';

/*
 * A terminal's group. A group is only a name a terminal carries, at most one: terminals with the same name (within
 * a project) are one group, on whatever canvas they are. There is no group of its own anywhere in the state.
 */

export const GROUP_NAME_MAX = 40;

/** The name of a terminal's group: one line of plain text, trimmed, without control characters or characters that reverse text direction. */
export const GroupName = z
  .string()
  .trim()
  .min(1)
  .max(GROUP_NAME_MAX)
  .regex(PLAIN_LINE, 'A group’s name is one line of plain text, without control characters')
  .describe('The name of the group the terminal is in. Terminals with the same group name are one group, on whatever canvas they are.');

/** The names of the groups the given terminals are in, each once, in the order a person would sort them. */
export function groupsOf(sessions: readonly { group?: string | null }[]): string[] {
  const names = new Set<string>();
  for (const session of sessions) if (session.group) names.add(session.group);
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** The terminals in the group of exactly that name. */
export function membersOf<T extends { group?: string | null }>(sessions: readonly T[], group: string): T[] {
  return sessions.filter((session) => session.group === group);
}
