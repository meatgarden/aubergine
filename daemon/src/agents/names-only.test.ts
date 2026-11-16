import { describe, expect, it } from 'vitest';
import { describeHook, describeMcpServer, describeRule, hostOf, keyName, looksLikeACredential, matcherName, namesOf, programOf, tidyName } from './names-only';

/** Made-up secrets. None may ever come out of this module. */
const SECRETS = ['sk-live-OPAL7781', 'hunter2-topaz', 'ghp_made_up_0001', 'xoxb-made-up-0002', 'Bearer abc.def.ghi', 'p4ssw0rd-garnet'];
const clean = (text: string): void => {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
  for (const part of ['OPAL7781', 'topaz', 'made_up', 'made-up', 'abc.def', 'garnet']) expect(text).not.toContain(part);
};

describe('the program a command starts', () => {
  it('is its file name, without folder, arguments or what is set in front of it', () => {
    expect(programOf('npx -y @scope/server --token sk-live-OPAL7781')).toBe('npx');
    expect(programOf('/opt/tools/bin/my-server --key=hunter2-topaz')).toBe('my-server');
    expect(programOf('API_KEY=sk-live-OPAL7781 OTHER=x node server.js')).toBe('node');
    expect(programOf('env TOKEN=ghp_made_up_0001 uvx thing')).toBe('uvx');
    expect(programOf('"${CLAUDE_PLUGIN_ROOT}"/scripts/format.sh --secret p4ssw0rd-garnet')).toBe('format.sh');
    expect(programOf("'/path with spaces/run-tool' arg")).toBe('run-tool');
    // A name with a space in it is not a plain file name: not shown.
    expect(programOf("'/path/run tool' arg")).toBe('a command');
    expect(programOf('  python3   -m   server ')).toBe('python3');
  });

  it('says "a command" where no plain file name can be made out, and never a value', () => {
    for (const command of ['', '   ', '$(curl https://x/y?k=sk-live-OPAL7781)', 'sk-live-OPAL7781', '`cat ~/.token`', '| nc host 1', 'a;b', 42, null, undefined, { command: 'x' }]) {
      const out = programOf(command as unknown);
      clean(out);
      if (typeof command !== 'string' || !/^[a-z]/.test(command.trim())) expect(out).toBe('a command');
    }
    // A key put where the program belongs has the shape of a file name. It is still not shown.
    for (const key of ['sk-live-OPAL7781', 'ghp_made_up_0001', 'xoxb-made-up-0002', 'AKIAIOSFODNN7EXAMPLE', 'eyJhbGciOiJIUzI1NiJ9', 'p4ssw0rd-garnet-2026', 'aB3dE6gH9jK2mN5pQ8sT1v']) {
      expect(programOf(key)).toBe('a command');
      expect(programOf(`${key} --flag`)).toBe('a command');
      expect(looksLikeACredential(key)).toBe(true);
    }
    // Ordinary programs are shown.
    for (const program of ['node', 'npx', 'uvx', 'python3', 'python3.12', 'docker', 'my-mcp-server', 'format.sh', 'server_v2', 'deno']) {
      expect(programOf(`${program} run`)).toBe(program);
      expect(looksLikeACredential(program)).toBe(false);
    }
  });
});

describe('the host of an address', () => {
  it('is only the host: no user, password, path or query', () => {
    expect(hostOf('https://user:p4ssw0rd-garnet@api.example.com/v1/mcp?key=sk-live-OPAL7781#frag')).toBe('api.example.com');
    expect(hostOf('http://127.0.0.1:8080/mcp/hunter2-topaz')).toBe('127.0.0.1');
    expect(hostOf('wss://stream.example.org/x')).toBe('stream.example.org');
  });

  it('says "an address" for anything that is not one', () => {
    for (const address of ['', 'not a url', '${API_BASE:-https://x}/mcp', 'file:///etc/passwd', 'javascript:alert(1)', 'sk-live-OPAL7781', 7, null]) {
      expect(hostOf(address as unknown)).toBe('an address');
    }
  });
});

describe('names in a map', () => {
  it('are the keys, never the values, and not a key that looks like a value', () => {
    expect(namesOf({ API_KEY: 'sk-live-OPAL7781', REGION: 'eu' })).toEqual(['API_KEY', 'REGION']);
    expect(namesOf({ Authorization: 'Bearer abc.def.ghi', 'X-Team': 'ghp_made_up_0001' })).toEqual(['Authorization', 'X-Team']);
    // A value pasted where a name belongs is not repeated.
    const odd = namesOf({ 'sk-live-OPAL7781 with spaces': 'x', 'KEY=hunter2-topaz': 'y' });
    clean(odd.join(' '));
    expect(odd).toEqual(['(a name that is not shown)', '(a name that is not shown)']);
    expect(namesOf(['a', 'b'])).toEqual([]);
    expect(namesOf('API_KEY=sk-live-OPAL7781')).toEqual([]);
    expect(namesOf(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`VAR_${i}`, 'v']))).at(-1)).toBe('and 8 more');
  });
});

describe('an MCP server, described', () => {
  it('shows the program, the count of arguments and the names of variables for one that is run', () => {
    const text = describeMcpServer({ command: '/usr/local/bin/npx', args: ['-y', 'some-server', '--token', 'sk-live-OPAL7781'], env: { SLACK_TOKEN: 'xoxb-made-up-0002', TEAM: 'T1' } });
    expect(text).toBe('runs npx with 4 arguments · environment: SLACK_TOKEN, TEAM');
    clean(text);
  });

  it('shows the host and the names of headers for one at an address', () => {
    const text = describeMcpServer({ type: 'http', url: 'https://user:p4ssw0rd-garnet@mcp.example.com/v1?key=sk-live-OPAL7781', headers: { Authorization: 'Bearer abc.def.ghi' }, headersHelper: '/opt/bin/get-token --secret hunter2-topaz' });
    expect(text).toBe('http, at mcp.example.com · headers: Authorization · headers from get-token');
    clean(text);
  });

  it('never repeats anything from an entry it does not recognise', () => {
    for (const entry of [null, 'npx server --token sk-live-OPAL7781', ['sk-live-OPAL7781'], 7, {}, { command: 5, url: 6 }, { type: 'sk-live-OPAL7781', url: 'https://x.example.com' }, { secret: 'hunter2-topaz', nested: { token: 'ghp_made_up_0001' } }]) {
      clean(describeMcpServer(entry));
    }
    expect(describeMcpServer({})).toBe('neither a command nor an address is given');
    expect(describeMcpServer({ type: 'sk-live-OPAL7781', url: 'https://x.example.com' })).toBe('remote, at x.example.com');
  });
});

describe('a hook and a rule, described', () => {
  it('shows the program of a command hook and nothing after it', () => {
    expect(describeHook({ type: 'command', command: 'curl -H "Authorization: Bearer abc.def.ghi" https://hooks.example.com/sk-live-OPAL7781' })).toBe('runs curl');
    expect(describeHook({ type: 'http', url: 'https://hooks.example.com/t/xoxb-made-up-0002' })).toBe('http, to hooks.example.com');
    expect(describeHook({ type: 'prompt', prompt: 'the password is hunter2-topaz' })).toBe('a prompt hook');
    for (const hook of [null, 'curl sk-live-OPAL7781', { type: 'sk-live-OPAL7781' }, { command: 'x' }]) clean(describeHook(hook));
  });

  it('shows a matcher only when it is a plain list of tool names', () => {
    expect(matcherName('Write|Edit')).toBe('Write|Edit');
    expect(matcherName('*')).toBe('');
    expect(matcherName('Bash(curl sk-live-OPAL7781)')).toBe('a pattern');
    expect(matcherName(5)).toBe('');
  });

  it('shows the tool of a rule, and for a command its program, never the rest', () => {
    expect(describeRule('Bash(npm run test *)')).toBe('Bash: npm');
    expect(describeRule('Bash(curl -H "Authorization: Bearer abc.def.ghi" *)')).toBe('Bash: curl');
    expect(describeRule('Read(./secrets/hunter2-topaz.env)')).toBe('Read: a pattern');
    expect(describeRule('WebFetch(domain:sk-live-OPAL7781.example.com)')).toBe('WebFetch: a pattern');
    expect(describeRule('mcp__slack__post_message')).toBe('mcp__slack__post_message');
    expect(describeRule('Edit')).toBe('Edit');
    for (const rule of ['sk-live-OPAL7781 is my key', '(hunter2-topaz)', 7, null, 'Bash($(echo ghp_made_up_0001))']) clean(describeRule(rule));
  });
});

describe('a name that is shown', () => {
  it('is one line, without control characters or characters that reverse text, and not endless', () => {
    expect(tidyName('a\u001b[31mb\nc‮d')).toBe('a [31mb c d');
    expect(tidyName('x'.repeat(500)).length).toBe(120);
    expect(keyName('')).toBe('(unnamed)');
    expect(keyName(7)).toBe('(unnamed)');
    expect(keyName('slack')).toBe('slack');
  });
});
