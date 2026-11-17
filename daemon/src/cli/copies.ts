import { AubergineError, type Client } from '@aubergine/client';
import { bytesWords, countsWords, showControl } from '@aubergine/shared';
import { UsageError } from './commands';

/**
 * `aubergine copies`: the working copies there are, and what the owner does
 * with one when its terminal is done. A client of the public API like every
 * other command. It knows no kind and no choice by name: it prints what the
 * server says each one offers, and sends back the one that was typed.
 */

export type CopiesCommand = { action: 'list' } | { action: 'show'; query: string } | { action: 'end'; choice: string; query: string; yes: boolean };

export function parseCopiesCommand(words: readonly string[]): CopiesCommand {
  const [action, ...rest] = words;
  if (action === undefined || action === 'list' || action === 'ls') {
    if (rest.length > 0) throw new UsageError('copies list takes no arguments');
    return { action: 'list' };
  }
  const unknown = rest.find((word) => word.startsWith('--') && word !== '--yes');
  if (unknown) throw new UsageError(`copies ${action} does not know ${unknown}`);
  const query = rest.filter((word) => word !== '--yes').join(' ').trim();
  if (query === '') throw new UsageError(`copies ${action} needs a working copy: the name of its terminal, its branch, or the start of its ID. See: aubergine copies`);
  if (action === 'show') return { action: 'show', query };
  if (!/^[a-z][a-z-]{0,39}$/.test(action)) throw new UsageError(`copies does not know "${action}"`);
  // Anything else is one of the things a working copy offers; the server says whether it is.
  return { action: 'end', choice: action, query, yes: rest.includes('--yes') };
}

export interface CopiesCommandDeps {
  owner: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  print: (text: string) => void;
  ask: (question: string) => Promise<string>;
}

type Listed = Awaited<ReturnType<Client['listEnvironments']>>['items'][number];

function pick(all: readonly Listed[], query: string): Listed {
  const wanted = query.toLowerCase();
  const found = all.filter((e) => e.id === wanted || (wanted.length >= 8 && e.id.startsWith(wanted)) || e.sessionName.toLowerCase() === wanted || e.branch?.toLowerCase() === wanted || e.folder.toLowerCase().endsWith(`/${wanted}`));
  if (found.length === 1) return found[0] as Listed;
  throw new UsageError(found.length === 0 ? `No working copy matches "${query}". See: aubergine copies` : `${found.length} working copies match "${query}". Use the branch or the ID.`);
}

const lineOf = (e: Listed): string[] => [
  `${e.sessionName}  ${e.sessionId === null ? '(its terminal is gone)' : ''}`.trimEnd(),
  `  ${e.title.toLowerCase()}${e.branch ? `, branch ${e.branch}` : ''}`,
  `  ${e.broken ?? (e.changes ? `${countsWords(e.changes)}${e.changes.commits > 0 ? `, ${e.changes.commits} commit${e.changes.commits === 1 ? '' : 's'}` : ''}${e.changes.uncommitted > 0 ? `, ${e.changes.uncommitted} not committed` : ''}` : 'not read yet')}`,
  `  ${e.folder}${e.bytes !== null ? `  (${e.bytesAtLeast ? 'at least ' : ''}${bytesWords(e.bytes)})` : ''}`,
  `  made from ${e.projectFolder}`,
];

async function all(client: Client): Promise<Listed[]> {
  const items: Listed[] = [];
  for await (const item of client.each.listEnvironments()) items.push(item);
  return items;
}

export async function runCopiesCommand(command: CopiesCommand, deps: CopiesCommandDeps): Promise<number> {
  const { owner, print } = deps;
  try {
    const copies = await owner(all);
    if (command.action === 'list') {
      if (copies.length === 0) {
        print('No working copies. Start a terminal in one with: aubergine here --copy   (in a folder of a Git repository)');
        return 0;
      }
      // Names of sessions and branches of a repository: printed with control characters shown.
      print(showControl(copies.flatMap((e) => [...lineOf(e), '']).join('\n').trimEnd()));
      print('\nWhat can be done with one: aubergine copies show <copy>');
      return 0;
    }
    const copy = pick(copies, command.query);
    const { endings } = await owner((client) => client.getEnvironmentEndings({ environmentId: copy.id }));
    if (command.action === 'show') {
      const detail = await owner((client) => client.getEnvironment({ environmentId: copy.id }));
      print(showControl([...lineOf(copy), ...(detail.note && detail.note !== copy.broken ? [`  ${detail.note}`] : []), '', ...detail.files.map((file) => `  ${file.state.padEnd(8)} ${file.path}${file.committed ? '' : '  (not committed)'}`), ...(detail.filesCut ? ['  … and more'] : [])].join('\n').trimEnd()));
      print('\nWhat can be done with it:');
      for (const ending of endings) print(showControl(`  aubergine copies ${ending.choice} "${copy.sessionName}"\n      ${ending.label}. ${ending.says}${ending.available ? '' : `\n      Not now: ${ending.reason ?? ''}`}`));
      return 0;
    }
    const ending = endings.find((entry) => entry.choice === command.choice);
    if (!ending) {
      print(showControl(`A working copy does not offer "${command.choice}". It offers: ${endings.map((entry) => entry.choice).join(', ')}.`));
      return 1;
    }
    if (!ending.available) {
      print(showControl(ending.reason ?? 'That cannot be done now.'));
      return 1;
    }
    let confirm = false;
    if (ending.asksAgain !== null) {
      // The second question, asked of a person. `--yes` does not answer it: work that exists nowhere else is never lost unasked.
      const answer = await deps.ask(`${showControl(ending.asksAgain)} [y/N] `);
      if (!/^y(es)?$/i.test(answer.trim())) {
        print('Kept.');
        return 0;
      }
      confirm = true;
    } else if (!command.yes) {
      const answer = await deps.ask(`${showControl(`${ending.label}: ${ending.says}`)} [y/N] `);
      if (!/^y(es)?$/i.test(answer.trim())) {
        print('Nothing was done.');
        return 0;
      }
    }
    const done = await owner((client) => client.endEnvironment({ environmentId: copy.id, body: { choice: command.choice, confirm } }));
    print(showControl(done.says));
    return 0;
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    print(showControl(error.message));
    return 1;
  }
}
