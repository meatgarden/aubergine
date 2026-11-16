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

export interface ListWorkflowsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListWorkflowsResult = {
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
};

export type CreateWorkflowBody = {
  /** What it is called. */
  name: string;
  /** What it is for, in a sentence or two. */
  description?: string;
  /** Text added to every element: rules that hold from start to finish. */
  standing?: string;
  /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
  inputs?: {
    key: string;
    label: string;
    description?: string;
    required?: boolean;
  }[];
  /** The elements, in the order they are gone through. */
  elements: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  }[];
  /** Pairs of key and value for tools of your own to give meaning to. */
  labels?: {
    [key: string]: string;
  };
  /** Where it came from. Left out, it was made here. */
  origin?: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  /** Fields from a file that this version does not know, kept so they are written out again. */
  extra?: {
    [key: string]: unknown;
  };
};

export type CreateWorkflowResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export type GetWorkflowResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export type UpdateWorkflowBody = {
  /** What it is called. */
  name?: string;
  /** What it is for, in a sentence or two. */
  description?: string;
  /** Text added to every element: rules that hold from start to finish. */
  standing?: string;
  /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
  inputs?: {
    key: string;
    label: string;
    description?: string;
    required?: boolean;
  }[];
  /** The elements, in the order they are gone through. */
  elements?: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  }[];
  /** Pairs of key and value for tools of your own to give meaning to. */
  labels?: {
    [key: string]: string;
  };
};

export type UpdateWorkflowResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export type CopyWorkflowBody = {
  /** The name of the copy. Without one: the name with "copy" after it. */
  name?: string;
};

export type CopyWorkflowResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export interface ListWorkflowVersionsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListWorkflowVersionsResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export interface ListWorkflowTemplatesQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListWorkflowTemplatesResult = {
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
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
};

export type UseWorkflowTemplateBody = {
  /** The name of the new workflow. Without one, the template's own title. */
  name?: string;
};

export type UseWorkflowTemplateResult = {
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
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
};

export interface ListRunsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
  /**
   * `live` (the default): runs still going. `ended`: finished and stopped runs, newest first, from the archive. Or one status.
   */
  status?: "queued" | "running" | "paused" | "blocked" | "finished" | "stopped" | "live" | "ended";
  /**
   * Only runs of this session.
   */
  sessionId?: string;
  /**
   * Only runs of this workflow.
   */
  workflowId?: string;
}

export type ListRunsResult = {
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
      produces: string;
    }[];
  }[];
  nextCursor: string | null;
};

export type StartRunBody = {
  /** The workflow to go through. The run keeps to the version that is latest now. */
  workflowId: string;
  /** The inputs the workflow asks for, by key. */
  inputs?: {
    [key: string]: string;
  };
  /** When the session is already on a run: stop that one and start this. Without it, that is refused. */
  replace?: boolean;
  /** Type the line that tells the agent about the run into the session's terminal. Only ever done for the owner (the browser or the command line), and only when an agent is running there; an API token is given the line in the answer and nothing is typed. */
  kickoff?: boolean;
  /** The session that will do it. Without one the run waits, queued. */
  sessionId?: string;
};

export type StartRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type GetRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type ReportRunBody = {
  type: "done";
  elementId: string;
  note?: string;
  output?: unknown;
} | {
  type: "blocked";
  reason: string;
} | {
  type: "goto";
  elementId: string;
} | {
  type: "pause";
} | {
  type: "resume";
} | {
  type: "stop";
} | {
  type: "assign";
  sessionId: string;
};

export type ReportRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type StartSessionRunBody = {
  /** The workflow to go through. The run keeps to the version that is latest now. */
  workflowId: string;
  /** The inputs the workflow asks for, by key. */
  inputs?: {
    [key: string]: string;
  };
  /** When the session is already on a run: stop that one and start this. Without it, that is refused. */
  replace?: boolean;
  /** Type the line that tells the agent about the run into the session's terminal. Only ever done for the owner (the browser or the command line), and only when an agent is running there; an API token is given the line in the answer and nothing is typed. */
  kickoff?: boolean;
};

export type StartSessionRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export interface ListDraftsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListDraftsResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export type ProposeDraftBody = {
  /** A whole workflow. Give this or `element`, not both. */
  workflow?: {
    /** What it is called. */
    name: string;
    /** What it is for, in a sentence or two. */
    description?: string;
    /** Text added to every element: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The elements, in the order they are gone through. */
    elements: {
      id?: string;
      kind?: string;
      name: string;
      instructions?: string;
      doneWhen?: string;
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces?: string;
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  };
  /** For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. */
  revisesWorkflowId?: string;
  /** What it is meant to do, when nobody asked for it. */
  description?: string;
};

export type ProposeDraftResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export type GetDraftResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export type ReviseDraftBody = {
  /** A whole workflow. Give this or `element`, not both. */
  workflow?: {
    /** What it is called. */
    name: string;
    /** What it is for, in a sentence or two. */
    description?: string;
    /** Text added to every element: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The elements, in the order they are gone through. */
    elements: {
      id?: string;
      kind?: string;
      name: string;
      instructions?: string;
      doneWhen?: string;
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces?: string;
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  };
  /** For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. */
  revisesWorkflowId?: string;
  /** What it is meant to do, when nobody asked for it. */
  description?: string;
};

export type ReviseDraftResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export type AcceptDraftBody = {
  /** The workflow as edited before accepting. */
  workflow?: {
    /** What it is called. */
    name: string;
    /** What it is for, in a sentence or two. */
    description?: string;
    /** Text added to every element: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The elements, in the order they are gone through. */
    elements: {
      id?: string;
      kind?: string;
      name: string;
      instructions?: string;
      doneWhen?: string;
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces?: string;
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** The element as edited before accepting. */
  element?: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  };
};

export type AcceptDraftResult = {
  workflowId: string | null;
  elementId: string | null;
};

export type ReturnDraftBody = {
  /** What should change. */
  comment: string;
};

export type ReturnDraftResult = {
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
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
  } | null;
  element: {
    id: string;
    kind: string;
    name: string;
    instructions: string;
    doneWhen: string;
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces: string;
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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

export type RequestDraftBody = {
  kind: "workflow" | "element";
  /** What you want, in your own words. */
  description: string;
  /** The session whose agent is asked. */
  sessionId: string;
  /** Type the fixed request line into the terminal, when an agent is running there. */
  tell?: boolean;
};

export type RequestDraftResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export interface ListElementsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListElementsResult = {
  items: {
    id: string;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra: {
        [key: string]: unknown;
      };
    };
    createdAt: string;
    updatedAt: string;
  }[];
  nextCursor: string | null;
};

export type CreateElementBody = {
  id?: string;
  kind?: string;
  name: string;
  instructions?: string;
  doneWhen?: string;
  needs?: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
  produces?: string;
  origin?: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  extra?: {
    [key: string]: unknown;
  };
};

export type CreateElementResult = {
  id: string;
  element: {
    id: string;
    kind: string;
    name: string;
    instructions: string;
    doneWhen: string;
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces: string;
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
};

export type UpdateElementBody = {
  kind?: string;
  name?: string;
  instructions?: string;
  doneWhen?: string;
  needs?: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
  produces?: string;
};

export type UpdateElementResult = {
  id: string;
  element: {
    id: string;
    kind: string;
    name: string;
    instructions: string;
    doneWhen: string;
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces: string;
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
};

export type CopyElementResult = {
  id: string;
  element: {
    id: string;
    kind: string;
    name: string;
    instructions: string;
    doneWhen: string;
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces: string;
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra: {
      [key: string]: unknown;
    };
  };
  createdAt: string;
  updatedAt: string;
};

export type RunElementBody = {
  /** The session that will do it. */
  sessionId: string;
  /** What the element asks for: `task`, when its text uses it. */
  inputs?: {
    [key: string]: string;
  };
  /** Stop the run the session is on, if any, and start this. */
  replace?: boolean;
  /** Type the fixed kickoff line, for the owner, where an agent is running. */
  kickoff?: boolean;
};

export type RunElementResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type TickRunItemBody = {
  /** The element whose output it is. */
  elementId: string;
  /** Which item, counting from zero. */
  item: number;
  /** True to tick it, false to take the tick away. */
  ticked: boolean;
};

export type TickRunItemResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
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
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    reviewWorkflowChanges: boolean;
  }[];
  nextCursor: string | null;
};

export type CreateTokenBody = {
  /** What will use it. */
  name: string;
  /** What it may do. At least one. */
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
  /** When it stops working. Never, when neither this nor `expiresInDays` is given. */
  expiresAt?: string;
  /** In how many days it stops working. */
  expiresInDays?: number;
  /** Changes to workflows need your review: with `workflows:write` the token may propose drafts, and may not create or change workflows directly. On unless you switch it off. */
  reviewWorkflowChanges?: boolean;
};

export type CreateTokenResult = {
  token: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    reviewWorkflowChanges: boolean;
  };
  secret: string;
};

export type RevokeTokenResult = {
  id: string;
  name: string;
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write")[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reviewWorkflowChanges: boolean;
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

export type GetSessionRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type ReportSessionRunBody = {
  type: "done";
  /** The element being finished. Without it: the current one. */
  elementId?: string;
  /** What was done, for whoever comes next. */
  note?: string;
  /** What the element produced, when it declares an output other than a note: for a checklist, `{"items": [{"text": "…"}]}`. */
  output?: unknown;
} | {
  type: "blocked";
  reason: string;
} | {
  type: "goto";
  elementId: string;
} | {
  type: "pause";
} | {
  type: "resume";
} | {
  type: "stop";
};

export type ReportSessionRunResult = {
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
    produces: string;
  }[];
  position: string;
  text: string;
  kickoff: string;
  kickoffTyped: boolean;
};

export type GetSessionBriefResult = {
  text: string;
  kind: "workflow" | "element";
  status: "requested" | "waiting" | "returned";
};

export interface ListSessionDraftsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListSessionDraftsResult = {
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
          id: string;
          kind: string;
          name: string;
          instructions: string;
          doneWhen: string;
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          produces: string;
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
      } | null;
      element: {
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
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
};

export type ProposeSessionDraftBody = {
  /** A whole workflow. Give this or `element`, not both. */
  workflow?: {
    /** What it is called. */
    name: string;
    /** What it is for, in a sentence or two. */
    description?: string;
    /** Text added to every element: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The elements, in the order they are gone through. */
    elements: {
      id?: string;
      kind?: string;
      name: string;
      instructions?: string;
      doneWhen?: string;
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces?: string;
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    id?: string;
    kind?: string;
    name: string;
    instructions?: string;
    doneWhen?: string;
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces?: string;
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    extra?: {
      [key: string]: unknown;
    };
  };
  /** For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow. */
  revisesWorkflowId?: string;
  /** What it is meant to do, when nobody asked for it. */
  description?: string;
};

export type ProposeSessionDraftResult = {
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
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
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
  } | null;
  element: {
    id: string;
    kind: string;
    name: string;
    instructions: string;
    doneWhen: string;
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    produces: string;
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
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
        id: string;
        kind: string;
        name: string;
        instructions: string;
        doneWhen: string;
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        produces: string;
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
    } | null;
    element: {
      id: string;
      kind: string;
      name: string;
      instructions: string;
      doneWhen: string;
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      produces: string;
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
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
  listWorkflows: { method: 'GET', path: '/v1/workflows', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  createWorkflow: { method: 'POST', path: '/v1/workflows', params: [], hasBody: true, paged: false, idempotent: true, stream: false },
  getWorkflow: { method: 'GET', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: false, paged: false, idempotent: false, stream: false },
  updateWorkflow: { method: 'PATCH', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: true, paged: false, idempotent: false, stream: false },
  removeWorkflow: { method: 'DELETE', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: false, paged: false, idempotent: false, stream: false },
  copyWorkflow: { method: 'POST', path: '/v1/workflows/{workflowId}/copy', params: ["workflowId"], hasBody: true, paged: false, idempotent: true, stream: false },
  listWorkflowVersions: { method: 'GET', path: '/v1/workflows/{workflowId}/versions', params: ["workflowId"], hasBody: false, paged: true, idempotent: false, stream: false },
  listWorkflowTemplates: { method: 'GET', path: '/v1/workflow-templates', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  useWorkflowTemplate: { method: 'POST', path: '/v1/workflow-templates/{template}/use', params: ["template"], hasBody: true, paged: false, idempotent: true, stream: false },
  listRuns: { method: 'GET', path: '/v1/runs', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  startRun: { method: 'POST', path: '/v1/runs', params: [], hasBody: true, paged: false, idempotent: true, stream: false },
  getRun: { method: 'GET', path: '/v1/runs/{runId}', params: ["runId"], hasBody: false, paged: false, idempotent: false, stream: false },
  reportRun: { method: 'POST', path: '/v1/runs/{runId}/report', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false },
  startSessionRun: { method: 'POST', path: '/v1/sessions/{sessionId}/runs', params: ["sessionId"], hasBody: true, paged: false, idempotent: true, stream: false },
  listDrafts: { method: 'GET', path: '/v1/drafts', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  proposeDraft: { method: 'POST', path: '/v1/drafts', params: [], hasBody: true, paged: false, idempotent: true, stream: false },
  getDraft: { method: 'GET', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: false, paged: false, idempotent: false, stream: false },
  reviseDraft: { method: 'PUT', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false },
  discardDraft: { method: 'DELETE', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: false, paged: false, idempotent: false, stream: false },
  acceptDraft: { method: 'POST', path: '/v1/drafts/{draftId}/accept', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false },
  returnDraft: { method: 'POST', path: '/v1/drafts/{draftId}/return', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false },
  requestDraft: { method: 'POST', path: '/v1/draft-requests', params: [], hasBody: true, paged: false, idempotent: false, stream: false },
  listElements: { method: 'GET', path: '/v1/elements', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  createElement: { method: 'POST', path: '/v1/elements', params: [], hasBody: true, paged: false, idempotent: true, stream: false },
  updateElement: { method: 'PATCH', path: '/v1/elements/{elementId}', params: ["elementId"], hasBody: true, paged: false, idempotent: false, stream: false },
  removeElement: { method: 'DELETE', path: '/v1/elements/{elementId}', params: ["elementId"], hasBody: false, paged: false, idempotent: false, stream: false },
  copyElement: { method: 'POST', path: '/v1/elements/{elementId}/copy', params: ["elementId"], hasBody: false, paged: false, idempotent: true, stream: false },
  runElement: { method: 'POST', path: '/v1/elements/{elementId}/run', params: ["elementId"], hasBody: true, paged: false, idempotent: true, stream: false },
  tickRunItem: { method: 'POST', path: '/v1/runs/{runId}/ticks', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false },
  streamEvents: { method: 'GET', path: '/v1/events', params: [], hasBody: false, paged: false, idempotent: false, stream: true },
  listTokens: { method: 'GET', path: '/v1/tokens', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  createToken: { method: 'POST', path: '/v1/tokens', params: [], hasBody: true, paged: false, idempotent: false, stream: false },
  revokeToken: { method: 'DELETE', path: '/v1/tokens/{tokenId}', params: ["tokenId"], hasBody: false, paged: false, idempotent: false, stream: false },
  listActivity: { method: 'GET', path: '/v1/activity', params: [], hasBody: false, paged: true, idempotent: false, stream: false },
  setAttention: { method: 'PUT', path: '/v1/sessions/{sessionId}/attention', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  getSessionRun: { method: 'GET', path: '/v1/sessions/{sessionId}/run', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  reportSessionRun: { method: 'POST', path: '/v1/sessions/{sessionId}/run/report', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
  getSessionBrief: { method: 'GET', path: '/v1/sessions/{sessionId}/brief', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false },
  listSessionDrafts: { method: 'GET', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: false, paged: true, idempotent: false, stream: false },
  proposeSessionDraft: { method: 'POST', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false },
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
   * List workflows.
   *
   * `GET /v1/workflows`. Scope: `read`.
   */
  listWorkflows(args?: { query?: ListWorkflowsQuery } & CallOptions): Promise<ListWorkflowsResult>;
  /**
   * Create a workflow.
   *
   * `POST /v1/workflows`. Scope: `workflows:write`.
   */
  createWorkflow(args: { body: CreateWorkflowBody } & CallOptions): Promise<CreateWorkflowResult>;
  /**
   * Read a workflow.
   *
   * `GET /v1/workflows/{workflowId}`. Scope: `read`.
   */
  getWorkflow(args: { workflowId: string } & CallOptions): Promise<GetWorkflowResult>;
  /**
   * Change a workflow.
   *
   * `PATCH /v1/workflows/{workflowId}`. Scope: `workflows:write`.
   */
  updateWorkflow(args: { workflowId: string; body: UpdateWorkflowBody } & CallOptions): Promise<UpdateWorkflowResult>;
  /**
   * Remove a workflow.
   *
   * `DELETE /v1/workflows/{workflowId}`. Scope: `workflows:write`.
   */
  removeWorkflow(args: { workflowId: string } & CallOptions): Promise<void>;
  /**
   * Copy a workflow.
   *
   * `POST /v1/workflows/{workflowId}/copy`. Scope: `workflows:write`.
   */
  copyWorkflow(args: { workflowId: string; body?: CopyWorkflowBody } & CallOptions): Promise<CopyWorkflowResult>;
  /**
   * List the versions of a workflow.
   *
   * `GET /v1/workflows/{workflowId}/versions`. Scope: `read`.
   */
  listWorkflowVersions(args: { workflowId: string; query?: ListWorkflowVersionsQuery } & CallOptions): Promise<ListWorkflowVersionsResult>;
  /**
   * List the workflows that come with the server.
   *
   * `GET /v1/workflow-templates`. Scope: `read`.
   */
  listWorkflowTemplates(args?: { query?: ListWorkflowTemplatesQuery } & CallOptions): Promise<ListWorkflowTemplatesResult>;
  /**
   * Create a workflow from a template.
   *
   * `POST /v1/workflow-templates/{template}/use`. Scope: `workflows:write`.
   */
  useWorkflowTemplate(args: { template: string; body?: UseWorkflowTemplateBody } & CallOptions): Promise<UseWorkflowTemplateResult>;
  /**
   * List runs.
   *
   * `GET /v1/runs`. Scope: `read`.
   */
  listRuns(args?: { query?: ListRunsQuery } & CallOptions): Promise<ListRunsResult>;
  /**
   * Start a run of a workflow.
   *
   * `POST /v1/runs`. Scope: `runs:write`.
   */
  startRun(args: { body: StartRunBody } & CallOptions): Promise<StartRunResult>;
  /**
   * Read a run.
   *
   * `GET /v1/runs/{runId}`. Scope: `read`.
   */
  getRun(args: { runId: string } & CallOptions): Promise<GetRunResult>;
  /**
   * Report on a run: done, blocked, go to, pause, resume, stop.
   *
   * `POST /v1/runs/{runId}/report`. Scope: `runs:write`.
   */
  reportRun(args: { runId: string; body: ReportRunBody } & CallOptions): Promise<ReportRunResult>;
  /**
   * Start a run on a session.
   *
   * `POST /v1/sessions/{sessionId}/runs`. Scope: `runs:write`.
   */
  startSessionRun(args: { sessionId: string; body: StartSessionRunBody } & CallOptions): Promise<StartSessionRunResult>;
  /**
   * List drafts.
   *
   * `GET /v1/drafts`. Scope: `read`.
   */
  listDrafts(args?: { query?: ListDraftsQuery } & CallOptions): Promise<ListDraftsResult>;
  /**
   * Propose a workflow or an element as a draft.
   *
   * `POST /v1/drafts`. Scope: `workflows:write`.
   */
  proposeDraft(args: { body: ProposeDraftBody } & CallOptions): Promise<ProposeDraftResult>;
  /**
   * Read a draft.
   *
   * `GET /v1/drafts/{draftId}`. Scope: `read`.
   */
  getDraft(args: { draftId: string } & CallOptions): Promise<GetDraftResult>;
  /**
   * Hand in a new version of a draft.
   *
   * `PUT /v1/drafts/{draftId}`. Scope: `workflows:write`.
   */
  reviseDraft(args: { draftId: string; body: ReviseDraftBody } & CallOptions): Promise<ReviseDraftResult>;
  /**
   * Discard a draft.
   *
   * `DELETE /v1/drafts/{draftId}`. Signed-in browser only: no API token may call this.
   */
  discardDraft(args: { draftId: string } & CallOptions): Promise<void>;
  /**
   * Accept a draft.
   *
   * `POST /v1/drafts/{draftId}/accept`. Signed-in browser only: no API token may call this.
   */
  acceptDraft(args: { draftId: string; body?: AcceptDraftBody } & CallOptions): Promise<AcceptDraftResult>;
  /**
   * Send a draft back with a comment.
   *
   * `POST /v1/drafts/{draftId}/return`. Signed-in browser only: no API token may call this.
   */
  returnDraft(args: { draftId: string; body: ReturnDraftBody } & CallOptions): Promise<ReturnDraftResult>;
  /**
   * Ask the agent in a session to write a workflow or an element.
   *
   * `POST /v1/draft-requests`. Signed-in browser only: no API token may call this.
   */
  requestDraft(args: { body: RequestDraftBody } & CallOptions): Promise<RequestDraftResult>;
  /**
   * List the elements on the shelf.
   *
   * `GET /v1/elements`. Scope: `read`.
   */
  listElements(args?: { query?: ListElementsQuery } & CallOptions): Promise<ListElementsResult>;
  /**
   * Put an element on the shelf.
   *
   * `POST /v1/elements`. Scope: `workflows:write`.
   */
  createElement(args: { body: CreateElementBody } & CallOptions): Promise<CreateElementResult>;
  /**
   * Change an element on the shelf.
   *
   * `PATCH /v1/elements/{elementId}`. Scope: `workflows:write`.
   */
  updateElement(args: { elementId: string; body: UpdateElementBody } & CallOptions): Promise<UpdateElementResult>;
  /**
   * Take an element off the shelf.
   *
   * `DELETE /v1/elements/{elementId}`. Scope: `workflows:write`.
   */
  removeElement(args: { elementId: string } & CallOptions): Promise<void>;
  /**
   * Duplicate an element on the shelf.
   *
   * `POST /v1/elements/{elementId}/copy`. Scope: `workflows:write`.
   */
  copyElement(args: { elementId: string } & CallOptions): Promise<CopyElementResult>;
  /**
   * Run one element by itself, on a session.
   *
   * `POST /v1/elements/{elementId}/run`. Scope: `runs:write`.
   */
  runElement(args: { elementId: string; body: RunElementBody } & CallOptions): Promise<RunElementResult>;
  /**
   * Tick an item of what an element produced.
   *
   * `POST /v1/runs/{runId}/ticks`. Scope: `runs:write`.
   */
  tickRunItem(args: { runId: string; body: TickRunItemBody } & CallOptions): Promise<TickRunItemResult>;
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
   * The run a session is on.
   *
   * `GET /v1/sessions/{sessionId}/run`. A session's own token, or an API token with `read`.
   */
  getSessionRun(args: { sessionId: string } & CallOptions): Promise<GetSessionRunResult>;
  /**
   * Report on the run a session is on.
   *
   * `POST /v1/sessions/{sessionId}/run/report`. A session's own token, or an API token with `runs:write`.
   */
  reportSessionRun(args: { sessionId: string; body: ReportSessionRunBody } & CallOptions): Promise<ReportSessionRunResult>;
  /**
   * What a session was asked to write.
   *
   * `GET /v1/sessions/{sessionId}/brief`. A session's own token.
   */
  getSessionBrief(args: { sessionId: string } & CallOptions): Promise<GetSessionBriefResult>;
  /**
   * The drafts a session proposed or was asked for.
   *
   * `GET /v1/sessions/{sessionId}/drafts`. A session's own token.
   */
  listSessionDrafts(args: { sessionId: string; query?: ListSessionDraftsQuery } & CallOptions): Promise<ListSessionDraftsResult>;
  /**
   * Hand in a draft from a session.
   *
   * `POST /v1/sessions/{sessionId}/drafts`. A session's own token.
   */
  proposeSessionDraft(args: { sessionId: string; body: ProposeSessionDraftBody } & CallOptions): Promise<ProposeSessionDraftResult>;
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
     * Every item of `listWorkflows`, fetched a page at a time as they are asked for.
     */
    listWorkflows(args?: { query?: ListWorkflowsQuery } & CallOptions): AsyncGenerator<ListWorkflowsResult['items'][number], void, void>;
    /**
     * Every item of `listWorkflowVersions`, fetched a page at a time as they are asked for.
     */
    listWorkflowVersions(args?: { workflowId: string; query?: ListWorkflowVersionsQuery } & CallOptions): AsyncGenerator<ListWorkflowVersionsResult['items'][number], void, void>;
    /**
     * Every item of `listWorkflowTemplates`, fetched a page at a time as they are asked for.
     */
    listWorkflowTemplates(args?: { query?: ListWorkflowTemplatesQuery } & CallOptions): AsyncGenerator<ListWorkflowTemplatesResult['items'][number], void, void>;
    /**
     * Every item of `listRuns`, fetched a page at a time as they are asked for.
     */
    listRuns(args?: { query?: ListRunsQuery } & CallOptions): AsyncGenerator<ListRunsResult['items'][number], void, void>;
    /**
     * Every item of `listDrafts`, fetched a page at a time as they are asked for.
     */
    listDrafts(args?: { query?: ListDraftsQuery } & CallOptions): AsyncGenerator<ListDraftsResult['items'][number], void, void>;
    /**
     * Every item of `listElements`, fetched a page at a time as they are asked for.
     */
    listElements(args?: { query?: ListElementsQuery } & CallOptions): AsyncGenerator<ListElementsResult['items'][number], void, void>;
    /**
     * Every item of `listTokens`, fetched a page at a time as they are asked for.
     */
    listTokens(args?: { query?: ListTokensQuery } & CallOptions): AsyncGenerator<ListTokensResult['items'][number], void, void>;
    /**
     * Every item of `listActivity`, fetched a page at a time as they are asked for.
     */
    listActivity(args?: { query?: ListActivityQuery } & CallOptions): AsyncGenerator<ListActivityResult['items'][number], void, void>;
    /**
     * Every item of `listSessionDrafts`, fetched a page at a time as they are asked for.
     */
    listSessionDrafts(args?: { sessionId: string; query?: ListSessionDraftsQuery } & CallOptions): AsyncGenerator<ListSessionDraftsResult['items'][number], void, void>;
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
