/**
 * What waits to be read before it can be used, in one sentence that names each thing as what it is: drafts written
 * by an agent or a program, items of the library asked to be installed, workflow files found in a repository, color
 * themes proposed. The
 * banner on the Queue and on Workflows both say this. Empty when nothing waits.
 */
export function toReadWords(counts: { agentDrafts: number; programDrafts: number; installs: number; files: number; themes?: number }): string {
  const part = (n: number, one: string, many: string): string | null => (n === 0 ? null : `${n} ${n === 1 ? one : many}`);
  const parts = [part(counts.agentDrafts, 'draft from an agent', 'drafts from agents'), part(counts.programDrafts, 'draft from a program', 'drafts from programs'), part(counts.installs, 'item from the library', 'items from the library'), part(counts.files, 'workflow file from a repository', 'workflow files from a repository'), part(counts.themes ?? 0, 'color theme proposed', 'color themes proposed')].filter((x): x is string => x !== null);
  if (parts.length === 0) return '';
  const total = counts.agentDrafts + counts.programDrafts + counts.installs + counts.files + (counts.themes ?? 0);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${list} to read before ${total === 1 ? 'it' : 'they'} can be used.`;
}
