import type { JsonSchema, OpenApiDocument, OpenApiOperation } from '@aubergine/shared';

/**
 * Writes the typed client from the description of the API. Pure: a document
 * in, the text of `client/src/generated.ts` out. Nothing here knows about any
 * particular route; a route that is declared appears in the client.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
const key = (name: string): string => (isIdentifier(name) ? name : JSON.stringify(name));

/** A JSON Schema as a TypeScript type. Covers what the schemas of this API use; anything else is `unknown`. */
export function tsType(schema: Json | undefined, indent = ''): string {
  if (schema === undefined || schema === null || typeof schema !== 'object' || Array.isArray(schema)) return 'unknown';
  const node = schema as { [key: string]: Json };
  if (typeof node.$ref === 'string') return node.$ref.split('/').at(-1) === 'Error' ? 'ErrorBody' : 'unknown';
  if ('const' in node) return JSON.stringify(node.const);
  if (Array.isArray(node.enum)) return node.enum.map((value) => JSON.stringify(value)).join(' | ');
  for (const union of ['anyOf', 'oneOf'] as const) {
    const options = node[union];
    if (Array.isArray(options)) return options.map((option) => parenthesised(tsType(option, indent))).join(' | ');
  }
  if (Array.isArray(node.allOf)) return node.allOf.map((part) => parenthesised(tsType(part, indent))).join(' & ');
  if (Array.isArray(node.type)) return node.type.map((type) => tsType({ ...node, type }, indent)).join(' | ');

  switch (node.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `${parenthesised(tsType(node.items, indent))}[]`;
    case 'object': {
      const properties = (node.properties ?? {}) as { [key: string]: Json };
      const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
      const inner = `${indent}  `;
      const lines = Object.entries(properties).map(([name, value]) => {
        const description = value && typeof value === 'object' && !Array.isArray(value) && typeof value.description === 'string' ? `${inner}/** ${value.description.replace(/\*\//g, '* /')} */\n` : '';
        return `${description}${inner}${key(name)}${required.has(name) ? '' : '?'}: ${tsType(value, inner)};`;
      });
      const extra = node.additionalProperties;
      if (extra !== undefined && extra !== false) {
        const value = extra === true ? 'unknown' : tsType(extra, inner);
        // With named fields beside it, an index signature must admit them all.
        lines.push(`${inner}[key: string]: ${lines.length > 0 ? 'unknown' : value};`);
      }
      return lines.length === 0 ? 'Record<string, never>' : `{\n${lines.join('\n')}\n${indent}}`;
    }
    default:
      return 'unknown';
  }
}

function parenthesised(type: string): string {
  return /[|&]/.test(type) && !type.startsWith('{') && !type.startsWith('(') ? `(${type})` : type;
}

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

interface Operation {
  path: string;
  method: Uppercase<(typeof METHODS)[number]>;
  operation: OpenApiOperation;
}

export function operationsOf(document: OpenApiDocument): Operation[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method];
      return operation ? [{ path, method: method.toUpperCase() as Operation['method'], operation }] : [];
    }),
  );
}

const pascal = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

function comment(lines: string[], indent = ''): string {
  return [`${indent}/**`, ...lines.flatMap((line) => line.split('\n')).map((line) => `${indent} * ${line}`.trimEnd()), `${indent} */`].join('\n');
}

/** The schema of a successful answer, or null when there is none. */
function answerSchema(operation: OpenApiOperation): { schema: JsonSchema; stream: boolean } | null {
  for (const [status, response] of Object.entries(operation.responses)) {
    if (!status.startsWith('2') || '$ref' in response || !response.content) continue;
    const json = response.content['application/json'];
    if (json) return { schema: json.schema, stream: false };
    const events = response.content['text/event-stream'];
    if (events) return { schema: events.schema, stream: true };
  }
  return null;
}

export function emitClient(document: OpenApiDocument): string {
  const operations = operationsOf(document);
  const out: string[] = [
    '// Generated from the description of the API (/v1/openapi.json). Do not edit by hand:',
    '// change the route declarations in shared/src/routes.ts and run `pnpm generate`.',
    '',
    "import { everyItem, requester, type CallOptions, type ClientOptions, type OperationInfo } from './runtime';",
    '',
    '/** The one shape every error has. */',
    `export type ErrorBody = ${tsType(document.components.schemas.Error)};`,
    '',
  ];

  // The types of each route: what it takes and what it gives.
  for (const { operation } of operations) {
    const name = pascal(operation.operationId);
    const query = operation.parameters.filter((p) => p.in === 'query');
    if (query.length > 0) {
      out.push(`export interface ${name}Query {`);
      for (const parameter of query) {
        if (parameter.description) out.push(comment([parameter.description], '  '));
        out.push(`  ${key(parameter.name)}${parameter.required ? '' : '?'}: ${tsType(parameter.schema, '  ')};`);
      }
      out.push('}', '');
    }
    const body = operation.requestBody?.content['application/json'].schema;
    if (body) out.push(`export type ${name}Body = ${tsType(body)};`, '');
    const answer = answerSchema(operation);
    if (answer) out.push(`export type ${name}${answer.stream ? 'Event' : 'Result'} = ${tsType(answer.schema)};`, '');
  }

  // What the hand-written part needs to know about each route.
  out.push('/** What each route is, for the code that makes the requests. */', 'export const OPERATIONS = {');
  for (const { path, method, operation } of operations) {
    const params = operation.parameters.filter((p) => p.in === 'path').map((p) => JSON.stringify(p.name));
    out.push(
      `  ${operation.operationId}: { method: '${method}', path: '${path}', params: [${params.join(', ')}], hasBody: ${operation.requestBody !== undefined}, paged: ${operation['x-aubergine-paged'] === true}, idempotent: ${operation['x-aubergine-idempotent'] === true}, stream: ${operation['x-aubergine-stream'] === true} },`,
    );
  }
  out.push('} as const satisfies Record<string, OperationInfo>;', '', 'export type OperationId = keyof typeof OPERATIONS;', '');

  // The client itself: one method per route.
  out.push('/** One method for each route of the API. */', 'export interface Client {');
  const each: string[] = [];
  for (const { path, method, operation } of operations) {
    const id = operation.operationId;
    const name = pascal(id);
    const params = operation.parameters.filter((p) => p.in === 'path').map((p) => `${key(p.name)}: string`);
    const hasQuery = operation.parameters.some((p) => p.in === 'query');
    const queryRequired = operation.parameters.some((p) => p.in === 'query' && p.required);
    const body = operation.requestBody;
    const fields = [...params, ...(hasQuery ? [`query${queryRequired ? '' : '?'}: ${name}Query`] : []), ...(body ? [`body${body.required ? '' : '?'}: ${name}Body`] : [])];
    const needsArgs = params.length > 0 || queryRequired || body?.required === true;
    const args = `args${needsArgs ? '' : '?'}: ${fields.length > 0 ? `{ ${fields.join('; ')} } & CallOptions` : 'CallOptions'}`;
    const answer = answerSchema(operation);
    const access = operation['x-aubergine-access'];
    const who = access.who === 'any' ? 'Needs no scope.' : access.who === 'browser' ? 'Signed-in browser only: no API token may call this.' : access.who === 'session' ? `A session's own token${access.scope ? `, or an API token with \`${access.scope}\`` : ''}.` : `Scope: \`${access.scope}\`.`;
    out.push(comment([`${operation.summary}.`, '', `\`${method} ${path}\`. ${who}`], '  '));
    out.push(`  ${id}(${args}): ${answer?.stream ? `AsyncGenerator<${name}Event, void, void>` : `Promise<${answer ? `${name}Result` : 'void'}>`};`);
    if (operation['x-aubergine-paged']) {
      each.push(comment([`Every item of \`${id}\`, fetched a page at a time as they are asked for.`], '    '));
      each.push(`    ${id}(${args.replace('args:', 'args?:').replace('args??', 'args?')}): AsyncGenerator<${name}Result['items'][number], void, void>;`);
    }
  }
  out.push('  /** For each list: every item of it, across its pages. Use with `for await`. */', '  each: {', ...each, '  };', '}', '');

  out.push(
    '/**',
    ' * Makes a client for one server. Give it a token (`token`), or in a page served',
    ' * by the server itself say `useCookie: true`.',
    ' */',
    'export function createClient(options: ClientOptions = {}): Client {',
    '  const { call, stream } = requester(options);',
    '  const client: Record<string, unknown> = {};',
    '  const each: Record<string, unknown> = {};',
    '  for (const [id, info] of Object.entries(OPERATIONS) as [OperationId, OperationInfo][]) {',
    '    client[id] = (args: Record<string, unknown> = {}) => (info.stream ? stream(info, args) : call(info, args));',
    '    if (info.paged) {',
    '      each[id] = (args: { query?: Record<string, unknown> } & Record<string, unknown> = {}) =>',
    '        everyItem((cursor) => call(info, { ...args, query: { ...args.query, ...(cursor === undefined ? {} : { cursor }) } }) as Promise<{ items: unknown[]; nextCursor: string | null }>);',
    '    }',
    '  }',
    '  client.each = each;',
    '  return client as unknown as Client;',
    '}',
    '',
  );
  return out.join('\n');
}
