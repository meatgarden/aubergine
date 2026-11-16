# API reference

<!-- Generated from the description of the API (/v1/openapi.json). Do not edit by hand: change the route declarations in shared/src/routes.ts and run `pnpm generate`. -->

Read and change the canvases, sessions, layout and notes of an Aubergine server on this computer.

The server listens on 127.0.0.1 only. `/v1` only gains things: fields are added, never renamed or removed. Fields you send that the server does not know are ignored, and answers may gain fields, so ignore what you do not know.

Errors always have one shape: `{"error": {"code": "...", "message": "..."}}`. Lists answer with `items` and `nextCursor`; pass `cursor` for the next page. Times are ISO 8601 in UTC. IDs are opaque strings.

This file is generated from the same declarations the server registers its routes from, so it cannot fall behind them. The description itself is served by every server at `/v1/openapi.json`, as an OpenAPI 3.1 document; a typed client generated from it is in `client/`.

How to create a token, what the scopes mean, the limits and the activity log are in the README, under "API tokens". In the examples, `$TOKEN` is the secret of an API token.

## Routes

| | | Scope |
|---|---|---|
| [`GET /v1`](#getcapabilities) | What this server can do, and who is asking | none |
| [`GET /v1/openapi.json`](#getdescription) | The description of this API, as an OpenAPI 3.1 document | none |
| [`GET /v1/canvases`](#listcanvases) | List canvases | `read` |
| [`POST /v1/canvases`](#createcanvas) | Create a canvas | `canvases:write` |
| [`GET /v1/canvases/{canvasId}`](#getcanvas) | One canvas, with its nodes and frames | `read` |
| [`PATCH /v1/canvases/{canvasId}`](#updatecanvas) | Rename, recolor, reorder or relabel a canvas | `canvases:write` |
| [`DELETE /v1/canvases/{canvasId}`](#closecanvas) | Close a canvas | `canvases:write` |
| [`POST /v1/canvases/{canvasId}/show`](#showcanvas) | Switch an open browser to a canvas | `canvases:write` |
| [`GET /v1/canvases/{canvasId}/sessions`](#listcanvassessions) | The sessions on a canvas | `read` |
| [`POST /v1/canvases/{canvasId}/sessions`](#startsession) | Start a session on a canvas | `sessions:write` |
| [`GET /v1/sessions`](#listsessions) | List every session | `read` |
| [`GET /v1/sessions/{sessionId}`](#getsession) | One session | `read` |
| [`PATCH /v1/sessions/{sessionId}`](#updatesession) | Rename or tag a session, or change its pinned note | `sessions:write` |
| [`DELETE /v1/sessions/{sessionId}`](#endsession) | End a session | `sessions:write` |
| [`POST /v1/sessions/{sessionId}/move`](#movesession) | Move a session to another canvas | `sessions:write` |
| [`POST /v1/sessions/{sessionId}/park`](#parksession) | Park a session | `sessions:write` |
| [`POST /v1/sessions/{sessionId}/restore`](#restoresession) | Put a parked session back on a canvas | `sessions:write` |
| [`POST /v1/sessions/{sessionId}/show`](#showsession) | Bring a session up in an open browser | `sessions:write` |
| [`POST /v1/sessions/{sessionId}/notes`](#appendnote) | Add an entry to a session's note log | session's own token, or `notes:write` |
| [`PATCH /v1/canvases/{canvasId}/nodes/{nodeId}`](#updatenode) | Move, resize or color a node | `canvases:write` |
| [`POST /v1/canvases/{canvasId}/frames`](#createframe) | Add a frame | `canvases:write` |
| [`PATCH /v1/canvases/{canvasId}/frames/{frameId}`](#updateframe) | Change a frame | `canvases:write` |
| [`DELETE /v1/canvases/{canvasId}/frames/{frameId}`](#removeframe) | Remove a frame | `canvases:write` |
| [`GET /v1/workflows`](#listworkflows) | List workflows | `read` |
| [`POST /v1/workflows`](#createworkflow) | Create a workflow | `workflows:write` |
| [`GET /v1/workflows/{workflowId}`](#getworkflow) | Read a workflow | `read` |
| [`PATCH /v1/workflows/{workflowId}`](#updateworkflow) | Change a workflow | `workflows:write` |
| [`DELETE /v1/workflows/{workflowId}`](#removeworkflow) | Remove a workflow | `workflows:write` |
| [`POST /v1/workflows/{workflowId}/copy`](#copyworkflow) | Copy a workflow | `workflows:write` |
| [`GET /v1/workflows/{workflowId}/versions`](#listworkflowversions) | List the versions of a workflow | `read` |
| [`GET /v1/workflow-templates`](#listworkflowtemplates) | List the workflows that come with the server | `read` |
| [`POST /v1/workflow-templates/{template}/use`](#useworkflowtemplate) | Create a workflow from a template | `workflows:write` |
| [`GET /v1/runs`](#listruns) | List runs | `read` |
| [`POST /v1/runs`](#startrun) | Start a run of a workflow | `runs:write` |
| [`GET /v1/runs/{runId}`](#getrun) | Read a run | `read` |
| [`POST /v1/runs/{runId}/report`](#reportrun) | Report on a run: done, blocked, go to, pause, resume, stop | `runs:write` |
| [`POST /v1/sessions/{sessionId}/runs`](#startsessionrun) | Start a run on a session | `runs:write` |
| [`GET /v1/events`](#streamevents) | Follow changes as they happen | `read` |
| [`GET /v1/tokens`](#listtokens) | List API tokens | browser only |
| [`POST /v1/tokens`](#createtoken) | Create an API token | browser only |
| [`DELETE /v1/tokens/{tokenId}`](#revoketoken) | Revoke an API token | browser only |
| [`GET /v1/activity`](#listactivity) | What API tokens did | browser only |
| [`PUT /v1/sessions/{sessionId}/attention`](#setattention) | Say whether the session wants the user | session's own token |
| [`GET /v1/sessions/{sessionId}/run`](#getsessionrun) | The run a session is on | session's own token, or `read` |
| [`POST /v1/sessions/{sessionId}/run/report`](#reportsessionrun) | Report on the run a session is on | session's own token, or `runs:write` |
| [`PUT /v1/sessions/{sessionId}/agent`](#reportagent) | Say which agent runs in the session, and in which conversation | session's own token |

## Errors

Every error is `{"error": {"code": "...", "message": "..."}}`.

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | The request is not what this route accepts: a field is missing or wrong, a cursor is not one the server gave out. |
| 401 | `unauthorized` | No credential, a wrong one, or a token that has been revoked or has expired. |
| 403 | `forbidden` | The credential is good but may not do this: the token lacks the scope, or no token may. |
| 404 | `not_found` | There is no such canvas, session, node, frame, token, workflow or run. |
| 409 | `conflict` | It cannot be done as things stand: for example closing the last canvas, parking a session whose shell has ended, or a report that does not fit where a run stands. |
| 413 | `too_large` | The request body is larger than the server accepts. |
| 429 | `rate_limited` | Too many calls with this token in a short time. `Retry-After` says in how many seconds to try again. |
| 503 | `runtime_unavailable` | The server cannot start or reach terminals right now (tmux is missing or too old). |

## Server

### getCapabilities

`GET /v1`: What this server can do, and who is asking.

The version, the features present, every scope there is, and for the caller its own identity: for a token, its name and scopes. Needs no scope.

Needs no scope: any caller that is who it says it is.

**Answer** `200`:

```ts
{
  name: "aubergine";
  version: string;
  api: "v1";
  description: string;
  features: string[];
  scopes: {
    name: "read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input";
    grantable: boolean;
    meaning: string;
  }[];
  caller: {
    kind: "user";
  } | {
    kind: "token";
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
    expiresAt: string | null;
  } | {
    kind: "session";
    sessionId: string;
  };
}
```

**Errors:** 400, 401, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1
```

### getDescription

`GET /v1/openapi.json`: The description of this API, as an OpenAPI 3.1 document.

Generated by the server from the same declarations it registers its routes from. Needs no scope.

Needs no scope: any caller that is who it says it is.

**Answer** `200`:

```ts
{
  openapi: string;
  [key: string]: unknown;
}
```

**Errors:** 400, 401, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/openapi.json
```

## Canvases

### listCanvases

`GET /v1/canvases`: List canvases.

In tab order, each with how many sessions are on it, how many wait for you and how many have unread output.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    projectId: string;
    name: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    order: number;
    labels: {
      [key: string]: string;
    };
    createdAt: string;
    counts: {
      sessions: number;
      waiting: number;
      unread: number;
    };
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases
```

### createCanvas

`POST /v1/canvases`: Create a canvas.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | yes | The name on its tab. |
| `color` | `"none" \| "red" \| "orange" \| "yellow" \| "green" \| "blue" \| "purple"` | no | The color of its tab. |
| `labels` | `{ [key: string]: string; }` | no | Pairs of key and value for tools of your own to give meaning to. |

**Answer** `201`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  counts: {
    sessions: number;
    waiting: number;
    unread: number;
  };
  nodes: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/canvases
```

### getCanvas

`GET /v1/canvases/{canvasId}`: One canvas, with its nodes and frames.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  counts: {
    sessions: number;
    waiting: number;
    unread: number;
  };
  nodes: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases/<canvasId>
```

### updateCanvas

`PATCH /v1/canvases/{canvasId}`: Rename, recolor, reorder or relabel a canvas.

Send any of `name`, `color`, `order`, `labels`. `labels` replaces the whole set.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no |  |
| `color` | `"none" \| "red" \| "orange" \| "yellow" \| "green" \| "blue" \| "purple"` | no |  |
| `order` | `number` | no |  |
| `labels` | `{ [key: string]: string; }` | no |  |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  counts: {
    sessions: number;
    waiting: number;
    unread: number;
  };
  nodes: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/canvases/<canvasId>
```

### closeCanvas

`DELETE /v1/canvases/{canvasId}`: Close a canvas.

Closing a canvas never ends a session. If sessions are on it, say what happens to them: `sessions=park`, or `sessions=move&to=<canvas id>`. The last canvas cannot be closed.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `sessions` | query | `"park" \| "move"` | no | What happens to the sessions on it. Needed when it has any. |
| `to` | query | `string` | no | With `sessions=move`: the canvas to move them to. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases/<canvasId>
```

### showCanvas

`POST /v1/canvases/{canvasId}/show`: Switch an open browser to a canvas.

Asks the browser tab used most recently to show this canvas, unless one already does. `shown` is how many tabs show it or were asked; 0 when no browser is open.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  shown: number;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/show
```

## Sessions

### listCanvasSessions

`GET /v1/canvases/{canvasId}/sessions`: The sessions on a canvas.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    projectId: string;
    name: string;
    createdAt: string;
    state: "open" | "parked" | "exited";
    cwd: string | null;
    command: string | null;
    note: string;
    status: {
      state: ("busy" | "idle") | null;
      commandLine: string | null;
      startedAt: string | null;
      lastExit: number | null;
      lastFinishedAt: string | null;
      unread: boolean;
    };
    attention: {
      state: "none" | "working" | "waiting" | "done";
      message: string | null;
      at: string | null;
    };
    noteLog: {
      id: string;
      at: string;
      author: "user" | "agent";
      kind: "note" | "prompt" | "event";
      text: string;
    }[];
    agent: {
      kind: "claude-code";
      conversationId: string | null;
    } | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    tags: string[];
    parkedFrom: {
      canvasId: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    } | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/sessions
```

### startSession

`POST /v1/canvases/{canvasId}/sessions`: Start a session on a canvas.

Starts a terminal, optionally in a folder (`cwd`), optionally typing a command into it once its shell is ready. This runs that command as you: a token that may start sessions may run anything you can.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no | What to call it. A name is made up when left out. |
| `cwd` | `string` | no | Folder to start in (absolute path). The default folder when left out. |
| `command` | `string` | no | A line to type into the new session once its shell is ready. |
| `position` | `{ x: number; y: number; width?: number; height?: number; }` | no | Where to put it. A free spot is found when left out. |
| `tags` | `string[]` | no | Short words of your own to find and filter the session by. |

**Answer** `201`:

```ts
{
  session: {
    id: string;
    projectId: string;
    name: string;
    createdAt: string;
    state: "open" | "parked" | "exited";
    cwd: string | null;
    command: string | null;
    note: string;
    status: {
      state: ("busy" | "idle") | null;
      commandLine: string | null;
      startedAt: string | null;
      lastExit: number | null;
      lastFinishedAt: string | null;
      unread: boolean;
    };
    attention: {
      state: "none" | "working" | "waiting" | "done";
      message: string | null;
      at: string | null;
    };
    noteLog: {
      id: string;
      at: string;
      author: "user" | "agent";
      kind: "note" | "prompt" | "event";
      text: string;
    }[];
    agent: {
      kind: "claude-code";
      conversationId: string | null;
    } | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    tags: string[];
    parkedFrom: {
      canvasId: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    } | null;
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429, 503.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/sessions
```

### listSessions

`GET /v1/sessions`: List every session.

On every canvas, and the parked ones. `state` narrows it to `open`, `parked` or `exited`.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |
| `state` | query | `"open" \| "parked" \| "exited"` | no | Only sessions in this state. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    projectId: string;
    name: string;
    createdAt: string;
    state: "open" | "parked" | "exited";
    cwd: string | null;
    command: string | null;
    note: string;
    status: {
      state: ("busy" | "idle") | null;
      commandLine: string | null;
      startedAt: string | null;
      lastExit: number | null;
      lastFinishedAt: string | null;
      unread: boolean;
    };
    attention: {
      state: "none" | "working" | "waiting" | "done";
      message: string | null;
      at: string | null;
    };
    noteLog: {
      id: string;
      at: string;
      author: "user" | "agent";
      kind: "note" | "prompt" | "event";
      text: string;
    }[];
    agent: {
      kind: "claude-code";
      conversationId: string | null;
    } | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    tags: string[];
    parkedFrom: {
      canvasId: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    } | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions
```

### getSession

`GET /v1/sessions/{sessionId}`: One session.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  state: "open" | "parked" | "exited";
  cwd: string | null;
  command: string | null;
  note: string;
  status: {
    state: ("busy" | "idle") | null;
    commandLine: string | null;
    startedAt: string | null;
    lastExit: number | null;
    lastFinishedAt: string | null;
    unread: boolean;
  };
  attention: {
    state: "none" | "working" | "waiting" | "done";
    message: string | null;
    at: string | null;
  };
  noteLog: {
    id: string;
    at: string;
    author: "user" | "agent";
    kind: "note" | "prompt" | "event";
    text: string;
  }[];
  agent: {
    kind: "claude-code";
    conversationId: string | null;
  } | null;
  lastInputAt: string | null;
  lastOutputAt: string | null;
  tags: string[];
  parkedFrom: {
    canvasId: string;
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  } | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>
```

### updateSession

`PATCH /v1/sessions/{sessionId}`: Rename or tag a session, or change its pinned note.

Send any of `name`, `tags`, `note`. `tags` replaces the whole list. The pinned note is a note, not a property of the session, so it needs the scope for notes.

An API token needs the scope `sessions:write`. Sending `note` needs `notes:write` instead, or as well when other fields are sent.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no |  |
| `tags` | `string[]` | no |  |
| `note` | `string` | no |  |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  state: "open" | "parked" | "exited";
  cwd: string | null;
  command: string | null;
  note: string;
  status: {
    state: ("busy" | "idle") | null;
    commandLine: string | null;
    startedAt: string | null;
    lastExit: number | null;
    lastFinishedAt: string | null;
    unread: boolean;
  };
  attention: {
    state: "none" | "working" | "waiting" | "done";
    message: string | null;
    at: string | null;
  };
  noteLog: {
    id: string;
    at: string;
    author: "user" | "agent";
    kind: "note" | "prompt" | "event";
    text: string;
  }[];
  agent: {
    kind: "claude-code";
    conversationId: string | null;
  } | null;
  lastInputAt: string | null;
  lastOutputAt: string | null;
  tags: string[];
  parkedFrom: {
    canvasId: string;
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  } | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>
```

### endSession

`DELETE /v1/sessions/{sessionId}`: End a session.

Ends the shell and removes the session. This cannot be undone.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>
```

### moveSession

`POST /v1/sessions/{sessionId}/move`: Move a session to another canvas.

The shell is not touched. Without a `position` a free spot is found.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `canvasId` | `string` | yes | The canvas to move it to. |
| `position` | `{ x: number; y: number; }` | no | Where to put it there. A free spot is found when left out. |

**Answer** `200`:

```ts
{
  session: {
    id: string;
    projectId: string;
    name: string;
    createdAt: string;
    state: "open" | "parked" | "exited";
    cwd: string | null;
    command: string | null;
    note: string;
    status: {
      state: ("busy" | "idle") | null;
      commandLine: string | null;
      startedAt: string | null;
      lastExit: number | null;
      lastFinishedAt: string | null;
      unread: boolean;
    };
    attention: {
      state: "none" | "working" | "waiting" | "done";
      message: string | null;
      at: string | null;
    };
    noteLog: {
      id: string;
      at: string;
      author: "user" | "agent";
      kind: "note" | "prompt" | "event";
      text: string;
    }[];
    agent: {
      kind: "claude-code";
      conversationId: string | null;
    } | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    tags: string[];
    parkedFrom: {
      canvasId: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    } | null;
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  };
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"canvasId":"<canvasId>"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/move
```

### parkSession

`POST /v1/sessions/{sessionId}/park`: Park a session.

Takes it off its canvas. The shell keeps running, and the session remembers where it was.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  state: "open" | "parked" | "exited";
  cwd: string | null;
  command: string | null;
  note: string;
  status: {
    state: ("busy" | "idle") | null;
    commandLine: string | null;
    startedAt: string | null;
    lastExit: number | null;
    lastFinishedAt: string | null;
    unread: boolean;
  };
  attention: {
    state: "none" | "working" | "waiting" | "done";
    message: string | null;
    at: string | null;
  };
  noteLog: {
    id: string;
    at: string;
    author: "user" | "agent";
    kind: "note" | "prompt" | "event";
    text: string;
  }[];
  agent: {
    kind: "claude-code";
    conversationId: string | null;
  } | null;
  lastInputAt: string | null;
  lastOutputAt: string | null;
  tags: string[];
  parkedFrom: {
    canvasId: string;
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  } | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/park
```

### restoreSession

`POST /v1/sessions/{sessionId}/restore`: Put a parked session back on a canvas.

Onto `canvasId`, or without one the canvas most recently looked at in a browser. It returns to its old spot when that is on the same canvas and still free.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `canvasId` | `string` | no | The canvas to put it on. Without one, the canvas most recently looked at in a browser. |

**Answer** `200`:

```ts
{
  session: {
    id: string;
    projectId: string;
    name: string;
    createdAt: string;
    state: "open" | "parked" | "exited";
    cwd: string | null;
    command: string | null;
    note: string;
    status: {
      state: ("busy" | "idle") | null;
      commandLine: string | null;
      startedAt: string | null;
      lastExit: number | null;
      lastFinishedAt: string | null;
      unread: boolean;
    };
    attention: {
      state: "none" | "working" | "waiting" | "done";
      message: string | null;
      at: string | null;
    };
    noteLog: {
      id: string;
      at: string;
      author: "user" | "agent";
      kind: "note" | "prompt" | "event";
      text: string;
    }[];
    agent: {
      kind: "claude-code";
      conversationId: string | null;
    } | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    tags: string[];
    parkedFrom: {
      canvasId: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
    } | null;
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  };
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"canvasId":"<canvasId>"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/restore
```

### showSession

`POST /v1/sessions/{sessionId}/show`: Bring a session up in an open browser.

A tab already on its canvas if there is one, else the tab used most recently. `shown` is how many tabs were asked; 0 when no browser is open.

An API token needs the scope `sessions:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  shown: number;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/show
```

## Notes

### appendNote

`POST /v1/sessions/{sessionId}/notes`: Add an entry to a session's note log.

The log only grows. An entry added by a program is signed as an agent, not as you. `entry` is null when the server was set not to keep that kind of entry.

For a session's own token, about that session; or an API token with the scope `notes:write`, about any session.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes |  |
| `kind` | `"note" \| "prompt" \| "event"` | no |  |

**Answer** `201`:

```ts
{
  entry: {
    id: string;
    at: string;
    author: "user" | "agent";
    kind: "note" | "prompt" | "event";
    text: string;
  } | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/notes
```

## Layout

### updateNode

`PATCH /v1/canvases/{canvasId}/nodes/{nodeId}`: Move, resize or color a node.

A node is a session as it sits on a canvas. Send any of `x`, `y`, `width`, `height`, `color`.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `nodeId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `x` | `number` | no |  |
| `y` | `number` | no |  |
| `width` | `number` | no |  |
| `height` | `number` | no |  |
| `color` | `"none" \| "red" \| "orange" \| "yellow" \| "green" \| "blue" \| "purple"` | no |  |

**Answer** `200`:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  sessionId: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"x":0}' \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/nodes/<nodeId>
```

### createFrame

`POST /v1/canvases/{canvasId}/frames`: Add a frame.

A frame is a labeled rectangle behind the nodes, to group them.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `x` | `number` | yes |  |
| `y` | `number` | yes |  |
| `width` | `number` | yes |  |
| `height` | `number` | yes |  |
| `label` | `string` | no |  |
| `color` | `"none" \| "red" \| "orange" \| "yellow" \| "green" \| "blue" \| "purple"` | no |  |

**Answer** `201`:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"x":0,"y":0,"width":200,"height":120}' \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/frames
```

### updateFrame

`PATCH /v1/canvases/{canvasId}/frames/{frameId}`: Change a frame.

Send any of its rectangle, `label`, `color`. With `carry`, the nodes lying inside the frame move with it.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `frameId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `x` | `number` | no |  |
| `y` | `number` | no |  |
| `width` | `number` | no |  |
| `height` | `number` | no |  |
| `label` | `string` | no |  |
| `color` | `"none" \| "red" \| "orange" \| "yellow" \| "green" \| "blue" \| "purple"` | no |  |
| `carry` | `boolean` | no |  |

**Answer** `200`:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"x":0}' \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/frames/<frameId>
```

### removeFrame

`DELETE /v1/canvases/{canvasId}/frames/{frameId}`: Remove a frame.

The nodes inside it stay where they are.

An API token needs the scope `canvases:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | path | `string` | yes | An ID. |
| `frameId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/canvases/<canvasId>/frames/<frameId>
```

## Workflows

### listWorkflows

`GET /v1/workflows`: List workflows.

By name. Each with the names of its elements, without their text.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    name: string;
    description: string;
    labels: {
      [key: string]: string;
    };
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    createdAt: string;
    updatedAt: string;
    version: number;
    elements: string[];
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/workflows
```

### createWorkflow

`POST /v1/workflows`: Create a workflow.

A workflow is an ordered list of elements, each a piece of text for whoever does the work. Nothing in it is run by the server.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | yes | What it is called. |
| `description` | `string` | no | What it is for, in a sentence or two. |
| `standing` | `string` | no | Text added to every element: rules that hold from start to finish. |
| `inputs` | `{ key: string; label: string; description?: string; required?: bool…` | no | What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. |
| `elements` | `{ id?: string; kind?: string; name: string; instructions?: string; …` | yes | The elements, in the order they are gone through. |
| `labels` | `{ [key: string]: string; }` | no | Pairs of key and value for tools of your own to give meaning to. |
| `origin` | `{ kind: string; name?: string; [key: string]: unknown; }` | no | Where it came from. Left out, it was made here. |
| `extra` | `{ [key: string]: unknown; }` | no | Fields from a file that this version does not know, kept so they are written out again. |

**Answer** `201`:

```ts
{
  id: string;
  name: string;
  description: string;
  labels: {
    [key: string]: string;
  };
  origin: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  elements: string[];
  current: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  };
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example","elements":[{"name":"example"}]}' \
     http://127.0.0.1:4600/v1/workflows
```

### getWorkflow

`GET /v1/workflows/{workflowId}`: Read a workflow.

With everything its latest version says.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  name: string;
  description: string;
  labels: {
    [key: string]: string;
  };
  origin: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  elements: string[];
  current: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/workflows/<workflowId>
```

### updateWorkflow

`PATCH /v1/workflows/{workflowId}`: Change a workflow.

A change to what it says is saved as a new version. Runs already going keep to the version they started on.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no | What it is called. |
| `description` | `string` | no | What it is for, in a sentence or two. |
| `standing` | `string` | no | Text added to every element: rules that hold from start to finish. |
| `inputs` | `{ key: string; label: string; description?: string; required?: bool…` | no | What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. |
| `elements` | `{ id?: string; kind?: string; name: string; instructions?: string; …` | no | The elements, in the order they are gone through. |
| `labels` | `{ [key: string]: string; }` | no | Pairs of key and value for tools of your own to give meaning to. |

**Answer** `200`:

```ts
{
  id: string;
  name: string;
  description: string;
  labels: {
    [key: string]: string;
  };
  origin: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  elements: string[];
  current: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/workflows/<workflowId>
```

### removeWorkflow

`DELETE /v1/workflows/{workflowId}`: Remove a workflow.

Refused while a run of it is still going. Runs that are over stay in the archive.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/workflows/<workflowId>
```

### copyWorkflow

`POST /v1/workflows/{workflowId}/copy`: Copy a workflow.

A new workflow with the same content, to change without touching the first.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no | The name of the copy. Without one: the name with "copy" after it. |

**Answer** `201`:

```ts
{
  id: string;
  name: string;
  description: string;
  labels: {
    [key: string]: string;
  };
  origin: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  elements: string[];
  current: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/workflows/<workflowId>/copy
```

### listWorkflowVersions

`GET /v1/workflows/{workflowId}/versions`: List the versions of a workflow.

Newest first. Old versions that no run needs are dropped past a limit.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/workflows/<workflowId>/versions
```

### listWorkflowTemplates

`GET /v1/workflow-templates`: List the workflows that come with the server.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    name: string;
    title: string;
    description: string;
    content: {
      name: string;
      description: string;
      standing: string;
      inputs: {
        key: string;
        label: string;
        description: string;
        required: boolean;
      }[];
      elements: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    };
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/workflow-templates
```

### useWorkflowTemplate

`POST /v1/workflow-templates/{template}/use`: Create a workflow from a template.

The result is an ordinary workflow that can be changed like any other.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `template` | path | `string` | yes | The name of the template, as the list gives it. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | no | The name of the new workflow. Without one, the template's own title. |

**Answer** `201`:

```ts
{
  id: string;
  name: string;
  description: string;
  labels: {
    [key: string]: string;
  };
  origin: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  elements: string[];
  current: {
    name: string;
    description: string;
    standing: string;
    inputs: {
      key: string;
      label: string;
      description: string;
      required: boolean;
    }[];
    elements: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
    number: number;
    createdAt: string;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/workflow-templates/<template>/use
```

## Runs

### listRuns

`GET /v1/runs`: List runs.

Runs still going, or with `status=ended` the ones that are over, newest first.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |
| `status` | query | `"queued" \| "running" \| "paused" \| "blocked" \| "finished" \| "stopped…` | no | `live` (the default): runs still going. `ended`: finished and stopped runs, newest first, from the archive. Or one status. |
| `sessionId` | query | `string` | no | Only runs of this session. |
| `workflowId` | query | `string` | no | Only runs of this workflow. |

**Answer** `200`:

```ts
{
  items: {
    run: {
      id: string;
      workflowId: string;
      workflowVersion: number;
      sessionId: string | null;
      inputs: {
        [key: string]: string;
      };
      status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
      currentElementId: string | null;
      elements: {
        elementId: string;
        state: "pending" | "active" | "done" | "skipped";
        startedAt: string | null;
        finishedAt: string | null;
        note: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        } | null;
        sessionId: string | null;
      }[];
      blockedReason: string | null;
      pausedFrom: ("running" | "blocked") | null;
      startedBy: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      createdAt: string;
      updatedAt: string;
      finishedAt: string | null;
    };
    workflowName: string;
    elements: {
      id: string;
      name: string;
    }[];
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/runs
```

### startRun

`POST /v1/runs`: Start a run of a workflow.

On a session, or on none yet: the run then waits, queued. A session is on one run at a time.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `workflowId` | `string` | yes | The workflow to go through. The run keeps to the version that is latest now. |
| `inputs` | `{ [key: string]: string; }` | no | The inputs the workflow asks for, by key. |
| `replace` | `boolean` | no | When the session is already on a run: stop that one and start this. Without it, that is refused. |
| `kickoff` | `boolean` | no | Type the line that tells the agent about the run into the session's terminal. Only ever done for the owner (the browser or the command line), and only when an agent is running there; an API token is given the line in the answer and nothing is typed. |
| `sessionId` | `string` | no | The session that will do it. Without one the run waits, queued. |

**Answer** `201`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"workflowId":"<workflowId>"}' \
     http://127.0.0.1:4600/v1/runs
```

### getRun

`GET /v1/runs/{runId}`: Read a run.

Where it stands, every element with its state, times and note, and the text whoever is on it is told now. Also for a run that is over.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `runId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/runs/<runId>
```

### reportRun

`POST /v1/runs/{runId}/report`: Report on a run: done, blocked, go to, pause, resume, stop.

The only way a run moves. A report that does not fit where the run stands is refused with 409 and changes nothing: `done` for an element that is not the current one, anything for a run that is over.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `runId` | path | `string` | yes | An ID. |

**Body** (JSON):

**Answer** `200`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"type":"done","elementId":"<elementId>"}' \
     http://127.0.0.1:4600/v1/runs/<runId>/report
```

### startSessionRun

`POST /v1/sessions/{sessionId}/runs`: Start a run on a session.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `workflowId` | `string` | yes | The workflow to go through. The run keeps to the version that is latest now. |
| `inputs` | `{ [key: string]: string; }` | no | The inputs the workflow asks for, by key. |
| `replace` | `boolean` | no | When the session is already on a run: stop that one and start this. Without it, that is refused. |
| `kickoff` | `boolean` | no | Type the line that tells the agent about the run into the session's terminal. Only ever done for the owner (the browser or the command line), and only when an agent is running there; an API token is given the line in the answer and nothing is typed. |

**Answer** `201`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"workflowId":"<workflowId>"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/runs
```

## Events

### streamEvents

`GET /v1/events`: Follow changes as they happen.

A stream of server-sent events (`text/event-stream`) that does not end: one `data:` line of JSON per change, and a comment line now and then to keep the connection open. `canvasId` narrows it to what concerns one canvas. Changes to tokens are not sent.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | query | `string` | no | Only changes that concern this canvas. |

**Answer** `200`, a stream; each `data:` line is

```ts
{
  type: string;
  [key: string]: unknown;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -N -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/events
```

## Tokens

### listTokens

`GET /v1/tokens`: List API tokens.

Never their secrets, which the server does not have.

For the signed-in browser only. No API token may call this, whatever its scopes.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

### createToken

`POST /v1/tokens`: Create an API token.

The answer holds the secret. It is sent this once and cannot be had again.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `name` | `string` | yes | What will use it. |
| `scopes` | `("read" \| "canvases:write" \| "sessions:write" \| "notes:write" \| "wo…` | yes | What it may do. At least one. |
| `expiresAt` | `string` | no | When it stops working. Never, when neither this nor `expiresInDays` is given. |
| `expiresInDays` | `number` | no | In how many days it stops working. |

**Answer** `201`:

```ts
{
  token: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  };
  secret: string;
}
```

**Errors:** 400, 401, 403, 413, 429.

### revokeToken

`DELETE /v1/tokens/{tokenId}`: Revoke an API token.

It is refused on its very next call. Revoking twice changes nothing.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `tokenId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  name: string;
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### listActivity

`GET /v1/activity`: What API tokens did.

One entry per call made with a token, newest first. `tokenId` narrows it to one token.

For the signed-in browser only. No API token may call this, whatever its scopes.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |
| `tokenId` | query | `string` | no | Only calls made with this token. |

**Answer** `200`:

```ts
{
  items: {
    at: string;
    tokenId: string;
    tokenName: string;
    action: string;
    resource: {
      sessionId?: string;
      canvasId?: string;
    };
    method: string;
    route: string;
    status: number;
    outcome: "ok" | "denied" | "refused" | "limited" | "error";
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

## For a session itself

### setAttention

`PUT /v1/sessions/{sessionId}/attention`: Say whether the session wants the user.

For a program inside a session, with that session's own token (`AUBERGINE_TOKEN`). No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `state` | `"none" \| "working" \| "waiting" \| "done"` | yes |  |
| `message` | `string` | no |  |

**Answer** `200`:

```ts
{
  state: "none" | "working" | "waiting" | "done";
  message: string | null;
  at: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PUT -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"state":"none"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/attention
```

### getSessionRun

`GET /v1/sessions/{sessionId}/run`: The run a session is on.

For a program inside a session, with that session's own token (`AUBERGINE_TOKEN`): where its run stands and what to do now. 404 when the session is on no run.

For a session's own token, about that session; or an API token with the scope `read`, about any session.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/run
```

### reportSessionRun

`POST /v1/sessions/{sessionId}/run/report`: Report on the run a session is on.

For a program inside a session, with that session's own token: the current element is done, the work is blocked, and so on. It reaches that session's run and nothing else.

For a session's own token, about that session; or an API token with the scope `runs:write`, about any session.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

**Answer** `200`:

```ts
{
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    inputs: {
      [key: string]: string;
    };
    status: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked") | null;
    startedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  workflowName: string;
  elements: {
    id: string;
    name: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"type":"done"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/run/report
```

### reportAgent

`PUT /v1/sessions/{sessionId}/agent`: Say which agent runs in the session, and in which conversation.

For a program inside a session, with that session's own token (`AUBERGINE_TOKEN`). No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `kind` | `"claude-code"` | yes |  |
| `conversationId` | `string \| null` | no |  |

**Answer** `200`:

```ts
{
  kind: "claude-code";
  conversationId: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PUT -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"kind":"claude-code"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/agent
```
