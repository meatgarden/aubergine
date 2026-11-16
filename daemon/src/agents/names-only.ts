/**
 * The names-only rule.
 *
 * An agent's configuration files can hold secrets: an MCP server's
 * environment variables and headers, a token in an argument, a password in
 * an address, a key pasted into a hook's command. Whatever is shown of those
 * files goes through this module, and only names come out of it: a
 * program's name, an address's host, the names of variables and headers.
 * Never a value, never an argument list, never the rest of a command line.
 *
 * Everything here takes `unknown`, because what it is given was written by
 * someone else, and returns short plain text.
 */

const MAX_NAME = 120;
const MAX_NAMES = 12;

/** One line, without control characters or characters that reverse the direction of text, cut to a sensible length. */
export function tidyName(text: string, max: number = MAX_NAME): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0x200e || code === 0x200f) out += ' ';
    else out += char;
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** A name that is safe to show as a name: a key of a map someone else wrote. Something that looks like a value, not a name, is not shown. */
export function keyName(key: unknown): string {
  if (typeof key !== 'string') return '(unnamed)';
  const tidy = tidyName(key);
  return tidy === '' ? '(unnamed)' : tidy;
}

/** The name of an environment variable or a header, when it looks like one; otherwise a placeholder. A value pasted where a name belongs is not repeated. */
function variableName(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(key) ? key : '(a name that is not shown)';
}

/** The names in a map, never its values: `API_KEY, REGION`. */
export function namesOf(map: unknown): string[] {
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return [];
  const names = Object.keys(map).map(variableName);
  return names.length > MAX_NAMES ? [...names.slice(0, MAX_NAMES), `and ${names.length - MAX_NAMES} more`] : names;
}

/**
 * The program a command line starts: its file name, without its folder, its
 * arguments, or anything set in front of it. `FOO=secret /opt/bin/tool --key
 * abc` is `tool`. When no program can be made out, `a command`.
 */
export function programOf(command: unknown): string {
  if (typeof command !== 'string') return 'a command';
  const words = shellWords(command, 8);
  // Leading assignments (`KEY=value cmd`) and the `env` or `exec` that carries them are not the program.
  let index = 0;
  while (index < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] as string) || words[index] === 'env' || words[index] === 'exec')) index += 1;
  // A variable for a folder in front of the path says nothing by itself: `${ROOT}/scripts/run.sh` is `run.sh`.
  const base = (words[index] ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
  // What is left must look like a file name, and not like a credential put where a program belongs.
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(base) || looksLikeACredential(base)) return 'a command';
  return base;
}

/** The first few words of a command line as a shell would split them: quotes are taken off, and a quoted part with spaces stays one word. */
function shellWords(command: string, most: number): string[] {
  const words: string[] = [];
  let word = '';
  let quote: string | null = null;
  let any = false;
  for (const char of command.trim()) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      any = true;
    } else if (/\s/.test(char)) {
      if (word !== '' || any) words.push(word);
      word = '';
      any = false;
      if (words.length >= most) return words;
    } else word += char;
  }
  if (word !== '' || any) words.push(word);
  return words;
}

/**
 * Whether a word looks like a key or a token and not like the name of a program. A guess, made on the
 * careful side: a program whose name has four digits in it, or is long and mixed like a key, is shown as
 * "a command" too. Showing a name less often costs little; showing a key once costs a lot.
 */
export function looksLikeACredential(word: string): boolean {
  if (/^(sk|pk|rk|ghp|gho|ghu|ghs|ghr|glpat|xox[abprs]|akia|asia|eyj|aub1|aubt|ya29|npm)[-_]?/i.test(word) && word.length >= 12) return true;
  if ((word.match(/\d/g) ?? []).length >= 4) return true;
  if (word.length >= 20 && /[a-z]/.test(word) && /[A-Z]/.test(word) && /\d/.test(word)) return true;
  return word.length > 32;
}

/**
 * The host of an address, and nothing else of it: no user name or password,
 * no path, no query. `https://user:pw@api.example.com/v1?key=abc` is
 * `api.example.com`. When it is not an address, `an address`.
 */
export function hostOf(address: unknown): string {
  if (typeof address !== 'string') return 'an address';
  try {
    const url = new URL(address.trim());
    if (!/^(https?|wss?):$/.test(url.protocol)) return 'an address';
    const host = url.hostname;
    return /^[A-Za-z0-9.[\]:-]{1,253}$/.test(host) && host !== '' ? host : 'an address';
  } catch {
    // An address with a placeholder in it (`${BASE_URL}/mcp`) is not one a host can be read from.
    return 'an address';
  }
}

/** One MCP server as its configuration describes it, in names only. */
export function describeMcpServer(entry: unknown): string {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return 'not in a form that is recognised';
  const server = entry as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof server.url === 'string') {
    const kind = typeof server.type === 'string' && /^(http|sse|ws|streamable-http)$/.test(server.type) ? server.type : 'remote';
    parts.push(`${kind}, at ${hostOf(server.url)}`);
    const headers = namesOf(server.headers);
    if (headers.length > 0) parts.push(`headers: ${headers.join(', ')}`);
    if (typeof server.headersHelper === 'string') parts.push(`headers from ${programOf(server.headersHelper)}`);
  } else if (typeof server.command === 'string') {
    const count = Array.isArray(server.args) ? server.args.length : 0;
    parts.push(`runs ${programOf(server.command)}${count > 0 ? ` with ${count} argument${count === 1 ? '' : 's'}` : ''}`);
  } else {
    parts.push('neither a command nor an address is given');
  }
  const env = namesOf(server.env);
  if (env.length > 0) parts.push(`environment: ${env.join(', ')}`);
  return parts.join(' · ');
}

/** One hook handler, in names only: what kind it is and, for a command, the program it starts. */
export function describeHook(handler: unknown): string {
  if (handler === null || typeof handler !== 'object' || Array.isArray(handler)) return 'not in a form that is recognised';
  const hook = handler as Record<string, unknown>;
  const type = typeof hook.type === 'string' && /^[a-z-]{1,20}$/.test(hook.type) ? hook.type : 'unknown kind';
  if (type === 'command') return `runs ${programOf(hook.command)}`;
  if (typeof hook.url === 'string') return `${type}, to ${hostOf(hook.url)}`;
  return `a ${type} hook`;
}

/** What a hook matches on, when that is a plain list of tool names (`Write|Edit`); otherwise only that there is a matcher. */
export function matcherName(matcher: unknown): string {
  if (typeof matcher !== 'string' || matcher.trim() === '' || matcher === '*') return '';
  return /^[A-Za-z0-9_|*.-]{1,80}$/.test(matcher) ? matcher : 'a pattern';
}

/**
 * A permission rule, in names only: the tool, and for a rule about commands
 * the program it is about. `Bash(curl -H "Authorization: abc" *)` is
 * `Bash: curl`. The rest of the rule is not shown: it may hold anything.
 */
export function describeRule(rule: unknown): string {
  if (typeof rule !== 'string') return '(not a rule)';
  const match = /^([A-Za-z][A-Za-z0-9_.-]{0,100})(?:\((.*)\))?$/s.exec(rule.trim());
  if (!match) return '(a rule that is not shown)';
  const tool = match[1] as string;
  const inside = match[2];
  if (inside === undefined || inside.trim() === '') return tool;
  if (tool === 'Bash' || tool === 'PowerShell') {
    const program = programOf(inside);
    return program === 'a command' ? `${tool}: a pattern` : `${tool}: ${program}`;
  }
  return `${tool}: a pattern`;
}
