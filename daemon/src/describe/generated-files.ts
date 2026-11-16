import { openApiDocument } from '@aubergine/shared';
import { emitClient } from './emit-client';
import { emitDocs } from './emit-docs';

/**
 * Everything that is generated from the description of the API and kept in
 * the repository, by path from the repository's root. The script writes
 * these; a test fails when what is committed differs.
 *
 * The version is left out of what is generated, so that a release does not
 * change these files.
 */
export function generatedFiles(): Record<string, string> {
  const document = openApiDocument({ version: '0' });
  return {
    'client/src/generated.ts': emitClient(document),
    'docs/api.md': emitDocs(document),
  };
}
