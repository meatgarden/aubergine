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
| [`POST /v1/runs/{runId}/approve`](#approverun) | Approve the element a run waits on | browser only |
| [`POST /v1/runs/{runId}/send-back`](#sendbackrun) | Send a run that waits for approval back to an earlier element | browser only |
| [`POST /v1/workflows/{workflowId}/runs`](#startruns) | Start a workflow on several sessions at once | `runs:write` |
| [`GET /v1/board`](#getboard) | The board: every run that is going, by workflow and element | `read` |
| [`POST /v1/sessions/{sessionId}/runs`](#startsessionrun) | Start a run on a session | `runs:write` |
| [`GET /v1/drafts`](#listdrafts) | List drafts | `read` |
| [`POST /v1/drafts`](#proposedraft) | Propose a workflow or an element as a draft | `workflows:write` |
| [`GET /v1/drafts/{draftId}`](#getdraft) | Read a draft | `read` |
| [`PUT /v1/drafts/{draftId}`](#revisedraft) | Hand in a new version of a draft | `workflows:write` |
| [`DELETE /v1/drafts/{draftId}`](#discarddraft) | Discard a draft | browser only |
| [`POST /v1/drafts/{draftId}/accept`](#acceptdraft) | Accept a draft | browser only |
| [`POST /v1/drafts/{draftId}/return`](#returndraft) | Send a draft back with a comment | browser only |
| [`GET /v1/draft-records`](#listdraftrecords) | What became of drafts | browser only |
| [`POST /v1/draft-requests`](#requestdraft) | Ask the agent in a session to write a workflow or an element | browser only |
| [`GET /v1/library/sources`](#listlibrarysources) | List the sources of the library | `read` |
| [`POST /v1/library/sources`](#addlibrarysource) | Add a source | browser only |
| [`DELETE /v1/library/sources/{sourceId}`](#removelibrarysource) | Remove a source | browser only |
| [`POST /v1/library/sources/{sourceId}/refresh`](#refreshlibrarysource) | Read a source again | browser only |
| [`GET /v1/library/items`](#listlibraryitems) | List what the sources offer | `read` |
| [`GET /v1/library/sources/{sourceId}/items/{itemId}`](#getlibraryitem) | One item, with what it says | `read` |
| [`POST /v1/library/installs`](#requestlibraryinstall) | Ask for an item to be installed, or brought up to date | `workflows:write` |
| [`GET /v1/library/requests`](#listlibraryrequests) | The installs that wait for the owner | browser only |
| [`GET /v1/library/requests/{requestId}`](#getlibraryrequest) | One waiting install, with everything its reviewer reads | browser only |
| [`DELETE /v1/library/requests/{requestId}`](#discardlibraryrequest) | Discard a waiting install | browser only |
| [`POST /v1/library/requests/{requestId}/accept`](#acceptlibraryrequest) | Install what a request asks for | browser only |
| [`GET /v1/library/installed`](#listlibraryinstalled) | What was installed from the library | `read` |
| [`GET /v1/library/installed/{installedId}/usage`](#getlibraryinstalledusage) | Where an installed item is used | `read` |
| [`DELETE /v1/library/installed/{installedId}`](#removelibraryinstalled) | Remove what was installed | browser only |
| [`GET /v1/elements`](#listelements) | List the elements on the shelf | `read` |
| [`POST /v1/elements`](#createelement) | Put an element on the shelf | `workflows:write` |
| [`PATCH /v1/elements/{elementId}`](#updateelement) | Change an element on the shelf | `workflows:write` |
| [`DELETE /v1/elements/{elementId}`](#removeelement) | Take an element off the shelf | `workflows:write` |
| [`POST /v1/elements/{elementId}/copy`](#copyelement) | Duplicate an element on the shelf | `workflows:write` |
| [`GET /v1/elements/{elementId}/versions`](#listelementversions) | The versions of a shelf element | `read` |
| [`GET /v1/elements/{elementId}/usage`](#getelementusage) | Where a shelf element is used | `read` |
| [`POST /v1/elements/{elementId}/retire`](#retireelement) | Retire a shelf element | browser only |
| [`POST /v1/elements/{elementId}/restore`](#restoreelement) | Bring a retired shelf element back | browser only |
| [`POST /v1/workflows/{workflowId}/elements/{elementId}/shelf-update`](#updatefromshelf) | Decide about a newer shelf version for one copy in a workflow | browser only |
| [`POST /v1/elements/{elementId}/run`](#runelement) | Run one element by itself, on a session | `runs:write` |
| [`POST /v1/runs/{runId}/ticks`](#tickrunitem) | Tick an item of what an element produced | `runs:write` |
| [`GET /v1/repository-workflows`](#listrepositoryworkflows) | List the workflows that repositories offer | `read` |
| [`GET /v1/repository-workflows/file`](#getrepositoryworkflow) | Read one repository workflow | `read` |
| [`POST /v1/repository-workflows/accept`](#acceptrepositoryworkflow) | Accept a repository workflow as it is now | browser only |
| [`POST /v1/repository-workflows/save`](#savetorepository) | Write a workflow into a repository | browser only |
| [`POST /v1/sessions/{sessionId}/repository-runs`](#runrepositoryworkflow) | Start a run of a repository workflow on a session | `runs:write` |
| [`GET /v1/tasks`](#listtasks) | List the tasks of the queue | `read` |
| [`POST /v1/tasks`](#addtask) | Add a task to the queue | `tasks:write` |
| [`GET /v1/tasks/{taskId}`](#gettask) | Read one task | `read` |
| [`PATCH /v1/tasks/{taskId}`](#changetask) | Change a task that has not started | browser only |
| [`POST /v1/tasks/{taskId}/withdraw`](#withdrawtask) | Take a task back before it starts | `tasks:write` |
| [`POST /v1/tasks/{taskId}/accept`](#accepttask) | Say yes to a proposed task | browser only |
| [`POST /v1/tasks/{taskId}/decline`](#declinetask) | Say no to a proposed task | browser only |
| [`POST /v1/tasks/{taskId}/again`](#retrytask) | Put a failed task back among those that wait | browser only |
| [`POST /v1/tasks/{taskId}/clear`](#cleartask) | Put away a task that is over | browser only |
| [`PUT /v1/tasks/order`](#reordertasks) | Say in which order the waiting tasks start | browser only |
| [`POST /v1/tasks/start`](#starttasks) | Start the next task, or one named | browser only |
| [`GET /v1/queue`](#getqueue) | How tasks are started, and how the queue stands | `read` |
| [`PUT /v1/queue`](#changequeue) | Change the limit, hold new starts, or switch automatic starting | browser only |
| [`GET /v1/for-you`](#getforyou) | What waits on the owner | `read` |
| [`POST /v1/asks`](#addask) | Ask the owner for something, in writing | `tasks:write` |
| [`POST /v1/asks/{askId}/done`](#finishask) | Mark something written on the list as done | browser only |
| [`POST /v1/asks/{askId}/dismiss`](#dismissask) | Take something written off the list without doing it | browser only |
| [`GET /v1/rules`](#listrules) | List the rules | browser only |
| [`POST /v1/rules`](#addrule) | Write a rule | browser only |
| [`DELETE /v1/rules/{ruleId}`](#removerule) | Remove a rule | browser only |
| [`POST /v1/sessions/{sessionId}/tasks`](#proposesessiontask) | Propose a task for the queue | session's own token |
| [`POST /v1/sessions/{sessionId}/asks`](#addsessionask) | Ask the owner for something, in writing | session's own token |
| [`GET /v1/sessions/{sessionId}/queue`](#getsessionqueue) | What is in the queue, and what the session itself proposed and asked | session's own token |
| [`GET /v1/environments/offers`](#getenvironmentoffers) | Where a new session in a folder could work | browser only |
| [`GET /v1/environments`](#listenvironments) | List what was prepared for sessions to work in | `read` |
| [`GET /v1/environments/{environmentId}`](#getenvironment) | Read one environment: what it is, and which files changed | `read` |
| [`GET /v1/environments/{environmentId}/difference`](#getenvironmentdifference) | The difference of one file in an environment, as text | browser only |
| [`GET /v1/environments/{environmentId}/endings`](#getenvironmentendings) | What can be done with an environment when its session ends | browser only |
| [`POST /v1/environments/{environmentId}/end`](#endenvironment) | Keep, remove or discard an environment | browser only |
| [`GET /v1/sessions/{sessionId}/environment`](#getsessionenvironment) | Where a session works, and which files changed there | session's own token, or `read` |
| [`GET /v1/sessions/{sessionId}/environment/difference`](#getsessiondifference) | The difference of one file in a session's working copy, as text | `terminal:read` |
| [`GET /v1/sessions/{sessionId}/screen`](#getscreen) | What a terminal shows now | `terminal:read` |
| [`GET /v1/sessions/{sessionId}/output`](#getoutput) | What a terminal printed recently | `terminal:read` |
| [`GET /v1/search`](#searchterminals) | Search what terminals have printed | `terminal:read` |
| [`POST /v1/sessions/{sessionId}/input`](#sendinput) | Type into a terminal, or press keys | `terminal:input` |
| [`GET /v1/sessions/{sessionId}/run`](#getsessionrun) | The run a session is on | session's own token, or `read` |
| [`POST /v1/sessions/{sessionId}/run`](#runcommand) | Run a command at a shell prompt and wait for it | `terminal:input` |
| [`PUT /v1/sessions/{sessionId}/protection`](#protectsession) | Switch "people only" on or off for a session | browser only |
| [`PUT /v1/sessions/{sessionId}/takes-messages`](#settakesmessages) | Say whether a "people only" session still takes messages from other terminals | browser only |
| [`GET /v1/events`](#streamevents) | Follow changes as they happen | `read` |
| [`GET /v1/tokens`](#listtokens) | List API tokens | browser only |
| [`POST /v1/tokens`](#createtoken) | Create an API token | browser only |
| [`DELETE /v1/tokens/{tokenId}`](#revoketoken) | Revoke an API token | browser only |
| [`GET /v1/activity`](#listactivity) | What API tokens did | browser only |
| [`GET /v1/sessions/{sessionId}/messages`](#listsessionmessages) | The messages to and from a session | `messages:read` |
| [`POST /v1/sessions/{sessionId}/messages`](#sendmessage) | Send a message to a session | `messages:write` |
| [`POST /v1/sessions/{sessionId}/inbox`](#takeinbox) | Take the unread messages of the session | session's own token |
| [`POST /v1/sessions/{sessionId}/messages/{messageId}/reply`](#replytomessage) | Answer a message the session received | session's own token |
| [`POST /v1/sessions/{sessionId}/tell`](#sendfromsession) | Send a message from the session to another terminal | session's own token |
| [`PUT /v1/sessions/{sessionId}/attention`](#setattention) | Say whether the session wants the user | session's own token |
| [`PUT /v1/sessions/{sessionId}/recap`](#writerecap) | Hand in a recap of the session | session's own token |
| [`POST /v1/sessions/{sessionId}/run/report`](#reportsessionrun) | Report on the run a session is on | session's own token, or `runs:write` |
| [`GET /v1/sessions/{sessionId}/brief`](#getsessionbrief) | What a session was asked to write | session's own token |
| [`GET /v1/sessions/{sessionId}/drafts`](#listsessiondrafts) | The drafts a session proposed or was asked for | session's own token |
| [`POST /v1/sessions/{sessionId}/drafts`](#proposesessiondraft) | Hand in a draft from a session | session's own token |
| [`GET /v1/sessions/{sessionId}/repository-workflows`](#getsessionrepositoryworkflows) | The workflows the repository of a session offers | session's own token, or `read` |
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
    name: "read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write";
    grantable: boolean;
    meaning: string;
  }[];
  caller: {
    kind: "user";
  } | {
    kind: "token";
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
    expiresAt: string | null;
    reach: {
      kind: "all";
    } | {
      kind: "canvases";
      canvasIds: string[];
    } | {
      kind: "tag";
      tag: string;
    } | null;
    reviewWorkflowChanges: boolean;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    order: number;
    labels: {
      [key: string]: string;
    };
    createdAt: string;
    messagesFrom: string[];
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
| `color` | `("none" \| "red" \| "orange" \| "yellow" \| "lime" \| "green" \| "teal" \|…` | no | The color of its tab. |
| `labels` | `{ [key: string]: string; }` | no | Pairs of key and value for tools of your own to give meaning to. |

**Answer** `201`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  messagesFrom: string[];
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  messagesFrom: string[];
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
| `color` | `("none" \| "red" \| "orange" \| "yellow" \| "lime" \| "green" \| "teal" \|…` | no |  |
| `order` | `number` | no |  |
| `labels` | `{ [key: string]: string; }` | no |  |

**Answer** `200`:

```ts
{
  id: string;
  projectId: string;
  name: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  order: number;
  labels: {
    [key: string]: string;
  };
  createdAt: string;
  messagesFrom: string[];
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  }[];
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    label: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
      program: string | null;
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
      color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    } | null;
    peopleOnly: boolean;
    typedBy: {
      name: string;
      at: string;
    } | null;
    recap: {
      text: string;
      at: string;
    } | null;
    takesMessages: boolean;
    untold: {
      what: "kickoff" | "brief" | "recap" | "inbox";
      why: "no-report" | "at-shell" | "other-program" | "unknown";
      at: string;
    } | null;
    messages: {
      unread: number;
      from: string | null;
      forOwner: number;
      paused: number;
      at: string | null;
    };
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

Starts a terminal, optionally in a folder (`cwd`), optionally typing a command into it once its shell is ready. A command is typed into the new terminal and runs as you, so for a token it needs `terminal:input` as well, with a reach that covers the session being made (this canvas, the tags sent); without it the call is refused and no session is made. Without a command the session is a plain shell.

An API token needs the scope `sessions:write`. Sending `command` needs `terminal:input` as well, with a reach that covers the session being made.

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
| `environment` | `string` | no | Where it works. Left out: in the folder itself. `working-copy`: in a working copy of its own, a second checkout of the repository the folder is in, on a new branch. Refused with the reason when the folder is not in a repository that can have one. |

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
      program: string | null;
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
      color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    } | null;
    peopleOnly: boolean;
    typedBy: {
      name: string;
      at: string;
    } | null;
    recap: {
      text: string;
      at: string;
    } | null;
    takesMessages: boolean;
    untold: {
      what: "kickoff" | "brief" | "recap" | "inbox";
      why: "no-report" | "at-shell" | "other-program" | "unknown";
      at: string;
    } | null;
    messages: {
      unread: number;
      from: string | null;
      forOwner: number;
      paused: number;
      at: string | null;
    };
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
      program: string | null;
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
      color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    } | null;
    peopleOnly: boolean;
    typedBy: {
      name: string;
      at: string;
    } | null;
    recap: {
      text: string;
      at: string;
    } | null;
    takesMessages: boolean;
    untold: {
      what: "kickoff" | "brief" | "recap" | "inbox";
      why: "no-report" | "at-shell" | "other-program" | "unknown";
      at: string;
    } | null;
    messages: {
      unread: number;
      from: string | null;
      forOwner: number;
      paused: number;
      at: string | null;
    };
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
    program: string | null;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  } | null;
  peopleOnly: boolean;
  typedBy: {
    name: string;
    at: string;
  } | null;
  recap: {
    text: string;
    at: string;
  } | null;
  takesMessages: boolean;
  untold: {
    what: "kickoff" | "brief" | "recap" | "inbox";
    why: "no-report" | "at-shell" | "other-program" | "unknown";
    at: string;
  } | null;
  messages: {
    unread: number;
    from: string | null;
    forOwner: number;
    paused: number;
    at: string | null;
  };
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
    program: string | null;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  } | null;
  peopleOnly: boolean;
  typedBy: {
    name: string;
    at: string;
  } | null;
  recap: {
    text: string;
    at: string;
  } | null;
  takesMessages: boolean;
  untold: {
    what: "kickoff" | "brief" | "recap" | "inbox";
    why: "no-report" | "at-shell" | "other-program" | "unknown";
    at: string;
  } | null;
  messages: {
    unread: number;
    from: string | null;
    forOwner: number;
    paused: number;
    at: string | null;
  };
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
      program: string | null;
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
      color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    } | null;
    peopleOnly: boolean;
    typedBy: {
      name: string;
      at: string;
    } | null;
    recap: {
      text: string;
      at: string;
    } | null;
    takesMessages: boolean;
    untold: {
      what: "kickoff" | "brief" | "recap" | "inbox";
      why: "no-report" | "at-shell" | "other-program" | "unknown";
      at: string;
    } | null;
    messages: {
      unread: number;
      from: string | null;
      forOwner: number;
      paused: number;
      at: string | null;
    };
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
    program: string | null;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  } | null;
  peopleOnly: boolean;
  typedBy: {
    name: string;
    at: string;
  } | null;
  recap: {
    text: string;
    at: string;
  } | null;
  takesMessages: boolean;
  untold: {
    what: "kickoff" | "brief" | "recap" | "inbox";
    why: "no-report" | "at-shell" | "other-program" | "unknown";
    at: string;
  } | null;
  messages: {
    unread: number;
    from: string | null;
    forOwner: number;
    paused: number;
    at: string | null;
  };
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
      program: string | null;
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
      color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
    } | null;
    peopleOnly: boolean;
    typedBy: {
      name: string;
      at: string;
    } | null;
    recap: {
      text: string;
      at: string;
    } | null;
    takesMessages: boolean;
    untold: {
      what: "kickoff" | "brief" | "recap" | "inbox";
      why: "no-report" | "at-shell" | "other-program" | "unknown";
      at: string;
    } | null;
    messages: {
      unread: number;
      from: string | null;
      forOwner: number;
      paused: number;
      at: string | null;
    };
  };
  canvasId: string;
  node: {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
    sessionId: string;
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
| `color` | `("none" \| "red" \| "orange" \| "yellow" \| "lime" \| "green" \| "teal" \|…` | no |  |

**Answer** `200`:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  sessionId: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
| `color` | `("none" \| "red" \| "orange" \| "yellow" \| "lime" \| "green" \| "teal" \|…` | no |  |

**Answer** `201`:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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
| `color` | `("none" \| "red" \| "orange" \| "yellow" \| "lime" \| "green" \| "teal" \|…` | no |  |
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
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
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

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

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
| `elements` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | yes | The elements, in the order they are gone through. |
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

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
| `elements` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | no | The elements, in the order they are gone through. |
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

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

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
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

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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
| `status` | query | `"queued" \| "running" \| "paused" \| "blocked" \| "awaiting" \| "finishe…` | no | `live` (the default): runs still going. `ended`: finished and stopped runs, newest first, from the archive. Or one status. |
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
      status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
      currentElementId: string | null;
      elements: {
        elementId: string;
        state: "pending" | "active" | "done" | "skipped";
        startedAt: string | null;
        finishedAt: string | null;
        note: string;
        output: unknown | null;
        ticks: {
          item: number;
          by: {
            kind: "agent" | "person" | "token";
            name?: string;
          };
          at: string;
        }[];
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        } | null;
        sessionId: string | null;
        sentBack: {
          comment: string;
          fromElementId: string;
          by: {
            kind: "agent" | "person" | "token";
            name?: string;
          };
          at: string;
        } | null;
      }[];
      blockedReason: string | null;
      pausedFrom: ("running" | "blocked" | "awaiting") | null;
      history: {
        type: "approved" | "sent-back";
        elementId: string;
        toElementId: string | null;
        comment: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
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
      produces: string;
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
| `kickoff` | `boolean` | no | Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. |
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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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

### approveRun

`POST /v1/runs/{runId}/approve`: Approve the element a run waits on.

For the owner only: no token and no session can do this, whatever its scopes. The run goes on to its next element, and the agent there is told with the fixed sentence to read its status. Refused with 409 when the run does not wait for approval.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `runId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `elementId` | `string` | no | The element being approved. Name it, so that a decision sent twice approves one element and not two. Without it: the one the run waits on. |
| `comment` | `string` | no | A few words for whoever does the next element. Plain text on one line. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### sendBackRun

`POST /v1/runs/{runId}/send-back`: Send a run that waits for approval back to an earlier element.

For the owner only: no token and no session can do this. The run returns to the element named; it and everything after it is done again, the approval too. The comment is part of what the agent is told about that element, marked as the words of a person.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `runId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `elementId` | `string` | yes | The earlier element the run goes back to. It, and everything after it, is done again. |
| `comment` | `string` | yes | What should change. Whoever does that element is told it, marked as your words. Plain text on one line. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### startRuns

`POST /v1/workflows/{workflowId}/runs`: Start a workflow on several sessions at once.

Each session gets a run of its own, started exactly as `POST /v1/runs` starts one, with the same rule for the kickoff line per session. The answer says for each session whether its run started, and if not, why. One that cannot start does not stop the others.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `sessionIds` | `string[]` | yes | The sessions, each of which gets its own run. |
| `inputs` | `{ [key: string]: string; }` | no | The inputs for every run. |
| `inputsBySession` | `{ [key: string]: { [key: string]: string; }; }` | no | For a session named here: its own inputs, in place of the ones for all. |
| `replace` | `boolean` | no | When the session is already on a run: stop that one and start this. Without it, that is refused. |
| `kickoff` | `boolean` | no | Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. |

**Answer** `200`:

```ts
{
  results: {
    sessionId: string;
    started: boolean;
    /** The run, when it started. */
    run: {
      run: {
        id: string;
        workflowId: string;
        workflowVersion: number;
        sessionId: string | null;
        inputs: {
          [key: string]: string;
        };
        status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
        currentElementId: string | null;
        elements: {
          elementId: string;
          state: "pending" | "active" | "done" | "skipped";
          startedAt: string | null;
          finishedAt: string | null;
          note: string;
          output: unknown | null;
          ticks: {
            item: number;
            by: {
              kind: "agent" | "person" | "token";
              name?: string;
            };
            at: string;
          }[];
          by: {
            kind: "agent" | "person" | "token";
            name?: string;
          } | null;
          sessionId: string | null;
          sentBack: {
            comment: string;
            fromElementId: string;
            by: {
              kind: "agent" | "person" | "token";
              name?: string;
            };
            at: string;
          } | null;
        }[];
        blockedReason: string | null;
        pausedFrom: ("running" | "blocked" | "awaiting") | null;
        history: {
          type: "approved" | "sent-back";
          elementId: string;
          toElementId: string | null;
          comment: string;
          by: {
            kind: "agent" | "person" | "token";
            name?: string;
          };
          at: string;
        }[];
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
        produces: string;
      }[];
      position: string;
      text: string;
      kickoff: string;
      kickoffTyped: boolean;
    } | null;
    /** Why it did not start, in a sentence. */
    reason: string | null;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"sessionIds":["<sessionIds>"]}' \
     http://127.0.0.1:4600/v1/workflows/<workflowId>/runs
```

### getBoard

`GET /v1/board`: The board: every run that is going, by workflow and element.

Every live run on every canvas, grouped by workflow (and by version, where live runs are on more than one), in columns that are the elements in order; the counts of what waits for the owner, is blocked and is working; and the runs that ended in the last day. It holds nothing that listing runs and sessions does not already give. A card that waits for a person can be approved or sent back by the owner only.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `canvasId` | query | `string` | no | Only runs whose terminal is on this canvas. |
| `workflowId` | query | `string` | no | Only runs of this workflow. |
| `status` | query | `"queued" \| "running" \| "paused" \| "blocked" \| "awaiting" \| "finishe…` | no | Only runs with this status. |
| `tag` | query | `string` | no | Only runs whose terminal has this tag. |

**Answer** `200`:

```ts
{
  /** Of the live runs shown, after the filters. */
  counts: {
    waitingForYou: number;
    blocked: number;
    working: number;
    paused: number;
    queued: number;
    total: number;
  };
  summary: string;
  groups: {
    /** Stays the same while the group exists: the workflow and its version, or `single`. */
    key: string;
    /** Null for the group of runs of one element by itself. */
    workflowId: string | null;
    workflowName: string;
    /** Said only when live runs are on more than one version of the workflow. */
    version: number | null;
    /** The group of runs of one element by itself: each card names its element. */
    single: boolean;
    /** Runs that wait for a terminal. */
    queued: {
      runId: string;
      workflowId: string;
      /** The terminal doing the run. Null for a run that is queued. */
      sessionId: string | null;
      /** The name of that terminal; empty for a queued run. */
      sessionName: string;
      /** The canvas the terminal is on. Null when it is parked, or the run is queued. */
      canvasId: string | null;
      canvasName: string;
      tags: string[];
      status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
      /** The status as the interface says it: `working`, `waiting for approval`, `blocked` and so on. */
      statusWords: string;
      elementId: string | null;
      elementName: string;
      /** When the run came to the element it is on. */
      since: string | null;
      /** The terminal has printed for a while since the last report: the card may be behind. */
      quiet: boolean;
      blockedReason: string | null;
      /** True when the run waits for a person to approve or send back. Only the owner can do either. */
      waitsForPerson: boolean;
      finishedAt: string | null;
    }[];
    /** That version's elements, in order. */
    columns: {
      elementId: string;
      name: string;
      /** An element where a run stops until a person has decided. */
      waitsForPerson: boolean;
      cards: {
        runId: string;
        workflowId: string;
        /** The terminal doing the run. Null for a run that is queued. */
        sessionId: string | null;
        /** The name of that terminal; empty for a queued run. */
        sessionName: string;
        /** The canvas the terminal is on. Null when it is parked, or the run is queued. */
        canvasId: string | null;
        canvasName: string;
        tags: string[];
        status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
        /** The status as the interface says it: `working`, `waiting for approval`, `blocked` and so on. */
        statusWords: string;
        elementId: string | null;
        elementName: string;
        /** When the run came to the element it is on. */
        since: string | null;
        /** The terminal has printed for a while since the last report: the card may be behind. */
        quiet: boolean;
        blockedReason: string | null;
        /** True when the run waits for a person to approve or send back. Only the owner can do either. */
        waitsForPerson: boolean;
        finishedAt: string | null;
      }[];
    }[];
  }[];
  /** Runs that finished or were stopped in the last day, newest first, at most a set number. */
  ended: {
    runId: string;
    workflowId: string;
    /** The terminal doing the run. Null for a run that is queued. */
    sessionId: string | null;
    /** The name of that terminal; empty for a queued run. */
    sessionName: string;
    /** The canvas the terminal is on. Null when it is parked, or the run is queued. */
    canvasId: string | null;
    canvasName: string;
    tags: string[];
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    /** The status as the interface says it: `working`, `waiting for approval`, `blocked` and so on. */
    statusWords: string;
    elementId: string | null;
    elementName: string;
    /** When the run came to the element it is on. */
    since: string | null;
    /** The terminal has printed for a while since the last report: the card may be behind. */
    quiet: boolean;
    blockedReason: string | null;
    /** True when the run waits for a person to approve or send back. Only the owner can do either. */
    waitsForPerson: boolean;
    finishedAt: string | null;
    workflowName: string;
  }[];
  /** True when there were more ended runs than are shown. */
  endedCut: boolean;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/board
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
| `kickoff` | `boolean` | no | Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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

## Drafts

### listDrafts

`GET /v1/drafts`: List drafts.

Workflows and elements that were proposed and wait for the owner, oldest first. A draft cannot be run and is not among the workflows.

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
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/drafts
```

### proposeDraft

`POST /v1/drafts`: Propose a workflow or an element as a draft.

Nothing proposed here can be run or is told to an agent until the owner has read and accepted it in the browser.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `workflow` | `{ /** What it is called. */ name: string; /** What it is for, in a …` | no | A whole workflow. Give this or `element`, not both. |
| `element` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | no | One element, for the shelf. |
| `revisesWorkflowId` | `string` | no | For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. |
| `description` | `string` | no | What it is meant to do, when nobody asked for it. |

**Answer** `201`:

```ts
{
  draft: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  };
  text: string;
  previousText: string | null;
  needs: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"workflow":{"name":"example","elements":[{"name":"example"}]}}' \
     http://127.0.0.1:4600/v1/drafts
```

### getDraft

`GET /v1/drafts/{draftId}`: Read a draft.

With the whole text it would tell an agent, what it needs, and the text of the version before.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `draftId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  draft: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  };
  text: string;
  previousText: string | null;
  needs: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/drafts/<draftId>
```

### reviseDraft

`PUT /v1/drafts/{draftId}`: Hand in a new version of a draft.

For a draft that was sent back, or to replace one still waiting.

An API token needs the scope `workflows:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `draftId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `workflow` | `{ /** What it is called. */ name: string; /** What it is for, in a …` | no | A whole workflow. Give this or `element`, not both. |
| `element` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | no | One element, for the shelf. |
| `revisesWorkflowId` | `string` | no | For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. |
| `description` | `string` | no | What it is meant to do, when nobody asked for it. |

**Answer** `200`:

```ts
{
  draft: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  };
  text: string;
  previousText: string | null;
  needs: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"workflow":{"name":"example","elements":[{"name":"example"}]}}' \
     http://127.0.0.1:4600/v1/drafts/<draftId>
```

### discardDraft

`DELETE /v1/drafts/{draftId}`: Discard a draft.

For the owner only.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `draftId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

### acceptDraft

`POST /v1/drafts/{draftId}/accept`: Accept a draft.

A workflow draft becomes a workflow, or a new version of the one it revises; an element draft goes on the shelf. For the owner only: no token may accept.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `draftId` | path | `string` | yes | An ID. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `workflow` | `{ /** What it is called. */ name: string; /** What it is for, in a …` | no | The workflow as edited before accepting. |
| `element` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | no | The element as edited before accepting. |

**Answer** `200`:

```ts
{
  workflowId: string | null;
  elementId: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### returnDraft

`POST /v1/drafts/{draftId}/return`: Send a draft back with a comment.

For the owner only. Whoever proposed it reads the comment and hands in a new version.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `draftId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `comment` | `string` | yes | What should change. |

**Answer** `200`:

```ts
{
  workflow: {
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
  } | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  } | null;
  id: string;
  kind: "workflow" | "element";
  status: "requested" | "waiting" | "returned";
  description: string;
  proposedBy: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  } | {
    kind: "person";
  };
  sessionId: string | null;
  revisesWorkflowId: string | null;
  previous: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
  } | null;
  revision: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### listDraftRecords

`GET /v1/draft-records`: What became of drafts.

For the owner only. Newest first: who proposed each draft, what kind it was, whether it was accepted or discarded, when, and whether that was done in the browser or from the command line. Never what a draft said.

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
    at: string;
    draftId: string;
    kind: "workflow" | "element";
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    revisions: number;
    outcome: "accepted" | "discarded" | "withdrawn";
    by: {
      kind: "owner" | "owner-cli";
      sessionId: string | null;
    };
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

### requestDraft

`POST /v1/draft-requests`: Ask the agent in a session to write a workflow or an element.

For the owner only. The description is kept with the request and read by the agent with `aubergine workflow brief`; only a fixed sentence is typed into the terminal.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `kind` | `"workflow" \| "element"` | yes |  |
| `description` | `string` | yes | What you want, in your own words. |
| `sessionId` | `string` | yes | The session whose agent is asked. |
| `tell` | `boolean` | no | Type the fixed request line into the terminal, when an agent is running there. |

**Answer** `201`:

```ts
{
  draft: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  };
  told: boolean;
  line: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

## Library

### listLibrarySources

`GET /v1/library/sources`: List the sources of the library.

Each with when it was last read, the commit that was read for a Git source, why the last try failed when it did, and what it lists. Nothing is fetched by asking.

An API token needs the scope `read`.

**Answer** `200`:

```ts
{
  sources: {
    id: string;
    kind: string;
    address: string;
    name: string;
    claims: string | null;
    addedAt: string;
    refreshedAt: string | null;
    commit: string | null;
    problem: string | null;
    history: ("same" | "grew" | "rewritten" | "cannot-tell") | null;
    items: {
      id: string;
      kind: string;
      name: string;
      description: string;
      version: string;
      path: string;
      digest: string | null;
      retired: boolean;
      replacedBy: string | null;
      flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
      problem: string | null;
    }[];
    skipped: {
      id: string;
      reason: string;
    }[];
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/library/sources
```

### addLibrarySource

`POST /v1/library/sources`: Add a source.

For the owner only. A folder on this computer, or the address of a Git repository (https, ssh or file; never one with a password in it). Adding a Git source fetches it once: the only other thing that ever fetches is a refresh.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `kind` | `string` | yes | `folder` (a folder on this computer) or `git` (the address of a Git repository). |
| `address` | `string` | yes | For a folder: its path. For Git: an address starting with https://, ssh:// or file://, or of the form user@host:path. Never with a password in it. |
| `name` | `string` | no | What to call it. Left out, it is shown by what its index calls it, said as its own claim, with its address beside it. |

**Answer** `201`:

```ts
{
  id: string;
  kind: string;
  address: string;
  name: string;
  claims: string | null;
  addedAt: string;
  refreshedAt: string | null;
  commit: string | null;
  problem: string | null;
  history: ("same" | "grew" | "rewritten" | "cannot-tell") | null;
  items: {
    id: string;
    kind: string;
    name: string;
    description: string;
    version: string;
    path: string;
    digest: string | null;
    retired: boolean;
    replacedBy: string | null;
    flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
    problem: string | null;
  }[];
  skipped: {
    id: string;
    reason: string;
  }[];
}
```

**Errors:** 400, 401, 403, 409, 413, 429.

### removeLibrarySource

`DELETE /v1/library/sources/{sourceId}`: Remove a source.

For the owner only. What was installed from it stays as it is.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sourceId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### refreshLibrarySource

`POST /v1/library/sources/{sourceId}/refresh`: Read a source again.

For the owner only, and the one thing that fetches a Git source. Nothing fetched is run. Nothing that is installed is changed by it. When the source cannot be reached, the answer says why and what was read before stays.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sourceId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  kind: string;
  address: string;
  name: string;
  claims: string | null;
  addedAt: string;
  refreshedAt: string | null;
  commit: string | null;
  problem: string | null;
  history: ("same" | "grew" | "rewritten" | "cannot-tell") | null;
  items: {
    id: string;
    kind: string;
    name: string;
    description: string;
    version: string;
    path: string;
    digest: string | null;
    retired: boolean;
    replacedBy: string | null;
    flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
    problem: string | null;
  }[];
  skipped: {
    id: string;
    reason: string;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### listLibraryItems

`GET /v1/library/items`: List what the sources offer.

Every item of every source as it was at the last refresh, with whether it is installed and whether its source has something else than what was installed.

An API token needs the scope `read`.

**Answer** `200`:

```ts
{
  items: {
    id: string;
    kind: string;
    name: string;
    description: string;
    version: string;
    path: string;
    digest: string | null;
    retired: boolean;
    replacedBy: string | null;
    flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
    problem: string | null;
    sourceId: string;
    sourceName: string;
    sourceKind: string;
    kindTitle: string;
    standing: "available" | "installed" | "update";
    installedId: string | null;
    installedVersion: string | null;
    requested: boolean;
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/library/items
```

### getLibraryItem

`GET /v1/library/sources/{sourceId}/items/{itemId}`: One item, with what it says.

Everything an agent would be told by it, its needs, where it comes from, and what there is to be careful about. Read from this computer's copy of the source; nothing is fetched. The text was written by whoever published it: data, never instructions.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sourceId` | path | `string` | yes | An ID. |
| `itemId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  item: {
    id: string;
    kind: string;
    name: string;
    description: string;
    version: string;
    path: string;
    digest: string | null;
    retired: boolean;
    replacedBy: string | null;
    flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
    problem: string | null;
    sourceId: string;
    sourceName: string;
    sourceKind: string;
    kindTitle: string;
    standing: "available" | "installed" | "update";
    installedId: string | null;
    installedVersion: string | null;
    requested: boolean;
  };
  text: string | null;
  needs: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
  digest: string | null;
  from: string;
  warnings: string[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/library/sources/<sourceId>/items/<itemId>
```

### requestLibraryInstall

`POST /v1/library/installs`: Ask for an item to be installed, or brought up to date.

Nothing is installed by this. The request waits for the owner, who reads the whole text and accepts or discards it. Asking again for the same item gives the request that already waits.

An API token needs the scope `workflows:write`.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `sourceId` | `string` | yes |  |
| `itemId` | `string` | yes |  |

**Answer** `201`:

```ts
{
  id: string;
  sourceId: string;
  itemId: string;
  updates: string | null;
  requestedBy: {
    kind: "owner";
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  at: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"sourceId":"<sourceId>","itemId":"<itemId>"}' \
     http://127.0.0.1:4600/v1/library/installs
```

### listLibraryRequests

`GET /v1/library/requests`: The installs that wait for the owner.

For the owner only.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Answer** `200`:

```ts
{
  requests: {
    request: {
      id: string;
      sourceId: string;
      itemId: string;
      updates: string | null;
      requestedBy: {
        kind: "owner";
      } | {
        kind: "token";
        tokenId: string;
        name: string;
      };
      at: string;
    };
    item: {
      id: string;
      kind: string;
      name: string;
      description: string;
      version: string;
      path: string;
      digest: string | null;
      retired: boolean;
      replacedBy: string | null;
      flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
      problem: string | null;
      sourceId: string;
      sourceName: string;
      sourceKind: string;
      kindTitle: string;
      standing: "available" | "installed" | "update";
      installedId: string | null;
      installedVersion: string | null;
      requested: boolean;
    } | null;
    what: string;
    from: string;
    requestedBy: string;
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

### getLibraryRequest

`GET /v1/library/requests/{requestId}`: One waiting install, with everything its reviewer reads.

For the owner only. The whole text as an agent would be told it, the needs with advice on whether the agents here have them, where it comes from, and for an update what is in place now.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `requestId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  request: {
    id: string;
    sourceId: string;
    itemId: string;
    updates: string | null;
    requestedBy: {
      kind: "owner";
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    };
    at: string;
  };
  item: {
    id: string;
    kind: string;
    name: string;
    description: string;
    version: string;
    path: string;
    digest: string | null;
    retired: boolean;
    replacedBy: string | null;
    flags: ("changed-without-version" | "gone" | "unreadable" | "unknown-kind")[];
    problem: string | null;
    sourceId: string;
    sourceName: string;
    sourceKind: string;
    kindTitle: string;
    standing: "available" | "installed" | "update";
    installedId: string | null;
    installedVersion: string | null;
    requested: boolean;
  } | null;
  what: string;
  from: string;
  requestedBy: string;
  text: string | null;
  previousText: string | null;
  installedText: string | null;
  needs: {
    need: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    };
    state: "found" | "not-found" | "cannot-tell";
    words: string;
  }[];
  digest: string | null;
  warnings: string[];
  proposal: {
    workflow: unknown | null;
    element: unknown | null;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### discardLibraryRequest

`DELETE /v1/library/requests/{requestId}`: Discard a waiting install.

For the owner only.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `requestId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

### acceptLibraryRequest

`POST /v1/library/requests/{requestId}/accept`: Install what a request asks for.

For the owner only: no token can accept. The body names the digest of the file as it was shown; the file is read again, and if it is not that file any more nothing is installed. A workflow goes among the workflows, an element onto the shelf; an update makes a new version of what is there.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `requestId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `digest` | `string` | yes | The digest of the file as it was shown for review. If the file is not that any more, nothing is installed. |
| `workflow` | `unknown` | no | The workflow as edited before accepting. |
| `element` | `unknown` | no | The element as edited before accepting. |

**Answer** `200`:

```ts
{
  id: string;
  kind: string;
  name: string;
  from: {
    sourceId: string;
    kind: string;
    address: string;
    sourceName: string;
    itemId: string;
    version: string;
    commit: string | null;
    digest: string;
  };
  installedAt: string;
  target: {
    workflowId?: string;
    shelfId?: string;
  };
  atSource: "current" | "retired" | "gone";
  useInstead: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### listLibraryInstalled

`GET /v1/library/installed`: What was installed from the library.

Each with where it came from: source, item, the version its publisher gave it, the commit, and the digest of the file as installed.

An API token needs the scope `read`.

**Answer** `200`:

```ts
{
  installed: {
    id: string;
    kind: string;
    name: string;
    from: {
      sourceId: string;
      kind: string;
      address: string;
      sourceName: string;
      itemId: string;
      version: string;
      commit: string | null;
      digest: string;
    };
    installedAt: string;
    target: {
      workflowId?: string;
      shelfId?: string;
    };
    atSource: "current" | "retired" | "gone";
    useInstead: string | null;
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/library/installed
```

### getLibraryInstalledUsage

`GET /v1/library/installed/{installedId}/usage`: Where an installed item is used.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `installedId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  uses: string[];
  liveRuns: number;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/library/installed/<installedId>/usage
```

### removeLibraryInstalled

`DELETE /v1/library/installed/{installedId}`: Remove what was installed.

For the owner only. An element leaves the shelf, and copies of it in workflows stay as they are, saying that their source was removed. A workflow is removed; refused while a run of it is going.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `installedId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 409, 413, 429.

## Elements

### listElements

`GET /v1/elements`: List the elements on the shelf.

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
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    createdAt: string;
    updatedAt: string;
    /** The number of its newest version. Editing it adds one. */
    version: number;
    /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
    versions: {
      version: number;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      };
      at: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      note: string;
    }[];
    /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
    state: "current" | "retired";
    /** For a retired element: the shelf element to use in its place, when one was named. */
    replacedBy: string | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/elements
```

### createElement

`POST /v1/elements`: Put an element on the shelf.

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `id` | `string` | no | Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. |
| `kind` | `string` | no | What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. |
| `name` | `string` | yes | What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. |
| `instructions` | `string` | no | What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. |
| `ask` | `string` | no | For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. |
| `lookAt` | `string` | no | For an approval, if you like: what the person should look at before deciding. |
| `doneWhen` | `string` | no | One line: how to tell that the element is finished. The agent is told to report done when this is true. |
| `needs` | `{ kind: "mcp" \| "command" \| "access" \| "other"; name: string; note?…` | no | What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. |
| `produces` | `string` | no | What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). |
| `origin` | `{ kind: string; name?: string; [key: string]: unknown; }` | no | Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. |
| `source` | `{ shelfId: string; version: number \| null; hash: string \| null; } \|…` | no | For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. |
| `extra` | `{ [key: string]: unknown; }` | no | Fields from a file that this version does not know, kept so that they are written out again. |

**Answer** `201`:

```ts
{
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
  /** The number of its newest version. Editing it adds one. */
  version: number;
  /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
  versions: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
  state: "current" | "retired";
  /** For a retired element: the shelf element to use in its place, when one was named. */
  replacedBy: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"name":"example"}' \
     http://127.0.0.1:4600/v1/elements
```

### updateElement

`PATCH /v1/elements/{elementId}`: Change an element on the shelf.

Copies of it already in workflows are not changed.

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `kind` | `string` | no |  |
| `name` | `string` | no |  |
| `instructions` | `string` | no |  |
| `doneWhen` | `string` | no |  |
| `ask` | `string` | no |  |
| `lookAt` | `string` | no |  |
| `needs` | `{ kind: "mcp" \| "command" \| "access" \| "other"; name: string; note?…` | no |  |
| `produces` | `string` | no |  |
| `note` | `string` | no | One line on what changed. Kept with the new version. |

**Answer** `200`:

```ts
{
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
  /** The number of its newest version. Editing it adds one. */
  version: number;
  /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
  versions: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
  state: "current" | "retired";
  /** For a retired element: the shelf element to use in its place, when one was named. */
  replacedBy: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"kind":"text"}' \
     http://127.0.0.1:4600/v1/elements/<elementId>
```

### removeElement

`DELETE /v1/elements/{elementId}`: Take an element off the shelf.

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/elements/<elementId>
```

### copyElement

`POST /v1/elements/{elementId}/copy`: Duplicate an element on the shelf.

An API token needs the scope `workflows:write`. A token whose changes to workflows need review is refused here: it proposes a draft instead (`POST /v1/drafts`).

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Answer** `201`:

```ts
{
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
  /** The number of its newest version. Editing it adds one. */
  version: number;
  /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
  versions: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
  state: "current" | "retired";
  /** For a retired element: the shelf element to use in its place, when one was named. */
  replacedBy: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/elements/<elementId>/copy
```

### listElementVersions

`GET /v1/elements/{elementId}/versions`: The versions of a shelf element.

Newest first: each with what the element said, who saved it, when, and a line on what changed. The newest 30 are kept, and any a copy in a workflow was made from.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/elements/<elementId>/versions
```

### getElementUsage

`GET /v1/elements/{elementId}/usage`: Where a shelf element is used.

The workflows that hold a copy of it, and for each copy whether it is unchanged, was changed in its workflow, or is behind the shelf.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  uses: {
    workflowId: string;
    workflowName: string;
    /** The number of the workflow's newest version. */
    workflowVersion: number;
    copies: {
      elementId: string;
      name: string;
      /** `unchanged`, `changed` (here, since it was copied), `behind` (a newer version is on the shelf), `both`, or `unknown` for a copy from before versions were kept. */
      state: "none" | "unchanged" | "changed" | "behind" | "both" | "unknown" | "gone";
      copiedVersion: number | null;
    }[];
    /** Every kept version of the workflow that holds a copy. */
    inVersions: number[];
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/elements/<elementId>/usage
```

### retireElement

`POST /v1/elements/{elementId}/retire`: Retire a shelf element.

For the owner only. A retired element is kept and still works wherever a copy of it is; it is no longer offered when inserting, and cannot be run by itself. It may name the element to use in its place.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `replacedBy` | `string` | no | The shelf element to use in its place. The editor then says so wherever a copy of the retired one is. |

**Answer** `200`:

```ts
{
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
  /** The number of its newest version. Editing it adds one. */
  version: number;
  /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
  versions: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
  state: "current" | "retired";
  /** For a retired element: the shelf element to use in its place, when one was named. */
  replacedBy: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### restoreElement

`POST /v1/elements/{elementId}/restore`: Bring a retired shelf element back.

For the owner only.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
  /** The number of its newest version. Editing it adds one. */
  version: number;
  /** Its saved versions, oldest first: each with who saved it, when, and a line on what changed. None is ever changed. */
  versions: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    };
    at: string;
    by: {
      kind: "agent" | "person" | "token";
      name?: string;
    };
    note: string;
  }[];
  /** `current`, or `retired`: kept and still working where it is used, but not offered when inserting and not run by itself. */
  state: "current" | "retired";
  /** For a retired element: the shelf element to use in its place, when one was named. */
  replacedBy: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### updateFromShelf

`POST /v1/workflows/{workflowId}/elements/{elementId}/shelf-update`: Decide about a newer shelf version for one copy in a workflow.

For the owner only: no token and no draft can do this. `take` puts the shelf's newest version in place of the copy; `keep` leaves the copy and notes that the newer version was seen. Either saves a new version of the workflow, as any edit does; runs that are going are not touched. Nothing is merged, and nothing is ever updated by itself.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `workflowId` | path | `string` | yes | An ID. |
| `elementId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `decision` | `"take" \| "keep"` | yes | `take`: the shelf's newest version takes the place of the copy's content. `keep`: the copy stays as it is, and is from then on a copy of the newest version that was changed here. |

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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
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

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### runElement

`POST /v1/elements/{elementId}/run`: Run one element by itself, on a session.

A run of that one element. It is listed among the runs, and no workflow is added for it.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `elementId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `sessionId` | `string` | yes | The session that will do it. |
| `inputs` | `{ [key: string]: string; }` | no | What the element asks for: `task`, when its text uses it. |
| `replace` | `boolean` | no | Stop the run the session is on, if any, and start this. |
| `kickoff` | `boolean` | no | Type the fixed kickoff line, for the owner, where an agent is running. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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
     -H "Content-Type: application/json" -d '{"sessionId":"<sessionId>"}' \
     http://127.0.0.1:4600/v1/elements/<elementId>/run
```

## Runs

### tickRunItem

`POST /v1/runs/{runId}/ticks`: Tick an item of what an element produced.

For a checklist. Ticks are kept with the run, also after it is over, with who ticked and when; the next element is told which items are ticked.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `runId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `elementId` | `string` | yes | The element whose output it is. |
| `item` | `number` | yes | Which item, counting from zero. |
| `ticked` | `boolean` | yes | True to tick it, false to take the tick away. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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
     -H "Content-Type: application/json" -d '{"elementId":"<elementId>","item":0,"ticked":true}' \
     http://127.0.0.1:4600/v1/runs/<runId>/ticks
```

## Repository workflows

### listRepositoryWorkflows

`GET /v1/repository-workflows`: List the workflows that repositories offer.

For each Git repository a session's folder is in: the workflow files in its `.aubergine/workflows/` folder as they are now, each with whether its content was accepted. Read from disk when asked; nothing is remembered between calls.

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
    root: string;
    folder: string;
    workflows: {
      file: string;
      name: string | null;
      elements: string[];
      hash: string | null;
      state: "accepted" | "review" | "changed" | "unreadable";
      reason: string | null;
    }[];
    truncated: boolean;
    sessionIds: string[];
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/repository-workflows
```

### getRepositoryWorkflow

`GET /v1/repository-workflows/file`: Read one repository workflow.

The whole text it would tell an agent, what it needs, and, when it has changed since it was accepted, the text that was accepted.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `root` | query | `string` | yes | The top folder of the repository, as the list gives it. It must be the repository of a session. |
| `file` | query | `string` | yes | The name of the file, as the list gives it. |

**Answer** `200`:

```ts
{
  workflow: {
    file: string;
    name: string | null;
    elements: string[];
    hash: string | null;
    state: "accepted" | "review" | "changed" | "unreadable";
    reason: string | null;
  };
  root: string;
  text: string;
  previousText: string | null;
  needs: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
  } | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/repository-workflows/file?root=text&file=text
```

### acceptRepositoryWorkflow

`POST /v1/repository-workflows/accept`: Accept a repository workflow as it is now.

For the owner only. A repository workflow cannot be run until its exact content was accepted, and must be accepted again when the file changes.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `root` | `string` | yes | The top folder of the repository, as the list gives it. It must be the repository of a session. |
| `file` | `string` | yes | The name of the file, as the list gives it. |
| `hash` | `string` | yes | The hash of the content that was read. If the file has changed since, nothing is accepted. |

**Answer** `200`:

```ts
{
  file: string;
  name: string | null;
  elements: string[];
  hash: string | null;
  state: "accepted" | "review" | "changed" | "unreadable";
  reason: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### saveToRepository

`POST /v1/repository-workflows/save`: Write a workflow into a repository.

For the owner only. Writes one file into `.aubergine/workflows/` of the repository a session's folder is in, named after the workflow. Nothing is replaced unless `overwrite` says so.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `sessionId` | `string` | yes | A session whose folder is inside the repository to write to. |
| `workflowId` | `string` | yes | The workflow to write. |
| `overwrite` | `boolean` | no | Replace the file if there is one of that name. Without this, that is refused. |

**Answer** `201`:

```ts
{
  root: string;
  file: string;
  path: string;
  overwritten: boolean;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### runRepositoryWorkflow

`POST /v1/sessions/{sessionId}/repository-runs`: Start a run of a repository workflow on a session.

The session's folder must be in that repository, and the file's content must be what the owner accepted; otherwise 409. The run is made from the accepted content: a later change to the file does not reach it.

An API token needs the scope `runs:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `file` | `string` | yes | The file, as the list gives it. |
| `inputs` | `{ [key: string]: string; }` | no | The inputs the workflow asks for, by key. |
| `replace` | `boolean` | no | Stop the run the session is on, if any, and start this. |
| `kickoff` | `boolean` | no | Type the fixed kickoff line, for the owner, where an agent is running. |

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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
     -H "Content-Type: application/json" -d '{"file":"text"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/repository-runs
```

## Queue

### listTasks

`GET /v1/tasks`: List the tasks of the queue.

Every task that is not over, and those that are over and not yet looked at; with `state=ended`, the ones put away, newest first.

An API token needs the scope `read`.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |
| `state` | query | `"proposed" \| "queued" \| "taken" \| "working" \| "needs-owner" \| "done…` | no | `live` (the default): every task that is not over, and those that are over and not yet looked at. `ended`: tasks that are over and were put away, newest first, from the archive. Or one state. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    /** What it is, in one line. Shown in lists and in terminals. */
    title: string;
    /** What to do, for the agent that takes it. Plain text. */
    details: string;
    /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
    folder: string | null;
    /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
    workflowId: string | null;
    /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
    environment: string | null;
    /** Who may take it. */
    taker: {
      kind: "any";
    } | {
      kind: "session";
      sessionId: string;
    } | {
      kind: "new";
      canvasId: string;
    };
    addedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
      sessionId?: string;
      tokenId?: string;
    };
    source: {
      kind: string;
      [key: string]: unknown;
    };
    labels: string[];
    /** Its place among the tasks that wait: lower is sooner. */
    order: number;
    state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
    /** The terminal that took it. */
    sessionId: string | null;
    /** The run it became. */
    runId: string | null;
    /** With `failed` and `needs-owner`: why, in a sentence. */
    reason: string | null;
    createdAt: string;
    updatedAt: string;
    endedAt: string | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/tasks
```

### addTask

`POST /v1/tasks`: Add a task to the queue.

From the owner it is queued. From a program it is a proposal: it waits on the owner's list for a yes, and starts nothing. A token with review switched off queues directly. Refused with 409 when the caller already has as many proposals waiting as are allowed.

An API token needs the scope `tasks:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `title` | `string` | yes | What it is, in one line. |
| `details` | `string` | no | What to do, for the agent that takes it. Plain text. |
| `folder` | `string \| null` | no | The folder it is done in. Null: the folder new terminals start in. |
| `workflowId` | `string \| null` | no | The workflow it goes through. Null: it is told as one element, with the details as its task. |
| `environment` | `string \| null` | no | Where a new terminal for it works. Null: a working copy of its own where the folder can have one. |
| `taker` | `{ kind: "any"; } \| { kind: "session"; sessionId: string; } \| { kind…` | no | Who may take it: `{"kind":"any"}`, one terminal, or a new agent terminal on a canvas. |
| `labels` | `string[]` | no | Short words of your own. |
| `source` | `{ kind: string; [key: string]: unknown; }` | no | Where it came from. Left out: through the API for a program, by hand for the owner. |

**Answer** `201`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"title":"text"}' \
     http://127.0.0.1:4600/v1/tasks
```

### getTask

`GET /v1/tasks/{taskId}`: Read one task.

Also for a task that was put away.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/tasks/<taskId>
```

### changeTask

`PATCH /v1/tasks/{taskId}`: Change a task that has not started.

For the owner only: no token and no session can do this, whatever its scopes. What is left out stays as it was.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `title` | `string` | no | What it is, in one line. |
| `details` | `string` | no | What to do, for the agent that takes it. Plain text. |
| `folder` | `string \| null` | no | The folder it is done in. Null: the folder new terminals start in. |
| `workflowId` | `string \| null` | no | The workflow it goes through. Null: it is told as one element, with the details as its task. |
| `environment` | `string \| null` | no | Where a new terminal for it works. Null: a working copy of its own where the folder can have one. |
| `taker` | `{ kind: "any"; } \| { kind: "session"; sessionId: string; } \| { kind…` | no | Who may take it: `{"kind":"any"}`, one terminal, or a new agent terminal on a canvas. |
| `labels` | `string[]` | no | Short words of your own. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### withdrawTask

`POST /v1/tasks/{taskId}/withdraw`: Take a task back before it starts.

The owner may withdraw any task that has not started. A program may withdraw what it itself added, and nothing else.

An API token needs the scope `tasks:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/tasks/<taskId>/withdraw
```

### acceptTask

`POST /v1/tasks/{taskId}/accept`: Say yes to a proposed task.

For the owner only: no token and no session can do this, whatever its scopes. The task joins the ones that wait to be started. Accepting starts nothing by itself.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### declineTask

`POST /v1/tasks/{taskId}/decline`: Say no to a proposed task.

For the owner only: no token and no session can do this, whatever its scopes. A record is kept that it was proposed and declined.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### retryTask

`POST /v1/tasks/{taskId}/again`: Put a failed task back among those that wait.

For the owner only: no token and no session can do this, whatever its scopes. Nothing is ever tried again by itself.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### clearTask

`POST /v1/tasks/{taskId}/clear`: Put away a task that is over.

For the owner only: no token and no session can do this, whatever its scopes. A task that is done or failed stays on the owner's list until it was looked at; this puts it in the archive.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `taskId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### reorderTasks

`PUT /v1/tasks/order`: Say in which order the waiting tasks start.

For the owner only: no token and no session can do this, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `taskIds` | `string[]` | yes | Tasks that wait, in the order they are to be started. One that is left out keeps its place after these. |

**Answer** `200`:

```ts
{
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
}
```

**Errors:** 400, 401, 403, 413, 429.

### startTasks

`POST /v1/tasks/start`: Start the next task, or one named.

For the owner only: no token and no session can do this, whatever its scopes. Without a task: the next one that someone can take now, if a place is free. A start is the existing start of a run on a terminal; nothing is typed but the fixed kickoff sentence, by the existing rule. Refused while new starts are held.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON, may be left out):

| Field | Type | Required | |
|---|---|---|---|
| `taskId` | `string` | no | The task to start. Without one: the next in order that can be taken now. |

**Answer** `200`:

```ts
{
  started: {
    taskId: string;
    sessionId: string | null;
    ok: boolean;
    reason: string | null;
  }[];
  /** In a sentence: what was started, or why nothing was. */
  says: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### getQueue

`GET /v1/queue`: How tasks are started, and how the queue stands.

The limit, whether new starts are held, whether tasks start by themselves, and the counts.

An API token needs the scope `read`.

**Answer** `200`:

```ts
{
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/queue
```

### changeQueue

`PUT /v1/queue`: Change the limit, hold new starts, or switch automatic starting.

For the owner only: no token and no session can do this, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `limit` | `number` | no | How many tasks may be at work at once. |
| `hold` | `boolean` | no |  |
| `automatic` | `boolean` | no |  |

**Answer** `200`:

```ts
{
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
}
```

**Errors:** 400, 401, 403, 413, 429.

### getForYou

`GET /v1/for-you`: What waits on the owner.

Everything that waits on a person, in one list: terminals that wait, runs to approve, drafts and installs to read, proposed tasks, tasks that are done or failed, lists handed in, working copies to decide about, and what was asked in writing. Gathered from what the caller can already read elsewhere, plus what was written on the list.

An API token needs the scope `read`.

**Answer** `200`:

```ts
{
  items: {
    /** Stays the same while the thing waits: its kind and what it is about. */
    id: string;
    kind: string;
    /** What its kind is called: `Approval`, `A draft to read`. */
    title: string;
    /** What waits, in a sentence. Where part of it was written by an agent or a program, it is their words. */
    sentence: string;
    /** Where it came from: a terminal by name, a program, the library. */
    from: string;
    /** Since when, when that is known. */
    at: string | null;
    /** Where one acts on it: `run:<id>`, `session:<id>`, `task:<id>`, `ask:<id>`, `copy:<id>`, `review`. */
    act: string;
    /** True for a terminal that waits for the owner: these are what the count in the toolbar counts. */
    waits: boolean;
    /** True for something written on the list, which the owner marks done. False for what is gathered: that goes when the thing is done. */
    written: boolean;
    sessionId: string | null;
    runId: string | null;
    taskId: string | null;
    askId: string | null;
    environmentId: string | null;
    elementId: string | null;
  }[];
  waiting: number;
  summary: string;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/for-you
```

### addAsk

`POST /v1/asks`: Ask the owner for something, in writing.

It appears on the owner's list until they mark it done or dismiss it. Nothing is typed anywhere and nothing is started. Refused with 409 when the caller already has as many waiting as are allowed.

An API token needs the scope `tasks:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `idempotency-key` | header | `string` | no | A key of your choosing (1 to 128 visible ASCII characters). Sending the same request again with the same key returns the first answer and creates nothing more. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes | What is asked, in plain text. |
| `source` | `{ kind: string; [key: string]: unknown; }` | no |  |

**Answer** `201`:

```ts
{
  id: string;
  text: string;
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  createdAt: string;
}
```

**Errors:** 400, 401, 403, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     http://127.0.0.1:4600/v1/asks
```

### finishAsk

`POST /v1/asks/{askId}/done`: Mark something written on the list as done.

For the owner only: no token and no session can do this, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `askId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  text: string;
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  createdAt: string;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### dismissAsk

`POST /v1/asks/{askId}/dismiss`: Take something written off the list without doing it.

For the owner only: no token and no session can do this, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `askId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  id: string;
  text: string;
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  createdAt: string;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### listRules

`GET /v1/rules`: List the rules.

For the owner only: no token and no session can do this, whatever its scopes. A rule is "when this happens, do that".

For the signed-in browser only. No API token may call this, whatever its scopes.

**Answer** `200`:

```ts
{
  rules: {
    id: string;
    event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added";
    action: {
      kind: string;
      [key: string]: unknown;
    };
    createdAt: string;
    /** The rule in a sentence. */
    says: string;
  }[];
  /** The kinds of action there are. */
  actions: {
    kind: string;
    title: string;
    says: string;
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

### addRule

`POST /v1/rules`: Write a rule.

For the owner only: no token and no session can do this, whatever its scopes. The action is one of the registered kinds: a notification in the open page, or a run of one shelf element on a terminal. Nothing a rule does leaves this computer by Aubergine's own hand.

For the signed-in browser only. No API token may call this, whatever its scopes.

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `event` | `"task.done" \| "task.failed" \| "task.needs-owner" \| "ask.added"` | yes | What sets it off. |
| `action` | `{ kind: string; [key: string]: unknown; }` | yes | What it does: `{"kind":"notify"}`, or `{"kind":"run-element","elementId":"…","on":{"kind":"session","sessionId":"…"}}`. |

**Answer** `201`:

```ts
{
  rules: {
    id: string;
    event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added";
    action: {
      kind: string;
      [key: string]: unknown;
    };
    createdAt: string;
    /** The rule in a sentence. */
    says: string;
  }[];
  /** The kinds of action there are. */
  actions: {
    kind: string;
    title: string;
    says: string;
  }[];
}
```

**Errors:** 400, 401, 403, 409, 413, 429.

### removeRule

`DELETE /v1/rules/{ruleId}`: Remove a rule.

For the owner only: no token and no session can do this, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `ruleId` | path | `string` | yes | An ID. |

**Answer** `204`, with nothing in it.

**Errors:** 400, 401, 403, 404, 413, 429.

## For a session itself

### proposeSessionTask

`POST /v1/sessions/{sessionId}/tasks`: Propose a task for the queue.

What the session thinks should be done, by another agent or later. It waits on the owner's list for a yes and starts nothing. Where it would run and who takes it are the owner's to say.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `title` | `string` | yes | What it is, in one line. |
| `details` | `string` | no | What to do, for the agent that takes it. Plain text. |
| `labels` | `string[]` | no | Short words of your own. |

**Answer** `201`:

```ts
{
  id: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one element, with the details as its task. */
  workflowId: string | null;
  /** Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself. */
  environment: string | null;
  /** Who may take it. */
  taker: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  labels: string[];
  /** Its place among the tasks that wait: lower is sooner. */
  order: number;
  state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
  /** The terminal that took it. */
  sessionId: string | null;
  /** The run it became. */
  runId: string | null;
  /** With `failed` and `needs-owner`: why, in a sentence. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"title":"text"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/tasks
```

### addSessionAsk

`POST /v1/sessions/{sessionId}/asks`: Ask the owner for something, in writing.

For something only a person can do. It appears on the owner's list until they mark it done or dismiss it.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes | What is asked, in plain text. |

**Answer** `201`:

```ts
{
  id: string;
  text: string;
  addedBy: {
    kind: "agent" | "person" | "token";
    name?: string;
    sessionId?: string;
    tokenId?: string;
  };
  source: {
    kind: string;
    [key: string]: unknown;
  };
  createdAt: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/asks
```

### getSessionQueue

`GET /v1/sessions/{sessionId}/queue`: What is in the queue, and what the session itself proposed and asked.

Every task by its title and state, so that nothing is proposed twice, and what this session asked of its owner that still waits. Not what other sessions asked, and not the rest of what waits on the owner.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  tasks: {
    id: string;
    title: string;
    state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
    mine: boolean;
  }[];
  /** What this session asked of its owner and that still waits. */
  asks: {
    id: string;
    text: string;
    addedBy: {
      kind: "agent" | "person" | "token";
      name?: string;
      sessionId?: string;
      tokenId?: string;
    };
    source: {
      kind: string;
      [key: string]: unknown;
    };
    createdAt: string;
  }[];
  says: string;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     $AUBERGINE_URL/v1/sessions/<sessionId>/queue
```

## Environments

### getEnvironmentOffers

`GET /v1/environments/offers`: Where a new session in a folder could work.

For the owner only. Every kind of environment, with whether it can be had for that folder and, when not, why: a working copy needs the folder to be in a Git repository with at least one commit. It also says what would not be carried over. It reads; nothing is made or changed.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `folder` | query | `string` | no | The folder a session would start in. Without one: the folder new sessions start in. |

**Answer** `200`:

```ts
{
  folder: string;
  offers: {
    kind: string;
    title: string;
    /** The kind's own words for how far it keeps an agent apart. */
    words: string;
    available: boolean;
    /** When it is not available for this folder: why, in a sentence. */
    reason: string | null;
    /** What to know before choosing it, in sentences: what is not carried over, what will not be there. */
    notes: string[];
  }[];
}
```

**Errors:** 400, 401, 403, 413, 429.

### listEnvironments

`GET /v1/environments`: List what was prepared for sessions to work in.

Every working copy there is, with its session (or that its session is gone), its branch, the counts of what changed, and what its folder takes on disk. Names and counts only.

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
    kind: string;
    /** What the kind is called, as it was when this was made: `Its own working copy`. */
    title: string;
    /** The kind's own words for how far it keeps an agent apart. Never more than 'kept apart'. */
    words: string;
    /** The session that works in it. Null when that session is gone. */
    sessionId: string | null;
    /** The name of the session it was made for, as it was then. */
    sessionName: string;
    /** The owner's own folder it was made from: for a working copy, the top of their checkout. */
    projectFolder: string;
    /** The folder that was prepared. */
    folder: string;
    /** The folder inside it that the session started in. */
    startFolder: string;
    /** For a working copy: the branch made for it. */
    branch: string | null;
    /** For a working copy: the commit it started from. "What changed" is told against this. */
    startCommit: string | null;
    createdAt: string;
    /** What changed, as last read; null before the first reading. */
    changes: {
      /** Files that were there at the start and are different now. */
      changed: number;
      /** Files that are new, committed or not. */
      added: number;
      /** Files that were there at the start and are gone. */
      removed: number;
      /** Commits made since the start. */
      commits: number;
      /** Of those files, how many hold work that is in no commit. */
      uncommitted: number;
      /** When this was last read. */
      at: string;
    } | null;
    /** Why it cannot be used any more, in a sentence: its folder was deleted, or its repository moved. Null while it is whole. */
    broken: string | null;
    /** What its folder takes on disk. Null when it could not be measured. */
    bytes: number | null;
    /** True when measuring stopped early: it takes at least that much. */
    bytesAtLeast: boolean;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/environments
```

### getEnvironment

`GET /v1/environments/{environmentId}`: Read one environment: what it is, and which files changed.

The files that differ from the commit it started from, uncommitted work included, by name. Read afresh each time. No content.

An API token needs the scope `read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `environmentId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  kind: string;
  title: string;
  words: string;
  /** Null for a session that works in the folder it was started in: nothing was prepared for it. */
  environment: {
    id: string;
    kind: string;
    /** What the kind is called, as it was when this was made: `Its own working copy`. */
    title: string;
    /** The kind's own words for how far it keeps an agent apart. Never more than 'kept apart'. */
    words: string;
    /** The session that works in it. Null when that session is gone. */
    sessionId: string | null;
    /** The name of the session it was made for, as it was then. */
    sessionName: string;
    /** The owner's own folder it was made from: for a working copy, the top of their checkout. */
    projectFolder: string;
    /** The folder that was prepared. */
    folder: string;
    /** The folder inside it that the session started in. */
    startFolder: string;
    /** For a working copy: the branch made for it. */
    branch: string | null;
    /** For a working copy: the commit it started from. "What changed" is told against this. */
    startCommit: string | null;
    createdAt: string;
    /** What changed, as last read; null before the first reading. */
    changes: {
      /** Files that were there at the start and are different now. */
      changed: number;
      /** Files that are new, committed or not. */
      added: number;
      /** Files that were there at the start and are gone. */
      removed: number;
      /** Commits made since the start. */
      commits: number;
      /** Of those files, how many hold work that is in no commit. */
      uncommitted: number;
      /** When this was last read. */
      at: string;
    } | null;
    /** Why it cannot be used any more, in a sentence: its folder was deleted, or its repository moved. Null while it is whole. */
    broken: string | null;
  } | null;
  /** The files that differ from the start, at most 500. */
  files: {
    /** From the top of the working copy. */
    path: string;
    state: "changed" | "added" | "removed";
    /** False when the file holds work that is in no commit. */
    committed: boolean;
  }[];
  /** True when there are more files than are listed. */
  filesCut: boolean;
  /** The branch the working copy is on now. Other than its own when someone changed it there. */
  onBranch: string | null;
  /** Anything else worth saying, in a sentence. */
  note: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/environments/<environmentId>
```

### getEnvironmentDifference

`GET /v1/environments/{environmentId}/difference`: The difference of one file in an environment, as text.

For the owner only: this is the route for an environment whose session is gone. For a session that is there, a token reads it through the session, where its reach is asked.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `environmentId` | path | `string` | yes | An ID. |
| `file` | query | `string` | yes | One of the files the environment lists as different. |

**Answer** `200`:

```ts
{
  file: string;
  state: "changed" | "added" | "removed";
  /** The difference in the usual form of lines with `+` and `-`. Empty when it is not drawn. */
  text: string;
  /** True when the text was longer than is given. */
  cut: boolean;
  /** Why there is no text: the file is not text, or is too large. */
  notDrawn: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### getEnvironmentEndings

`GET /v1/environments/{environmentId}/endings`: What can be done with an environment when its session ends.

For the owner only. The choices its kind offers, whether each is possible now, and for one that would lose work that exists nowhere else, the question to ask once more with the count of commits and files.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `environmentId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  environmentId: string;
  endings: {
    choice: string;
    label: string;
    /** What it does, in a sentence. */
    says: string;
    available: boolean;
    /** When it is not available: why. */
    reason: string | null;
    /** When choosing it would lose work that exists nowhere else: the question to ask once more, naming what would be lost. Null when nothing would be. */
    asksAgain: string | null;
  }[];
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

### endEnvironment

`POST /v1/environments/{environmentId}/end`: Keep, remove or discard an environment.

For the owner only: no token and no session can do this. Nothing is ever merged, pushed or rebased, and the branch the owner has checked out is never changed. A choice that would lose work that exists nowhere else is refused with 409 and the question to ask, until it is sent again with `confirm`.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `environmentId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `choice` | `string` | yes | One of the choices the environment offers. |
| `confirm` | `boolean` | no | True after the second question was answered with yes. Without it, a choice that would lose work that exists nowhere else is refused with that question. |

**Answer** `200`:

```ts
{
  /** True when nothing is kept of it in Aubergine. */
  removed: boolean;
  says: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

### getSessionEnvironment

`GET /v1/sessions/{sessionId}/environment`: Where a session works, and which files changed there.

For a session in a working copy: its branch, the commit it started from and the files that differ from it, by name, uncommitted work included. For any other session: that it works in the folder it was started in. No content. A session may read this about itself.

For a session's own token, about that session; or an API token with the scope `read`, about any session.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  kind: string;
  title: string;
  words: string;
  /** Null for a session that works in the folder it was started in: nothing was prepared for it. */
  environment: {
    id: string;
    kind: string;
    /** What the kind is called, as it was when this was made: `Its own working copy`. */
    title: string;
    /** The kind's own words for how far it keeps an agent apart. Never more than 'kept apart'. */
    words: string;
    /** The session that works in it. Null when that session is gone. */
    sessionId: string | null;
    /** The name of the session it was made for, as it was then. */
    sessionName: string;
    /** The owner's own folder it was made from: for a working copy, the top of their checkout. */
    projectFolder: string;
    /** The folder that was prepared. */
    folder: string;
    /** The folder inside it that the session started in. */
    startFolder: string;
    /** For a working copy: the branch made for it. */
    branch: string | null;
    /** For a working copy: the commit it started from. "What changed" is told against this. */
    startCommit: string | null;
    createdAt: string;
    /** What changed, as last read; null before the first reading. */
    changes: {
      /** Files that were there at the start and are different now. */
      changed: number;
      /** Files that are new, committed or not. */
      added: number;
      /** Files that were there at the start and are gone. */
      removed: number;
      /** Commits made since the start. */
      commits: number;
      /** Of those files, how many hold work that is in no commit. */
      uncommitted: number;
      /** When this was last read. */
      at: string;
    } | null;
    /** Why it cannot be used any more, in a sentence: its folder was deleted, or its repository moved. Null while it is whole. */
    broken: string | null;
  } | null;
  /** The files that differ from the start, at most 500. */
  files: {
    /** From the top of the working copy. */
    path: string;
    state: "changed" | "added" | "removed";
    /** False when the file holds work that is in no commit. */
    committed: boolean;
  }[];
  /** True when there are more files than are listed. */
  filesCut: boolean;
  /** The branch the working copy is on now. Other than its own when someone changed it there. */
  onBranch: string | null;
  /** Anything else worth saying, in a sentence. */
  note: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/environment
```

### getSessionDifference

`GET /v1/sessions/{sessionId}/environment/difference`: The difference of one file in a session's working copy, as text.

What is in the files: content, like what a terminal shows. So it needs the scope for reading terminals, with a reach that covers the session, and is closed by "people only". Bounded: a long difference is cut and says so; a file that is not text, or is very large, is not drawn.

An API token needs the scope `terminal:read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `file` | query | `string` | yes | One of the files the environment lists as different. |

**Answer** `200`:

```ts
{
  file: string;
  state: "changed" | "added" | "removed";
  /** The difference in the usual form of lines with `+` and `-`. Empty when it is not drawn. */
  text: string;
  /** True when the text was longer than is given. */
  cut: boolean;
  /** Why there is no text: the file is not text, or is too large. */
  notDrawn: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/environment/difference?file=text
```

## Terminals

### getScreen

`GET /v1/sessions/{sessionId}/screen`: What a terminal shows now.

The visible rows as text, with the size and where the cursor is. Text only: colors and other control sequences are not in it. Reading attaches no viewer, so nothing is resized. Refused with `people_only` for a session the owner closed to programs.

An API token needs the scope `terminal:read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  text: string;
  columns: number;
  rows: number;
  cursor: {
    x: number;
    y: number;
  };
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/screen
```

### getOutput

`GET /v1/sessions/{sessionId}/output`: What a terminal printed recently.

So many lines back from the end, oldest first, as text. `nextCursor` reads further back, as far as the terminal remembers.

An API token needs the scope `terminal:read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `lines` | query | `number` | no | How many lines to return at most, counted back from the end. |
| `cursor` | query | `string` | no | The `nextCursor` of an earlier answer: read further back from there. |

**Answer** `200`:

```ts
{
  text: string;
  lines: number;
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/output
```

### searchTerminals

`GET /v1/search`: Search what terminals have printed.

Looks through the history of every session the caller may read. Sessions it may not read (out of its reach, or "people only") are not searched; the answer says that some were left out, not which.

An API token needs the scope `terminal:read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `limit` | query | `number` | no | How many matches to return at most. |
| `q` | query | `string` | yes | The text to look for. Capitals do not matter. |

**Answer** `200`:

```ts
{
  hits: {
    sessionId: string;
    sessionName: string;
    text: string;
    before: string[];
    after: string[];
  }[];
  truncated: boolean;
  searched: number;
  someLeftOut: boolean;
}
```

**Errors:** 400, 401, 403, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/search?q=text
```

### sendInput

`POST /v1/sessions/{sessionId}/input`: Type into a terminal, or press keys.

Text is typed exactly as it is: nothing in it is read as the name of a key or as an escape, and it may hold no control characters. Enter is pressed only when `enter` says so. Text with line breaks is refused unless `paste` is set, and is then delivered as a paste. Keys are pressed by name, from a fixed list. Whatever has the keyboard in that terminal receives it: a shell will run it. Refused with `people_only` for a session the owner closed to programs.

An API token needs the scope `terminal:input`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | no | Text to type, exactly as it is. No control characters; no line breaks unless `paste` is true. |
| `enter` | `boolean` | no | Press Enter after the text. Say so explicitly: text alone presses nothing. |
| `paste` | `boolean` | no | Deliver the text as a paste. Needed for text with line breaks. |
| `keys` | `("Enter" \| "Tab" \| "Escape" \| "Backspace" \| "Delete" \| "Up" \| "Down…` | no | Keys to press, in order, from this list only: Enter, Tab, Escape, Backspace, Delete, Up, Down, Left, Right, Home, End, PageUp, PageDown, Space, Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L, Ctrl+U, Ctrl+A, Ctrl+E, Ctrl+R. |

**Answer** `200`:

```ts
{
  typed: number;
  keys: number;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/input
```

## For a session itself

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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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

## Terminals

### runCommand

`POST /v1/sessions/{sessionId}/run`: Run a command at a shell prompt and wait for it.

Types one command line into a shell that is at its prompt and waits until the shell reports it finished: the exit code, what the terminal showed meanwhile, and how long it took. Refused (409) with `not_at_prompt` when a program or an agent has the keyboard, `no_shell_integration` when the shell does not report, `run_in_progress` when a run is already waited for there. When the time is up the answer has `finished: false`; the command is left running. The output is given only to a caller that may also read that terminal.

An API token needs the scope `terminal:input`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `command` | `string` | yes | One command line, typed at the shell prompt. One line: no line breaks, no control characters. |
| `timeoutSeconds` | `number` | no | How long to wait for it to finish. When the time is up the answer says it is still going; nothing is stopped. |

**Answer** `200`:

```ts
{
  finished: boolean;
  exitCode: number | null;
  output: string | null;
  outputCut: boolean;
  durationMs: number;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"command":"npm test"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/run
```

### protectSession

`PUT /v1/sessions/{sessionId}/protection`: Switch "people only" on or off for a session.

For the owner only. While it is on, no token may read that terminal or type into it, whatever its scopes.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `peopleOnly` | `boolean` | yes | True: no token may read this terminal or type into it, whatever its scopes. |

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
    program: string | null;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  } | null;
  peopleOnly: boolean;
  typedBy: {
    name: string;
    at: string;
  } | null;
  recap: {
    text: string;
    at: string;
  } | null;
  takesMessages: boolean;
  untold: {
    what: "kickoff" | "brief" | "recap" | "inbox";
    why: "no-report" | "at-shell" | "other-program" | "unknown";
    at: string;
  } | null;
  messages: {
    unread: number;
    from: string | null;
    forOwner: number;
    paused: number;
    at: string | null;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

## Messages

### setTakesMessages

`PUT /v1/sessions/{sessionId}/takes-messages`: Say whether a "people only" session still takes messages from other terminals.

For the owner only. A session that is "people only" is closed to messages from other terminals too, unless this is on: then terminals the owner let message it (by the switch of its canvas) can, while it stays closed to reading and typing, and to every token.

For the signed-in browser only. No API token may call this, whatever its scopes.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `takesMessages` | `boolean` | yes | True: while "people only", it still takes messages from terminals the owner let message it. It stays closed to reading, to typing and to every token. False: people only closes it to messages as well. |

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
    program: string | null;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  } | null;
  peopleOnly: boolean;
  typedBy: {
    name: string;
    at: string;
  } | null;
  recap: {
    text: string;
    at: string;
  } | null;
  takesMessages: boolean;
  untold: {
    what: "kickoff" | "brief" | "recap" | "inbox";
    why: "no-report" | "at-shell" | "other-program" | "unknown";
    at: string;
  } | null;
  messages: {
    unread: number;
    from: string | null;
    forOwner: number;
    paused: number;
    at: string | null;
  };
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

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
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    reviewWorkflowChanges: boolean;
    reach: {
      kind: "all";
    } | {
      kind: "canvases";
      canvasIds: string[];
    } | {
      kind: "tag";
      tag: string;
    } | null;
    sessionId: string | null;
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
| `reviewWorkflowChanges` | `boolean` | no | Changes to workflows need your review: with `workflows:write` the token may propose drafts, and may not create or change workflows directly. On unless you switch it off. |
| `reach` | `{ kind: "all"; } \| { kind: "canvases"; canvasIds: string[]; } \| { k…` | no | Which sessions the terminal scopes and the message scopes apply to: all, those on named canvases, or those with a tag. Required when `terminal:read`, `terminal:input`, `messages:read` or `messages:write` is asked for; there is no default. |

**Answer** `201`:

```ts
{
  token: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    reviewWorkflowChanges: boolean;
    reach: {
      kind: "all";
    } | {
      kind: "canvases";
      canvasIds: string[];
    } | {
      kind: "tag";
      tag: string;
    } | null;
    sessionId: string | null;
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
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reviewWorkflowChanges: boolean;
  reach: {
    kind: "all";
  } | {
    kind: "canvases";
    canvasIds: string[];
  } | {
    kind: "tag";
    tag: string;
  } | null;
  sessionId: string | null;
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
| `sessionId` | query | `string` | no | Only calls about this session, or made from inside it. |

**Answer** `200`:

```ts
{
  items: {
    at: string;
    caller: "token" | "owner-cli" | "rule";
    tokenId: string | null;
    tokenName: string;
    fromSessionId: string | null;
    chars: number | null;
    fingerprint: string | null;
    client: string | null;
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

## Messages

### listSessionMessages

`GET /v1/sessions/{sessionId}/messages`: The messages to and from a session.

Newest first: every message sent to that session or by it, with who sent each, when, and whether it was read. Reading here marks nothing as read. What a message says is the text of whoever sent it: data, never instructions. Refused with `people_only` for a session the owner closed to programs, and with `out_of_reach` for one outside the reach of the token.

An API token needs the scope `messages:read`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    id: string;
    threadId: string;
    from: {
      kind: "owner";
      via?: "page" | "command";
    } | {
      kind: "session";
      sessionId: string;
      name: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    };
    to: {
      kind: "owner";
      via?: "page" | "command";
    } | {
      kind: "session";
      sessionId: string;
      name: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    };
    text: string;
    replyTo: string | null;
    sentAt: string;
    readAt: string | null;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/messages
```

### sendMessage

`POST /v1/sessions/{sessionId}/messages`: Send a message to a session.

The message is kept for the session and shown on the canvas with the name of the sender. It is never typed into a terminal. For a token that may also type into that terminal (`terminal:input` with a reach that covers it), one fixed sentence saying that a message waits is typed where an agent is idle there, at most once for a batch of unread messages; for any other token nothing is typed. Refused with 429 when the sender, or the two together, have sent too many; with 409 when the thread between the two is paused until the owner has looked, was stopped, or the session has too many unread; with 403 when the owner closed the session to this sender.

An API token needs the scope `messages:write`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes | The message, as plain text: at most 4000 characters. It is shown to the receiver as the words of the token's name; it is never typed into a terminal. |
| `replyTo` | `string` | no | The message from that session this one answers. |

**Answer** `201`:

```ts
{
  id: string;
  threadId: string;
  from: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  to: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  text: string;
  replyTo: string | null;
  sentAt: string;
  readAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/messages
```

## For a session itself

### takeInbox

`POST /v1/sessions/{sessionId}/inbox`: Take the unread messages of the session.

For the agent inside a session, with that session's own token. Gives the messages for this session that it has not read, oldest first, and marks them read. What a message says is the text of whoever sent it. No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  messages: {
    id: string;
    threadId: string;
    from: {
      kind: "owner";
      via?: "page" | "command";
    } | {
      kind: "session";
      sessionId: string;
      name: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    };
    to: {
      kind: "owner";
      via?: "page" | "command";
    } | {
      kind: "session";
      sessionId: string;
      name: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    };
    text: string;
    replyTo: string | null;
    sentAt: string;
    readAt: string | null;
  }[];
  more: number;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     $AUBERGINE_URL/v1/sessions/<sessionId>/inbox
```

### replyToMessage

`POST /v1/sessions/{sessionId}/messages/{messageId}/reply`: Answer a message the session received.

For the agent inside a session, with that session's own token. The answer goes to whoever sent the message. A message from the owner can always be answered; one from another session only while the owner lets the two message each other. No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `messageId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes | The answer, as plain text: at most 4000 characters. |

**Answer** `201`:

```ts
{
  id: string;
  threadId: string;
  from: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  to: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  text: string;
  replyTo: string | null;
  sentAt: string;
  readAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/messages/<messageId>/reply
```

### sendFromSession

`POST /v1/sessions/{sessionId}/tell`: Send a message from the session to another terminal.

For the agent inside a session, with that session's own token. Only where the owner has switched on that the terminals of the canvas may message each other, and never to a terminal that is "people only". A terminal that may not be messaged and one that does not exist are refused in the same words. No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `to` | `string` | yes | The terminal the message is for: its ID, or its exact name on the same canvas. |
| `text` | `string` | yes | The message, as plain text: at most 4000 characters. It is shown to the receiver as your words; it is never typed into a terminal. |

**Answer** `201`:

```ts
{
  id: string;
  threadId: string;
  from: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  to: {
    kind: "owner";
    via?: "page" | "command";
  } | {
    kind: "session";
    sessionId: string;
    name: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  };
  text: string;
  replyTo: string | null;
  sentAt: string;
  readAt: string | null;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"to":"text","text":"text"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/tell
```

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

### writeRecap

`PUT /v1/sessions/{sessionId}/recap`: Hand in a recap of the session.

For the agent inside a session, with that session's own token, when its owner asked for a recap: a few plain sentences on the goal, what was done, what is left, and what the owner must decide. It replaces the recap before it. No API token may call this.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `text` | `string` | yes | Three to six plain sentences: the goal, what was done, what is left, anything the owner must decide. |

**Answer** `200`:

```ts
{
  text: string;
  at: string;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PUT -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"text":"text"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/recap
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
    status: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
    currentElementId: string | null;
    elements: {
      elementId: string;
      state: "pending" | "active" | "done" | "skipped";
      startedAt: string | null;
      finishedAt: string | null;
      note: string;
      output: unknown | null;
      ticks: {
        item: number;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      }[];
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      } | null;
      sessionId: string | null;
      sentBack: {
        comment: string;
        fromElementId: string;
        by: {
          kind: "agent" | "person" | "token";
          name?: string;
        };
        at: string;
      } | null;
    }[];
    blockedReason: string | null;
    pausedFrom: ("running" | "blocked" | "awaiting") | null;
    history: {
      type: "approved" | "sent-back";
      elementId: string;
      toElementId: string | null;
      comment: string;
      by: {
        kind: "agent" | "person" | "token";
        name?: string;
      };
      at: string;
    }[];
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
    produces: string;
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

### getSessionBrief

`GET /v1/sessions/{sessionId}/brief`: What a session was asked to write.

For a program inside a session, with that session's own token: the owner's request for a workflow or an element, the format, and how to hand it in; after a draft was sent back, the comment too. 404 when nothing is asked of the session.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  text: string;
  kind: "workflow" | "element";
  status: "requested" | "waiting" | "returned";
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     $AUBERGINE_URL/v1/sessions/<sessionId>/brief
```

### listSessionDrafts

`GET /v1/sessions/{sessionId}/drafts`: The drafts a session proposed or was asked for.

With that session's own token: its own drafts and the comments on them, and no others.

For a session's own token, about that session. No API token may call this.

A list: it answers a page at a time, see `limit` and `cursor`.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |
| `limit` | query | `number` | no | How many items to return at most. |
| `cursor` | query | `string` | no | The `nextCursor` of the page before. Opaque: do not build or change it. |

**Answer** `200`:

```ts
{
  items: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
    id: string;
    kind: "workflow" | "element";
    status: "requested" | "waiting" | "returned";
    description: string;
    proposedBy: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "token";
      tokenId: string;
      name: string;
    } | {
      kind: "person";
    };
    sessionId: string | null;
    revisesWorkflowId: string | null;
    previous: {
      workflow: {
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
          /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
          source: {
            shelfId: string;
            version: number | null;
            hash: string | null;
          } | null;
          /** Fields from a file that this version does not know, kept so that they are written out again. */
          extra: {
            [key: string]: unknown;
          };
        }[];
        extra: {
          [key: string]: unknown;
        };
      } | null;
      element: {
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      } | null;
    } | null;
    revision: number;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  nextCursor: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     $AUBERGINE_URL/v1/sessions/<sessionId>/drafts
```

### proposeSessionDraft

`POST /v1/sessions/{sessionId}/drafts`: Hand in a draft from a session.

With that session's own token. It answers a request made of the session, or revises the session's draft that was sent back; otherwise it is a new draft. A draft is never run and never told to an agent: the owner reads it first.

For a session's own token, about that session. No API token may call this.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Body** (JSON):

| Field | Type | Required | |
|---|---|---|---|
| `workflow` | `{ /** What it is called. */ name: string; /** What it is for, in a …` | no | A whole workflow. Give this or `element`, not both. |
| `element` | `{ /** Its ID inside its workflow. It stays the same when the elemen…` | no | One element, for the shelf. |
| `revisesWorkflowId` | `string` | no | For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. |
| `description` | `string` | no | What it is meant to do, when nobody asked for it. |

**Answer** `201`:

```ts
{
  workflow: {
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    }[];
    extra: {
      [key: string]: unknown;
    };
  } | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
    extra: {
      [key: string]: unknown;
    };
  } | null;
  id: string;
  kind: "workflow" | "element";
  status: "requested" | "waiting" | "returned";
  description: string;
  proposedBy: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "token";
    tokenId: string;
    name: string;
  } | {
    kind: "person";
  };
  sessionId: string | null;
  revisesWorkflowId: string | null;
  previous: {
    workflow: {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
        source: {
          shelfId: string;
          version: number | null;
          hash: string | null;
        } | null;
        /** Fields from a file that this version does not know, kept so that they are written out again. */
        extra: {
          [key: string]: unknown;
        };
      }[];
      extra: {
        [key: string]: unknown;
      };
    } | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra: {
        [key: string]: unknown;
      };
    } | null;
  } | null;
  revision: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Errors:** 400, 401, 403, 404, 409, 413, 429.

```sh
curl -X POST -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"workflow":{"name":"example","elements":[{"name":"example"}]}}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/drafts
```

### getSessionRepositoryWorkflows

`GET /v1/sessions/{sessionId}/repository-workflows`: The workflows the repository of a session offers.

With that session's own token: the workflow files of the repository its folder is in, and whether each was accepted. It cannot accept one, and cannot start a run.

For a session's own token, about that session; or an API token with the scope `read`, about any session.

| Parameter | In | Type | Required | |
|---|---|---|---|---|
| `sessionId` | path | `string` | yes | An ID. |

**Answer** `200`:

```ts
{
  root: string | null;
  folder: string | null;
  workflows: {
    file: string;
    name: string | null;
    elements: string[];
    hash: string | null;
    state: "accepted" | "review" | "changed" | "unreadable";
    reason: string | null;
  }[];
  truncated: boolean;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -H "Authorization: Bearer $TOKEN" \
     http://127.0.0.1:4600/v1/sessions/<sessionId>/repository-workflows
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
  program: string | null;
}
```

**Errors:** 400, 401, 403, 404, 413, 429.

```sh
curl -X PUT -H "Authorization: Bearer $AUBERGINE_TOKEN" \
     -H "Content-Type: application/json" -d '{"kind":"claude-code"}' \
     $AUBERGINE_URL/v1/sessions/<sessionId>/agent
```
