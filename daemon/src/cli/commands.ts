import { ago, type CanvasSummary, type HistoryList, type Session } from '@aubergine/shared';
import { HOOK_EVENTS, type HookEvent } from '../agents/claude-code';

export type Command =
  | { name: 'list' }
  | { name: 'new'; sessionName: string | null; canvas: string | null; copy: boolean; folder: string | null }
  /** `task …`, `todo …`, `ask …`, `rule …`: their own words, parsed by the queue commands. */
  | { name: 'queue'; which: 'task' | 'todo' | 'ask' | 'rule'; words: string[] }
  /** `copies …`: its own words, parsed by the working-copy commands. */
  | { name: 'copies'; words: string[] }
  | { name: 'canvas-list' }
  | { name: 'canvas-new'; canvasName: string }
  | { name: 'attach'; query: string }
  | {
      name: 'here';
      sessionName: string | null;
      /** The canvas to put it on, by name; null means the one most recently looked at. */
      canvas: string | null;
      attach: boolean;
      /** Show the new session on an open canvas, or open a browser on it. */
      open: boolean;
      claude: boolean;
      /** Start it in a working copy of the repository this folder is in. */
      copy: boolean;
      /** Words after `--`: a command to type into the new session, or with `claude`, arguments for the agent. */
      command: string[];
      /** Called from the shell snippet: be quick, be quiet, and report failure by exit code. */
      fromShellHook: boolean;
    }
  | { name: 'scan' }
  | {
      name: 'move';
      /** Terminals to move; empty with `all` false means: just list. */
      terminals: string[];
      all: boolean;
      stop: boolean;
      force: boolean;
      yes: boolean;
      dryRun: boolean;
      open: boolean;
    }
  | { name: 'import'; terminals: string[]; all: boolean; dryRun: boolean; canvas: string | null }
  /** `workflow …`: its own words, parsed by the workflow commands. */
  | { name: 'workflow'; words: string[] }
  /** `element …`: the shelf, running one element by itself, proposing one. */
  | { name: 'element'; words: string[] }
  | { name: 'note'; text: string }
  /** `library …`: its own words, parsed by the library commands. */
  | { name: 'library'; words: string[] }
  /** `board`: every run that is going, as text. */
  | { name: 'board'; canvas: string | null; workflow: string | null; status: string | null; tag: string | null }
  /** Inside a session: take its unread messages. */
  | { name: 'inbox' }
  /** Inside a session: answer a message it received. */
  | { name: 'reply'; id: string; text: string }
  /** Send a message to a session: from the session it is typed in, or from the owner when typed outside one. */
  | { name: 'tell'; query: string; text: string }
  /** Inside a session: say whether its owner is needed. */
  /** `where`: inside a session, where it works. */
  | { name: 'where' }
  | { name: 'attention'; state: 'none' | 'working' | 'waiting' | 'done'; message: string | null }
  /** The guide for agents: for whoever asks, in full, or the few lines for an instructions file. */
  | { name: 'guide'; all: boolean; snippet: boolean }
  /** Past conversations of the agent in a folder: list them, or open one on the canvas. No command prints a transcript. */
  | { name: 'history'; folder: string | null }
  | { name: 'history-open'; id: string; copy: boolean; folder: string | null; evenIfOpen: boolean }
  /** `--write`: inside a session, hand in a recap (or read what is wanted). Otherwise: print the recap of a session. */
  | { name: 'recap'; write: boolean; file: string | null; query: string | null }
  | { name: 'hook'; event: HookEvent }
  | { name: 'hooks-print' }
  | { name: 'mcp'; words: string[] }
  | { name: 'shell-hook-print' }
  | { name: 'service'; action: 'install' | 'uninstall' }
  /** What a terminal shows now. */
  | { name: 'screen'; query: string }
  | { name: 'output'; query: string; lines: number | null }
  /** Types text into a session, as the owner. */
  | { name: 'send'; query: string; text: string; enter: boolean }
  /** Runs a command at a session's prompt and waits for it. */
  | { name: 'run'; query: string; command: string; timeout: number | null }
  | { name: 'protect'; query: string; peopleOnly: boolean }
  | { name: 'token-create'; tokenName: string; scopes: string[]; expires: string | null; /** `all`, `canvas:<name>` or `tag:<tag>`: which sessions the terminal scopes reach. */ reach: string | null; /** False with `--no-review`: the token may change workflows directly. */ review: boolean }
  | { name: 'token-list' }
  | { name: 'token-revoke'; query: string }
  | { name: 'start'; open: boolean }
  | { name: 'open'; print: boolean }
  | { name: 'update' }
  | { name: 'version' }
  | { name: 'uninstall'; yes: boolean }
  | { name: 'doctor' }
  | { name: 'demo'; remove: boolean; open: boolean }
  /** No arguments at all: a short word on where to begin, or the usage. */
  | { name: 'begin' }
  | { name: 'help' };

/** What `aubergine` says by itself while there is nothing on the canvas yet: the three ways to begin, as the empty canvas shows them. */
export const BEGIN = `Nothing is on your canvas yet. Three ways to begin:
  aubergine demo        show me around: a canvas of stand-ins and a short tour (remove it with: aubergine demo --remove)
  aubergine new         start a new terminal on the canvas
  aubergine here        bring in a terminal you already have open: type it there
Everything else: aubergine help`;

export const USAGE = `Usage: aubergine <command>

  start                      Start the server here, in the foreground (builds the web app first if needed)
                             --open   also open the canvas in your browser, signed in
  open                       Open the canvas in your browser, signed in (--print shows the sign-in address instead)
  update                     Bring this copy up to date: fetch, install, build
  version                    Version, commit, where this copy and your data are
  doctor                     Check that everything Aubergine needs is in place
  uninstall                  Remove the command and an installed copy. Your data and terminals are kept. (--yes: do not ask)

  demo                       Make a canvas named "Demo" with a small scene of stand-ins, and a tour of it in the browser.
                             Nothing in it is real. --remove takes away everything it made; --no-open leaves the browser alone

  list                       List sessions with their state, command and folder
  new [name]                 Start a new terminal on a canvas
  new [name] --copy [--in <folder>]
                             Start it in a working copy of its own: a second checkout of the repository this folder
                             (or <folder>) is in, on a new branch. Kept apart from your checkout; that is not a lock
  canvas list                List the canvases, with how many terminals are on each and how many wait for you
  canvas new <name>          Add a canvas
  attach <name>              Open a session in this terminal (detach by closing the window)
  here [name] [-- command]   Start a session in this folder and turn this terminal into a view of it
  here --copy [--claude]     The same, in a working copy of its own of the repository this folder is in
  copies                     The working copies there are: terminal, branch, what changed, size on disk
  copies show <copy>         One of them: the files that changed, and what can be done with it
  copies keep-branch | keep | discard | forget <copy>
                             Keep its branch and remove its folder; keep everything; discard both; stop listing one that
                             is broken. Nothing is ever merged or pushed. Only you can: no token and no agent does this
                             --canvas <name>   put it on this canvas
                             --no-attach   only create it
                             --no-open     do not bring it up in the browser
                             --claude      start Claude Code in it, continuing this folder's last conversation
                             --claude -- <args>   start it with these arguments instead, for example
                                                  --claude -- --resume <id> --fork-session
  scan                       List your open terminals that are not on the canvas yet (read-only)
  import [terminal…]         Give those terminals a canvas session in the same folder; with none named,
                             every one, one per folder (--all: one per terminal). --dry-run shows the plan
                             --canvas <name>   put them on this canvas
  move [terminal…|--all]     Move running Claude Code tabs onto the canvas; with nothing named, list them
                             (default)     start a copy of the conversation; the original keeps running
                             --stop        ask an idle original to exit, then resume the same conversation
                             --dry-run, --yes, --force, --no-open
  token create <name> --scope <scope> [--scope …] [--expires 30d | <date>] [--no-review]
                             [--reach all | canvas:<name> | tag:<tag>]   which sessions the terminal scopes and the message scopes reach
                             Make an API token for a program of yours. Its secret is printed once, on standard output
  token list                 The API tokens, with their scopes and when each was last used
  token revoke <name|id>     Revoke a token: it stops working at once
  workflow list              The workflows, with how many elements each has and how many runs are going
  workflow show <name>       One workflow in full: what every element says
  workflow new <name> [--template <template>]
                             Make a workflow, from a template or with one element to start from
  workflow templates         The templates that come with Aubergine
  workflow edit <name>       Change a workflow in your editor ($VISUAL or $EDITOR); --file <path> takes it from a file
  workflow copy <name> [new name]
  workflow remove <name>     Remove a workflow (--yes: do not ask). Refused while a run of it is going
  workflow export <name> [file]   Write a workflow as a file, to pass on (to standard output without a file)
  workflow import <file> [--name <name>]   Make a workflow from such a file ("-" reads standard input)
  workflow run <name> [--session <name|id>] [--input key=value …] [--replace]
                             Start a run on a session: this one, when typed inside a session
  workflow approve <run> [--comment <text>]
                             Approve the element a run waits on. The run is its ID or the name of its terminal.
                             Only you can: no token and no agent's own command does this
  workflow send-back <run> --to <element> --comment <text>
                             Send a run that waits for approval back to an earlier element; the agent is told your comment
  task add <title> [--details <text>] [--folder <folder>] [--workflow <name>] [--to any | <terminal> | new:<canvas>] [--label <word>]
                             Add a task to the queue for agents. Typed inside a canvas terminal it is a proposal, which waits for your yes
  task list | show <task>    The queue: what is at work, what is next, what waits for your yes
  task start [task]          Start the next task that someone can take, or the one named. Only you can
  task accept | decline <task>   Say yes or no to a proposed task. Only you can
  task move <task> --first | --last | --before <task>
  task withdraw | again | clear <task>   Take one back; put a failed one back; put away one that is over
  todo                       What waits on you: terminals, approvals, drafts, proposals, done and failed tasks, what was asked
  todo add <text> | todo done <item>
  ask <text>                 Inside a session: ask your owner for something only a person can do
  rule list | add --when <event> (--notify | --run <element> (--on <terminal> | --new <canvas>)) | remove <rule>
                             When something happens, do something. Only you write rules
  board [--canvas <name>] [--workflow <name>] [--status <status>] [--tag <tag>]
                             Every run that is going, by workflow and element: who waits for you, who is blocked
  Inside a session that is on a run:
  workflow status            Where the run stands and what to do now
  workflow done [--note <text>] [--output <file>]
                             The current element is finished; prints what comes next. --output hands in what the
                             element produces when that is more than a note (a checklist); - reads standard input
  workflow brief             Inside a session that was asked to write a workflow or an element: the request
  workflow propose --file <file>   Hand a workflow in as a draft, for a person to read (- or nothing: standard input)
  element propose --file <file>    The same for one element
  element list | show <name> | remove <name>     The shelf of elements
  element run <name> [--session <name|id>] [--input key=value …] [--replace]
                             Run one element by itself on a session
  workflow blocked <reason>  You cannot go on without a person
  workflow goto <element>    Jump to an element, by name, ID or number
  workflow pause | resume | stop
  screen <session>           What that terminal shows now, as text
  output <session> [--lines n]   What it printed recently
  send <session> <text> [--enter]   Type text into it, exactly as given; --enter presses Enter after it
  run <session> [--timeout s] -- <command>   Run a command at its shell prompt, wait, and print the output and exit code
  protect <session>          Mark it "people only": no API token may read it or type into it
  unprotect <session>        Open it to API tokens again (those whose scopes and reach allow)
  library list               What the library offers, from every source, and what of it is installed
  library show <item>        One item in full: everything an agent would be told by it, and where it comes from
  library install <item>     Shows all of it, asks, and installs exactly what was shown. Nothing installs unasked
  library sources            The sources, each with when it was last read and why the last try failed, if it did
  library add <folder | Git address> [--name <name>]
                             Add a source: a folder, or https://…, ssh://…, user@host:path, file://… A Git source is
                             fetched now and on "refresh", and at no other time. No password is taken or stored
  library refresh [source]   Read a source again (all of them, with none named). The only thing that fetches
  library remove <source>    Remove a source. What was installed from it stays
  library export <workflow> --to <folder> [--element] [--version v] [--id id]
                             Write a workflow (or, with --element, a shelf element) as a file into a folder and list
                             it in that folder's index, so the folder can be a source. Never commits or pushes
  history [folder]           The agent's earlier conversations in a folder (this one, when none is given): name or first
                             prompt, when, how many turns, and whether a canvas terminal is on it now
  history open <id> [--copy] [--folder f]
                             Open one on the canvas: a new terminal in that folder with the agent resumed in it;
                             --copy opens a branch of it and leaves the original as it is
  recap <session>            What a terminal was about and where it stands: from what is known, and what its agent wrote
  recap --write [--file f]   Inside a session, for its agent: hand in a recap on standard input or from a file.
                             With nothing handed in, prints what is wanted
  tell <session> <text>      Send a message to a terminal. It is kept for the agent there to read; it is never typed.
                             Typed outside a session it is from you; inside one, from that session, which may
                             message only where you switched that on for its canvas
  inbox                      Inside a session: the unread messages for it, which are then read
  reply <id> <text>          Inside a session: answer a message it received
  note <text>                Inside a session: add an entry to that session's note log
  where                      Inside a session: whether it works in a working copy of its own, on which branch, and what to leave alone
  attention waiting [what you need] | working | done | none
                             Inside a session: say whether its owner is needed. An agent Aubergine started reports this
                             by itself; any other program in a terminal says it with this
  guide                      For agents: what an agent can do here and how to behave, for whoever asks (a terminal's own
                             credential, an API token in AUBERGINE_API_TOKEN, or both)
                             --all       every part, each saying what it needs
                             --snippet   a few lines to paste into a project's instructions file for agents
  mcp [--url <address>]      An MCP server on standard input and output, for an agent or another MCP client: the
                             API as tools. Uses AUBERGINE_API_TOKEN, else the session's own token; offers only
                             the tools that credential may use
  hook <event>               For agent hooks: reads the hook's JSON on stdin (start, prompt, notification, stop)
  hooks print                Print the Claude Code hook settings, to add to your own config by hand
  shell-hook print           Print a zsh snippet that makes new terminal tabs start on the canvas
  service install            Start the Aubergine server at login
  service uninstall          Stop starting it at login
  help                       Show this text

new, here and import take --canvas <name>. Without it they use the canvas you looked at most recently
in a browser, or the first one when no browser is open.

The server must be running for list, new, canvas, copies, task, todo, ask, rule, token, workflow, element, library, board, screen, output, send, run, protect, attach, here, scan, import, move, tell, inbox, reply, note, attention and open.
guide works without it, and then prints every part.`;

export class UsageError extends Error {}

/**
 * Takes one `--option value` (or `--option=value`) out of some words.
 * Returns the value, null when the option is not there, and the other words.
 */
export function takeOption(words: readonly string[], option: string): { value: string | null; rest: string[] } {
  const rest: string[] = [];
  let value: string | null = null;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as string;
    let found: string | undefined;
    if (word === option) {
      found = words[index + 1];
      index += 1;
      if (found === undefined || found.startsWith('--')) throw new UsageError(`${option} needs a name`);
    } else if (word.startsWith(`${option}=`)) {
      found = word.slice(option.length + 1);
    } else {
      rest.push(word);
      continue;
    }
    if (found.trim() === '') throw new UsageError(`${option} needs a name`);
    if (value !== null) throw new UsageError(`${option} was given twice`);
    value = found;
  }
  return { value, rest };
}

export function parseCommand(argv: readonly string[]): Command {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
      return { name: 'begin' };
    case 'demo': {
      const unknown = rest.find((word) => word !== '--remove' && word !== '--no-open');
      if (unknown) throw new UsageError(`demo does not know "${unknown}". It takes --remove, or --no-open.`);
      return { name: 'demo', remove: rest.includes('--remove'), open: !rest.includes('--no-open') };
    }
    case 'help':
    case '--help':
    case '-h':
      return { name: 'help' };
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('list takes no arguments');
      return { name: 'list' };
    case 'new': {
      const { value: canvas, rest: afterCanvas } = takeOption(rest, '--canvas');
      const { value: folder, rest: all } = takeOption(afterCanvas, '--in');
      const unknown = all.find((word) => word.startsWith('--') && word !== '--copy');
      if (unknown) throw new UsageError(`new does not know ${unknown}`);
      const words = all.filter((word) => word !== '--copy');
      return { name: 'new', sessionName: words.length > 0 ? words.join(' ') : null, canvas, copy: all.includes('--copy'), folder };
    }
    case 'canvas':
    case 'canvases': {
      const [action, ...words] = rest;
      if (action === undefined || action === 'list' || action === 'ls') {
        if (words.length > 0) throw new UsageError('canvas list takes no arguments');
        return { name: 'canvas-list' };
      }
      if (action === 'new') {
        const unknown = words.find((word) => word.startsWith('--'));
        if (unknown) throw new UsageError(`canvas new does not know ${unknown}`);
        if (words.join(' ').trim() === '') throw new UsageError('canvas new needs a name');
        return { name: 'canvas-new', canvasName: words.join(' ') };
      }
      throw new UsageError('canvas needs "list" or "new <name>"');
    }
    case 'attach':
      if (rest.length === 0) throw new UsageError('attach needs a session name');
      if (rest.some((word) => word.startsWith('--'))) throw new UsageError(`attach does not know ${rest.find((word) => word.startsWith('--'))}`);
      return { name: 'attach', query: rest.join(' ') };
    case 'here': {
      const split = rest.indexOf('--');
      const { value: canvas, rest: options } = takeOption(split < 0 ? rest : rest.slice(0, split), '--canvas');
      const command = split < 0 ? [] : rest.slice(split + 1);
      const flags = options.filter((word) => word.startsWith('--'));
      const unknown = flags.find((flag) => !['--no-attach', '--no-open', '--claude', '--from-shell-hook', '--copy'].includes(flag));
      if (unknown) throw new UsageError(`here does not know ${unknown}`);
      if (split >= 0 && command.length === 0) throw new UsageError('here: nothing after "--"');
      const words = options.filter((word) => !word.startsWith('--'));
      return {
        name: 'here',
        sessionName: words.length > 0 ? words.join(' ') : null,
        canvas,
        attach: !flags.includes('--no-attach'),
        // Never from the shell snippet or when only creating: those must not take the user's attention.
        open: !flags.some((flag) => ['--no-open', '--no-attach', '--from-shell-hook'].includes(flag)),
        claude: flags.includes('--claude'),
        copy: flags.includes('--copy'),
        command,
        fromShellHook: flags.includes('--from-shell-hook'),
      };
    }
    case 'scan':
      if (rest.length > 0) throw new UsageError('scan takes no arguments');
      return { name: 'scan' };
    case 'move': {
      const known = ['--all', '--stop', '--force', '--yes', '--dry-run', '--no-open'];
      const unknown = rest.find((word) => word.startsWith('--') && !known.includes(word));
      if (unknown) throw new UsageError(`move does not know ${unknown}`);
      const terminals = rest.filter((word) => !word.startsWith('--'));
      const all = rest.includes('--all');
      if (all && terminals.length > 0) throw new UsageError('move: name terminals or use --all, not both');
      if (rest.includes('--force') && !rest.includes('--stop')) throw new UsageError('move: --force only applies with --stop');
      return {
        name: 'move',
        terminals,
        all,
        stop: rest.includes('--stop'),
        force: rest.includes('--force'),
        yes: rest.includes('--yes'),
        dryRun: rest.includes('--dry-run'),
        open: !rest.includes('--no-open'),
      };
    }
    case 'import': {
      const { value: canvas, rest: words } = takeOption(rest, '--canvas');
      const unknown = words.find((word) => word.startsWith('--') && word !== '--all' && word !== '--dry-run');
      if (unknown) throw new UsageError(`import does not know ${unknown}`);
      return {
        name: 'import',
        terminals: words.filter((word) => !word.startsWith('--')),
        all: words.includes('--all'),
        dryRun: words.includes('--dry-run'),
        canvas,
      };
    }
    case 'screen':
      if (rest.length === 0 || rest.some((word) => word.startsWith('--'))) throw new UsageError(rest.find((word) => word.startsWith('--')) ? `screen does not know ${rest.find((word) => word.startsWith('--'))}` : 'screen needs a session name');
      return { name: 'screen', query: rest.join(' ') };
    case 'output': {
      const { value: lines, rest: words } = takeOption(rest, '--lines');
      const unknown = words.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`output does not know ${unknown}`);
      if (words.length === 0) throw new UsageError('output needs a session name');
      if (lines !== null && !/^\d{1,5}$/.test(lines)) throw new UsageError('--lines needs a number');
      return { name: 'output', query: words.join(' '), lines: lines === null ? null : Number(lines) };
    }
    case 'send': {
      // The first word names the session; the rest is the text, typed exactly as given. Only --enter before the text is an option.
      const [query, ...after] = rest;
      const enter = after[0] === '--enter' || after.at(-1) === '--enter';
      const words = after[0] === '--enter' ? after.slice(1) : after.at(-1) === '--enter' ? after.slice(0, -1) : after;
      if (query === undefined || query.startsWith('--')) throw new UsageError('send needs a session name, then the text');
      if (words.join(' ').trim() === '') throw new UsageError('send needs some text to type');
      return { name: 'send', query, text: words.join(' '), enter };
    }
    case 'run': {
      const split = rest.indexOf('--');
      const { value: timeout, rest: words } = takeOption(split < 0 ? rest : rest.slice(0, split), '--timeout');
      const unknown = words.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`run does not know ${unknown}`);
      if (words.length === 0) throw new UsageError('run needs a session name, then -- and the command');
      if (split < 0 || split === rest.length - 1) throw new UsageError('run needs the command after --');
      if (timeout !== null && !/^\d{1,4}$/.test(timeout)) throw new UsageError('--timeout needs a number of seconds');
      return { name: 'run', query: words.join(' '), command: rest.slice(split + 1).join(' '), timeout: timeout === null ? null : Number(timeout) };
    }
    case 'protect':
    case 'unprotect': {
      const unknown = rest.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`${command} does not know ${unknown}`);
      if (rest.length === 0) throw new UsageError(`${command} needs a session name`);
      return { name: 'protect', query: rest.join(' '), peopleOnly: command === 'protect' };
    }
    case 'workflow':
    case 'workflows':
      return { name: 'workflow', words: rest };
    case 'element':
    case 'elements':
      return { name: 'element', words: rest };
    case 'library':
      return { name: 'library', words: rest };
    case 'task':
    case 'tasks':
      return { name: 'queue', which: 'task', words: rest };
    case 'todo':
      return { name: 'queue', which: 'todo', words: rest };
    case 'ask':
      return { name: 'queue', which: 'ask', words: rest };
    case 'rule':
    case 'rules':
      return { name: 'queue', which: 'rule', words: rest };
    case 'copies':
    case 'copy':
      return { name: 'copies', words: rest };
    case 'board': {
      const canvas = takeOption(rest, '--canvas');
      const workflow = takeOption(canvas.rest, '--workflow');
      const status = takeOption(workflow.rest, '--status');
      const tag = takeOption(status.rest, '--tag');
      if (tag.rest.length > 0) throw new UsageError(`board does not know ${tag.rest[0]}`);
      return { name: 'board', canvas: canvas.value, workflow: workflow.value, status: status.value, tag: tag.value };
    }
    case 'history': {
      const { value: folder, rest: afterFolder } = takeOption(rest, '--folder');
      if (afterFolder[0] === 'open') {
        const words = afterFolder.slice(1);
        const unknown = words.find((word) => word.startsWith('--') && word !== '--copy' && word !== '--even-if-open');
        if (unknown) throw new UsageError(`history open does not know ${unknown}`);
        const ids = words.filter((word) => !word.startsWith('--'));
        if (ids.length !== 1) throw new UsageError('history open needs one conversation ID, as `aubergine history` lists them');
        return { name: 'history-open', id: ids[0] as string, copy: words.includes('--copy'), folder, evenIfOpen: words.includes('--even-if-open') };
      }
      const unknown = afterFolder.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`history does not know ${unknown}`);
      if (afterFolder.length > 1) throw new UsageError('history takes one folder');
      return { name: 'history', folder: afterFolder[0] ?? folder };
    }
    case 'recap': {
      const { value: file, rest: afterFile } = takeOption(rest, '--file');
      const write = afterFile.includes('--write');
      const words = afterFile.filter((word) => word !== '--write');
      const unknown = words.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`recap does not know ${unknown}`);
      if (write && words.length > 0) throw new UsageError('recap --write takes the recap on standard input or from --file, not as words');
      if (!write && file !== null) throw new UsageError('--file goes with --write');
      if (!write && words.length === 0) throw new UsageError('recap needs a session: aubergine recap <name>. Inside a session, an agent hands one in with: aubergine recap --write');
      return { name: 'recap', write, file, query: write ? null : words.join(' ') };
    }
    case 'inbox':
      if (rest.length > 0) throw new UsageError('inbox takes no arguments');
      return { name: 'inbox' };
    case 'reply': {
      const [id, ...words] = rest;
      if (id === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new UsageError('reply needs the ID of the message, as `aubergine inbox` shows it, then the answer: aubergine reply <id> "<your answer>"');
      if (words.join(' ').trim() === '') throw new UsageError('reply needs the answer after the ID');
      return { name: 'reply', id, text: words.join(' ') };
    }
    case 'tell': {
      const [query, ...words] = rest;
      if (query === undefined || query.startsWith('--')) throw new UsageError('tell needs a terminal (its name in quotes, or its ID), then the message: aubergine tell "<terminal>" "<message>"');
      if (words.join(' ').trim() === '') throw new UsageError('tell needs the message after the terminal');
      return { name: 'tell', query, text: words.join(' ') };
    }
    case 'note':
      if (rest.join(' ').trim() === '') throw new UsageError('note needs some text');
      return { name: 'note', text: rest.join(' ') };
    case 'where':
      if (rest.length > 0) throw new UsageError('where takes no arguments');
      return { name: 'where' };
    case 'attention': {
      const [state, ...words] = rest;
      if (state !== 'none' && state !== 'working' && state !== 'waiting' && state !== 'done') throw new UsageError('attention needs one of: waiting, working, done, none. With waiting, say what you need: aubergine attention waiting "<what you need>"');
      const unknown = words.find((word) => word.startsWith('--'));
      if (unknown) throw new UsageError(`attention does not know ${unknown}`);
      const message = words.join(' ').trim();
      if (message.length > 500) throw new UsageError('What is needed is one sentence: at most 500 characters.');
      return { name: 'attention', state, message: message === '' ? null : message };
    }
    case 'guide': {
      const unknown = rest.find((word) => word !== '--all' && word !== '--snippet');
      if (unknown) throw new UsageError(`guide does not know "${unknown}". It takes --all, or --snippet.`);
      if (rest.includes('--all') && rest.includes('--snippet')) throw new UsageError('guide takes --all or --snippet, not both');
      return { name: 'guide', all: rest.includes('--all'), snippet: rest.includes('--snippet') };
    }
    case 'hook': {
      const event = HOOK_EVENTS.find((e) => e === rest[0]);
      if (!event || rest.length !== 1) throw new UsageError(`hook needs one of: ${HOOK_EVENTS.join(', ')}`);
      return { name: 'hook', event };
    }
    case 'mcp':
      // Its own options are read by the MCP server itself, which answers a wrong one in the protocol rather than here.
      return { name: 'mcp', words: rest };
    case 'hooks':
      if (rest.length === 1 && rest[0] === 'print') return { name: 'hooks-print' };
      throw new UsageError('hooks needs "print"');
    case 'shell-hook':
      if (rest.length === 1 && rest[0] === 'print') return { name: 'shell-hook-print' };
      throw new UsageError('shell-hook needs "print"');
    case 'token':
    case 'tokens': {
      const [action, ...words] = rest;
      if (action === undefined || action === 'list' || action === 'ls') {
        if (words.length > 0) throw new UsageError('token list takes no arguments');
        return { name: 'token-list' };
      }
      if (action === 'revoke') {
        if (words.length === 0 || words.some((word) => word.startsWith('--'))) throw new UsageError('token revoke needs the name or the ID of one token');
        return { name: 'token-revoke', query: words.join(' ') };
      }
      if (action === 'create' || action === 'new') {
        const { value: expires, rest: afterReach } = takeOption(words, '--expires');
        const { value: reach, rest: withFlag } = takeOption(afterReach, '--reach');
        const review = !withFlag.includes('--no-review');
        const afterExpires = withFlag.filter((word) => word !== '--no-review');
        const scopes: string[] = [];
        const names: string[] = [];
        for (let index = 0; index < afterExpires.length; index += 1) {
          const word = afterExpires[index] as string;
          const given = word === '--scope' ? afterExpires[(index += 1)] : word.startsWith('--scope=') ? word.slice('--scope='.length) : null;
          if (given === undefined || (given !== null && (given === '' || given.startsWith('--')))) throw new UsageError('--scope needs a scope');
          if (given !== null) scopes.push(...given.split(',').map((scope) => scope.trim()).filter(Boolean));
          else if (word.startsWith('--')) throw new UsageError(`token create does not know ${word}`);
          else names.push(word);
        }
        if (names.length === 0) throw new UsageError('token create needs a name');
        if (scopes.length === 0) throw new UsageError('token create needs at least one --scope: read, canvases:write, sessions:write, notes:write, workflows:write, runs:write, terminal:read, terminal:input, messages:read or messages:write');
        return { name: 'token-create', tokenName: names.join(' '), scopes: [...new Set(scopes)], expires, reach, review };
      }
      throw new UsageError('token needs "create <name> --scope …", "list" or "revoke <name|id>"');
    }
    case 'start': {
      const unknown = rest.find((word) => word !== '--open');
      if (unknown) throw new UsageError(`start does not know ${unknown}`);
      return { name: 'start', open: rest.includes('--open') };
    }
    case 'open': {
      const unknown = rest.find((word) => word !== '--print');
      if (unknown) throw new UsageError(`open does not know ${unknown}`);
      return { name: 'open', print: rest.includes('--print') };
    }
    case 'update':
      if (rest.length > 0) throw new UsageError('update takes no arguments');
      return { name: 'update' };
    case 'version':
    case '--version':
    case '-v':
      if (rest.length > 0) throw new UsageError('version takes no arguments');
      return { name: 'version' };
    case 'doctor':
      if (rest.length > 0) throw new UsageError('doctor takes no arguments');
      return { name: 'doctor' };
    case 'uninstall': {
      const unknown = rest.find((word) => word !== '--yes' && word !== '-y');
      if (unknown) throw new UsageError(`uninstall does not know ${unknown}`);
      return { name: 'uninstall', yes: rest.length > 0 };
    }
    case 'service':
      if (rest.length === 1 && (rest[0] === 'install' || rest[0] === 'uninstall')) {
        return { name: 'service', action: rest[0] };
      }
      throw new UsageError('service needs "install" or "uninstall"');
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
}

/**
 * Finds the session a name refers to: an exact name (case does not matter),
 * else a unique name starting with the text, else a unique ID prefix.
 */
export function resolveSession(sessions: readonly Session[], query: string): Session {
  const wanted = query.trim().toLowerCase();
  const running = sessions.filter((s) => s.state !== 'exited');
  const pick = (matches: Session[], what: string): Session | null => {
    if (matches.length === 1) return matches[0] ?? null;
    if (matches.length > 1) {
      throw new UsageError(`${matches.length} sessions ${what} "${query}": ${matches.map((s) => s.name).join(', ')}`);
    }
    return null;
  };
  const found =
    pick(running.filter((s) => s.name.toLowerCase() === wanted), 'are named') ??
    pick(running.filter((s) => s.name.toLowerCase().startsWith(wanted)), 'start with') ??
    pick(running.filter((s) => wanted.length >= 4 && s.id.startsWith(wanted)), 'have an ID starting with');
  if (!found) throw new UsageError(`No running session matches "${query}". Try: aubergine list`);
  return found;
}

/** A plain table: name, state, command, folder. */
export function formatSessions(sessions: readonly Session[]): string {
  if (sessions.length === 0) return 'No sessions.';
  const rows = [
    ['NAME', 'STATE', 'COMMAND', 'FOLDER'],
    ...sessions.map((s) => [s.name, s.state, s.command ?? '-', s.cwd ?? '-']),
  ];
  const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => (row[column] ?? '').length)));
  return rows
    .map((row) => row.map((cell, column) => (column < 3 ? cell.padEnd(widths[column] ?? 0) : cell)).join('  ').trimEnd())
    .join('\n');
}

/**
 * Whether this process is running inside an Aubergine session (or a view of
 * one). `tmuxSocket` is the name of our tmux socket.
 */
export function insideAubergine(env: NodeJS.ProcessEnv, tmuxSocket: string): boolean {
  if (env.AUBERGINE_SESSION_ID) return true;
  // $TMUX is "<socket path>,<pid>,<n>"; ours ends in "/<socket name>".
  const socketPath = (env.TMUX ?? '').split(',')[0] ?? '';
  return socketPath !== '' && socketPath.split('/').pop() === tmuxSocket;
}

/** A session name for a folder: its last part. */
export function nameForFolder(folder: string): string {
  const base = folder.split('/').filter(Boolean).pop() ?? '';
  return base.trim().slice(0, 80) || 'Terminal';
}

/**
 * Finds the canvas a name refers to: an exact name (case does not matter),
 * else a unique name starting with the text, else its ID.
 */
export function resolveCanvas<T extends { id: string; name: string }>(canvases: readonly T[], query: string): T {
  const wanted = query.trim().toLowerCase();
  const exact = canvases.filter((c) => c.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0] as T;
  if (exact.length > 1) {
    throw new UsageError(`${exact.length} canvases are named "${query}". Rename one, or give its ID (see: aubergine canvas list).`);
  }
  const starting = canvases.filter((c) => c.name.toLowerCase().startsWith(wanted));
  if (starting.length === 1) return starting[0] as T;
  if (starting.length > 1) {
    throw new UsageError(`"${query}" could be: ${starting.map((c) => `"${c.name}"`).join(', ')}`);
  }
  const byId = canvases.find((c) => c.id === wanted);
  if (byId) return byId;
  throw new UsageError(`No canvas named "${query}". See: aubergine canvas list, or add it with: aubergine canvas new "${query}"`);
}

/** The canvases as a table. `currentId` is the one new sessions go to when none is named. */
export function formatCanvases(canvases: readonly CanvasSummary[], currentId: string | null, ids = false): string {
  if (canvases.length === 0) return 'No canvases.';
  const width = Math.max(...canvases.map((c) => c.name.length), 4);
  const lines = canvases.map((c) => {
    const mark = c.id === currentId ? '*' : ' ';
    const terminals = `${c.counts.sessions} terminal${c.counts.sessions === 1 ? '' : 's'}`;
    const waiting = c.counts.waiting > 0 ? `  ${c.counts.waiting} waiting for you` : '';
    return `${mark} ${c.name.padEnd(width)}  ${terminals}${waiting}${ids ? `  ${c.id}` : ''}`;
  });
  return `${lines.join('\n')}\n\n* where new sessions go when no --canvas is given`;
}

/**
 * When a token should expire, from what was typed: a number of days (`30d`,
 * `30`) or a date (`2027-01-31`, or a full ISO time). Returns the field of
 * the request to send, or throws with what was wrong.
 */
export function expiryFromOption(value: string | null, now: Date = new Date()): { expiresInDays: number } | { expiresAt: string } | Record<string, never> {
  if (value === null) return {};
  const days = /^(\d{1,4})d?$/.exec(value.trim());
  if (days) {
    const count = Number(days[1]);
    if (count < 1) throw new UsageError('--expires needs at least one day');
    return { expiresInDays: count };
  }
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T23:59:59` : value.trim());
  if (Number.isNaN(date.getTime())) throw new UsageError(`--expires does not understand "${value}". Use a number of days (30d) or a date (2027-01-31).`);
  if (date.getTime() <= now.getTime()) throw new UsageError(`--expires ${value} is in the past`);
  return { expiresAt: date.toISOString() };
}

/** Finds the token a name or an ID refers to: an exact name (case does not matter), else an ID, else the start of one. */
export function resolveToken<T extends { id: string; name: string; revokedAt: string | null }>(tokens: readonly T[], query: string): T {
  const wanted = query.trim().toLowerCase();
  const live = tokens.filter((t) => t.revokedAt === null);
  const named = live.filter((t) => t.name.toLowerCase() === wanted);
  if (named.length === 1) return named[0] as T;
  if (named.length > 1) throw new UsageError(`${named.length} tokens are named "${query}". Give the ID of the one you mean (see: aubergine token list).`);
  const byId = tokens.filter((t) => t.id === wanted || (wanted.length >= 8 && t.id.startsWith(wanted)));
  if (byId.length === 1) return byId[0] as T;
  throw new UsageError(`No token named "${query}". See: aubergine token list`);
}

/** The tokens as a table: never a secret, which the server does not have either. */
export function formatTokens(
  tokens: readonly { id: string; name: string; scopes: readonly string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; reviewWorkflowChanges?: boolean; reach?: { kind: 'all' } | { kind: 'tag'; tag: string } | { kind: 'canvases'; canvasIds: readonly string[] } | null }[],
  now: number = Date.now(),
): string {
  if (tokens.length === 0) return 'No API tokens. Make one with: aubergine token create <name> --scope read';
  const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : 'never');
  const rows = tokens.map((t) => [
    t.name,
    t.revokedAt ? 'revoked' : t.expiresAt && Date.parse(t.expiresAt) <= now ? 'expired' : 'active',
    t.scopes.join(','),
    // Only means something for a token that may write workflows.
    !t.scopes.includes('workflows:write') ? '-' : t.reviewWorkflowChanges ? 'reviewed' : 'direct',
    // Which sessions its terminal scopes reach.
    !t.reach ? '-' : t.reach.kind === 'all' ? 'all sessions' : t.reach.kind === 'tag' ? `tag ${t.reach.tag}` : `${t.reach.canvasIds.length} ${t.reach.canvasIds.length === 1 ? 'canvas' : 'canvases'}`,
    day(t.lastUsedAt),
    t.expiresAt ? day(t.expiresAt) : 'never',
    t.id,
  ]);
  const head = ['NAME', 'STATE', 'SCOPES', 'WORKFLOWS', 'TERMINALS', 'LAST USED', 'EXPIRES', 'ID'];
  const widths = head.map((title, i) => Math.max(title.length, ...rows.map((row) => (row[i] as string).length)));
  return [head, ...rows].map((row) => row.map((cell, i) => (cell as string).padEnd(widths[i] as number)).join('  ').trimEnd()).join('\n');
}

/** The list of past conversations as lines: newest first, each with what it was about, when, and its ID for `history open`. */
export function formatHistory(list: HistoryList, now: Date): string {
  const lines: string[] = [];
  if (list.conversations.length === 0) lines.push(`No ${list.agent} conversations are kept for ${list.folder}.`);
  else lines.push(`${list.agent} conversations in ${list.folder}, newest first:`);
  for (const conversation of list.conversations) {
    const about = conversation.name ?? conversation.firstPrompt ?? '(nothing said in it could be read)';
    const when = conversation.lastActiveAt ? `${ago(conversation.lastActiveAt, now)} ago` : 'at a time not known';
    const turns = conversation.turns === null ? 'very long' : `${conversation.turns} turn${conversation.turns === 1 ? '' : 's'}`;
    lines.push(`  ${conversation.id}  ${when}, ${turns}${conversation.onCanvas ? `, on the canvas now as "${conversation.onCanvas.name}"` : ''}`);
    lines.push(`      ${about.length > 110 ? `${about.slice(0, 109)}…` : about}`);
    if (conversation.name && conversation.lastPrompt) lines.push(`      last: ${conversation.lastPrompt.length > 100 ? `${conversation.lastPrompt.slice(0, 99)}…` : conversation.lastPrompt}`);
  }
  for (const note of list.notes) lines.push(`Note: ${note.text}`);
  if (list.conversations.length > 0) lines.push('Open one on the canvas with: aubergine history open <id>   (--copy for a branch of it)');
  return lines.join('\n');
}
