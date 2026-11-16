import { z } from 'zod';
import { accessOf, scopeFor, type Action } from './access';
import { ErrorResponse, IDEMPOTENCY_HEADER, type ErrorCode } from './protocol';
import { ROUTES, ROUTE_IDS, ROUTE_TAGS, type RouteId, type RouteSpec } from './routes';
import { GRANTABLE_SCOPES, SCOPE_MEANING, TOKEN_PREFIX, type Scope } from './tokens';

/**
 * The description of the public API, as an OpenAPI 3.1 document, worked out
 * from the route declarations and their schemas. Nothing in it is written by
 * hand per route: change a declaration and the description changes with it.
 * Pure: no server is needed to produce it.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonSchema = { [key: string]: Json };

/** Who may call a route, as the description carries it under `x-aubergine-access`. */
export interface RouteAccess {
  /** The scope an API token needs; null when no token may call it, or when it needs none. */
  scope: Scope | null;
  /** Scopes that particular fields of the body need instead of, or besides, the route's own. */
  fieldScopes: Record<string, Scope | null>;
  /** `any`: any caller. `token`: an API token with the scope, or the browser. `browser`: the signed-in browser only. `session`: a session's own token (or the browser), and for `note.append` also a token with the scope. */
  who: 'any' | 'token' | 'browser' | 'session';
}

export interface OpenApiOperation {
  operationId: RouteId;
  tags: string[];
  summary: string;
  description: string;
  security: Record<string, string[]>[];
  parameters: { name: string; in: 'path' | 'query' | 'header'; required: boolean; description?: string; schema: JsonSchema }[];
  requestBody?: { required: boolean; content: { 'application/json': { schema: JsonSchema } } };
  responses: Record<string, { description: string; content?: Record<string, { schema: JsonSchema }>; headers?: Record<string, { description: string; schema: JsonSchema }> } | { $ref: string }>;
  'x-aubergine-access': RouteAccess;
  'x-aubergine-paged'?: true;
  'x-aubergine-idempotent'?: true;
  'x-aubergine-stream'?: true;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string }[];
  paths: Record<string, Partial<Record<'get' | 'post' | 'patch' | 'put' | 'delete', OpenApiOperation>>>;
  components: {
    securitySchemes: Record<string, { type: string; scheme?: string; in?: string; name?: string; description: string }>;
    schemas: Record<string, JsonSchema>;
    responses: Record<string, { description: string; content: Record<string, { schema: JsonSchema }>; headers?: Record<string, { description: string; schema: JsonSchema }> }>;
  };
}

/**
 * A zod schema as JSON Schema, tidied for a description that people read.
 * What goes in may carry fields the server does not know (they are ignored),
 * and what comes out may gain fields later, so neither is closed.
 */
export function jsonSchemaOf(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const raw = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonSchema;
  const tidy = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(tidy);
    if (node === null || typeof node !== 'object') return node;
    const out: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') continue;
      if (key === 'additionalProperties' && value === false) continue;
      // zod spells out what a date-time looks like as a long pattern; the format says it already.
      if (key === 'pattern' && (node.format === 'date-time' || node.format === 'uuid')) continue;
      out[key] = tidy(value);
    }
    return out;
  };
  return tidy(raw) as JsonSchema;
}

/** `/v1/canvases/:canvasId` as OpenAPI writes it: `/v1/canvases/{canvasId}`. */
export const openApiPath = (path: string): string => path.replace(/:([A-Za-z]+)/g, '{$1}');

export function accessOfRoute(spec: RouteSpec): RouteAccess {
  const fieldScopes = Object.fromEntries(Object.entries({ ...spec.fieldActions, ...spec.fieldAlso }).map(([field, action]) => [field, scopeFor(action)]));
  if (spec.action === null) return { scope: null, fieldScopes, who: 'any' };
  const access = accessOf(spec.action);
  if (access.session) return { scope: access.scope, fieldScopes, who: 'session' };
  return { scope: access.scope, fieldScopes, who: access.scope === null ? 'browser' : 'token' };
}

/** Who may call a route, in a sentence, for the description and the reference. */
export function accessSentence(spec: RouteSpec): string {
  const access = accessOfRoute(spec);
  const also = Object.entries(spec.fieldAlso ?? {})
    .map(([field, action]) => ` Sending \`${field}\` needs \`${scopeFor(action)}\` as well, with a reach that covers the session being made.`)
    .join('');
  const fields = Object.entries(access.fieldScopes)
    .filter(([field]) => spec.fieldActions?.[field] !== undefined)
    .map(([field, scope]) => ` Sending \`${field}\` needs \`${scope}\`${spec.fieldActions && Object.keys(spec.fieldActions).length > 0 ? ' instead, or as well when other fields are sent' : ''}.`)
    .join('');
  switch (access.who) {
    case 'any':
      return 'Needs no scope: any caller that is who it says it is.';
    case 'browser':
      return 'For the signed-in browser only. No API token may call this, whatever its scopes.';
    case 'session':
      return access.scope
        ? `For a session's own token, about that session; or an API token with the scope \`${access.scope}\`, about any session.`
        : "For a session's own token, about that session. No API token may call this.";
    default:
      return `An API token needs the scope \`${access.scope}\`.${spec.action === 'workflows.write' ? ' A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).' : ''}${fields}${also}`;
  }
}

const ERROR_TEXT: Record<string, { status: string; code: ErrorCode; description: string }> = {
  BadRequest: { status: '400', code: 'bad_request', description: 'The request is not what this route accepts: a field is missing or wrong, a cursor is not one the server gave out.' },
  Unauthorized: { status: '401', code: 'unauthorized', description: 'No credential, a wrong one, or a token that has been revoked or has expired.' },
  Forbidden: { status: '403', code: 'forbidden', description: 'The credential is good but may not do this: the token lacks the scope, or no token may.' },
  NotFound: { status: '404', code: 'not_found', description: 'There is no such canvas, session, node, frame, token, workflow or run.' },
  Conflict: { status: '409', code: 'conflict', description: 'It cannot be done as things stand: for example closing the last canvas, parking a session whose shell has ended, or a report that does not fit where a run stands.' },
  TooLarge: { status: '413', code: 'too_large', description: 'The request body is larger than the server accepts.' },
  RateLimited: { status: '429', code: 'rate_limited', description: 'Too many calls with this token in a short time. `Retry-After` says in how many seconds to try again.' },
  Unavailable: { status: '503', code: 'runtime_unavailable', description: 'The server cannot start or reach terminals right now (tmux is missing or too old).' },
};
const BY_STATUS = Object.fromEntries(Object.entries(ERROR_TEXT).map(([name, value]) => [value.status, name]));

function pathParameter(name: string, schema: z.ZodType): { description?: string; schema: JsonSchema } {
  if (name.endsWith('Id')) return { schema: { type: 'string', format: 'uuid' } };
  const { description, ...rest } = jsonSchemaOf(schema, 'input');
  return { ...(typeof description === 'string' ? { description } : {}), schema: rest };
}

function operation(id: RouteId, spec: RouteSpec): OpenApiOperation {
  const access = accessOfRoute(spec);
  const parameters: OpenApiOperation['parameters'] = [];
  for (const [name, schema] of Object.entries(spec.params?.shape ?? {})) {
    // Nearly every parameter is an ID. One that is not is described by its own schema.
    parameters.push({ name, in: 'path', required: true, ...pathParameter(name, schema as z.ZodType) });
  }
  if (spec.query) {
    const query = jsonSchemaOf(spec.query, 'input');
    const required = Array.isArray(query.required) ? query.required : [];
    for (const [name, schema] of Object.entries((query.properties ?? {}) as Record<string, JsonSchema>)) {
      const { description, ...rest } = schema;
      parameters.push({ name, in: 'query', required: required.includes(name), ...(typeof description === 'string' ? { description } : {}), schema: rest });
    }
  }
  if (spec.idempotent) {
    parameters.push({
      name: IDEMPOTENCY_HEADER,
      in: 'header',
      required: false,
      description: 'A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more.',
      schema: { type: 'string', minLength: 1, maxLength: 128 },
    });
  }

  const responses: OpenApiOperation['responses'] = {};
  if (spec.stream) {
    responses['200'] = {
      description: 'A stream that stays open. Each `data:` line is one JSON object of the shape given here.',
      content: { 'text/event-stream': { schema: jsonSchemaOf(spec.stream, 'output') } },
    };
  } else if (spec.response) {
    responses[String(spec.status)] = { description: spec.status === 201 ? 'Created.' : 'Done.', content: { 'application/json': { schema: jsonSchemaOf(spec.response, 'output') } } };
  } else {
    responses[String(spec.status)] = { description: 'Done. Nothing is sent back.' };
  }
  // What every route can answer, then what this one can besides.
  const statuses = ['400', '401', '403', '413', '429', ...(spec.errors ?? []).map(String)].filter((status) => !(access.who === 'any' && status === '403'));
  for (const status of [...new Set(statuses)].sort()) responses[status] = { $ref: `#/components/responses/${BY_STATUS[status]}` };

  const security: Record<string, string[]>[] =
    access.who === 'browser'
      ? [{ browserCookie: [] }]
      : access.who === 'any'
        ? [{ apiToken: [] }, { sessionToken: [] }, { browserCookie: [] }]
        : access.who === 'session'
          ? [{ sessionToken: [] }, ...(access.scope ? [{ apiToken: [access.scope] }] : []), { browserCookie: [] }]
          : [{ apiToken: access.scope ? [access.scope] : [] }, { browserCookie: [] }];

  return {
    operationId: id,
    tags: [spec.tag],
    summary: spec.summary,
    description: [spec.description, accessSentence(spec), spec.paged ? 'A list: it answers a page at a time, see `limit` and `cursor`.' : null].filter(Boolean).join('\n\n'),
    security,
    parameters,
    ...(spec.body ? { requestBody: { required: !spec.bodyOptional, content: { 'application/json': { schema: jsonSchemaOf(spec.body, 'input') } } } } : {}),
    responses,
    'x-aubergine-access': access,
    ...(spec.paged ? { 'x-aubergine-paged': true as const } : {}),
    ...(spec.idempotent ? { 'x-aubergine-idempotent': true as const } : {}),
    ...(spec.stream ? { 'x-aubergine-stream': true as const } : {}),
  };
}

export function openApiDocument(options: { version: string }): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  for (const id of ROUTE_IDS) {
    const spec: RouteSpec = ROUTES[id];
    const path = openApiPath(spec.path);
    paths[path] = { ...paths[path], [spec.method.toLowerCase()]: operation(id, spec) };
  }
  const errorSchema = jsonSchemaOf(ErrorResponse, 'output');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Aubergine API',
      version: options.version,
      description: [
        'Read and change the canvases, sessions, layout and notes of an Aubergine server on this computer.',
        'The server listens on 127.0.0.1 only. `/v1` only gains things: fields are added, never renamed or removed. Fields you send that the server does not know are ignored, and answers may gain fields, so ignore what you do not know.',
        'Errors always have one shape: `{"error": {"code": "...", "message": "..."}}`. Lists answer with `items` and `nextCursor`; pass `cursor` for the next page. Times are ISO 8601 in UTC. IDs are opaque strings.',
      ].join('\n\n'),
    },
    servers: [{ url: 'http://127.0.0.1:4600', description: 'The default address. The port is 4600 unless AUBERGINE_PORT says otherwise.' }],
    tags: ROUTE_TAGS.map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiToken: {
          type: 'http',
          scheme: 'bearer',
          description: `An API token the owner created (its secret starts with \`${TOKEN_PREFIX}\`), sent as \`Authorization: Bearer <secret>\`. Each route names the scope it needs: ${GRANTABLE_SCOPES.map((scope) => `\`${scope}\` (${SCOPE_MEANING[scope]})`).join(' ')}`,
        },
        sessionToken: {
          type: 'http',
          scheme: 'bearer',
          description: "The token every session's shell is given as `AUBERGINE_TOKEN`. It can act for its own session only, on the few routes that say so.",
        },
        browserCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'aubergine_token_<port>',
          description: 'The signed-in browser. Requests that change something must also carry the page\'s own `Origin`. Not for programs: use an API token.',
        },
      },
      schemas: { Error: errorSchema },
      responses: Object.fromEntries(
        Object.entries(ERROR_TEXT).map(([name, text]) => [
          name,
          {
            description: `${text.description} The code is \`${text.code}\`.`,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            ...(name === 'RateLimited' ? { headers: { 'Retry-After': { description: 'Seconds to wait before trying again.', schema: { type: 'integer', minimum: 1 } } } } : {}),
          },
        ]),
      ),
    },
  };
}

/** The scope a route needs, straight from the table `authorize` uses. For tests and tools. */
export const scopeOfRoute = (id: RouteId): Scope | null => {
  const action: Action | null = ROUTES[id].action;
  return action === null ? null : scopeFor(action);
};
