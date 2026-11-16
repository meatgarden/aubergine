import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { INPUT_TEXT_HARD_MAX, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SETTINGS_FILE, SettingsFile } from './settings';
import { ZshIntegration } from './shell/integration';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => existsSync(p));

/**
 * Terminal access against real terminals: a real tmux on a socket of this
 * test's own, real shells with stand-in startup files, and the routes. What
 * is asserted is what a program in the terminal actually received, read back
 * from a file it wrote, not what the server meant to send.
 */
describe.runIf(ZSH)('terminal access, against real terminals', () => {
  const socket = testSocketName('terminal-access');
  const runtime = new TmuxRuntime({ socket });
  let dir: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let sessions: Sessions;
  let port = 0;
  let ownerToken: string;
  let reader = '';
  let typer = '';
  let both = '';
  /** The shell new sessions start: zsh, or for one test a shell that reports nothing. */
  let shell = ZSH as string;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-terminal-')));
    const data = path.join(dir, 'data');
    const userDir = path.join(dir, 'user');
    await mkdir(data);
    await mkdir(userDir);
    // Stand-in startup files: a plain prompt, and nothing of the developer's own.
    await writeFile(path.join(userDir, '.zshrc'), "PROMPT='ready> '\nunsetopt zle_bracketed_paste 2>/dev/null\nunset HISTFILE\n");
    await writeFile(path.join(data, SETTINGS_FILE), JSON.stringify({ terminal: { inputCharsPerCall: 5000, inputCharsPerMinute: 200_000, inputCallsPerMinute: 1000 } }));
    ownerToken = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    const settings = new SettingsFile(data);
    await settings.reload();
    sessions = new Sessions(hub, runtime, { integration: new ZshIntegration(path.join(data, 'shell'), userDir), shell: () => shell, defaultFolder: () => dir });
    app = await buildServer({ hub, sessions, runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    const make = async (name: string, scopes: string[]): Promise<string> => (await asOwner('POST', '/v1/tokens', { name, scopes, reach: { kind: 'all' } })).body.secret as string;
    reader = await make('reader', ['terminal:read']);
    typer = await make('typer', ['terminal:input']);
    both = await make('both', ['terminal:read', 'terminal:input']);
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, socket);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  interface Answer {
    status: number;
    body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
    headers: Record<string, unknown>;
  }
  async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
    const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
    return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, headers: response.headers };
  }
  const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin: `http://127.0.0.1:${port}`, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
  const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);

  /** A new session whose shell has drawn its prompt. */
  async function ready(name: string): Promise<Session> {
    const { session } = await sessions.create({ name });
    const started = Date.now();
    while (!(await runtime.snapshot(session.id)).includes(shell === ZSH ? 'ready>' : '$')) {
      if (Date.now() - started > 15_000) throw new Error(`No prompt:\n${await runtime.snapshot(session.id)}`);
      await sleep(25);
    }
    return session;
  }
  async function until(what: string, check: () => Promise<boolean>): Promise<void> {
    const started = Date.now();
    while (!(await check())) {
      if (Date.now() - started > 15_000) throw new Error(`Waited in vain for ${what}`);
      await sleep(25);
    }
  }
  const input = (secret: string, session: Session, body: object): Promise<Answer> => call(secret, 'POST', `/v1/sessions/${session.id}/input`, body);
  const fileText = (name: string): Promise<string> => readFile(path.join(dir, name), 'utf8').catch(() => '');

  /** Starts `cat` writing into a file, types through the route, ends it, and gives back what the program received. */
  async function received(session: Session, name: string, type: () => Promise<void>): Promise<string> {
    await runtime.typeLine(session.id, `cat > ${path.join(dir, name)}`);
    await until('cat to start', async () => (await runtime.foreground(session.id)) === 'cat');
    await type();
    await runtime.press(session.id, ['Ctrl+D']);
    await until('cat to end', async () => (await runtime.foreground(session.id)) !== 'cat');
    return fileText(name);
  }

  describe('reading', () => {
    it('gives the screen as text with its size and cursor, and recent output a page at a time', async () => {
      const session = await ready('reading');
      await runtime.typeLine(session.id, "printf '\\033[31mred\\033[0m and plain\\n'; seq 1 300");
      await until('the output', async () => (await runtime.snapshot(session.id)).includes('300'));

      const screen = await call(reader, 'GET', `/v1/sessions/${session.id}/screen`);
      expect(screen.status).toBe(200);
      expect(screen.body.text).toContain('300');
      expect(screen.body.text.trimEnd().endsWith('ready>')).toBe(true);
      expect(screen.body).toMatchObject({ columns: expect.any(Number), rows: expect.any(Number), cursor: { x: 7, y: expect.any(Number) } });
      expect(screen.body.text.split('\n').length).toBeLessThanOrEqual(screen.body.rows);

      // The last hundred lines, then further back with the cursor, down to the start.
      const last = await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=100`);
      const lastLines = last.body.text.split('\n') as string[];
      expect(lastLines.at(-1)?.trimEnd()).toBe('ready>');
      expect(lastLines.at(-2)).toBe('300');
      expect(last.body.nextCursor).not.toBeNull();
      const earlier = await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=100&cursor=${last.body.nextCursor}`);
      const earlierLines = earlier.body.text.split('\n') as string[];
      expect(Number(earlierLines.at(-1)) + 1).toBe(Number(lastLines[0]));
      let everything = [...earlierLines, ...lastLines];
      let cursor = earlier.body.nextCursor as string | null;
      while (cursor) {
        const page = await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=100&cursor=${cursor}`);
        everything = [...(page.body.text.split('\n') as string[]), ...everything];
        cursor = page.body.nextCursor;
      }
      expect(everything.join('\n')).toContain('red and plain\n1\n2\n3\n');
      // Text only: the color the program printed is not in it, anywhere.
      expect(everything.join('\n')).not.toContain('\u001b');
      expect(screen.body.text).not.toContain('\u001b');
      expect((await call(reader, 'GET', `/v1/sessions/${session.id}/output?cursor=nonsense`)).status).toBe(400);
      expect((await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=99999`)).status).toBe(400);
    });

    it('counts recent output back from where the cursor is, on a screen that is not full yet', async () => {
      const session = await ready('fresh');
      await runtime.typeLine(session.id, 'echo one; echo two');
      await until('the output', async () => (await runtime.snapshot(session.id)).includes('two'));
      const recent = await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=3`);
      expect((recent.body.text as string).split('\n').map((line) => line.trimEnd())).toEqual(['one', 'two', 'ready>']);
      expect(recent.body).toMatchObject({ lines: 3, nextCursor: expect.any(String) });
      // Further back there is only the line the command was typed on; then nothing.
      const earlier = await call(reader, 'GET', `/v1/sessions/${session.id}/output?lines=3&cursor=${recent.body.nextCursor}`);
      // (A shell may print a line of its own before its first prompt; whatever is above, the command line is the last of this page.)
      expect((earlier.body.text as string).split('\n').at(-1)?.trimEnd()).toBe('ready> echo one; echo two');
      expect((earlier.body.text as string).split('\n').length).toBeLessThanOrEqual(3);
      expect(earlier.body.nextCursor).toBeNull();
    });

    it('reading the screens of many sessions over and over changes no size and disturbs no viewer', async () => {
      const several = await Promise.all(Array.from({ length: 6 }, (_, n) => ready(`many ${n}`)));
      // Someone is looking at the first one, at a size of their own.
      const viewer = await runtime.attach(several[0]!.id, { cols: 97, rows: 31 });
      let seen = '';
      viewer.onData((chunk) => {
        seen += Buffer.from(chunk).toString('utf8');
      });
      await until('the viewer to be attached', async () => (await call(reader, 'GET', `/v1/sessions/${several[0]!.id}/screen`)).body.columns === 97);
      const sizes = async (): Promise<string> => execFileSync('tmux', ['-L', socket, 'list-sessions', '-F', '#{session_name} #{window_width}x#{window_height}'], { encoding: 'utf8' });
      const before = await sizes();
      // Let what attaching itself draws arrive: quiet for half a second, then start counting.
      for (let quiet = 0; quiet < 10; ) {
        const length = seen.length;
        await sleep(50);
        quiet = seen.length === length ? quiet + 1 : 0;
      }
      seen = '';
      for (let round = 0; round < 5; round += 1) {
        const answers = await Promise.all(several.flatMap((s) => [call(reader, 'GET', `/v1/sessions/${s.id}/screen`), call(reader, 'GET', `/v1/sessions/${s.id}/output?lines=50`)]));
        expect(answers.every((a) => a.status === 200)).toBe(true);
      }
      await call(reader, 'GET', '/v1/search?q=ready');
      expect(await sizes()).toBe(before);
      expect((await call(reader, 'GET', `/v1/sessions/${several[0]!.id}/screen`)).body).toMatchObject({ columns: 97, rows: 31 });
      // Sixty reads and a search later, the viewer was sent nothing: nothing was redrawn.
      expect(JSON.stringify(seen)).toBe('""');
      viewer.close();
    });
  });

  describe('typing', () => {
    it('delivers text exactly as it is: no key names, no escapes, nothing read as an option', async () => {
      const session = await ready('typing');
      const text = `-l Enter Tab C-c Escape \\n \\x03 \\; $(id) \`id\` 'single' "double" ; | & > < ~ * ? ! # { } [ ] ü日本語🚀 0x41 --; end;`;
      const got = await received(session, 'exact.txt', async () => {
        const answer = await input(typer, session, { text });
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ typed: text.length, keys: 0 });
        expect((await input(typer, session, { keys: ['Enter'] })).body).toEqual({ typed: 0, keys: 1 });
      });
      expect(got).toBe(`${text}\n`);
    });

    it('delivers a long line whole, and several lines only as a paste', async () => {
      const session = await ready('long');
      // A terminal in line mode takes about a thousand bytes a line, whoever types; so the long one for `cat` stays under that.
      const long = `${'abcdefghij'.repeat(90)};`;
      const lines = 'first line\n\tsecond, indented\nthird; with $(id)';
      const got = await received(session, 'long.txt', async () => {
        expect((await input(typer, session, { text: long, enter: true })).body).toEqual({ typed: 901, keys: 1 });
        // Without `paste`, text with a line break is refused, and nothing of it is typed.
        const refused = await input(typer, session, { text: lines });
        expect(refused.status).toBe(400);
        expect(refused.body.error.message).toContain('line break');
        expect((await input(typer, session, { text: lines, paste: true, enter: true })).status).toBe(200);
      });
      expect(got).toBe(`${long}\n${lines}\n`);

      // A much longer line goes to the shell's own line editor, which takes it whole: 4,500 characters in several calls to tmux.
      const word = 'abcdefghi '.repeat(450).trimEnd();
      expect((await input(typer, session, { text: `print -r -- '${word}' > ${path.join(dir, 'very-long.txt')}`, enter: true })).status).toBe(200);
      await until('the long line to be run', async () => (await fileText('very-long.txt')).length > 0);
      expect(await fileText('very-long.txt')).toBe(`${word}\n`);
    });

    it('refuses what is not text, and types nothing of it', async () => {
      const session = await ready('refusing');
      const got = await received(session, 'refused.txt', async () => {
        for (const text of ['stop\u0003', 'clear\u001b[2J', 'a\rb', 'bell\u0007', 'del\u007f', 'csi\u009b31m', 'nul\u0000', 'back\u0008space', 'tab\there', 'two\nlines']) {
          const answer = await input(typer, session, { text });
          expect(answer.status, JSON.stringify(text)).toBe(400);
          expect(answer.body.error.code).toBe('bad_request');
        }
        // Also with paste: only line breaks and tabs are let through there.
        expect((await input(typer, session, { text: 'pasted\u001b[201~escape', paste: true })).status).toBe(400);
        expect((await input(typer, session, { text: 'x'.repeat(5001) })).status).toBe(413);
        expect((await input(typer, session, { text: 'x'.repeat(INPUT_TEXT_HARD_MAX + 1) })).status).toBe(400);
        // Keys: only from the list; text and keys are not mixed.
        for (const body of [{ keys: ['F12'] }, { keys: ['C-c'] }, { keys: ['Enter; rm -rf ~'] }, { keys: [] }, { text: 'a', keys: ['Enter'] }, { keys: ['Enter'], enter: true }, {}, { text: '' }, { keys: Array(33).fill('Enter') }]) {
          expect((await input(typer, session, body)).status, JSON.stringify(body)).toBe(400);
        }
        expect((await input(typer, session, { text: 'the only thing typed', enter: true })).status).toBe(200);
      });
      expect(got).toBe('the only thing typed\n');
    });

    it('presses Enter only when told to, and named keys do what they are', async () => {
      const session = await ready('enter');
      const marker = path.join(dir, 'ran.txt');
      expect((await input(typer, session, { text: `echo it ran > ${marker}` })).status).toBe(200);
      await sleep(400);
      expect(existsSync(marker)).toBe(false);
      // Ctrl+U clears the line that was typed; then the same with Enter runs.
      await input(typer, session, { keys: ['Ctrl+U'] });
      await input(typer, session, { keys: ['Enter'] });
      await sleep(300);
      expect(existsSync(marker)).toBe(false);
      await input(typer, session, { text: `echo it ran > ${marker}`, enter: true });
      await until('the command to run', async () => existsSync(marker));
      // Ctrl+C stops a program.
      await runtime.typeLine(session.id, 'sleep 60');
      await until('sleep to start', async () => (await runtime.foreground(session.id)) === 'sleep');
      await input(typer, session, { keys: ['Ctrl+C'] });
      await until('sleep to stop', async () => (await runtime.foreground(session.id)) === 'zsh');
    });
  });

  describe('run and wait', () => {
    const run = (secret: string, session: Session, body: object): Promise<Answer> => call(secret, 'POST', `/v1/sessions/${session.id}/run`, body);

    it('types a command at the prompt, waits for the shell to say it finished, and answers with the exit code and the output', async () => {
      const session = await ready('running');
      const answer = await run(both, session, { command: 'echo hello; echo world; (exit 3)' });
      expect(answer.status).toBe(200);
      expect(answer.body).toMatchObject({ finished: true, exitCode: 3, output: 'hello\nworld', outputCut: false });
      expect(answer.body.durationMs).toBeGreaterThanOrEqual(0);
      // Straight after: the prompt is back, so another can run. Two in the same second are told apart.
      const second = await run(both, session, { command: 'echo again' });
      expect(second.body).toMatchObject({ finished: true, exitCode: 0, output: 'again' });
      expect((await run(both, session, { command: 'true' })).body).toMatchObject({ finished: true, exitCode: 0, output: '' });
      // A token that may type but not read gets the exit code, not what the terminal showed.
      const blind = await run(typer, session, { command: 'echo for-nobody-to-read' });
      expect(blind.body).toMatchObject({ finished: true, exitCode: 0, output: null });
      expect(JSON.stringify(blind.body)).not.toContain('for-nobody');
      // The owner too can run and read.
      expect((await asOwner('POST', `/v1/sessions/${session.id}/run`, { command: 'echo mine' })).body.output).toBe('mine');
    });

    it('cuts long output and says so', async () => {
      const session = await ready('cutting');
      const answer = await run(both, session, { command: 'seq 1 2500' });
      expect(answer.body).toMatchObject({ finished: true, exitCode: 0, outputCut: true });
      const lines = answer.body.output.split('\n') as string[];
      expect(lines).toHaveLength(2000);
      expect(lines.at(-1)).toBe('2500');
    });

    it('answers when the time is up that the command is still going, and stops nothing', async () => {
      const session = await ready('waiting');
      const marker = path.join(dir, 'slow.txt');
      const started = Date.now();
      const answer = await run(both, session, { command: `sleep 3; echo done > ${marker}`, timeoutSeconds: 1 });
      expect(answer.body).toMatchObject({ finished: false, exitCode: null });
      expect(Date.now() - started).toBeLessThan(2500);
      // Still going: another run is refused, since the shell is not at its prompt. Nothing was typed for it.
      const refused = await run(both, session, { command: 'echo should-not-be-typed' });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('not_at_prompt');
      // It was left alone, and finishes by itself.
      await until('the slow command to finish', async () => existsSync(marker));
      await until('the prompt', async () => (await sessions.shellReport(session.id))?.state === 'idle');
      expect((await call(reader, 'GET', `/v1/sessions/${session.id}/output`)).body.text).not.toContain('should-not-be-typed');
      expect((await run(both, session, { command: 'echo back' })).body.output).toBe('back');
    });

    it('cannot be used to type into a program: only into a shell at its prompt', async () => {
      const session = await ready('guarded');
      const got = await received(session, 'guarded.txt', async () => {
        const refused = await run(both, session, { command: 'injected into cat' });
        expect(refused.status).toBe(409);
        expect(refused.body.error).toMatchObject({ code: 'not_at_prompt' });
        expect(refused.body.error.message).toContain('Nothing was typed');
      });
      expect(got).toBe('');
      // The same for a shell started inside the shell: the outer one reports "busy".
      await runtime.typeLine(session.id, 'sh');
      await until('sh to start', async () => (await runtime.foreground(session.id)) !== 'zsh');
      expect((await run(both, session, { command: 'echo inner' })).body.error.code).toBe('not_at_prompt');
      await runtime.typeLine(session.id, 'exit');
      await until('zsh again', async () => (await runtime.foreground(session.id)) === 'zsh');
      // One at a time on a session; and a command is one line of text.
      await until('the prompt', async () => (await sessions.shellReport(session.id))?.state === 'idle');
      const [first, second] = await Promise.all([run(both, session, { command: 'sleep 1' }), run(both, session, { command: 'echo second' })]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect([first, second].find((a) => a.status === 409)?.body.error.code).toBe('run_in_progress');
      for (const command of ['two\nlines', 'bell\u0007', 'esc\u001b[2J', 'tab\tbed', '   ']) expect((await run(both, session, { command })).status, JSON.stringify(command)).toBe(400);
    });

    it('does not trust a shell that never started the command typed before', async () => {
      const session = await ready('open quote');
      // An open quote: the shell waits for more, and never reports that a command started.
      const hanging = await run(both, session, { command: 'echo "never closed', timeoutSeconds: 1 });
      expect(hanging.body).toMatchObject({ finished: false, exitCode: null });
      const refused = await run(both, session, { command: 'rm -rf should-not-be-typed"' });
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toContain('never started');
      expect((await call(reader, 'GET', `/v1/sessions/${session.id}/screen`)).body.text).not.toContain('should-not-be-typed');
      // Once the shell has run something and reported again, it is trusted again.
      await input(typer, session, { keys: ['Ctrl+C'] });
      await input(typer, session, { text: 'true', enter: true });
      await until('the shell to report', async () => (await run(both, session, { command: 'echo settled' })).status === 200);
    });

    it('is refused for a shell that does not report, with a code that says so', async () => {
      shell = '/bin/sh';
      try {
        const session = await ready('plain sh');
        const refused = await run(both, session, { command: 'echo hi' });
        expect(refused.status).toBe(409);
        expect(refused.body.error.code).toBe('no_shell_integration');
        // Typing still works there; it is only the waiting that cannot be done.
        expect((await input(typer, session, { text: 'echo typed', enter: true })).status).toBe(200);
        await until('the output', async () => (await call(reader, 'GET', `/v1/sessions/${session.id}/screen`)).body.text.includes('\ntyped'));
      } finally {
        shell = ZSH as string;
      }
    });
  });
});
