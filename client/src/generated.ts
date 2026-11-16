// Generated from the description of the API (/v1/openapi.json). Do not edit by hand:
// change the route declarations in shared/src/routes.ts and run `pnpm generate`.

import { everyItem, requester, type CallOptions, type ClientOptions, type OperationInfo } from './runtime';

/** The one shape every error has. */
export type ErrorBody = {
  error: {
    code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "runtime_unavailable" | "too_large" | "rate_limited" | "internal";
    message: string;
  };
};

export type GetCapabilitiesResult = {
  name: "aubergine";
  version: string;
  api: "v1";
  description: string;
  features: string[];
  scopes: {
    name: "read" | "canvases:write" | "sessions:write" | "notes:write" | "terminal:read" | "terminal:input" | "workflows:write" | "runs:write";
    grantable: boolean;
    meaning: string;
  }[];
  caller: {
    kind: "user";
  } | {
    kind: "token";
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write")[];
    expiresAt: string | null;
  } | {
    kind: "session";
    sessionId: string;
  };
};

export type GetDescriptionResult = {
  openapi: string;
  [key: string]: unknown;
};

export interface ListCanvasesQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListCanvasesResult = {
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
};

export type CreateCanvasBody = {
  /** The name on its tab. */
  name: string;
  /** The color of its tab. */
  color?: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  /** Pairs of key and value for tools of your own to give meaning to. */
  labels?: {
    [key: string]: string;
  };
};

export type CreateCanvasResult = {
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
};

export type GetCanvasResult = {
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
};

export type UpdateCanvasBody = {
  name?: string;
  color?: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  order?: number;
  labels?: {
    [key: string]: string;
  };
};

export type UpdateCanvasResult = {
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
};

export interface CloseCanvasQuery {
  /**
   * What happens to the sessions on it. Needed when it has any.
   */
  sessions?: "park" | "move";
  /**
   * With `sessions=move`: the canvas to move them to.
   */
  to?: string;
}

export type ShowCanvasResult = {
  shown: number;
};

export interface ListCanvasSessionsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListCanvasSessionsResult = {
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
};

export type StartSessionBody = {
  /** What to call it. A name is made up when left out. */
  name?: string;
  /** Folder to start in (absolute path). The default folder when left out. */
  cwd?: string;
  /** A line to type into the new session once its shell is ready. */
  command?: string;
  /** Where to put it. A free spot is found when left out. */
  position?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  /** Short words of your own to find and filter the session by. */
  tags?: string[];
};

export type StartSessionResult = {
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
};

export interface ListSessionsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
  /**
   * Only sessions in this state.
   */
  state?: "open" | "parked" | "exited";
}

export type ListSessionsResult = {
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
};

export type GetSessionResult = {
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

export type UpdateSessionBody = {
  name?: string;
  tags?: string[];
  note?: string;
};

export type UpdateSessionResult = {
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

export type MoveSessionBody = {
  /** The canvas to move it to. */
  canvasId: string;
  /** Where to put it there. A free spot is found when left out. */
  position?: {
    x: number;
    y: number;
  };
};

export type MoveSessionResult = {
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
};

export type ParkSessionResult = {
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

export type RestoreSessionBody = {
  /** The canvas to put it on. Without one, the canvas most recently looked at in a browser. */
  canvasId?: string;
};

export type RestoreSessionResult = {
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
};

export type ShowSessionResult = {
  shown: number;
};

export type AppendNoteBody = {
  text: string;
  kind?: "note" | "prompt" | "event";
};

export type AppendNoteResult = {
  entry: {
    id: string;
    at: string;
    author: "user" | "agent";
    kind: "note" | "prompt" | "event";
    text: string;
  } | null;
};

export type UpdateNodeBody = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
};

export type UpdateNodeResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  sessionId: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
};

export type CreateFrameBody = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
};

export type CreateFrameResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
};

export type UpdateFrameBody = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
  color?: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
  carry?: boolean;
};

export type UpdateFrameResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
};

export interface StreamEventsQuery {
  /**
   * Only changes that concern this canvas.
   */
  canvasId?: string;
}

export type StreamEventsEvent = {
  type: string;
  [key: string]: unknown;
};

export interface ListTokensQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListTokensResult = {
  items: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  }[];
  nextCursor: string | null;
};

export type CreateTokenBody = {
  /** What will use it. */
  name: string;
  /** What it may do. At least one. */
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write")[];
  /** When it stops working. Never, when neither this nor `expiresInDays` is given. */
  expiresAt?: string;
  /** In how many days it stops working. */
  expiresInDays?: number;
};

export type CreateTokenResult = {
  token: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  };
  secret: string;
};

export type RevokeTokenResult = {
  id: string;
  name: string;
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write")[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export interface ListActivityQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
  /**
   * Only calls made with this token.
   */
  tokenId?: string;
}

export type ListActivityResult = {
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
};

export type SetAttentionBody = {
  state: "none" | "working" | "waiting" | "done";
  message?: string;
};

export type SetAttentionResult = {
  state: "none" | "working" | "waiting" | "done";
  message: string | null;
  at: string | null;
};

export type ReportAgentBody = {
  kind: "claude-code";
  conversationId?: string | null;
};

export type ReportAgentResult = {
  kind: "claude-code";
  conversationId: string | null;
};

/** What each route is, for the code that makes the requests. */
export const OPERATIONS = {
  getCapabilities: { method: 'GET', path: '/v1', params: [], hasBody: false, paged: false, idempotent: false, stream: false },
  getDescription: { method: 'GET', path: '/v1/openapi.json', params: [], hasBody: false, paged: false, idempotent: false, stream: false },
  listCanvases: { method: 'GET', path: '/v1/canvases', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  createCanvas: { method: 'POST', path: '/v1/canvases', params: [], hasBody: true, paged: false, idempotent: true, stream: false },
  getCanvas: { method: 'GET', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false },
  updateCanvas: { method: 'PATCH', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: true, paged: false, idempotent: false, stream: false },
  closeCanvas: { method: 'DELETE', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false },
  showCanvas: { method: 'POST', path: '/v1/canvases/{canvasId}/show', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false },
  listCanvasSessions: { method: 'GET', path: '/v1/canvases/{canvasId}/sessions', params: ["canvasId"], hasBody: false, paged: true, idempotent: false, stream: false },
  startSession: { method: 'POST', path: '/v1/canvases/{canvasId}/sessions', params: ["canvasId"], hasBody: true, paged: false, idempotent: true, stream: false },
  listSessions: { method: 'GET', path: '/v1/sessions', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  getSession: { method: 'GET', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  updateSession: { method: 'PATCH', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  endSession: { method: 'DELETE', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  moveSession: { method: 'POST', path: '/v1/sessions/{sessionId}/move', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  parkSession: { method: 'POST', path: '/v1/sessions/{sessionId}/park', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  restoreSession: { method: 'POST', path: '/v1/sessions/{sessionId}/restore', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  showSession: { method: 'POST', path: '/v1/sessions/{sessionId}/show', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  appendNote: { method: 'POST', path: '/v1/sessions/{sessionId}/notes', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  updateNode: { method: 'PATCH', path: '/v1/canvases/{canvasId}/nodes/{nodeId}', params: ["canvasId", "nodeId"], hasBody: true, paged: false, idempotent: false, stream: false },
  createFrame: { method: 'POST', path: '/v1/canvases/{canvasId}/frames', params: ["canvasId"], hasBody: true, paged: false, idempotent: true, stream: false },
  updateFrame: { method: 'PATCH', path: '/v1/canvases/{canvasId}/frames/{frameId}', params: ["canvasId", "frameId"], hasBody: true, paged: false, idempotent: false, stream: false },
  removeFrame: { method: 'DELETE', path: '/v1/canvases/{canvasId}/frames/{frameId}', params: ["canvasId", "frameId"], hasBody: false, paged: false, idempotent: false, stream: false },
  streamEvents: { method: 'GET', path: '/v1/events', params: [], hasBody: false, paged: false, idempotent: false, stream: true },
  listTokens: { method: 'GET', path: '/v1/tokens', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  createToken: { method: 'POST', path: '/v1/tokens', params: [], hasBody: true, paged: false, idempotent: false, stream: false },
  revokeToken: { method: 'DELETE', path: '/v1/tokens/{tokenId}', params: ["tokenId"], hasBody: false, paged: false, idempotent: false, stream: false },
  listActivity: { method: 'GET', path: '/v1/activity', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  setAttention: { method: 'PUT', path: '/v1/sessions/{sessionId}/attention', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  reportAgent: { method: 'PUT', path: '/v1/sessions/{sessionId}/agent', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
} as const satisfies Record<string, OperationInfo>;

export type OperationId = keyof typeof OPERATIONS;

/** One method for each route of the API. */
export interface Client {
  /**
   * What this server can do, and who is asking.
   *
   * `GET /v1`. Needs no scope.
   */
  getCapabilities(args?: CallOptions): Promise<GetCapabilitiesResult>;
  /**
   * The description of this API, as an OpenAPI 3.1 document.
   *
   * `GET /v1/openapi.json`. Needs no scope.
   */
  getDescription(args?: CallOptions): Promise<GetDescriptionResult>;
  /**
   * List canvases.
   *
   * `GET /v1/canvases`. Scope: `read`.
   */
  listCanvases(args?: { query?: ListCanvasesQuery } & CallOptions): Promise<ListCanvasesResult>;
  /**
   * Create a canvas.
   *
   * `POST /v1/canvases`. Scope: `canvases:write`.
   */
  createCanvas(args: { body: CreateCanvasBody } & CallOptions): Promise<CreateCanvasResult>;
  /**
   * One canvas, with its nodes and frames.
   *
   * `GET /v1/canvases/{canvasId}`. Scope: `read`.
   */
  getCanvas(args: { canvasId: string } & CallOptions): Promise<GetCanvasResult>;
  /**
   * Rename, recolor, reorder or relabel a canvas.
   *
   * `PATCH /v1/canvases/{canvasId}`. Scope: `canvases:write`.
   */
  updateCanvas(args: { canvasId: string; body: UpdateCanvasBody } & CallOptions): Promise<UpdateCanvasResult>;
  /**
   * Close a canvas.
   *
   * `DELETE /v1/canvases/{canvasId}`. Scope: `canvases:write`.
   */
  closeCanvas(args: { canvasId: string; query?: CloseCanvasQuery } & CallOptions): Promise<void>;
  /**
   * Switch an open browser to a canvas.
   *
   * `POST /v1/canvases/{canvasId}/show`. Scope: `canvases:write`.
   */
  showCanvas(args: { canvasId: string } & CallOptions): Promise<ShowCanvasResult>;
  /**
   * The sessions on a canvas.
   *
   * `GET /v1/canvases/{canvasId}/sessions`. Scope: `read`.
   */
  listCanvasSessions(args: { canvasId: string; query?: ListCanvasSessionsQuery } & CallOptions): Promise<ListCanvasSessionsResult>;
  /**
   * Start a session on a canvas.
   *
   * `POST /v1/canvases/{canvasId}/sessions`. Scope: `sessions:write`.
   */
  startSession(args: { canvasId: string; body?: StartSessionBody } & CallOptions): Promise<StartSessionResult>;
  /**
   * List every session.
   *
   * `GET /v1/sessions`. Scope: `read`.
   */
  listSessions(args?: { query?: ListSessionsQuery } & CallOptions): Promise<ListSessionsResult>;
  /**
   * One session.
   *
   * `GET /v1/sessions/{sessionId}`. Scope: `read`.
   */
  getSession(args: { sessionId: string } & CallOptions): Promise<GetSessionResult>;
  /**
   * Rename or tag a session, or change its pinned note.
   *
   * `PATCH /v1/sessions/{sessionId}`. Scope: `sessions:write`.
   */
  updateSession(args: { sessionId: string; body: UpdateSessionBody } & CallOptions): Promise<UpdateSessionResult>;
  /**
   * End a session.
   *
   * `DELETE /v1/sessions/{sessionId}`. Scope: `sessions:write`.
   */
  endSession(args: { sessionId: string } & CallOptions): Promise<void>;
  /**
   * Move a session to another canvas.
   *
   * `POST /v1/sessions/{sessionId}/move`. Scope: `sessions:write`.
   */
  moveSession(args: { sessionId: string; body: MoveSessionBody } & CallOptions): Promise<MoveSessionResult>;
  /**
   * Park a session.
   *
   * `POST /v1/sessions/{sessionId}/park`. Scope: `sessions:write`.
   */
  parkSession(args: { sessionId: string } & CallOptions): Promise<ParkSessionResult>;
  /**
   * Put a parked session back on a canvas.
   *
   * `POST /v1/sessions/{sessionId}/restore`. Scope: `sessions:write`.
   */
  restoreSession(args: { sessionId: string; body?: RestoreSessionBody } & CallOptions): Promise<RestoreSessionResult>;
  /**
   * Bring a session up in an open browser.
   *
   * `POST /v1/sessions/{sessionId}/show`. Scope: `sessions:write`.
   */
  showSession(args: { sessionId: string } & CallOptions): Promise<ShowSessionResult>;
  /**
   * Add an entry to a session's note log.
   *
   * `POST /v1/sessions/{sessionId}/notes`. A session's own token, or an API token with `notes:write`.
   */
  appendNote(args: { sessionId: string; body: AppendNoteBody } & CallOptions): Promise<AppendNoteResult>;
  /**
   * Move, resize or color a node.
   *
   * `PATCH /v1/canvases/{canvasId}/nodes/{nodeId}`. Scope: `canvases:write`.
   */
  updateNode(args: { canvasId: string; nodeId: string; body: UpdateNodeBody } & CallOptions): Promise<UpdateNodeResult>;
  /**
   * Add a frame.
   *
   * `POST /v1/canvases/{canvasId}/frames`. Scope: `canvases:write`.
   */
  createFrame(args: { canvasId: string; body: CreateFrameBody } & CallOptions): Promise<CreateFrameResult>;
  /**
   * Change a frame.
   *
   * `PATCH /v1/canvases/{canvasId}/frames/{frameId}`. Scope: `canvases:write`.
   */
  updateFrame(args: { canvasId: string; frameId: string; body: UpdateFrameBody } & CallOptions): Promise<UpdateFrameResult>;
  /**
   * Remove a frame.
   *
   * `DELETE /v1/canvases/{canvasId}/frames/{frameId}`. Scope: `canvases:write`.
   */
  removeFrame(args: { canvasId: string; frameId: string } & CallOptions): Promise<void>;
  /**
   * Follow changes as they happen.
   *
   * `GET /v1/events`. Scope: `read`.
   */
  streamEvents(args?: { query?: StreamEventsQuery } & CallOptions): AsyncGenerator<StreamEventsEvent, void, void>;
  /**
   * List API tokens.
   *
   * `GET /v1/tokens`. Signed-in browser only: no API token may call this.
   */
  listTokens(args?: { query?: ListTokensQuery } & CallOptions): Promise<ListTokensResult>;
  /**
   * Create an API token.
   *
   * `POST /v1/tokens`. Signed-in browser only: no API token may call this.
   */
  createToken(args: { body: CreateTokenBody } & CallOptions): Promise<CreateTokenResult>;
  /**
   * Revoke an API token.
   *
   * `DELETE /v1/tokens/{tokenId}`. Signed-in browser only: no API token may call this.
   */
  revokeToken(args: { tokenId: string } & CallOptions): Promise<RevokeTokenResult>;
  /**
   * What API tokens did.
   *
   * `GET /v1/activity`. Signed-in browser only: no API token may call this.
   */
  listActivity(args?: { query?: ListActivityQuery } & CallOptions): Promise<ListActivityResult>;
  /**
   * Say whether the session wants the user.
   *
   * `PUT /v1/sessions/{sessionId}/attention`. A session's own token.
   */
  setAttention(args: { sessionId: string; body: SetAttentionBody } & CallOptions): Promise<SetAttentionResult>;
  /**
   * Say which agent runs in the session, and in which conversation.
   *
   * `PUT /v1/sessions/{sessionId}/agent`. A session's own token.
   */
  reportAgent(args: { sessionId: string; body: ReportAgentBody } & CallOptions): Promise<ReportAgentResult>;
  /** For each list: every item of it, across its pages. Use with `for await`. */
  each: {
    /**
     * Every item of `listCanvases`, fetched a page at a time as they are asked for.
     */
    listCanvases(args?: { query?: ListCanvasesQuery } & CallOptions): AsyncGenerator<ListCanvasesResult['items'][number], void, void>;
    /**
     * Every item of `listCanvasSessions`, fetched a page at a time as they are asked for.
     */
    listCanvasSessions(args?: { canvasId: string; query?: ListCanvasSessionsQuery } & CallOptions): AsyncGenerator<ListCanvasSessionsResult['items'][number], void, void>;
    /**
     * Every item of `listSessions`, fetched a page at a time as they are asked for.
     */
    listSessions(args?: { query?: ListSessionsQuery } & CallOptions): AsyncGenerator<ListSessionsResult['items'][number], void, void>;
    /**
     * Every item of `listTokens`, fetched a page at a time as they are asked for.
     */
    listTokens(args?: { query?: ListTokensQuery } & CallOptions): AsyncGenerator<ListTokensResult['items'][number], void, void>;
    /**
     * Every item of `listActivity`, fetched a page at a time as they are asked for.
     */
    listActivity(args?: { query?: ListActivityQuery } & CallOptions): AsyncGenerator<ListActivityResult['items'][number], void, void>;
  };
}

/**
 * Makes a client for one server. Give it a token (`token`), or in a page served
 * by the server itself say `useCookie: true`.
 */
export function createClient(options: ClientOptions = {}): Client {
  const { call, stream } = requester(options);
  const client: Record<string, unknown> = {};
  const each: Record<string, unknown> = {};
  for (const [id, info] of Object.entries(OPERATIONS) as [OperationId, OperationInfo][]) {
    client[id] = (args: Record<string, unknown> = {}) => (info.stream ? stream(info, args) : call(info, args));
    if (info.paged) {
      each[id] = (args: { query?: Record<string, unknown> } & Record<string, unknown> = {}) =>
        everyItem((cursor) => call(info, { ...args, query: { ...args.query, ...(cursor === undefined ? {} : { cursor }) } }) as Promise<{ items: unknown[]; nextCursor: string | null }>);
    }
  }
  client.each = each;
  return client as unknown as Client;
}
