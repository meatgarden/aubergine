import type { JsonSchema, OpenApiDocument, OpenApiOperation } from '@aubergine/shared';
import { operationsOf, tsType } from './emit-client';

/**
 * Writes the reference (`docs/api.md`) from the description of the API.
 * Pure: a document in, Markdown out. One section per route.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A value that fits a schema, for an example: only what is required, and something plain for each kind. */
export function exampleOf(schema: Json | undefined, name = ''): Json {
  if (schema === undefined || schema === null || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const node = schema as { [key: string]: Json };
  if ('const' in node) return node.const as Json;
  if (Array.isArray(node.enum)) return node.enum[0] ?? null;
  const options = (node.anyOf ?? node.oneOf) as Json[] | undefined;
  if (Array.isArray(options)) return exampleOf(options.find((o) => !(o && typeof o === 'object' && !Array.isArray(o) && o.type === 'null')) ?? options[0], name);
  const type = Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;
  switch (type) {
    case 'string':
      if (node.format === 'uuid' || /Id$/.test(name)) return `<${name || 'id'}>`;
      if (node.format === 'date-time') return '2027-01-31T00:00:00.000Z';
      if (name === 'cwd') return '/path/to/project';
      if (name === 'command') return 'npm test';
      if (name === 'name') return 'example';
      return 'text';
    case 'integer':
    case 'number':
      return typeof node.minimum === 'number' ? Math.max(node.minimum, 0) : 0;
    case 'boolean':
      return true;
    case 'array':
      return [exampleOf(node.items, name)];
    case 'object': {
      const properties = (node.properties ?? {}) as { [key: string]: Json };
      const required = Array.isArray(node.required) ? (node.required as string[]) : [];
      // Nothing required: show the first field, so the example is not empty.
      const shown = required.length > 0 ? required : Object.keys(properties).slice(0, 1);
      return Object.fromEntries(shown.map((field) => [field, exampleOf(properties[field], field)]));
    }
    default:
      return null;
  }
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** A type short enough for a table cell. */
function shortType(schema: Json): string {
  const type = tsType(schema).replace(/\s+/g, ' ');
  return type.length > 70 ? `${type.slice(0, 67)}…` : type;
}

function fieldsTable(schema: JsonSchema): string[] {
  const properties = (schema.properties ?? {}) as { [key: string]: JsonSchema };
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  if (Object.keys(properties).length === 0) return [];
  return [
    '| Field | Type | Required | |',
    '|---|---|---|---|',
    ...Object.entries(properties).map(([name, value]) => `| \`${name}\` | \`${cell(shortType(value))}\` | ${required.has(name) ? 'yes' : 'no'} | ${cell(typeof value.description === 'string' ? value.description : '')} |`),
    '',
  ];
}

function curl(path: string, method: string, operation: OpenApiOperation, server: string): string[] {
  const access = operation['x-aubergine-access'];
  if (access.who === 'browser') return [];
  const session = access.who === 'session' && access.scope === null;
  const address = `${session ? '$AUBERGINE_URL' : server}${path.replace(/\{([A-Za-z]+)\}/g, '<$1>')}`;
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} -H "Authorization: Bearer ${session ? '$AUBERGINE_TOKEN' : '$TOKEN'}"`];
  const required = operation.parameters.filter((p) => p.in === 'query' && p.required).map((p) => `${p.name}=${String(exampleOf(p.schema, p.name))}`);
  const body = operation.requestBody?.content['application/json'].schema;
  if (body) lines.push(`     -H "Content-Type: application/json" -d '${JSON.stringify(exampleOf(body))}'`);
  if (operation['x-aubergine-stream']) lines[0] = lines[0]?.replace('curl', 'curl -N') ?? '';
  lines.push(`     ${address}${required.length > 0 ? `?${required.join('&')}` : ''}`);
  return ['```sh', lines.join(' \\\n'), '```', ''];
}

export function emitDocs(document: OpenApiDocument): string {
  const server = document.servers[0]?.url ?? 'http://127.0.0.1:4600';
  const operations = operationsOf(document);
  const out: string[] = [
    '# API reference',
    '',
    '<!-- Generated from the description of the API (/v1/openapi.json). Do not edit by hand: change the route declarations in shared/src/routes.ts and run `pnpm generate`. -->',
    '',
    document.info.description,
    '',
    'This file is generated from the same declarations the server registers its routes from, so it cannot fall behind them. The description itself is served by every server at `/v1/openapi.json`, as an OpenAPI 3.1 document; a typed client generated from it is in `client/`.',
    '',
    'How to create a token, what the scopes mean, the limits and the activity log are in the README, under "API tokens". In the examples, `$TOKEN` is the secret of an API token.',
    '',
    '## Routes',
    '',
    '| | | Scope |',
    '|---|---|---|',
    ...operations.map(({ path, method, operation }) => {
      const access = operation['x-aubergine-access'];
      const scope = access.who === 'any' ? 'none' : access.who === 'browser' ? 'browser only' : access.who === 'session' ? (access.scope ? `session's own token, or \`${access.scope}\`` : "session's own token") : `\`${access.scope}\``;
      return `| [\`${method} ${path}\`](#${operation.operationId.toLowerCase()}) | ${cell(operation.summary)} | ${scope} |`;
    }),
    '',
    '## Errors',
    '',
    'Every error is `{"error": {"code": "...", "message": "..."}}`.',
    '',
    '| Status | Code | When |',
    '|---|---|---|',
    ...Object.values(document.components.responses)
      .map((response) => {
        const match = /^(.*) The code is `([a-z_]+)`\.$/.exec(response.description);
        return match ? { code: match[2] ?? '', when: match[1] ?? '' } : null;
      })
      .flatMap((row, index) => (row ? [`| ${['400', '401', '403', '404', '409', '413', '429', '503'][index]} | \`${row.code}\` | ${cell(row.when)} |`] : [])),
    '',
  ];

  let tag = '';
  for (const { path, method, operation } of operations) {
    if (operation.tags[0] !== tag) {
      tag = operation.tags[0] ?? '';
      out.push(`## ${tag}`, '');
    }
    out.push(`### ${operation.operationId}`, '', `\`${method} ${path}\`: ${operation.summary}.`, '', operation.description, '');

    const parameters = operation.parameters;
    if (parameters.length > 0) {
      out.push('| Parameter | In | Type | Required | |', '|---|---|---|---|---|');
      for (const p of parameters) out.push(`| \`${p.name}\` | ${p.in} | \`${cell(shortType(p.schema))}\` | ${p.required ? 'yes' : 'no'} | ${cell(p.description ?? (p.in === 'path' ? 'An ID.' : ''))} |`);
      out.push('');
    }
    const body = operation.requestBody?.content['application/json'].schema;
    if (body) {
      out.push(`**Body** (JSON${operation.requestBody?.required ? '' : ', may be left out'}):`, '', ...fieldsTable(body));
    }
    const success = Object.entries(operation.responses).find(([status]) => status.startsWith('2'));
    if (success) {
      const [status, response] = success;
      const content = '$ref' in response ? undefined : response.content;
      const schema = content?.['application/json']?.schema ?? content?.['text/event-stream']?.schema;
      out.push(`**Answer** \`${status}\`${content?.['text/event-stream'] ? ', a stream; each `data:` line is' : schema ? ':' : ', with nothing in it.'}`, '');
      if (schema) out.push('```ts', tsType(schema), '```', '');
    }
    const errors = Object.keys(operation.responses).filter((status) => !status.startsWith('2'));
    out.push(`**Errors:** ${errors.join(', ')}.`, '', ...curl(path, method, operation, server));
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
