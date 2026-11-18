import { readFileSync } from 'node:fs';
import { TOOLS, offered } from '@aubergine/mcp';
import { GUIDE, GUIDE_SNIPPET, ROUTES, guideCommands, guideFor, guideTools, renderGuide, showControl } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import { generatedFiles } from '../describe/generated-files';
import { USAGE, parseCommand } from './commands';
import { guideText } from './guide';
import { parseElementCommand, parseWorkflowCommand } from './workflow';

/** The words of a command line as a shell would hand them over: spaces part them, double quotes keep them together. */
function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? (match[2] as string));
}

/** What a command line of the guide is, to the command itself. Throws when the command does not know it. */
function parsed(line: string): string {
  const [program, ...rest] = words(line);
  expect(program).toBe('aubergine');
  const command = parseCommand(rest);
  if (command.name === 'workflow') return `workflow ${parseWorkflowCommand(command.words).action}`;
  if (command.name === 'element') return `element ${parseElementCommand(command.words).action}`;
  if (command.name === 'recap') return command.write ? 'recap --write' : 'recap';
  if (command.name === 'queue') return command.which === 'task' ? `task ${command.words[0] ?? 'list'}` : command.which;
  return command.name;
}

/** The commands that use the terminal's own credential and never the owner's sign-in. */
const OWN_COMMANDS = new Set(['task add', 'task list', 'ask', 'where', 'attention', 'note', 'inbox', 'reply', 'tell', 'recap --write', 'guide', 'mcp', 'workflow status', 'workflow done', 'workflow blocked', 'workflow goto', 'workflow pause', 'workflow resume', 'workflow stop', 'workflow brief', 'workflow propose', 'element propose']);
/** The tools that are there for every connection. */
const ALWAYS = ['aubergine_status', 'aubergine_guide'];

const SESSION_ID = '01900000-0000-7000-8000-0000000000b1';
const session = { kind: 'session' as const, sessionId: SESSION_ID };

describe('what the guide names exists', () => {
  it('every command in it is one the command knows', () => {
    const commands = guideCommands();
    expect(commands.length).toBeGreaterThan(12);
    for (const line of commands) {
      const name = parsed(line);
      expect(name, line).not.toBe('begin');
      // `aubergine help` is named as the owner's list, and is the only one of the owner's that is.
      if (name !== 'help') expect(OWN_COMMANDS.has(name), `${line} is not a command of a terminal's own credential`).toBe(true);
      // And it is in the usage text, so that `aubergine help` and the guide do not disagree.
      for (const word of name.split(' ')) expect(USAGE, line).toContain(word);
    }
  });

  it('every tool in it is one the MCP server has', () => {
    const names = new Set([...TOOLS.map((tool) => tool.name), ...ALWAYS]);
    for (const tool of guideTools()) expect(names.has(tool), tool).toBe(true);
    // And the guide leaves none out.
    for (const name of names) expect(guideTools(), name).toContain(name);
  });

  it('a tool is named in a part that needs what the routes behind the tool need', () => {
    const routes = ROUTES as Record<string, { action: string | null; fieldActions?: Record<string, string> }>;
    for (const section of GUIDE) {
      for (const part of section.parts) {
        for (const name of part.tools ?? []) {
          if (ALWAYS.includes(name)) continue;
          const tool = TOOLS.find((t) => t.name === name)!;
          const actions = tool.uses.map((use) => (typeof use === 'string' ? routes[use]!.action : (routes[use.operation]!.fieldActions?.[use.field] ?? routes[use.operation]!.action)));
          expect(Array.isArray(part.needs), name).toBe(true);
          expect(actions.some((action) => action !== null && (part.needs as readonly string[]).includes(action)), `${name} in ${section.id}`).toBe(true);
        }
      }
    }
  });
});

describe("the guide for a terminal's own credential mentions nothing it cannot do", () => {
  const sections = guideFor({ session: true, scopes: [] });

  it('no tool the server would not list for it', () => {
    const listed = new Set([...offered(TOOLS, session).map((tool) => tool.name), ...ALWAYS]);
    for (const tool of guideTools(sections)) expect(listed.has(tool), tool).toBe(true);
    // And every tool it is listed is in its guide.
    for (const name of listed) expect(guideTools(sections), name).toContain(name);
  });

  it('no command that would act as the owner, except the one it is told to leave alone', () => {
    const names = guideCommands(sections).map(parsed);
    expect(names.filter((name) => !OWN_COMMANDS.has(name))).toEqual(['help']);
  });
});

describe('aubergine guide', () => {
  const URL = 'http://127.0.0.1:4600';
  const OWN = 'aubs_own-secret-of-the-terminal';
  const API = 'aubt_secret-of-the-api-token';
  /** A server that knows the two credentials. Keeps what it was asked. */
  function server(scopes: string[] = ['read', 'terminal:read']): { fetch: typeof fetch; asked: string[] } {
    const asked: string[] = [];
    const answer = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fetchWith = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      asked.push(`${request.method} ${request.url}`);
      const bearer = request.headers.get('authorization');
      const base = { version: '0', api: 'v1', features: [], limits: {} };
      if (bearer === `Bearer ${OWN}`) return answer(200, { ...base, caller: { kind: 'session', sessionId: SESSION_ID } });
      if (bearer === `Bearer ${API}`) return answer(200, { ...base, caller: { kind: 'token', id: SESSION_ID, name: 'bot', scopes, expiresAt: null, reach: { kind: 'all' }, reviewWorkflowChanges: true } });
      return answer(401, { error: { code: 'unauthorized', message: 'Not signed in.' } });
    }) as typeof fetch;
    return { fetch: fetchWith, asked };
  }
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  const plain = { all: false, snippet: false };
  const inTerminal = { AUBERGINE_URL: URL, AUBERGINE_SESSION_ID: SESSION_ID, AUBERGINE_TOKEN: OWN };

  it("in a terminal, with only that terminal's credential: its own work", async () => {
    const { fetch: fetchWith, asked } = server();
    const text = await guideText(plain, inTerminal, fetchWith);
    expect(text).toBe(renderGuide({ reader: { session: true, scopes: [] } }));
    expect(text.split('\n').length).toBeLessThanOrEqual(168);
    // It asked who the caller is, and nothing else.
    expect(asked).toEqual([`GET ${URL}/v1`]);
  });

  it('grows with an API token', async () => {
    const { fetch: fetchWith, asked } = server();
    const text = await guideText(plain, { ...inTerminal, AUBERGINE_API_TOKEN: API }, fetchWith);
    expect(text).toBe(renderGuide({ reader: { session: true, scopes: ['read', 'terminal:read'] } }));
    expect(text).toContain('terminal_screen');
    expect(text).not.toContain('terminal_send');
    expect(asked).toEqual([`GET ${URL}/v1`, `GET ${URL}/v1`]);
    // Outside a terminal, a token alone.
    expect(await guideText(plain, { AUBERGINE_URL: URL, AUBERGINE_API_TOKEN: API }, fetchWith)).toBe(renderGuide({ reader: { session: false, scopes: ['read', 'terminal:read'] } }));
  });

  it('with no server running: the whole guide, saying it could not tell what applies', async () => {
    const text = await guideText(plain, inTerminal, down);
    expect(text).toContain('The Aubergine server did not answer, so it could not be told what applies to you.');
    expect(text).toContain(renderGuide({ all: true }).split('\n').slice(2).join('\n'));
  });

  it('outside a terminal with no token, and with a credential the server does not know: the same, each saying why', async () => {
    const { fetch: fetchWith, asked } = server();
    expect(await guideText(plain, {}, fetchWith)).toContain('This is not an Aubergine terminal and no API token is set here');
    expect(asked).toEqual([]);
    expect(await guideText(plain, { ...inTerminal, AUBERGINE_TOKEN: 'aubs_wrong' }, fetchWith)).toContain('The server did not accept the credential set here');
    // One of two refused: the guide for the other, and a line saying so.
    const one = await guideText(plain, { ...inTerminal, AUBERGINE_API_TOKEN: 'aubt_wrong' }, fetchWith);
    expect(one).toContain(renderGuide({ reader: { session: true, scopes: [] } }));
    expect(one).toMatch(/One of the two credentials set here was not accepted/);
  });

  it('--all and --snippet ask nobody', async () => {
    const { fetch: fetchWith, asked } = server();
    expect(await guideText({ all: true, snippet: false }, { ...inTerminal, AUBERGINE_API_TOKEN: API }, fetchWith)).toBe(renderGuide({ all: true }));
    expect(await guideText({ all: false, snippet: true }, inTerminal, fetchWith)).toBe(GUIDE_SNIPPET);
    expect(asked).toEqual([]);
  });

  it('prints no secret and no path of the owner, whoever asks', async () => {
    const { fetch: fetchWith } = server(['read', 'canvases:write', 'sessions:write', 'notes:write', 'workflows:write', 'runs:write', 'terminal:read', 'terminal:input']);
    const env = { ...inTerminal, AUBERGINE_API_TOKEN: API, AUBERGINE_DATA_DIR: '/made-up/data-folder', AUBERGINE_BIN: '/made-up/data-folder/bin', HOME: '/made-up/home' };
    const outputs = [
      await guideText(plain, env, fetchWith),
      await guideText(plain, inTerminal, fetchWith),
      await guideText(plain, env, down),
      await guideText({ all: true, snippet: false }, env, fetchWith),
      await guideText({ all: false, snippet: true }, env, fetchWith),
    ];
    for (const text of outputs) {
      for (const secret of [OWN, API, 'aubs_', 'aubt_', '/made-up', SESSION_ID, URL, 'bot']) expect(text).not.toContain(secret);
      // No path at all but the two the guide names itself: the folder a repository keeps workflows in, and where the command is.
      const paths = [...text.matchAll(/(?<![A-Za-z$_.])\/[A-Za-z][\w./-]*/g)].map((match) => match[0]);
      expect(paths.filter((found) => found !== '/aubergine' && found !== '/workflows/')).toEqual([]);
      expect(showControl(text)).toBe(text);
    }
  });

  it('takes --all or --snippet and nothing else', () => {
    expect(parseCommand(['guide'])).toEqual({ name: 'guide', all: false, snippet: false });
    expect(parseCommand(['guide', '--all'])).toEqual({ name: 'guide', all: true, snippet: false });
    expect(parseCommand(['guide', '--snippet'])).toEqual({ name: 'guide', all: false, snippet: true });
    expect(() => parseCommand(['guide', '--all', '--snippet'])).toThrow(/not both/);
    expect(() => parseCommand(['guide', 'me'])).toThrow(/does not know/);
  });
});

describe('aubergine attention', () => {
  it('takes a state, and with it what is needed', () => {
    expect(parseCommand(['attention', 'waiting', 'Which', 'branch?'])).toEqual({ name: 'attention', state: 'waiting', message: 'Which branch?' });
    expect(parseCommand(['attention', 'done'])).toEqual({ name: 'attention', state: 'done', message: null });
    expect(() => parseCommand(['attention'])).toThrow(/waiting, working, done, none/);
    expect(() => parseCommand(['attention', 'urgent'])).toThrow(/waiting, working, done, none/);
    expect(() => parseCommand(['attention', 'waiting', 'x'.repeat(501)])).toThrow(/500/);
  });
});

describe('the guide as a file', () => {
  it('is the whole guide, generated, and committed as generated', () => {
    const file = generatedFiles()['docs/for-agents.md'] as string;
    expect(file).toContain(renderGuide({ all: true }));
    expect(file.startsWith('<!-- Generated')).toBe(true);
    expect(readFileSync(new URL('../../../docs/for-agents.md', import.meta.url), 'utf8')).toBe(file);
  });
});
