import { describe, expect, it } from 'vitest';
import { stableNodePath } from './node-path';

const versioned = '/opt/pkg/Cellar/node/26.1.0/bin/node';

function realpathFrom(links: Record<string, string>) {
  return (file: string) => {
    if (file in links) return links[file]!;
    throw new Error(`ENOENT: ${file}`);
  };
}

describe('stableNodePath', () => {
  it('prefers a PATH entry that points at the running binary', () => {
    const realpath = realpathFrom({ [versioned]: versioned, '/opt/pkg/bin/node': versioned });
    expect(stableNodePath(versioned, '/usr/bin:/opt/pkg/bin', realpath)).toBe('/opt/pkg/bin/node');
  });

  it('ignores a different node earlier on the PATH', () => {
    const realpath = realpathFrom({
      [versioned]: versioned,
      '/usr/bin/node': '/usr/bin/node',
      '/opt/pkg/bin/node': versioned,
    });
    expect(stableNodePath(versioned, '/usr/bin:/opt/pkg/bin', realpath)).toBe('/opt/pkg/bin/node');
  });

  it('falls back to the running binary when nothing on the PATH matches', () => {
    const realpath = realpathFrom({ [versioned]: versioned });
    expect(stableNodePath(versioned, '/usr/bin:relative/bin', realpath)).toBe(versioned);
  });

  it('falls back when the running binary cannot be resolved', () => {
    expect(stableNodePath(versioned, '/usr/bin', realpathFrom({}))).toBe(versioned);
  });
});
