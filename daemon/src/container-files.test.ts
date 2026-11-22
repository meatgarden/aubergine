import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot } from './package-root';

// The container files in docker/ are read as text; nothing is built or started. They keep the rules for a server
// that listens on 127.0.0.1 only: the web server shares the container's network, and Aubergine's own port is never
// published.
const folder = path.join(packageRoot(), 'docker');
const read = (name: string): string => readFileSync(path.join(folder, name), 'utf8');
/** The lines that are not comments, so that a comment saying what must not be done does not count as doing it. */
const code = (text: string): string => text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');

/** The lines of one top-level service in compose.yaml, up to the next service or the next top-level key. */
function service(compose: string, name: string): string {
  const lines = code(compose).split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  expect(start, `service ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line) || /^\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('the container files', () => {
  it("publish the web server's ports and never Aubergine's, on a network the web server joins", () => {
    const compose = read('compose.yaml');
    const aubergine = service(compose, 'aubergine');
    const proxy = service(compose, 'proxy');
    // The network is the container's that holds the terminals: the web server can be restarted without ending them.
    expect(proxy).toMatch(/^\s+network_mode: "service:aubergine"$/m);
    expect(aubergine).not.toMatch(/^\s+network_mode:/m);
    expect(proxy).not.toMatch(/^\s+(ports|expose):/m);
    expect(aubergine).not.toMatch(/^\s+expose:/m);
    // Every published port in the file: 80 and 443, and nothing else.
    const published = [...code(compose).matchAll(/^\s+- "([^"]+)"$/gm)].map((match) => match[1] ?? '').filter((entry) => /^\d/.test(entry));
    expect(published.sort()).toEqual(['443:443', '443:443/udp', '80:80']);
    expect(aubergine).toMatch(/^\s+init: true$/m);
    // Named volumes only: no folder of the host is handed to the terminals.
    const mounts = [...aubergine.matchAll(/^\s+- ([^:\s]+):\//gm)].map((match) => match[1] ?? '');
    expect(mounts.length).toBeGreaterThan(0);
    expect(mounts.filter((source) => /^[./~$]/.test(source))).toEqual([]);
  });

  it('never bind elsewhere, run privileged or reach the Docker socket', () => {
    for (const name of readdirSync(folder)) {
      const text = read(name);
      for (const word of ['0.0.0.0', '--host', 'privileged', 'docker.sock']) expect(text, `${name} has ${word}`).not.toContain(word);
    }
  });

  it('build an image that publishes nothing of its own, runs as a user, and installs the packed file', () => {
    const dockerfile = code(read('Dockerfile'));
    expect(dockerfile).not.toMatch(/^\s*EXPOSE\b/m);
    const users = [...dockerfile.matchAll(/^\s*USER\s+(\S+)/gm)].map((match) => match[1]);
    expect(users.length).toBeGreaterThan(0);
    expect(users.at(-1)).not.toMatch(/^(root|0)(:|$)/);
    // From the file scripts/npm-package.mjs packed, never from the registry by name.
    expect(dockerfile).toMatch(/npm-package\.mjs --pack/);
    const installs = [...dockerfile.matchAll(/npm install -g ([^\n]*)/g)].map((match) => match[1] ?? '');
    expect(installs.some((line) => /\.tgz\b/.test(line))).toBe(true);
    const byName = /^(@[^/\s]+\/)?aubergine(@\S*)?$/;
    expect(installs.flatMap((line) => line.split(/\s+/)).filter((word) => byName.test(word))).toEqual([]);
    // No secret is handed to the build.
    expect(dockerfile).not.toMatch(/^\s*ARG\s+\S*(TOKEN|SECRET|PASSWORD|KEY)/im);
  });

  it('start the server through an entrypoint that ends by handing over to it', () => {
    const lines = read('entrypoint.sh').trimEnd().split('\n');
    expect(lines[0]).toBe('#!/bin/sh');
    expect(lines.at(-1)).toBe('main "$@"');
    const body = lines.slice(lines.indexOf('main() {'), lines.lastIndexOf('}'));
    expect(body.length).toBeGreaterThan(0);
    expect(body.filter((line) => line.trim() !== '').at(-1)?.trim()).toBe('exec "$@"');
  });

  it('pass requests on to 127.0.0.1 and leave Host as it came', () => {
    const caddyfile = code(read('Caddyfile'));
    expect(caddyfile).toMatch(/reverse_proxy 127\.0\.0\.1:4600/);
    expect(caddyfile).not.toMatch(/reverse_proxy\s+(?!127\.0\.0\.1:)/);
    expect(caddyfile).not.toMatch(/header_up/i);
    expect(caddyfile.toLowerCase()).not.toContain('host {');
  });
});
