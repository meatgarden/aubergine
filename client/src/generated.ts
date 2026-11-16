// Generated from the description of the API (/v1/openapi.json). Do not edit by hand:
// change the route declarations in shared/src/routes.ts and run `pnpm generate`.

import { everyItem, requester, type CallOptions, type ClientOptions, type OperationInfo } from './runtime';

/** The one shape every error has. */
export type ErrorBody = {
  error: {
    code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "runtime_unavailable" | "too_large" | "rate_limited" | "people_only" | "out_of_reach" | "not_at_prompt" | "no_shell_integration" | "run_in_progress" | "internal";
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
    name: "read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write";
    grantable: boolean;
    meaning: string;
  }[];
  caller: {
    kind: "user";
  } | {
    kind: "token";
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
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
    messagesFrom: string[];
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
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
      color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
  /** Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. */
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
  /** Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. */
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source?: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source?: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source?: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** The element as edited before accepting. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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

export interface ListDraftRecordsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListDraftRecordsResult = {
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
};

export type CreateElementBody = {
  /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
  id?: string;
  /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
  kind?: string;
  /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
  name: string;
  /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
  instructions?: string;
  /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
  doneWhen?: string;
  /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
  needs?: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
  /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
  produces?: string;
  /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
  origin?: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
  source?: {
    shelfId: string;
    version: number | null;
    hash: string | null;
  } | null;
  /** Fields from a file that this version does not know, kept so that they are written out again. */
  extra?: {
    [key: string]: unknown;
  };
};

export type CreateElementResult = {
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
  /** One line on what changed. Kept with the new version. */
  note?: string;
};

export type UpdateElementResult = {
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export type CopyElementResult = {
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export interface ListElementVersionsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListElementVersionsResult = {
  items: {
    version: number;
    element: {
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export type GetElementUsageResult = {
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
};

export type RetireElementBody = {
  /** The shelf element to use in its place. The editor then says so wherever a copy of the retired one is. */
  replacedBy?: string;
};

export type RetireElementResult = {
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export type RestoreElementResult = {
  id: string;
  element: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export type UpdateFromShelfBody = {
  /** `take`: the shelf's newest version takes the place of the copy's content. `keep`: the copy stays as it is, and is from then on a copy of the newest version that was changed here. */
  decision: "take" | "keep";
};

export type UpdateFromShelfResult = {
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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

export interface ListRepositoryWorkflowsQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListRepositoryWorkflowsResult = {
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
};

export interface GetRepositoryWorkflowQuery {
  /**
   * The top folder of the repository, as the list gives it. It must be the repository of a session.
   */
  root: string;
  /**
   * The name of the file, as the list gives it.
   */
  file: string;
}

export type GetRepositoryWorkflowResult = {
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
};

export type AcceptRepositoryWorkflowBody = {
  /** The top folder of the repository, as the list gives it. It must be the repository of a session. */
  root: string;
  /** The name of the file, as the list gives it. */
  file: string;
  /** The hash of the content that was read. If the file has changed since, nothing is accepted. */
  hash: string;
};

export type AcceptRepositoryWorkflowResult = {
  file: string;
  name: string | null;
  elements: string[];
  hash: string | null;
  state: "accepted" | "review" | "changed" | "unreadable";
  reason: string | null;
};

export type SaveToRepositoryBody = {
  /** A session whose folder is inside the repository to write to. */
  sessionId: string;
  /** The workflow to write. */
  workflowId: string;
  /** Replace the file if there is one of that name. Without this, that is refused. */
  overwrite?: boolean;
};

export type SaveToRepositoryResult = {
  root: string;
  file: string;
  path: string;
  overwritten: boolean;
};

export type RunRepositoryWorkflowBody = {
  /** The file, as the list gives it. */
  file: string;
  /** The inputs the workflow asks for, by key. */
  inputs?: {
    [key: string]: string;
  };
  /** Stop the run the session is on, if any, and start this. */
  replace?: boolean;
  /** Type the fixed kickoff line, for the owner, where an agent is running. */
  kickoff?: boolean;
};

export type RunRepositoryWorkflowResult = {
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

export type GetScreenResult = {
  text: string;
  columns: number;
  rows: number;
  cursor: {
    x: number;
    y: number;
  };
};

export interface GetOutputQuery {
  /**
   * How many lines to return at most, counted back from the end.
   */
  lines?: number;
  /**
   * The `nextCursor` of an earlier answer: read further back from there.
   */
  cursor?: string;
}

export type GetOutputResult = {
  text: string;
  lines: number;
  nextCursor: string | null;
};

export interface SearchTerminalsQuery {
  /**
   * How many matches to return at most.
   */
  limit?: number;
  /**
   * The text to look for. Capitals do not matter.
   */
  q: string;
}

export type SearchTerminalsResult = {
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
};

export type SendInputBody = {
  /** Text to type, exactly as it is. No control characters; no line breaks unless `paste` is true. */
  text?: string;
  /** Press Enter after the text. Say so explicitly: text alone presses nothing. */
  enter?: boolean;
  /** Deliver the text as a paste. Needed for text with line breaks. */
  paste?: boolean;
  /** Keys to press, in order, from this list only: Enter, Tab, Escape, Backspace, Delete, Up, Down, Left, Right, Home, End, PageUp, PageDown, Space, Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L, Ctrl+U, Ctrl+A, Ctrl+E, Ctrl+R. */
  keys?: ("Enter" | "Tab" | "Escape" | "Backspace" | "Delete" | "Up" | "Down" | "Left" | "Right" | "Home" | "End" | "PageUp" | "PageDown" | "Space" | "Ctrl+C" | "Ctrl+D" | "Ctrl+Z" | "Ctrl+L" | "Ctrl+U" | "Ctrl+A" | "Ctrl+E" | "Ctrl+R")[];
};

export type SendInputResult = {
  typed: number;
  keys: number;
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

export type RunCommandBody = {
  /** One command line, typed at the shell prompt. One line: no line breaks, no control characters. */
  command: string;
  /** How long to wait for it to finish. When the time is up the answer says it is still going; nothing is stopped. */
  timeoutSeconds?: number;
};

export type RunCommandResult = {
  finished: boolean;
  exitCode: number | null;
  output: string | null;
  outputCut: boolean;
  durationMs: number;
};

export type ProtectSessionBody = {
  /** True: no token may read this terminal or type into it, whatever its scopes. */
  peopleOnly: boolean;
};

export type ProtectSessionResult = {
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
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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

export type SetTakesMessagesBody = {
  /** True: while "people only", it still takes messages from terminals the owner let message it. It stays closed to reading, to typing and to every token. False: people only closes it to messages as well. */
  takesMessages: boolean;
};

export type SetTakesMessagesResult = {
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
    color: "none" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
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
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
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
};

export type CreateTokenBody = {
  /** What will use it. */
  name: string;
  /** What it may do. At least one. */
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
  /** When it stops working. Never, when neither this nor `expiresInDays` is given. */
  expiresAt?: string;
  /** In how many days it stops working. */
  expiresInDays?: number;
  /** Changes to workflows need your review: with `workflows:write` the token may propose drafts, and may not create or change workflows directly. On unless you switch it off. */
  reviewWorkflowChanges?: boolean;
  /** Which sessions the terminal scopes and the message scopes apply to: all, those on named canvases, or those with a tag. Required when `terminal:read`, `terminal:input`, `messages:read` or `messages:write` is asked for; there is no default. */
  reach?: {
    kind: "all";
  } | {
    kind: "canvases";
    canvasIds: string[];
  } | {
    kind: "tag";
    tag: string;
  };
};

export type CreateTokenResult = {
  token: {
    id: string;
    name: string;
    scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
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
};

export type RevokeTokenResult = {
  id: string;
  name: string;
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
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
  /**
   * Only calls about this session, or made from inside it.
   */
  sessionId?: string;
}

export type ListActivityResult = {
  items: {
    at: string;
    caller: "token" | "owner-cli";
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
};

export interface ListSessionMessagesQuery {
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListSessionMessagesResult = {
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
};

export type SendMessageBody = {
  /** The message, as plain text: at most 4000 characters. It is shown to the receiver as the words of the token's name; it is never typed into a terminal. */
  text: string;
  /** The message from that session this one answers. */
  replyTo?: string;
};

export type SendMessageResult = {
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
};

export type TakeInboxResult = {
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
};

export type ReplyToMessageBody = {
  /** The answer, as plain text: at most 4000 characters. */
  text: string;
};

export type ReplyToMessageResult = {
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
};

export type SendFromSessionBody = {
  /** The terminal the message is for: its ID, or its exact name on the same canvas. */
  to: string;
  /** The message, as plain text: at most 4000 characters. It is shown to the receiver as your words; it is never typed into a terminal. */
  text: string;
};

export type SendFromSessionResult = {
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

export type WriteRecapBody = {
  /** Three to six plain sentences: the goal, what was done, what is left, anything the owner must decide. */
  text: string;
};

export type WriteRecapResult = {
  text: string;
  at: string;
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
        /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
          /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
      source?: {
        shelfId: string;
        version: number | null;
        hash: string | null;
      } | null;
      /** Fields from a file that this version does not know, kept so that they are written out again. */
      extra?: {
        [key: string]: unknown;
      };
    }[];
  };
  /** One element, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** One line: how to tell that the element is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every element can hand over) or `checklist` (a list the next element and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a shelf element: which element and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for an element that is not such a copy. */
    source?: {
      shelfId: string;
      version: number | null;
      hash: string | null;
    } | null;
    /** Fields from a file that this version does not know, kept so that they are written out again. */
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
      /** Its ID inside its workflow. It stays the same when the element is edited, so that a run can tell which element it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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
    /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
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
        /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
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
      /** What sort of element it is. Today there is one, `instructions`: text an agent reads and follows. Nothing in an element is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
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

export type GetSessionRepositoryWorkflowsResult = {
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
};

export type ReportAgentBody = {
  kind: "claude-code";
  conversationId?: string | null;
};

export type ReportAgentResult = {
  kind: "claude-code";
  conversationId: string | null;
  program: string | null;
};

/** What each route is, for the code that makes the requests. */
export const OPERATIONS = {
  getCapabilities: { method: 'GET', path: '/v1', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'any', scope: null } },
  getDescription: { method: 'GET', path: '/v1/openapi.json', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'any', scope: null } },
  listCanvases: { method: 'GET', path: '/v1/canvases', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  createCanvas: { method: 'POST', path: '/v1/canvases', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "canvases:write" } },
  getCanvas: { method: 'GET', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  updateCanvas: { method: 'PATCH', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  closeCanvas: { method: 'DELETE', path: '/v1/canvases/{canvasId}', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  showCanvas: { method: 'POST', path: '/v1/canvases/{canvasId}/show', params: ["canvasId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  listCanvasSessions: { method: 'GET', path: '/v1/canvases/{canvasId}/sessions', params: ["canvasId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  startSession: { method: 'POST', path: '/v1/canvases/{canvasId}/sessions', params: ["canvasId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "sessions:write", fieldScopes: {"command":"terminal:input"} } },
  listSessions: { method: 'GET', path: '/v1/sessions', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getSession: { method: 'GET', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  updateSession: { method: 'PATCH', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write", fieldScopes: {"note":"notes:write"} } },
  endSession: { method: 'DELETE', path: '/v1/sessions/{sessionId}', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write" } },
  moveSession: { method: 'POST', path: '/v1/sessions/{sessionId}/move', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write" } },
  parkSession: { method: 'POST', path: '/v1/sessions/{sessionId}/park', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write" } },
  restoreSession: { method: 'POST', path: '/v1/sessions/{sessionId}/restore', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write" } },
  showSession: { method: 'POST', path: '/v1/sessions/{sessionId}/show', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "sessions:write" } },
  appendNote: { method: 'POST', path: '/v1/sessions/{sessionId}/notes', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "notes:write" } },
  updateNode: { method: 'PATCH', path: '/v1/canvases/{canvasId}/nodes/{nodeId}', params: ["canvasId", "nodeId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  createFrame: { method: 'POST', path: '/v1/canvases/{canvasId}/frames', params: ["canvasId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "canvases:write" } },
  updateFrame: { method: 'PATCH', path: '/v1/canvases/{canvasId}/frames/{frameId}', params: ["canvasId", "frameId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  removeFrame: { method: 'DELETE', path: '/v1/canvases/{canvasId}/frames/{frameId}', params: ["canvasId", "frameId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "canvases:write" } },
  listWorkflows: { method: 'GET', path: '/v1/workflows', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  createWorkflow: { method: 'POST', path: '/v1/workflows', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  getWorkflow: { method: 'GET', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  updateWorkflow: { method: 'PATCH', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  removeWorkflow: { method: 'DELETE', path: '/v1/workflows/{workflowId}', params: ["workflowId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  copyWorkflow: { method: 'POST', path: '/v1/workflows/{workflowId}/copy', params: ["workflowId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  listWorkflowVersions: { method: 'GET', path: '/v1/workflows/{workflowId}/versions', params: ["workflowId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  listWorkflowTemplates: { method: 'GET', path: '/v1/workflow-templates', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  useWorkflowTemplate: { method: 'POST', path: '/v1/workflow-templates/{template}/use', params: ["template"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  listRuns: { method: 'GET', path: '/v1/runs', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  startRun: { method: 'POST', path: '/v1/runs', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "runs:write" } },
  getRun: { method: 'GET', path: '/v1/runs/{runId}', params: ["runId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  reportRun: { method: 'POST', path: '/v1/runs/{runId}/report', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "runs:write" } },
  startSessionRun: { method: 'POST', path: '/v1/sessions/{sessionId}/runs', params: ["sessionId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "runs:write" } },
  listDrafts: { method: 'GET', path: '/v1/drafts', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  proposeDraft: { method: 'POST', path: '/v1/drafts', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  getDraft: { method: 'GET', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  reviseDraft: { method: 'PUT', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  discardDraft: { method: 'DELETE', path: '/v1/drafts/{draftId}', params: ["draftId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  acceptDraft: { method: 'POST', path: '/v1/drafts/{draftId}/accept', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  returnDraft: { method: 'POST', path: '/v1/drafts/{draftId}/return', params: ["draftId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listDraftRecords: { method: 'GET', path: '/v1/draft-records', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  requestDraft: { method: 'POST', path: '/v1/draft-requests', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listElements: { method: 'GET', path: '/v1/elements', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  createElement: { method: 'POST', path: '/v1/elements', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  updateElement: { method: 'PATCH', path: '/v1/elements/{elementId}', params: ["elementId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  removeElement: { method: 'DELETE', path: '/v1/elements/{elementId}', params: ["elementId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  copyElement: { method: 'POST', path: '/v1/elements/{elementId}/copy', params: ["elementId"], hasBody: false, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  listElementVersions: { method: 'GET', path: '/v1/elements/{elementId}/versions', params: ["elementId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getElementUsage: { method: 'GET', path: '/v1/elements/{elementId}/usage', params: ["elementId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  retireElement: { method: 'POST', path: '/v1/elements/{elementId}/retire', params: ["elementId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  restoreElement: { method: 'POST', path: '/v1/elements/{elementId}/restore', params: ["elementId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  updateFromShelf: { method: 'POST', path: '/v1/workflows/{workflowId}/elements/{elementId}/shelf-update', params: ["workflowId", "elementId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  runElement: { method: 'POST', path: '/v1/elements/{elementId}/run', params: ["elementId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "runs:write" } },
  tickRunItem: { method: 'POST', path: '/v1/runs/{runId}/ticks', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "runs:write" } },
  listRepositoryWorkflows: { method: 'GET', path: '/v1/repository-workflows', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getRepositoryWorkflow: { method: 'GET', path: '/v1/repository-workflows/file', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  acceptRepositoryWorkflow: { method: 'POST', path: '/v1/repository-workflows/accept', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  saveToRepository: { method: 'POST', path: '/v1/repository-workflows/save', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  runRepositoryWorkflow: { method: 'POST', path: '/v1/sessions/{sessionId}/repository-runs', params: ["sessionId"], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "runs:write" } },
  getScreen: { method: 'GET', path: '/v1/sessions/{sessionId}/screen', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:read" } },
  getOutput: { method: 'GET', path: '/v1/sessions/{sessionId}/output', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:read" } },
  searchTerminals: { method: 'GET', path: '/v1/search', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:read" } },
  sendInput: { method: 'POST', path: '/v1/sessions/{sessionId}/input', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:input" } },
  getSessionRun: { method: 'GET', path: '/v1/sessions/{sessionId}/run', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "read" } },
  runCommand: { method: 'POST', path: '/v1/sessions/{sessionId}/run', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:input" } },
  protectSession: { method: 'PUT', path: '/v1/sessions/{sessionId}/protection', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  setTakesMessages: { method: 'PUT', path: '/v1/sessions/{sessionId}/takes-messages', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  streamEvents: { method: 'GET', path: '/v1/events', params: [], hasBody: false, paged: false, idempotent: false, stream: true, access: { who: 'token', scope: "read" } },
  listTokens: { method: 'GET', path: '/v1/tokens', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  createToken: { method: 'POST', path: '/v1/tokens', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  revokeToken: { method: 'DELETE', path: '/v1/tokens/{tokenId}', params: ["tokenId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listActivity: { method: 'GET', path: '/v1/activity', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listSessionMessages: { method: 'GET', path: '/v1/sessions/{sessionId}/messages', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "messages:read" } },
  sendMessage: { method: 'POST', path: '/v1/sessions/{sessionId}/messages', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "messages:write" } },
  takeInbox: { method: 'POST', path: '/v1/sessions/{sessionId}/inbox', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  replyToMessage: { method: 'POST', path: '/v1/sessions/{sessionId}/messages/{messageId}/reply', params: ["sessionId", "messageId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  sendFromSession: { method: 'POST', path: '/v1/sessions/{sessionId}/tell', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  setAttention: { method: 'PUT', path: '/v1/sessions/{sessionId}/attention', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  writeRecap: { method: 'PUT', path: '/v1/sessions/{sessionId}/recap', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  reportSessionRun: { method: 'POST', path: '/v1/sessions/{sessionId}/run/report', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "runs:write" } },
  getSessionBrief: { method: 'GET', path: '/v1/sessions/{sessionId}/brief', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSessionDrafts: { method: 'GET', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  proposeSessionDraft: { method: 'POST', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  getSessionRepositoryWorkflows: { method: 'GET', path: '/v1/sessions/{sessionId}/repository-workflows', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "read" } },
  reportAgent: { method: 'PUT', path: '/v1/sessions/{sessionId}/agent', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
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
   * What became of drafts.
   *
   * `GET /v1/draft-records`. Signed-in browser only: no API token may call this.
   */
  listDraftRecords(args?: { query?: ListDraftRecordsQuery } & CallOptions): Promise<ListDraftRecordsResult>;
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
   * The versions of a shelf element.
   *
   * `GET /v1/elements/{elementId}/versions`. Scope: `read`.
   */
  listElementVersions(args: { elementId: string; query?: ListElementVersionsQuery } & CallOptions): Promise<ListElementVersionsResult>;
  /**
   * Where a shelf element is used.
   *
   * `GET /v1/elements/{elementId}/usage`. Scope: `read`.
   */
  getElementUsage(args: { elementId: string } & CallOptions): Promise<GetElementUsageResult>;
  /**
   * Retire a shelf element.
   *
   * `POST /v1/elements/{elementId}/retire`. Signed-in browser only: no API token may call this.
   */
  retireElement(args: { elementId: string; body?: RetireElementBody } & CallOptions): Promise<RetireElementResult>;
  /**
   * Bring a retired shelf element back.
   *
   * `POST /v1/elements/{elementId}/restore`. Signed-in browser only: no API token may call this.
   */
  restoreElement(args: { elementId: string } & CallOptions): Promise<RestoreElementResult>;
  /**
   * Decide about a newer shelf version for one copy in a workflow.
   *
   * `POST /v1/workflows/{workflowId}/elements/{elementId}/shelf-update`. Signed-in browser only: no API token may call this.
   */
  updateFromShelf(args: { workflowId: string; elementId: string; body: UpdateFromShelfBody } & CallOptions): Promise<UpdateFromShelfResult>;
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
   * List the workflows that repositories offer.
   *
   * `GET /v1/repository-workflows`. Scope: `read`.
   */
  listRepositoryWorkflows(args?: { query?: ListRepositoryWorkflowsQuery } & CallOptions): Promise<ListRepositoryWorkflowsResult>;
  /**
   * Read one repository workflow.
   *
   * `GET /v1/repository-workflows/file`. Scope: `read`.
   */
  getRepositoryWorkflow(args: { query: GetRepositoryWorkflowQuery } & CallOptions): Promise<GetRepositoryWorkflowResult>;
  /**
   * Accept a repository workflow as it is now.
   *
   * `POST /v1/repository-workflows/accept`. Signed-in browser only: no API token may call this.
   */
  acceptRepositoryWorkflow(args: { body: AcceptRepositoryWorkflowBody } & CallOptions): Promise<AcceptRepositoryWorkflowResult>;
  /**
   * Write a workflow into a repository.
   *
   * `POST /v1/repository-workflows/save`. Signed-in browser only: no API token may call this.
   */
  saveToRepository(args: { body: SaveToRepositoryBody } & CallOptions): Promise<SaveToRepositoryResult>;
  /**
   * Start a run of a repository workflow on a session.
   *
   * `POST /v1/sessions/{sessionId}/repository-runs`. Scope: `runs:write`.
   */
  runRepositoryWorkflow(args: { sessionId: string; body: RunRepositoryWorkflowBody } & CallOptions): Promise<RunRepositoryWorkflowResult>;
  /**
   * What a terminal shows now.
   *
   * `GET /v1/sessions/{sessionId}/screen`. Scope: `terminal:read`.
   */
  getScreen(args: { sessionId: string } & CallOptions): Promise<GetScreenResult>;
  /**
   * What a terminal printed recently.
   *
   * `GET /v1/sessions/{sessionId}/output`. Scope: `terminal:read`.
   */
  getOutput(args: { sessionId: string; query?: GetOutputQuery } & CallOptions): Promise<GetOutputResult>;
  /**
   * Search what terminals have printed.
   *
   * `GET /v1/search`. Scope: `terminal:read`.
   */
  searchTerminals(args: { query: SearchTerminalsQuery } & CallOptions): Promise<SearchTerminalsResult>;
  /**
   * Type into a terminal, or press keys.
   *
   * `POST /v1/sessions/{sessionId}/input`. Scope: `terminal:input`.
   */
  sendInput(args: { sessionId: string; body: SendInputBody } & CallOptions): Promise<SendInputResult>;
  /**
   * The run a session is on.
   *
   * `GET /v1/sessions/{sessionId}/run`. A session's own token, or an API token with `read`.
   */
  getSessionRun(args: { sessionId: string } & CallOptions): Promise<GetSessionRunResult>;
  /**
   * Run a command at a shell prompt and wait for it.
   *
   * `POST /v1/sessions/{sessionId}/run`. Scope: `terminal:input`.
   */
  runCommand(args: { sessionId: string; body: RunCommandBody } & CallOptions): Promise<RunCommandResult>;
  /**
   * Switch "people only" on or off for a session.
   *
   * `PUT /v1/sessions/{sessionId}/protection`. Signed-in browser only: no API token may call this.
   */
  protectSession(args: { sessionId: string; body: ProtectSessionBody } & CallOptions): Promise<ProtectSessionResult>;
  /**
   * Say whether a "people only" session still takes messages from other terminals.
   *
   * `PUT /v1/sessions/{sessionId}/takes-messages`. Signed-in browser only: no API token may call this.
   */
  setTakesMessages(args: { sessionId: string; body: SetTakesMessagesBody } & CallOptions): Promise<SetTakesMessagesResult>;
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
   * The messages to and from a session.
   *
   * `GET /v1/sessions/{sessionId}/messages`. Scope: `messages:read`.
   */
  listSessionMessages(args: { sessionId: string; query?: ListSessionMessagesQuery } & CallOptions): Promise<ListSessionMessagesResult>;
  /**
   * Send a message to a session.
   *
   * `POST /v1/sessions/{sessionId}/messages`. Scope: `messages:write`.
   */
  sendMessage(args: { sessionId: string; body: SendMessageBody } & CallOptions): Promise<SendMessageResult>;
  /**
   * Take the unread messages of the session.
   *
   * `POST /v1/sessions/{sessionId}/inbox`. A session's own token.
   */
  takeInbox(args: { sessionId: string } & CallOptions): Promise<TakeInboxResult>;
  /**
   * Answer a message the session received.
   *
   * `POST /v1/sessions/{sessionId}/messages/{messageId}/reply`. A session's own token.
   */
  replyToMessage(args: { sessionId: string; messageId: string; body: ReplyToMessageBody } & CallOptions): Promise<ReplyToMessageResult>;
  /**
   * Send a message from the session to another terminal.
   *
   * `POST /v1/sessions/{sessionId}/tell`. A session's own token.
   */
  sendFromSession(args: { sessionId: string; body: SendFromSessionBody } & CallOptions): Promise<SendFromSessionResult>;
  /**
   * Say whether the session wants the user.
   *
   * `PUT /v1/sessions/{sessionId}/attention`. A session's own token.
   */
  setAttention(args: { sessionId: string; body: SetAttentionBody } & CallOptions): Promise<SetAttentionResult>;
  /**
   * Hand in a recap of the session.
   *
   * `PUT /v1/sessions/{sessionId}/recap`. A session's own token.
   */
  writeRecap(args: { sessionId: string; body: WriteRecapBody } & CallOptions): Promise<WriteRecapResult>;
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
   * The workflows the repository of a session offers.
   *
   * `GET /v1/sessions/{sessionId}/repository-workflows`. A session's own token, or an API token with `read`.
   */
  getSessionRepositoryWorkflows(args: { sessionId: string } & CallOptions): Promise<GetSessionRepositoryWorkflowsResult>;
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
     * Every item of `listDraftRecords`, fetched a page at a time as they are asked for.
     */
    listDraftRecords(args?: { query?: ListDraftRecordsQuery } & CallOptions): AsyncGenerator<ListDraftRecordsResult['items'][number], void, void>;
    /**
     * Every item of `listElements`, fetched a page at a time as they are asked for.
     */
    listElements(args?: { query?: ListElementsQuery } & CallOptions): AsyncGenerator<ListElementsResult['items'][number], void, void>;
    /**
     * Every item of `listElementVersions`, fetched a page at a time as they are asked for.
     */
    listElementVersions(args?: { elementId: string; query?: ListElementVersionsQuery } & CallOptions): AsyncGenerator<ListElementVersionsResult['items'][number], void, void>;
    /**
     * Every item of `listRepositoryWorkflows`, fetched a page at a time as they are asked for.
     */
    listRepositoryWorkflows(args?: { query?: ListRepositoryWorkflowsQuery } & CallOptions): AsyncGenerator<ListRepositoryWorkflowsResult['items'][number], void, void>;
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
