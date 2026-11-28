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
};

export type GetDescriptionResult = {
  openapi: string;
  [key: string]: unknown;
};

export interface ListCanvasesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
};

export type CreateCanvasBody = {
  /** The project it is made in. Left out: the first project the caller reaches. */
  projectId?: string;
  /** The name on its tab. */
  name: string;
  /** The color of its tab. */
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  /** Pairs of key and value for tools of your own to give meaning to. */
  labels?: {
    [key: string]: string;
  };
};

export type CreateCanvasResult = {
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
};

export type GetCanvasResult = {
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
};

export type UpdateCanvasBody = {
  name?: string;
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  order?: number;
  labels?: {
    [key: string]: string;
  };
};

export type UpdateCanvasResult = {
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    host?: {
      kind: string;
      [key: string]: unknown;
    };
    meantFor?: {
      agent: string | null;
      environment: string | null;
      placeUnset: boolean;
    };
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
    /** The fields of the terminal, in order: at most 12, each label once. */
    fields: {
      /** What the value is, in a few words: one line of plain text, without a colon. */
      label: unknown & unknown;
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
      source: "owner" | "agent" | "found";
      /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
      suggested?: {
        /** The value: one line of plain text. An address in it is shown as a link. */
        value: string;
        at: string;
      };
    }[];
    theme: string | null;
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
    outsideViewers?: number;
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
    links: {
      id: string;
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      /** What it is, told from the address unless someone said otherwise. */
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      /** A few plain words for it. */
      label: string;
      /** Who added it: the owner, the agent (or a program), or the server by looking. */
      source: "owner" | "agent" | "found";
      by?: string;
      /** When it was added. */
      at: string;
      ownerSet?: boolean;
      suggested?: {
        label: string;
        kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
        at: string;
      };
      fromTerminal?: boolean;
    }[];
    written: {
      name?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
      summary?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
    };
    suggested: {
      name?: {
        value: string;
        at: string;
      };
      summary?: {
        value: string;
        at: string;
      };
    };
    found: {
      branch: string | null;
      repository: string | null;
      repositoryUrl: string | null;
      pullRequest: {
        /** The address, kept and opened exactly as given. Only http and https. */
        url: string;
        number: number;
        title: string;
        state: "open" | "merged" | "closed" | "draft";
      } | null;
      at: string;
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
  /** Where it works. Left out: in the folder itself. `working-copy`: in a working copy of its own, a second checkout of the repository the folder is in, on a new branch. Refused with the reason when the folder is not in a repository that can have one. */
  environment?: string;
};

export type StartSessionResult = {
  session: {
    id: string;
    projectId: string;
    host?: {
      kind: string;
      [key: string]: unknown;
    };
    meantFor?: {
      agent: string | null;
      environment: string | null;
      placeUnset: boolean;
    };
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
    /** The fields of the terminal, in order: at most 12, each label once. */
    fields: {
      /** What the value is, in a few words: one line of plain text, without a colon. */
      label: unknown & unknown;
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
      source: "owner" | "agent" | "found";
      /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
      suggested?: {
        /** The value: one line of plain text. An address in it is shown as a link. */
        value: string;
        at: string;
      };
    }[];
    theme: string | null;
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
    outsideViewers?: number;
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
    links: {
      id: string;
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      /** What it is, told from the address unless someone said otherwise. */
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      /** A few plain words for it. */
      label: string;
      /** Who added it: the owner, the agent (or a program), or the server by looking. */
      source: "owner" | "agent" | "found";
      by?: string;
      /** When it was added. */
      at: string;
      ownerSet?: boolean;
      suggested?: {
        label: string;
        kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
        at: string;
      };
      fromTerminal?: boolean;
    }[];
    written: {
      name?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
      summary?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
    };
    suggested: {
      name?: {
        value: string;
        at: string;
      };
      summary?: {
        value: string;
        at: string;
      };
    };
    found: {
      branch: string | null;
      repository: string | null;
      repositoryUrl: string | null;
      pullRequest: {
        /** The address, kept and opened exactly as given. Only http and https. */
        url: string;
        number: number;
        title: string;
        state: "open" | "merged" | "closed" | "draft";
      } | null;
      at: string;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  };
};

export interface ListSessionsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    host?: {
      kind: string;
      [key: string]: unknown;
    };
    meantFor?: {
      agent: string | null;
      environment: string | null;
      placeUnset: boolean;
    };
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
    /** The fields of the terminal, in order: at most 12, each label once. */
    fields: {
      /** What the value is, in a few words: one line of plain text, without a colon. */
      label: unknown & unknown;
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
      source: "owner" | "agent" | "found";
      /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
      suggested?: {
        /** The value: one line of plain text. An address in it is shown as a link. */
        value: string;
        at: string;
      };
    }[];
    theme: string | null;
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
    outsideViewers?: number;
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
    links: {
      id: string;
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      /** What it is, told from the address unless someone said otherwise. */
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      /** A few plain words for it. */
      label: string;
      /** Who added it: the owner, the agent (or a program), or the server by looking. */
      source: "owner" | "agent" | "found";
      by?: string;
      /** When it was added. */
      at: string;
      ownerSet?: boolean;
      suggested?: {
        label: string;
        kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
        at: string;
      };
      fromTerminal?: boolean;
    }[];
    written: {
      name?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
      summary?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
    };
    suggested: {
      name?: {
        value: string;
        at: string;
      };
      summary?: {
        value: string;
        at: string;
      };
    };
    found: {
      branch: string | null;
      repository: string | null;
      repositoryUrl: string | null;
      pullRequest: {
        /** The address, kept and opened exactly as given. Only http and https. */
        url: string;
        number: number;
        title: string;
        state: "open" | "merged" | "closed" | "draft";
      } | null;
      at: string;
    } | null;
  }[];
  nextCursor: string | null;
};

export type GetSessionResult = {
  id: string;
  projectId: string;
  host?: {
    kind: string;
    [key: string]: unknown;
  };
  meantFor?: {
    agent: string | null;
    environment: string | null;
    placeUnset: boolean;
  };
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
  /** The fields of the terminal, in order: at most 12, each label once. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
  theme: string | null;
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
  outsideViewers?: number;
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
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
  written: {
    name?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
    summary?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
  };
  suggested: {
    name?: {
      value: string;
      at: string;
    };
    summary?: {
      value: string;
      at: string;
    };
  };
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
  } | null;
};

export type UpdateSessionBody = {
  name?: string;
  tags?: string[];
  note?: string;
  /** The fields of the terminal, in order: at most 12, each label once. Who set each is the server’s to say: what is sent is the owner’s, except a field sent exactly as it stood, which keeps who set it. */
  fields?: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
  }[];
  /** The color theme the terminal's body is drawn in, whatever the page is drawn in: one of the IDs of the color themes, built-in or a theme file the server has read (another is refused with 400). `null` clears it: the terminal is then drawn in the default for terminals, or as the page is. */
  theme?: string | null;
};

export type UpdateSessionResult = {
  id: string;
  projectId: string;
  host?: {
    kind: string;
    [key: string]: unknown;
  };
  meantFor?: {
    agent: string | null;
    environment: string | null;
    placeUnset: boolean;
  };
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
  /** The fields of the terminal, in order: at most 12, each label once. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
  theme: string | null;
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
  outsideViewers?: number;
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
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
  written: {
    name?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
    summary?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
  };
  suggested: {
    name?: {
      value: string;
      at: string;
    };
    summary?: {
      value: string;
      at: string;
    };
  };
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
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
    host?: {
      kind: string;
      [key: string]: unknown;
    };
    meantFor?: {
      agent: string | null;
      environment: string | null;
      placeUnset: boolean;
    };
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
    /** The fields of the terminal, in order: at most 12, each label once. */
    fields: {
      /** What the value is, in a few words: one line of plain text, without a colon. */
      label: unknown & unknown;
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
      source: "owner" | "agent" | "found";
      /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
      suggested?: {
        /** The value: one line of plain text. An address in it is shown as a link. */
        value: string;
        at: string;
      };
    }[];
    theme: string | null;
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
    outsideViewers?: number;
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
    links: {
      id: string;
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      /** What it is, told from the address unless someone said otherwise. */
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      /** A few plain words for it. */
      label: string;
      /** Who added it: the owner, the agent (or a program), or the server by looking. */
      source: "owner" | "agent" | "found";
      by?: string;
      /** When it was added. */
      at: string;
      ownerSet?: boolean;
      suggested?: {
        label: string;
        kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
        at: string;
      };
      fromTerminal?: boolean;
    }[];
    written: {
      name?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
      summary?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
    };
    suggested: {
      name?: {
        value: string;
        at: string;
      };
      summary?: {
        value: string;
        at: string;
      };
    };
    found: {
      branch: string | null;
      repository: string | null;
      repositoryUrl: string | null;
      pullRequest: {
        /** The address, kept and opened exactly as given. Only http and https. */
        url: string;
        number: number;
        title: string;
        state: "open" | "merged" | "closed" | "draft";
      } | null;
      at: string;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  };
};

export type ParkSessionResult = {
  id: string;
  projectId: string;
  host?: {
    kind: string;
    [key: string]: unknown;
  };
  meantFor?: {
    agent: string | null;
    environment: string | null;
    placeUnset: boolean;
  };
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
  /** The fields of the terminal, in order: at most 12, each label once. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
  theme: string | null;
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
  outsideViewers?: number;
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
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
  written: {
    name?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
    summary?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
  };
  suggested: {
    name?: {
      value: string;
      at: string;
    };
    summary?: {
      value: string;
      at: string;
    };
  };
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
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
    host?: {
      kind: string;
      [key: string]: unknown;
    };
    meantFor?: {
      agent: string | null;
      environment: string | null;
      placeUnset: boolean;
    };
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
    /** The fields of the terminal, in order: at most 12, each label once. */
    fields: {
      /** What the value is, in a few words: one line of plain text, without a colon. */
      label: unknown & unknown;
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
      source: "owner" | "agent" | "found";
      /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
      suggested?: {
        /** The value: one line of plain text. An address in it is shown as a link. */
        value: string;
        at: string;
      };
    }[];
    theme: string | null;
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
    outsideViewers?: number;
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
    links: {
      id: string;
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      /** What it is, told from the address unless someone said otherwise. */
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      /** A few plain words for it. */
      label: string;
      /** Who added it: the owner, the agent (or a program), or the server by looking. */
      source: "owner" | "agent" | "found";
      by?: string;
      /** When it was added. */
      at: string;
      ownerSet?: boolean;
      suggested?: {
        label: string;
        kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
        at: string;
      };
      fromTerminal?: boolean;
    }[];
    written: {
      name?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
      summary?: {
        by: "owner" | "agent" | "found";
        at: string;
      };
    };
    suggested: {
      name?: {
        value: string;
        at: string;
      };
      summary?: {
        value: string;
        at: string;
      };
    };
    found: {
      branch: string | null;
      repository: string | null;
      repositoryUrl: string | null;
      pullRequest: {
        /** The address, kept and opened exactly as given. Only http and https. */
        url: string;
        number: number;
        title: string;
        state: "open" | "merged" | "closed" | "draft";
      } | null;
      at: string;
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
    color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  };
};

export type ShowSessionResult = {
  shown: number;
};

export type OpenSessionOnDesktopResult = {
  /** True: the terminal application was asked to open a window. False: it could not be, and `says` is why. */
  opened: boolean;
  /** What was done, or why it could not be, in a sentence. */
  says: string;
};

export type ChangeDesktopSettingsBody = {
  /** Whether new terminals made in the page also open on the desktop. */
  openNew: boolean;
};

export type ChangeDesktopSettingsResult = {
  /** New terminals made in the page also open on the desktop. */
  openNew: boolean;
};

export type ChangeAppearanceBody = {
  /** `light`, `dark`, or `system` to match the system. */
  theme?: "light" | "dark" | "system";
  /** The color theme to draw when the page is light: one whose kind is light, built-in or a theme file the server has read. Another is refused with 400. */
  light?: string;
  /** The color theme to draw when the page is dark: one whose kind is dark, built-in or a theme file the server has read. Another is refused with 400. */
  dark?: string;
  /** The size of a terminal's text, in pixels, from 8 to 32. */
  fontSize?: number;
  /** The font-family list for a terminal's text: one line of at most 300 characters, without control characters or any of `;{}<>`. */
  fontFamily?: string;
  /** The shape of a terminal's cursor: `block`, `bar` or `underline`. */
  cursor?: "block" | "bar" | "underline";
  /** Whether a terminal's cursor blinks. */
  cursorBlink?: boolean;
  /** The color theme every terminal is drawn in that has none of its own: one of the IDs of the color themes, of either kind, built-in or a theme file the server has read (another is refused with 400). `null`: the theme the page is drawn in. */
  terminal?: string | null;
  /** What a terminal’s title says after its name, on the canvas and at the head of a terminal in a browser tab of its own: a template, one line of at most 200 characters without control characters (another is refused with 400), with placeholders such as {state}, {folder} and {field:Ticket}. A placeholder that is not known is kept as written and skipped where it is drawn. */
  titleFormat?: string;
  /** What a terminal’s row in the list says on its second line: a template, as `titleFormat` is. */
  rowFormat?: string;
  /** Whether the owner’s own stylesheet (`custom.css` in the data folder) is linked on the page. It names nothing that is run; what the file holds is written by hand. */
  customCss?: boolean;
  /** The color themes of terminals by tag, in order, at most 20: the whole list, which replaces the one there was (an empty list removes them all). The first entry whose tag a terminal has wins; a terminal’s own theme comes before all of them. A theme the server has not read is refused with 400. */
  byTag?: {
    /** A terminal’s tag, as tags are written: whatever the capitals, the same tag. */
    tag: string;
    /** The color theme of the terminals with that tag, of either kind, built-in or of a theme file. */
    theme: string;
  }[];
};

export type ChangeAppearanceResult = {
  /** `light`, `dark`, or `system` for whichever the system is set to. */
  theme: "light" | "dark" | "system";
  /** The color theme drawn when the page is light: the ID of a built-in theme, or of a theme file of the owner’s. */
  light: string;
  /** The color theme drawn when the page is dark: the ID of a built-in theme, or of a theme file of the owner’s. */
  dark: string;
  /** A terminal's font. */
  font: {
    /** The font-family list for a terminal's text. */
    family: string;
    /** The size of a terminal's text, in pixels. */
    size: number;
  };
  /** The shape of a terminal's cursor: `block`, `bar` or `underline`. */
  cursor: "block" | "bar" | "underline";
  /** Whether a terminal's cursor blinks. */
  cursorBlink: boolean;
  /** The color theme of a terminal that has none of its own, built-in or of a theme file; `null`: the theme the page is drawn in. */
  terminal: string | null;
  /** Color themes for terminals by tag, in order: a terminal without one of its own is drawn in the theme of the first entry whose tag it has. */
  byTag: {
    /** A terminal’s tag, as tags are written: whatever the capitals, the same tag. */
    tag: string;
    /** The color theme of the terminals with that tag, of either kind, built-in or of a theme file. */
    theme: string;
  }[];
  /** What a terminal’s title says after its name: a template with placeholders such as {state} and {folder}. */
  titleFormat: string;
  /** What a terminal’s row in the list says on its second line: a template with placeholders such as {state} and {time}. */
  rowFormat: string;
  /** Whether the owner’s own stylesheet (`custom.css` in the data folder) is linked on the page. */
  customCss: boolean;
};

export type ReadThemesResult = {
  /** The themes of the owner’s own that were read, by the name of their file. */
  themes: {
    /** The name of its file, without `.json`. */
    id: string;
    /** What the theme is called: one line of plain text. */
    name: string;
    /** Whether it is drawn as the light page or the dark one. */
    kind: "light" | "dark";
    /** The built-in theme it is laid over, of the same kind. Its shadows, scrim and focus ring are the base’s. */
    base: "light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula";
    /** Colors laid over the base theme, by the names of the page’s color tokens. What is not named is the base’s. */
    colors: {
      /** The page’s color token --bg, as #rrggbb. */
      bg?: string;
      /** The page’s color token --surface, as #rrggbb. */
      surface?: string;
      /** The page’s color token --surface-raised, as #rrggbb. */
      "surface-raised"?: string;
      /** The page’s color token --field, as #rrggbb. */
      field?: string;
      /** The page’s color token --surface-active, as #rrggbb. */
      "surface-active"?: string;
      /** The page’s color token --border, as #rrggbb. */
      border?: string;
      /** The page’s color token --border-strong, as #rrggbb. */
      "border-strong"?: string;
      /** The page’s color token --border-control, as #rrggbb. */
      "border-control"?: string;
      /** The page’s color token --text, as #rrggbb. */
      text?: string;
      /** The page’s color token --text-muted, as #rrggbb. */
      "text-muted"?: string;
      /** The page’s color token --accent, as #rrggbb. */
      accent?: string;
      /** The page’s color token --accent-soft, as #rrggbb. */
      "accent-soft"?: string;
      /** The page’s color token --accent-text, as #rrggbb. */
      "accent-text"?: string;
      /** The page’s color token --on-accent, as #rrggbb. */
      "on-accent"?: string;
      /** The page’s color token --accent-pressed, as #rrggbb. */
      "accent-pressed"?: string;
      /** The page’s color token --attention, as #rrggbb. */
      attention?: string;
      /** The page’s color token --attention-soft, as #rrggbb. */
      "attention-soft"?: string;
      /** The page’s color token --attention-text, as #rrggbb. */
      "attention-text"?: string;
      /** The page’s color token --on-attention, as #rrggbb. */
      "on-attention"?: string;
      /** The page’s color token --attention-pressed, as #rrggbb. */
      "attention-pressed"?: string;
      /** The page’s color token --working, as #rrggbb. */
      working?: string;
      /** The page’s color token --working-soft, as #rrggbb. */
      "working-soft"?: string;
      /** The page’s color token --working-text, as #rrggbb. */
      "working-text"?: string;
      /** The page’s color token --ok, as #rrggbb. */
      ok?: string;
      /** The page’s color token --ok-soft, as #rrggbb. */
      "ok-soft"?: string;
      /** The page’s color token --ok-text, as #rrggbb. */
      "ok-text"?: string;
      /** The page’s color token --danger, as #rrggbb. */
      danger?: string;
      /** The page’s color token --danger-soft, as #rrggbb. */
      "danger-soft"?: string;
      /** The page’s color token --danger-text, as #rrggbb. */
      "danger-text"?: string;
      /** The page’s color token --on-danger, as #rrggbb. */
      "on-danger"?: string;
      /** The page’s color token --danger-pressed, as #rrggbb. */
      "danger-pressed"?: string;
      /** The page’s color token --selection, as #rrggbb. */
      selection?: string;
      /** The page’s color token --terminal-bg, as #rrggbb. */
      "terminal-bg"?: string;
      /** The page’s color token --canvas-dot, as #rrggbb. */
      "canvas-dot"?: string;
      /** The page’s color token --minimap-node, as #rrggbb. */
      "minimap-node"?: string;
    };
    /** A terminal’s own colors, over the base’s. Its ground is the theme’s terminal-bg. */
    terminal: {
      /** The color of a terminal’s words, as #rrggbb. */
      foreground?: string;
      /** The color of a terminal’s cursor, as #rrggbb. */
      cursor?: string;
      /** The color behind what is selected in a terminal, as #rrggbb. */
      selection?: string;
      /** The sixteen colors a program asks for by number, in order: black, red, green, yellow, blue, magenta, cyan, white, then the bright eight. Null, or left out at the end: the base’s. */
      ansi?: (string | null)[];
    };
  }[];
  /** One sentence for each file that was not read, and each entry of a file that was skipped. */
  problems: string[];
};

export type ReadStylesheetResult = {
  /** The stylesheet found now: null when there is none to link. */
  stylesheet: {
    /** A short hash of the file’s content: it changes when the content does, and is put in the address of the stylesheet so that a browser takes the new one. */
    version: string;
    /** The file’s size, in bytes. */
    bytes: number;
  } | null;
  /** Why a file that is there was not read (a link, a folder, too large), in one sentence; null otherwise. */
  problem: string | null;
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
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
};

export type UpdateNodeResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  sessionId: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
};

export type CreateFrameBody = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
};

export type CreateFrameResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
};

export type UpdateFrameBody = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  label?: string;
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  carry?: boolean;
};

export type UpdateFrameResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  label: string;
  color: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
};

export interface ListWorkflowsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    /** The project it belongs to. Null: shared with every project. */
    projectId: string | null;
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
  /** Text added to every step: rules that hold from start to finish. */
  standing?: string;
  /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
  inputs?: {
    key: string;
    label: string;
    description?: string;
    required?: boolean;
  }[];
  /** The steps, in the order they are gone through. */
  elements: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** Text added to every step: rules that hold from start to finish. */
  standing?: string;
  /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
  inputs?: {
    key: string;
    label: string;
    description?: string;
    required?: boolean;
  }[];
  /** The steps, in the order they are gone through. */
  elements?: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
  status?: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped" | "live" | "ended";
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
      projectId?: string;
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
    projectId?: string;
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
};

export type GetRunResult = {
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    projectId?: string;
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
    projectId?: string;
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
};

export type ApproveRunBody = {
  /** The step being approved. Name it, so that a decision sent twice approves one step and not two. Without it: the one the run waits on. */
  elementId?: string;
  /** A few words for whoever does the next step. Plain text on one line. */
  comment?: string;
};

export type ApproveRunResult = {
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    projectId?: string;
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
};

export type SendBackRunBody = {
  /** The earlier step the run goes back to. It, and everything after it, is done again. */
  elementId: string;
  /** What should change. Whoever does that step is told it, marked as your words. Plain text on one line. */
  comment: string;
};

export type SendBackRunResult = {
  run: {
    id: string;
    workflowId: string;
    workflowVersion: number;
    sessionId: string | null;
    projectId?: string;
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
};

export type StartRunsBody = {
  /** The sessions, each of which gets its own run. */
  sessionIds: string[];
  /** The inputs for every run. */
  inputs?: {
    [key: string]: string;
  };
  /** For a session named here: its own inputs, in place of the ones for all. */
  inputsBySession?: {
    [key: string]: {
      [key: string]: string;
    };
  };
  /** When the session is already on a run: stop that one and start this. Without it, that is refused. */
  replace?: boolean;
  /** Type the line that tells the agent about the run into the session's terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed. */
  kickoff?: boolean;
};

export type StartRunsResult = {
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
        projectId?: string;
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
};

export interface GetBoardQuery {
  /**
   * Only runs whose terminal is on this canvas.
   */
  canvasId?: string;
  /**
   * Only runs of this workflow.
   */
  workflowId?: string;
  /**
   * Only runs with this status.
   */
  status?: "queued" | "running" | "paused" | "blocked" | "awaiting" | "finished" | "stopped";
  /**
   * Only runs whose terminal has this tag.
   */
  tag?: string;
  /**
   * Only runs of this project; `all`: of every project. Left out: the first project the caller reaches.
   */
  projectId?: string | "all";
}

export type GetBoardResult = {
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
    /** Null for the group of runs of one step by itself. */
    workflowId: string | null;
    workflowName: string;
    /** Said only when live runs are on more than one version of the workflow. */
    version: number | null;
    /** The group of runs of one step by itself: each card names its step. */
    single: boolean;
    /** Runs that wait for a terminal. */
    queued: {
      runId: string;
      /** The project it runs in. Null where that is not known. */
      projectId: string | null;
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
      /** When the run came to the step it is on. */
      since: string | null;
      /** The terminal has printed for a while since the last report: the card may be behind. */
      quiet: boolean;
      blockedReason: string | null;
      /** True when the run waits for a person to approve or send back. Only the owner can do either. */
      waitsForPerson: boolean;
      finishedAt: string | null;
    }[];
    /** That version's steps, in order. */
    columns: {
      elementId: string;
      name: string;
      /** A step where a run stops until a person has decided. */
      waitsForPerson: boolean;
      cards: {
        runId: string;
        /** The project it runs in. Null where that is not known. */
        projectId: string | null;
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
        /** When the run came to the step it is on. */
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
    /** The project it runs in. Null where that is not known. */
    projectId: string | null;
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
    /** When the run came to the step it is on. */
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
    projectId?: string;
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
};

export interface ListDraftsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Text added to every step: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The steps, in the order they are gone through. */
    elements: {
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask?: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt?: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** One step, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Text added to every step: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The steps, in the order they are gone through. */
    elements: {
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask?: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt?: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** One step, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Text added to every step: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The steps, in the order they are gone through. */
    elements: {
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask?: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt?: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The step as edited before accepting. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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

export interface ListThemesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListThemesResult = {
  items: {
    /** What a setting, a menu and a request call it. */
    id: string;
    /** What Settings calls it. */
    name: string;
    /** Whether it is drawn as the light page or the dark one. */
    kind: "light" | "dark";
    /** The built-in theme it is laid over: itself, for a built-in one. */
    base: "light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula";
    /** True for a theme file of the owner’s; false for one that comes with Aubergine. */
    own: boolean;
  }[];
  nextCursor: string | null;
};

export interface ListThemeProposalsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListThemeProposalsResult = {
  items: {
    id: string;
    themeId: string;
    /** What the theme would be called. */
    name: string;
    /** Light or dark; null for one that was decided. */
    kind: ("light" | "dark") | null;
    /** The built-in theme it is laid over; null for one that was decided. */
    base: ("light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula") | null;
    /** How many of its colors are its own (0 for one that was decided). */
    colors: number;
    /** What in the file was skipped. Empty for one that was decided. */
    problems: string[];
    /** Why it was proposed, in the words of whoever proposed it. */
    why: string;
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
    /** `waiting` for the owner; `accepted`: it is a theme file now; `declined`: it was not taken, and nothing of it is kept. */
    state: "waiting" | "accepted" | "declined";
    /** When it was proposed, or when it was decided. */
    at: string;
  }[];
  nextCursor: string | null;
};

export type ProposeThemeBody = {
  /** The ID it would have: the name of its file without `.json`. Not the ID of a theme that comes with Aubergine. */
  id: string;
  /** The theme file, as text: the same form as a file in `themes/` (docs/themes.md). It is read as it arrives; one that cannot be read is refused whole and nothing is kept. */
  text: string;
  /** Why it is proposed, in one line, for the owner to read. */
  why?: string;
};

export type ProposeThemeResult = {
  id: string;
  themeId: string;
  /** What the theme would be called. */
  name: string;
  /** Light or dark; null for one that was decided. */
  kind: ("light" | "dark") | null;
  /** The built-in theme it is laid over; null for one that was decided. */
  base: ("light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula") | null;
  /** How many of its colors are its own (0 for one that was decided). */
  colors: number;
  /** What in the file was skipped. Empty for one that was decided. */
  problems: string[];
  /** Why it was proposed, in the words of whoever proposed it. */
  why: string;
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
  /** `waiting` for the owner; `accepted`: it is a theme file now; `declined`: it was not taken, and nothing of it is kept. */
  state: "waiting" | "accepted" | "declined";
  /** When it was proposed, or when it was decided. */
  at: string;
};

export type AcceptThemeProposalBody = {
  /** The digest of the proposal as it was shown. A proposal whose text is not that one is refused with 409. */
  digest: string;
};

export type AcceptThemeProposalResult = {
  theme: {
    /** The name of its file, without `.json`. */
    id: string;
    /** What the theme is called: one line of plain text. */
    name: string;
    /** Whether it is drawn as the light page or the dark one. */
    kind: "light" | "dark";
    /** The built-in theme it is laid over, of the same kind. Its shadows, scrim and focus ring are the base’s. */
    base: "light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula";
    /** Colors laid over the base theme, by the names of the page’s color tokens. What is not named is the base’s. */
    colors: {
      /** The page’s color token --bg, as #rrggbb. */
      bg?: string;
      /** The page’s color token --surface, as #rrggbb. */
      surface?: string;
      /** The page’s color token --surface-raised, as #rrggbb. */
      "surface-raised"?: string;
      /** The page’s color token --field, as #rrggbb. */
      field?: string;
      /** The page’s color token --surface-active, as #rrggbb. */
      "surface-active"?: string;
      /** The page’s color token --border, as #rrggbb. */
      border?: string;
      /** The page’s color token --border-strong, as #rrggbb. */
      "border-strong"?: string;
      /** The page’s color token --border-control, as #rrggbb. */
      "border-control"?: string;
      /** The page’s color token --text, as #rrggbb. */
      text?: string;
      /** The page’s color token --text-muted, as #rrggbb. */
      "text-muted"?: string;
      /** The page’s color token --accent, as #rrggbb. */
      accent?: string;
      /** The page’s color token --accent-soft, as #rrggbb. */
      "accent-soft"?: string;
      /** The page’s color token --accent-text, as #rrggbb. */
      "accent-text"?: string;
      /** The page’s color token --on-accent, as #rrggbb. */
      "on-accent"?: string;
      /** The page’s color token --accent-pressed, as #rrggbb. */
      "accent-pressed"?: string;
      /** The page’s color token --attention, as #rrggbb. */
      attention?: string;
      /** The page’s color token --attention-soft, as #rrggbb. */
      "attention-soft"?: string;
      /** The page’s color token --attention-text, as #rrggbb. */
      "attention-text"?: string;
      /** The page’s color token --on-attention, as #rrggbb. */
      "on-attention"?: string;
      /** The page’s color token --attention-pressed, as #rrggbb. */
      "attention-pressed"?: string;
      /** The page’s color token --working, as #rrggbb. */
      working?: string;
      /** The page’s color token --working-soft, as #rrggbb. */
      "working-soft"?: string;
      /** The page’s color token --working-text, as #rrggbb. */
      "working-text"?: string;
      /** The page’s color token --ok, as #rrggbb. */
      ok?: string;
      /** The page’s color token --ok-soft, as #rrggbb. */
      "ok-soft"?: string;
      /** The page’s color token --ok-text, as #rrggbb. */
      "ok-text"?: string;
      /** The page’s color token --danger, as #rrggbb. */
      danger?: string;
      /** The page’s color token --danger-soft, as #rrggbb. */
      "danger-soft"?: string;
      /** The page’s color token --danger-text, as #rrggbb. */
      "danger-text"?: string;
      /** The page’s color token --on-danger, as #rrggbb. */
      "on-danger"?: string;
      /** The page’s color token --danger-pressed, as #rrggbb. */
      "danger-pressed"?: string;
      /** The page’s color token --selection, as #rrggbb. */
      selection?: string;
      /** The page’s color token --terminal-bg, as #rrggbb. */
      "terminal-bg"?: string;
      /** The page’s color token --canvas-dot, as #rrggbb. */
      "canvas-dot"?: string;
      /** The page’s color token --minimap-node, as #rrggbb. */
      "minimap-node"?: string;
    };
    /** A terminal’s own colors, over the base’s. Its ground is the theme’s terminal-bg. */
    terminal: {
      /** The color of a terminal’s words, as #rrggbb. */
      foreground?: string;
      /** The color of a terminal’s cursor, as #rrggbb. */
      cursor?: string;
      /** The color behind what is selected in a terminal, as #rrggbb. */
      selection?: string;
      /** The sixteen colors a program asks for by number, in order: black, red, green, yellow, blue, magenta, cyan, white, then the bright eight. Null, or left out at the end: the base’s. */
      ansi?: (string | null)[];
    };
  };
  /** The name of the file that was written, in `themes/`. */
  file: string;
  /** The themes of the owner’s own there are now. */
  themes: {
    /** The name of its file, without `.json`. */
    id: string;
    /** What the theme is called: one line of plain text. */
    name: string;
    /** Whether it is drawn as the light page or the dark one. */
    kind: "light" | "dark";
    /** The built-in theme it is laid over, of the same kind. Its shadows, scrim and focus ring are the base’s. */
    base: "light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula";
    /** Colors laid over the base theme, by the names of the page’s color tokens. What is not named is the base’s. */
    colors: {
      /** The page’s color token --bg, as #rrggbb. */
      bg?: string;
      /** The page’s color token --surface, as #rrggbb. */
      surface?: string;
      /** The page’s color token --surface-raised, as #rrggbb. */
      "surface-raised"?: string;
      /** The page’s color token --field, as #rrggbb. */
      field?: string;
      /** The page’s color token --surface-active, as #rrggbb. */
      "surface-active"?: string;
      /** The page’s color token --border, as #rrggbb. */
      border?: string;
      /** The page’s color token --border-strong, as #rrggbb. */
      "border-strong"?: string;
      /** The page’s color token --border-control, as #rrggbb. */
      "border-control"?: string;
      /** The page’s color token --text, as #rrggbb. */
      text?: string;
      /** The page’s color token --text-muted, as #rrggbb. */
      "text-muted"?: string;
      /** The page’s color token --accent, as #rrggbb. */
      accent?: string;
      /** The page’s color token --accent-soft, as #rrggbb. */
      "accent-soft"?: string;
      /** The page’s color token --accent-text, as #rrggbb. */
      "accent-text"?: string;
      /** The page’s color token --on-accent, as #rrggbb. */
      "on-accent"?: string;
      /** The page’s color token --accent-pressed, as #rrggbb. */
      "accent-pressed"?: string;
      /** The page’s color token --attention, as #rrggbb. */
      attention?: string;
      /** The page’s color token --attention-soft, as #rrggbb. */
      "attention-soft"?: string;
      /** The page’s color token --attention-text, as #rrggbb. */
      "attention-text"?: string;
      /** The page’s color token --on-attention, as #rrggbb. */
      "on-attention"?: string;
      /** The page’s color token --attention-pressed, as #rrggbb. */
      "attention-pressed"?: string;
      /** The page’s color token --working, as #rrggbb. */
      working?: string;
      /** The page’s color token --working-soft, as #rrggbb. */
      "working-soft"?: string;
      /** The page’s color token --working-text, as #rrggbb. */
      "working-text"?: string;
      /** The page’s color token --ok, as #rrggbb. */
      ok?: string;
      /** The page’s color token --ok-soft, as #rrggbb. */
      "ok-soft"?: string;
      /** The page’s color token --ok-text, as #rrggbb. */
      "ok-text"?: string;
      /** The page’s color token --danger, as #rrggbb. */
      danger?: string;
      /** The page’s color token --danger-soft, as #rrggbb. */
      "danger-soft"?: string;
      /** The page’s color token --danger-text, as #rrggbb. */
      "danger-text"?: string;
      /** The page’s color token --on-danger, as #rrggbb. */
      "on-danger"?: string;
      /** The page’s color token --danger-pressed, as #rrggbb. */
      "danger-pressed"?: string;
      /** The page’s color token --selection, as #rrggbb. */
      selection?: string;
      /** The page’s color token --terminal-bg, as #rrggbb. */
      "terminal-bg"?: string;
      /** The page’s color token --canvas-dot, as #rrggbb. */
      "canvas-dot"?: string;
      /** The page’s color token --minimap-node, as #rrggbb. */
      "minimap-node"?: string;
    };
    /** A terminal’s own colors, over the base’s. Its ground is the theme’s terminal-bg. */
    terminal: {
      /** The color of a terminal’s words, as #rrggbb. */
      foreground?: string;
      /** The color of a terminal’s cursor, as #rrggbb. */
      cursor?: string;
      /** The color behind what is selected in a terminal, as #rrggbb. */
      selection?: string;
      /** The sixteen colors a program asks for by number, in order: black, red, green, yellow, blue, magenta, cyan, white, then the bright eight. Null, or left out at the end: the base’s. */
      ansi?: (string | null)[];
    };
  }[];
  /** What in the theme files is not read now, or skipped. */
  problems: string[];
};

export interface ListLibrarySourcesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
}

export type ListLibrarySourcesResult = {
  sources: {
    id: string;
    projectId: string | null;
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
};

export type AddLibrarySourceBody = {
  /** `folder` (a folder on this computer) or `git` (the address of a Git repository). */
  kind: string;
  /** For a folder: its path. For Git: an address starting with https://, ssh:// or file://, or of the form user@host:path. Never with a password in it. */
  address: string;
  /** What to call it. Left out, it is shown by what its index calls it, said as its own claim, with its address beside it. */
  name?: string;
};

export type AddLibrarySourceResult = {
  id: string;
  projectId: string | null;
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
};

export type RefreshLibrarySourceResult = {
  id: string;
  projectId: string | null;
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
};

export type ListLibraryItemsResult = {
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
};

export type GetLibraryItemResult = {
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
};

export type RequestLibraryInstallBody = {
  sourceId: string;
  itemId: string;
};

export type RequestLibraryInstallResult = {
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

export type ListLibraryRequestsResult = {
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
};

export type GetLibraryRequestResult = {
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
};

export type AcceptLibraryRequestBody = {
  /** The digest of the file as it was shown for review. If the file is not that any more, nothing is installed. */
  digest: string;
  /** The workflow as edited before accepting. */
  workflow?: unknown;
  /** The step as edited before accepting. */
  element?: unknown;
};

export type AcceptLibraryRequestResult = {
  id: string;
  projectId: string | null;
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
};

export type ListLibraryInstalledResult = {
  installed: {
    id: string;
    projectId: string | null;
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
};

export type GetLibraryInstalledUsageResult = {
  uses: string[];
  liveRuns: number;
};

export interface ListElementsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    projectId: string | null;
    element: {
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** For a retired step: the saved step to use in its place, when one was named. */
    replacedBy: string | null;
  }[];
  nextCursor: string | null;
};

export type CreateElementBody = {
  /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
  id?: string;
  /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
  kind?: string;
  /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
  name: string;
  /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
  instructions?: string;
  /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
  ask?: string;
  /** For an approval, if you like: what the person should look at before deciding. */
  lookAt?: string;
  /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
  doneWhen?: string;
  /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
  needs?: {
    kind: "mcp" | "command" | "access" | "other";
    name: string;
    note?: string;
  }[];
  /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
  produces?: string;
  /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
  origin?: {
    kind: string;
    name?: string;
    [key: string]: unknown;
  };
  /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  projectId: string | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** For a retired step: the saved step to use in its place, when one was named. */
  replacedBy: string | null;
};

export type UpdateElementBody = {
  kind?: string;
  name?: string;
  instructions?: string;
  doneWhen?: string;
  ask?: string;
  lookAt?: string;
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
  projectId: string | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** For a retired step: the saved step to use in its place, when one was named. */
  replacedBy: string | null;
};

export type CopyElementResult = {
  id: string;
  projectId: string | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** For a retired step: the saved step to use in its place, when one was named. */
  replacedBy: string | null;
};

export interface ListElementVersionsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** The saved step to use in its place. The editor then says so wherever a copy of the retired one is. */
  replacedBy?: string;
};

export type RetireElementResult = {
  id: string;
  projectId: string | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** For a retired step: the saved step to use in its place, when one was named. */
  replacedBy: string | null;
};

export type RestoreElementResult = {
  id: string;
  projectId: string | null;
  element: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** For a retired step: the saved step to use in its place, when one was named. */
  replacedBy: string | null;
};

export type UpdateFromShelfBody = {
  /** `take`: the shelf's newest version takes the place of the copy's content. `keep`: the copy stays as it is, and is from then on a copy of the newest version that was changed here. */
  decision: "take" | "keep";
};

export type UpdateFromShelfResult = {
  id: string;
  /** The project it belongs to. Null: shared with every project. */
  projectId: string | null;
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** What the step asks for: `task`, when its text uses it. */
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
    projectId?: string;
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
};

export type TickRunItemBody = {
  /** The step whose output it is. */
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
    projectId?: string;
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
};

export interface ListRepositoryWorkflowsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    projectId?: string;
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
};

export interface ListTasksQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
  /**
   * `live` (the default): every task that is not over, and those that are over and not yet looked at. `ended`: tasks that are over and were put away, newest first, from the archive. Or one state.
   */
  state?: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn" | "live" | "ended";
}

export type ListTasksResult = {
  items: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    /** What it is, in one line. Shown in lists and in terminals. */
    title: string;
    /** What to do, for the agent that takes it. Plain text. */
    details: string;
    /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
    folder: string | null;
    /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
    workflowId: string | null;
    /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
    elementId: string | null;
    /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
    unattended: boolean;
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
};

export type AddTaskBody = {
  /** The project it is added to. Left out: the first project the caller reaches. The workflow, the terminal or the canvas it names must be of that project. */
  projectId?: string;
  /** What it is, in one line. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details?: string;
  /** The folder it is done in. Null: the folder new terminals start in. */
  folder?: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId?: string | null;
  /** Where a new terminal for it works. Null: a working copy of its own where the folder can have one. */
  environment?: string | null;
  /** Who may take it: `{"kind":"any"}`, one terminal, or a new agent terminal on a canvas. */
  taker?: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** Short words of your own. */
  labels?: string[];
  /** Where it came from. Left out: through the API for a program, by hand for the owner. */
  source?: {
    kind: string;
    [key: string]: unknown;
  };
};

export type AddTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type GetTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type ChangeTaskBody = {
  /** What it is, in one line. */
  title?: string;
  /** What to do, for the agent that takes it. Plain text. */
  details?: string;
  /** The folder it is done in. Null: the folder new terminals start in. */
  folder?: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId?: string | null;
  /** Where a new terminal for it works. Null: a working copy of its own where the folder can have one. */
  environment?: string | null;
  /** Who may take it: `{"kind":"any"}`, one terminal, or a new agent terminal on a canvas. */
  taker?: {
    kind: "any";
  } | {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** Short words of your own. */
  labels?: string[];
};

export type ChangeTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type WithdrawTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type AcceptTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type DeclineTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type RetryTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type ClearTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type ReorderTasksBody = {
  /** Tasks that wait, in the order they are to be started. One that is left out keeps its place after these. */
  taskIds: string[];
};

export type ReorderTasksResult = {
  /** The project these are of. */
  projectId: string;
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
};

export type StartTasksBody = {
  /** The task to start. Without one: the next in order that can be taken now. */
  taskId?: string;
  /** Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project. */
  projectId?: string | "all";
};

export type StartTasksResult = {
  started: {
    taskId: string;
    sessionId: string | null;
    ok: boolean;
    reason: string | null;
  }[];
  /** In a sentence: what was started, or why nothing was. */
  says: string;
};

export interface GetQueueQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
}

export type GetQueueResult = {
  /** The project these are of. */
  projectId: string;
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
};

export type ChangeQueueBody = {
  /** The project whose tasks these are about. Left out: the first project. */
  projectId?: string;
  /** How many tasks may be at work at once. */
  limit?: number;
  hold?: boolean;
  automatic?: boolean;
};

export type ChangeQueueResult = {
  /** The project these are of. */
  projectId: string;
  /** How many tasks may be at work at once. */
  limit: number;
  /** True: no new task is started. What is running is not touched. */
  hold: boolean;
  /** True: a task starts by itself when a place is free. Off unless the owner switched it on. */
  automatic: boolean;
  /** The counts in one line. */
  summary: string;
};

export interface GetForYouQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
}

export type GetForYouResult = {
  items: {
    /** Stays the same while the thing waits: its kind and what it is about. */
    id: string;
    kind: string;
    /** What its kind is called, short enough for a chip: `Approval`, `Draft to read`. */
    title: string;
    /** How its kind is to be drawn: `attention` for what waits on the owner to go on, `ok` for what ended well, `neutral` for the rest. */
    tone: "attention" | "ok" | "neutral";
    /** What waits, in a sentence that stands by itself. Where part of it was written by an agent or a program, it is their words. */
    sentence: string;
    /** Whose it is, for the first line of a row: the name of the terminal, or of whoever sent it. */
    who: string;
    /** What waits, in its own words, for the second line of a row: the question itself, the draft's name, how much of a list is left. */
    what: string;
    /** The one thing to do with it, as the words of a button: `Go to terminal`, `Read`. Null where the item has buttons of its own (accept or decline, done or dismiss). */
    action: string | null;
    /** Where it came from: a terminal by name, a program, the library. */
    from: string;
    /** Since when, when that is known. */
    at: string | null;
    /** Where one acts on it: `run:<id>`, `session:<id>`, `task:<id>`, `ask:<id>`, `copy:<id>`, `schedule:<id>`, `review`. */
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
    /** The project it is in. Null for what is of no one project. */
    projectId: string | null;
    elementId: string | null;
  }[];
  waiting: number;
  summary: string;
};

export type AddAskBody = {
  /** The project whose list it is written on. Left out: the first project the caller reaches. */
  projectId?: string;
  /** What is asked, in plain text. */
  text: string;
  source?: {
    kind: string;
    [key: string]: unknown;
  };
};

export type AddAskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
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
};

export type FinishAskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
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
};

export type DismissAskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
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
};

export interface ListRulesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
}

export type ListRulesResult = {
  rules: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added" | "schedule.fired" | "schedule.failed";
    action: {
      kind: string;
      [key: string]: unknown;
    };
    on: boolean;
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
};

export type AddRuleBody = {
  /** The project the rule is of. Left out: the first project. */
  projectId?: string;
  /** What sets it off. */
  event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added" | "schedule.fired" | "schedule.failed";
  /** What it does: `{"kind":"notify"}`, or `{"kind":"run-element","elementId":"…","on":{"kind":"session","sessionId":"…"}}`. */
  action: {
    kind: string;
    [key: string]: unknown;
  };
};

export type AddRuleResult = {
  rules: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added" | "schedule.fired" | "schedule.failed";
    action: {
      kind: string;
      [key: string]: unknown;
    };
    on: boolean;
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
};

export type SwitchRuleBody = {
  on: boolean;
};

export type SwitchRuleResult = {
  rules: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    event: "task.done" | "task.failed" | "task.needs-owner" | "ask.added" | "schedule.fired" | "schedule.failed";
    action: {
      kind: string;
      [key: string]: unknown;
    };
    on: boolean;
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
};

export interface ListProjectsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListProjectsResult = {
  items: {
    id: string;
    workspaceId: string;
    name: string;
    /** A named color, or `#rrggbb`. */
    color: string;
    /** Its place among the projects; lower comes first. */
    order: number;
    labels: {
      [key: string]: string;
    };
    /** The folders its work is in. May be empty. */
    folders: string[];
    /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
    defaultFolder: string | null;
    /** Which server owns its record. Set by the server. */
    home: {
      kind: string;
      [key: string]: unknown;
    };
    state: "open" | "archived";
    /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
    themes?: {
      /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
      light: string | null;
      /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
      dark: string | null;
    };
    fileExtra?: {
      [key: string]: unknown;
    };
    createdAt: string;
    canvases: number;
    /** Its terminals whose shell is running. */
    sessions: number;
    /** How many things wait on the owner in it. */
    waiting: number;
  }[];
  nextCursor: string | null;
};

export type AddProjectBody = {
  /** What it is called. */
  name: string;
  /** A named color, or `#rrggbb`. */
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  /** The folders its work is in. */
  folders?: string[];
  /** Where a new terminal starts when it names no folder. It is added to the folders when it is not among them. */
  defaultFolder?: string | null;
  /** The name of its first canvas. Left out: Main. */
  canvasName?: string;
};

export type AddProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export type GetProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export type ChangeProjectBody = {
  name?: string;
  color?: ("none" | "red" | "orange" | "yellow" | "lime" | "green" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "brown" | "gray") | string;
  folders?: string[];
  defaultFolder?: string | null;
  labels?: {
    [key: string]: string;
  };
  /** The color themes the page is drawn in while this project is looked at. Each that is left out stays as it was. */
  themes?: {
    /** The theme of the light page while this project is looked at: a light one, built-in or a theme file the server has read (another is refused with 400). Null: the page’s own. Left out: as it was. */
    light?: string | null;
    /** The theme of the dark page while this project is looked at: a dark one, built-in or a theme file the server has read (another is refused with 400). Null: the page’s own. Left out: as it was. */
    dark?: string | null;
  };
  /** Put it before this project in the order; null puts it last. */
  before?: string | null;
};

export type ChangeProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export type MoveCanvasToProjectBody = {
  /** The project it moves to. */
  projectId: string;
};

export type MoveCanvasToProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export type ArchiveProjectBody = {
  /** `park`: its terminals leave their canvases and keep running. `end`: their shells are ended for good. */
  sessions?: "park" | "end";
};

export type ArchiveProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export type ReopenProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export interface ExportProjectQuery {
  /**
   * `true`: write it as a template, without pinned notes unless `notes` is true.
   */
  template?: "true" | "false";
  notes?: "true" | "false";
  description?: string;
}

export type ExportProjectResult = {
  /** The file, as text. */
  text: string;
  digest: string;
  fileName: string;
  leftOut: string[];
};

export type ReadProjectFileBody = {
  /** The text of the file. */
  text: string;
};

export type ReadProjectFileResult = {
  /** Names exactly this text. Reading it in names it again: a text that changed since is not read in. */
  digest: string;
  template: boolean;
  name: string;
  description: string;
  /** True when a project here already has that name: another must be chosen. */
  nameTaken: boolean;
  places: {
    name: string;
    hint: string;
    default: boolean;
    terminals: number;
  }[];
  counts: {
    canvases: number;
    terminals: number;
    agents: number;
    frames: number;
    notes: number;
    workflows: number;
    elements: number;
    rules: number;
    schedules: number;
  };
  /** What will be made and what will not be started, each in a sentence. */
  says: string[];
  /** The terminals that were an agent’s, by name. Each is made as a plain shell. */
  agents: string[];
  /** What its steps say they need, by step. */
  needs: {
    of: string;
    needs: string[];
  }[];
  /** Everything an agent would be told: every workflow, step, and the task of every schedule, in full. */
  texts: {
    title: string;
    text: string;
  }[];
  /** The workflows and steps that were shared with every project where the file was written, by name. */
  shared: string[];
  /** What they become here unless the owner says otherwise. */
  sharedDefault: "shared" | "project";
  leftOut: string[];
};

export type ImportProjectFileBody = {
  text: string;
  /** The digest of the text that was read and shown. A text that is not exactly that one is refused. */
  digest: string;
  /** The name of the new project. Left out: the name in the file. */
  name?: string;
  /** Where each place is on this computer: a folder that exists, or null to leave it unset. */
  places?: {
    [key: string]: string | null;
  };
  /** What the file's shared workflows and steps become: shared with every project here, or the new project's own. */
  shared?: "shared" | "project";
  /** Start a fresh shell in each terminal. Off: each is made as a terminal whose shell has not started, with a button to start it. An agent is never started. */
  start?: boolean;
};

export type ImportProjectFileResult = {
  project: {
    id: string;
    workspaceId: string;
    name: string;
    /** A named color, or `#rrggbb`. */
    color: string;
    /** Its place among the projects; lower comes first. */
    order: number;
    labels: {
      [key: string]: string;
    };
    /** The folders its work is in. May be empty. */
    folders: string[];
    /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
    defaultFolder: string | null;
    /** Which server owns its record. Set by the server. */
    home: {
      kind: string;
      [key: string]: unknown;
    };
    state: "open" | "archived";
    /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
    themes?: {
      /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
      light: string | null;
      /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
      dark: string | null;
    };
    fileExtra?: {
      [key: string]: unknown;
    };
    createdAt: string;
    canvases: number;
    /** Its terminals whose shell is running. */
    sessions: number;
    /** How many things wait on the owner in it. */
    waiting: number;
  };
  says: string;
  started: number;
};

export type ListProjectTemplatesResult = {
  templates: {
    id: string;
    name: string;
    description: string;
    from: "app" | "yours";
    canvases: number;
    terminals: number;
  }[];
};

export type GetProjectTemplateResult = {
  text: string;
};

export type SaveProjectTemplateBody = {
  /** Keep the pinned notes in the template. */
  notes?: boolean;
  description?: string;
};

export type SaveProjectTemplateResult = {
  id: string;
  name: string;
  description: string;
  from: "app" | "yours";
  canvases: number;
  terminals: number;
};

export type GetSharingResult = {
  kinds: {
    kind: string;
    title: string;
    /** What the kind is, in a sentence. */
    says: string;
    /** What a new thing of this kind is: shared with every project, or of the project it is made in. */
    default: "shared" | "project";
    things: {
      id: string;
      name: string;
      /** Null: shared with every project. */
      projectId: string | null;
    }[];
  }[];
  /** What is neither shared nor owned because there is one of it for the whole server. */
  perServer: string;
};

export type ChangeSharingBody = {
  kind: string;
  default: "shared" | "project";
};

export type ChangeSharingResult = {
  kinds: {
    kind: string;
    title: string;
    /** What the kind is, in a sentence. */
    says: string;
    /** What a new thing of this kind is: shared with every project, or of the project it is made in. */
    default: "shared" | "project";
    things: {
      id: string;
      name: string;
      /** Null: shared with every project. */
      projectId: string | null;
    }[];
  }[];
  /** What is neither shared nor owned because there is one of it for the whole server. */
  perServer: string;
};

export type MoveSharedThingBody = {
  kind: string;
  id: string;
  /** The project it belongs to from now on. Null: shared with every project. */
  projectId: string | null;
};

export type MoveSharedThingResult = {
  kinds: {
    kind: string;
    title: string;
    /** What the kind is, in a sentence. */
    says: string;
    /** What a new thing of this kind is: shared with every project, or of the project it is made in. */
    default: "shared" | "project";
    things: {
      id: string;
      name: string;
      /** Null: shared with every project. */
      projectId: string | null;
    }[];
  }[];
  /** What is neither shared nor owned because there is one of it for the whole server. */
  perServer: string;
};

export type GetSessionProjectResult = {
  id: string;
  workspaceId: string;
  name: string;
  /** A named color, or `#rrggbb`. */
  color: string;
  /** Its place among the projects; lower comes first. */
  order: number;
  labels: {
    [key: string]: string;
  };
  /** The folders its work is in. May be empty. */
  folders: string[];
  /** One of its folders: where a new terminal starts when it names no folder. Null: where new terminals start anyway. */
  defaultFolder: string | null;
  /** Which server owns its record. Set by the server. */
  home: {
    kind: string;
    [key: string]: unknown;
  };
  state: "open" | "archived";
  /** The color themes the page is drawn in while this project is looked at: one for the light page and one for the dark. Null or left out: the page’s own. */
  themes?: {
    /** The color theme of the light page while this project is looked at: a light one. Null: the page’s own. */
    light: string | null;
    /** The color theme of the dark page while this project is looked at: a dark one. Null: the page’s own. */
    dark: string | null;
  };
  fileExtra?: {
    [key: string]: unknown;
  };
  createdAt: string;
  canvases: number;
  /** Its terminals whose shell is running. */
  sessions: number;
  /** How many things wait on the owner in it. */
  waiting: number;
};

export interface ListSchedulesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListSchedulesResult = {
  items: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    /** What it is called. Shown in lists and beside what it hands in. */
    name: string;
    /** The time of day, on this computer's clock and in its time zone. */
    time: string;
    /** The days of the week it runs on. */
    days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
    /** What it runs: one saved step, or a workflow. */
    what: {
      kind: "element";
      elementId: string;
    } | {
      kind: "workflow";
      workflowId: string;
    };
    /** Where: a terminal, or a new agent terminal on a canvas. */
    where: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "new";
      canvasId: string;
    };
    /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
    folder: string | null;
    /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
    environment: string | null;
    /** What the agent is told to do, as the task of what it runs. Plain text. */
    task: string;
    on: boolean;
    /** Times up to this moment are not its own: it was made, changed or switched on then. */
    since: string;
    /** How its latest time ended. */
    last: {
      /** When this was decided. */
      at: string;
      /** The time it was for. Null when the owner ran it by hand. */
      due: string | null;
      result: "fired" | "late" | "by-hand" | "skipped" | "missed" | "could-not-run";
      /** With `late`: by how many minutes. */
      lateMinutes: number;
      /** With `skipped`, `missed` and `could-not-run`: why, in a sentence. */
      reason: string | null;
      /** The task it became, when it became one. */
      taskId: string | null;
    } | null;
    /** The task of its latest firing. While that one waits or is at work, it does not fire again. */
    taskId: string | null;
    /** Why it cannot run as it is written, when it cannot. Said once on the owner's list, until it is changed or runs again. */
    problem: string | null;
    createdAt: string;
    updatedAt: string;
    /** The schedule in a sentence: when, what and where. */
    says: string;
    /** Its next time. Null while it is switched off. */
    next: string | null;
    /** Its next time in words, on this computer's clock. */
    nextSays: string;
    /** How its latest time ended, in a sentence. */
    lastSays: string;
  }[];
  nextCursor: string | null;
};

export type AddScheduleBody = {
  /** The project the schedule is of. Left out: the first project. */
  projectId?: string;
  /** What it is called. Shown in lists and beside what it hands in. */
  name: string;
  /** The time of day, on this computer's clock and in its time zone. */
  time: string;
  /** The days of the week it runs on. */
  days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  /** What it runs: one saved step, or a workflow. */
  what: {
    kind: "element";
    elementId: string;
  } | {
    kind: "workflow";
    workflowId: string;
  };
  /** Where: a terminal, or a new agent terminal on a canvas. */
  where: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
  folder?: string | null;
  /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
  environment?: string | null;
  /** What the agent is told to do, as the task of what it runs. Plain text. */
  task?: string;
  /** False: it keeps its place in the list and does not run. */
  on?: boolean;
};

export type AddScheduleResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is called. Shown in lists and beside what it hands in. */
  name: string;
  /** The time of day, on this computer's clock and in its time zone. */
  time: string;
  /** The days of the week it runs on. */
  days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  /** What it runs: one saved step, or a workflow. */
  what: {
    kind: "element";
    elementId: string;
  } | {
    kind: "workflow";
    workflowId: string;
  };
  /** Where: a terminal, or a new agent terminal on a canvas. */
  where: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
  folder: string | null;
  /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
  environment: string | null;
  /** What the agent is told to do, as the task of what it runs. Plain text. */
  task: string;
  on: boolean;
  /** Times up to this moment are not its own: it was made, changed or switched on then. */
  since: string;
  /** How its latest time ended. */
  last: {
    /** When this was decided. */
    at: string;
    /** The time it was for. Null when the owner ran it by hand. */
    due: string | null;
    result: "fired" | "late" | "by-hand" | "skipped" | "missed" | "could-not-run";
    /** With `late`: by how many minutes. */
    lateMinutes: number;
    /** With `skipped`, `missed` and `could-not-run`: why, in a sentence. */
    reason: string | null;
    /** The task it became, when it became one. */
    taskId: string | null;
  } | null;
  /** The task of its latest firing. While that one waits or is at work, it does not fire again. */
  taskId: string | null;
  /** Why it cannot run as it is written, when it cannot. Said once on the owner's list, until it is changed or runs again. */
  problem: string | null;
  createdAt: string;
  updatedAt: string;
  /** The schedule in a sentence: when, what and where. */
  says: string;
  /** Its next time. Null while it is switched off. */
  next: string | null;
  /** Its next time in words, on this computer's clock. */
  nextSays: string;
  /** How its latest time ended, in a sentence. */
  lastSays: string;
};

export type ChangeScheduleBody = {
  /** What it is called. Shown in lists and beside what it hands in. */
  name?: string;
  /** The time of day, on this computer's clock and in its time zone. */
  time?: string;
  /** The days of the week it runs on. */
  days?: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  /** What it runs: one saved step, or a workflow. */
  what?: {
    kind: "element";
    elementId: string;
  } | {
    kind: "workflow";
    workflowId: string;
  };
  /** Where: a terminal, or a new agent terminal on a canvas. */
  where?: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
  folder?: string | null;
  /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
  environment?: string | null;
  /** What the agent is told to do, as the task of what it runs. Plain text. */
  task?: string;
  /** False: it keeps its place in the list and does not run. */
  on?: boolean;
};

export type ChangeScheduleResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is called. Shown in lists and beside what it hands in. */
  name: string;
  /** The time of day, on this computer's clock and in its time zone. */
  time: string;
  /** The days of the week it runs on. */
  days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  /** What it runs: one saved step, or a workflow. */
  what: {
    kind: "element";
    elementId: string;
  } | {
    kind: "workflow";
    workflowId: string;
  };
  /** Where: a terminal, or a new agent terminal on a canvas. */
  where: {
    kind: "session";
    sessionId: string;
  } | {
    kind: "new";
    canvasId: string;
  };
  /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
  folder: string | null;
  /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
  environment: string | null;
  /** What the agent is told to do, as the task of what it runs. Plain text. */
  task: string;
  on: boolean;
  /** Times up to this moment are not its own: it was made, changed or switched on then. */
  since: string;
  /** How its latest time ended. */
  last: {
    /** When this was decided. */
    at: string;
    /** The time it was for. Null when the owner ran it by hand. */
    due: string | null;
    result: "fired" | "late" | "by-hand" | "skipped" | "missed" | "could-not-run";
    /** With `late`: by how many minutes. */
    lateMinutes: number;
    /** With `skipped`, `missed` and `could-not-run`: why, in a sentence. */
    reason: string | null;
    /** The task it became, when it became one. */
    taskId: string | null;
  } | null;
  /** The task of its latest firing. While that one waits or is at work, it does not fire again. */
  taskId: string | null;
  /** Why it cannot run as it is written, when it cannot. Said once on the owner's list, until it is changed or runs again. */
  problem: string | null;
  createdAt: string;
  updatedAt: string;
  /** The schedule in a sentence: when, what and where. */
  says: string;
  /** Its next time. Null while it is switched off. */
  next: string | null;
  /** Its next time in words, on this computer's clock. */
  nextSays: string;
  /** How its latest time ended, in a sentence. */
  lastSays: string;
};

export type RunScheduleResult = {
  schedule: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
    /** What it is called. Shown in lists and beside what it hands in. */
    name: string;
    /** The time of day, on this computer's clock and in its time zone. */
    time: string;
    /** The days of the week it runs on. */
    days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
    /** What it runs: one saved step, or a workflow. */
    what: {
      kind: "element";
      elementId: string;
    } | {
      kind: "workflow";
      workflowId: string;
    };
    /** Where: a terminal, or a new agent terminal on a canvas. */
    where: {
      kind: "session";
      sessionId: string;
    } | {
      kind: "new";
      canvasId: string;
    };
    /** For a new terminal: the folder it starts in. Null: the folder new terminals start in. */
    folder: string | null;
    /** For a new terminal: where it works. Null: a working copy of its own where the folder can have one. */
    environment: string | null;
    /** What the agent is told to do, as the task of what it runs. Plain text. */
    task: string;
    on: boolean;
    /** Times up to this moment are not its own: it was made, changed or switched on then. */
    since: string;
    /** How its latest time ended. */
    last: {
      /** When this was decided. */
      at: string;
      /** The time it was for. Null when the owner ran it by hand. */
      due: string | null;
      result: "fired" | "late" | "by-hand" | "skipped" | "missed" | "could-not-run";
      /** With `late`: by how many minutes. */
      lateMinutes: number;
      /** With `skipped`, `missed` and `could-not-run`: why, in a sentence. */
      reason: string | null;
      /** The task it became, when it became one. */
      taskId: string | null;
    } | null;
    /** The task of its latest firing. While that one waits or is at work, it does not fire again. */
    taskId: string | null;
    /** Why it cannot run as it is written, when it cannot. Said once on the owner's list, until it is changed or runs again. */
    problem: string | null;
    createdAt: string;
    updatedAt: string;
    /** The schedule in a sentence: when, what and where. */
    says: string;
    /** Its next time. Null while it is switched off. */
    next: string | null;
    /** Its next time in words, on this computer's clock. */
    nextSays: string;
    /** How its latest time ended, in a sentence. */
    lastSays: string;
  };
  /** The task it became. Null when it did not run. */
  taskId: string | null;
  /** In a sentence: what happened. */
  says: string;
};

export type ProposeSessionTaskBody = {
  /** What it is, in one line. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details?: string;
  /** Short words of your own. */
  labels?: string[];
};

export type ProposeSessionTaskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
  /** What it is, in one line. Shown in lists and in terminals. */
  title: string;
  /** What to do, for the agent that takes it. Plain text. */
  details: string;
  /** The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in. */
  folder: string | null;
  /** The workflow it goes through. Null: it is told as one step, with the details as its task. */
  workflowId: string | null;
  /** The saved step it runs, where it runs one and no workflow. Set by the server for what a schedule adds. */
  elementId: string | null;
  /** True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller. */
  unattended: boolean;
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
};

export type AddSessionAskBody = {
  /** The project whose list it is written on. Left out: the first project the caller reaches. */
  projectId?: string;
  /** What is asked, in plain text. */
  text: string;
};

export type AddSessionAskResult = {
  id: string;
  /** The project it belongs to. Set by the server from where it was made. */
  projectId: string;
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
};

export type GetSessionQueueResult = {
  tasks: {
    id: string;
    title: string;
    state: "proposed" | "queued" | "taken" | "working" | "needs-owner" | "done" | "failed" | "withdrawn";
    mine: boolean;
  }[];
  /** What this session asked of its owner and that still waits. */
  asks: {
    id: string;
    /** The project it belongs to. Set by the server from where it was made. */
    projectId: string;
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
};

export interface GetEnvironmentOffersQuery {
  /**
   * The folder a session would start in. Without one: the folder new sessions start in.
   */
  folder?: string;
}

export type GetEnvironmentOffersResult = {
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
};

export interface ListEnvironmentsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListEnvironmentsResult = {
  items: {
    id: string;
    /** The project it was made in: its session's. Kept when the session is gone. */
    projectId: string;
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
};

export type GetEnvironmentResult = {
  kind: string;
  title: string;
  words: string;
  /** Null for a session that works in the folder it was started in: nothing was prepared for it. */
  environment: {
    id: string;
    /** The project it was made in: its session's. Kept when the session is gone. */
    projectId: string;
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
};

export interface GetEnvironmentDifferenceQuery {
  /**
   * One of the files the environment lists as different.
   */
  file: string;
}

export type GetEnvironmentDifferenceResult = {
  file: string;
  state: "changed" | "added" | "removed";
  /** The difference in the usual form of lines with `+` and `-`. Empty when it is not drawn. */
  text: string;
  /** True when the text was longer than is given. */
  cut: boolean;
  /** Why there is no text: the file is not text, or is too large. */
  notDrawn: string | null;
};

export type GetEnvironmentEndingsResult = {
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
};

export type EndEnvironmentBody = {
  /** One of the choices the environment offers. */
  choice: string;
  /** True after the second question was answered with yes. Without it, a choice that would lose work that exists nowhere else is refused with that question. */
  confirm?: boolean;
};

export type EndEnvironmentResult = {
  /** True when nothing is kept of it in Aubergine. */
  removed: boolean;
  says: string;
};

export type GetSessionEnvironmentResult = {
  kind: string;
  title: string;
  words: string;
  /** Null for a session that works in the folder it was started in: nothing was prepared for it. */
  environment: {
    id: string;
    /** The project it was made in: its session's. Kept when the session is gone. */
    projectId: string;
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
};

export interface GetSessionDifferenceQuery {
  /**
   * One of the files the environment lists as different.
   */
  file: string;
}

export type GetSessionDifferenceResult = {
  file: string;
  state: "changed" | "added" | "removed";
  /** The difference in the usual form of lines with `+` and `-`. Empty when it is not drawn. */
  text: string;
  /** True when the text was longer than is given. */
  cut: boolean;
  /** Why there is no text: the file is not text, or is too large. */
  notDrawn: string | null;
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
    projectId?: string;
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
  host?: {
    kind: string;
    [key: string]: unknown;
  };
  meantFor?: {
    agent: string | null;
    environment: string | null;
    placeUnset: boolean;
  };
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
  /** The fields of the terminal, in order: at most 12, each label once. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
  theme: string | null;
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
  outsideViewers?: number;
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
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
  written: {
    name?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
    summary?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
  };
  suggested: {
    name?: {
      value: string;
      at: string;
    };
    summary?: {
      value: string;
      at: string;
    };
  };
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
  } | null;
};

export type SetTakesMessagesBody = {
  /** True: while "people only", it still takes messages from terminals the owner let message it. It stays closed to reading, to typing and to every token. False: people only closes it to messages as well. */
  takesMessages: boolean;
};

export type SetTakesMessagesResult = {
  id: string;
  projectId: string;
  host?: {
    kind: string;
    [key: string]: unknown;
  };
  meantFor?: {
    agent: string | null;
    environment: string | null;
    placeUnset: boolean;
  };
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
  /** The fields of the terminal, in order: at most 12, each label once. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
  theme: string | null;
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
  outsideViewers?: number;
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
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
  written: {
    name?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
    summary?: {
      by: "owner" | "agent" | "found";
      at: string;
    };
  };
  suggested: {
    name?: {
      value: string;
      at: string;
    };
    summary?: {
      value: string;
      at: string;
    };
  };
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
  } | null;
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    projects: {
      kind: "all";
    } | {
      kind: "projects";
      projectIds: string[];
    };
    projectId: string | null;
    sessionId: string | null;
  }[];
  nextCursor: string | null;
};

export type CreateTokenBody = {
  /** What will use it. */
  name: string;
  /** What it may do. At least one. */
  scopes: ("read" | "canvases:write" | "sessions:write" | "notes:write" | "workflows:write" | "runs:write" | "tasks:write" | "terminal:read" | "terminal:input" | "messages:read" | "messages:write")[];
  /** When it stops working. Never, when neither this nor `expiresInDays` is given. */
  expiresAt?: string;
  /** In how many days it stops working. */
  expiresInDays?: number;
  /** Changes to workflows need your review: with `workflows:write` the token may propose drafts, and may not create or change workflows directly. On unless you switch it off. */
  reviewWorkflowChanges?: boolean;
  /** Which projects it reaches, for every scope, reading included: `{"kind":"all"}` (the default) or `{"kind":"projects","projectIds":[…]}`. Things shared with every project are seen either way. */
  projects?: {
    kind: "all";
  } | {
    kind: "projects";
    projectIds: string[];
  };
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
    projects: {
      kind: "all";
    } | {
      kind: "projects";
      projectIds: string[];
    };
    projectId: string | null;
    sessionId: string | null;
  };
  secret: string;
};

export type RevokeTokenResult = {
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
  projects: {
    kind: "all";
  } | {
    kind: "projects";
    projectIds: string[];
  };
  projectId: string | null;
  sessionId: string | null;
};

export interface ListActivityQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
    caller: "token" | "owner-cli" | "rule" | "schedule" | "owner" | "device" | "pairing";
    byDeviceId?: string | null;
    deviceId?: string | null;
    deviceName?: string | null;
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
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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

export type ListLinksResult = {
  /** The links of the terminal, in the order they are drawn. */
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
};

export type AddLinkBody = {
  /** The address, kept and opened exactly as given. Only http and https. */
  url: string;
  /** A few plain words for it. Left out: told from the address. */
  label?: string;
  /** What it is. Left out: told from the address. */
  kind?: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
};

export type AddLinkResult = {
  link: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  };
  /** False where the owner had set this link in their own words: what was sent is kept beside it as a suggestion, and the link is as it was. */
  kept: boolean;
};

export type ChangeLinkBody = {
  /** Its new label. Left out: as it was. */
  label?: string;
  /** Its new kind. Left out: as it was. */
  kind?: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
};

export type ChangeLinkResult = {
  link: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  };
  /** False where the owner had set this link in their own words: what was sent is kept beside it as a suggestion, and the link is as it was. */
  kept: boolean;
};

export type RemoveLinkResult = {
  /** The links of the terminal, in the order they are drawn. */
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
};

export type ListOwnFieldsResult = {
  /** The fields of the terminal, in order, each saying who set it. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
};

export type SetOwnFieldBody = {
  /** What the value is, in a few words: one line of plain text, without a colon, at most 40 characters. A label that is there already, whatever its capitals, is that field. */
  label: string;
  /** The value: one line of plain text, at most 200 characters. */
  value: string;
};

export type SetOwnFieldResult = {
  /** One field: a label and its value, and who set it. */
  field: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  };
  /** False where the owner set this label: the owner’s value stays, and what was sent is kept on it as a suggestion. */
  kept: boolean;
};

export type RemoveOwnFieldResult = {
  /** The fields of the terminal, in order, each saying who set it. */
  fields: {
    /** What the value is, in a few words: one line of plain text, without a colon. */
    label: unknown & unknown;
    /** The value: one line of plain text. An address in it is shown as a link. */
    value: string;
    /** Who set it: `owner` (the owner, or a program that may change the session) or `agent` (the agent in the terminal, with its own credential). Set by the server. */
    source: "owner" | "agent" | "found";
    /** What the agent in the terminal would set this field to, where the owner set it: kept beside the owner’s value until the owner uses it or changes the field. */
    suggested?: {
      /** The value: one line of plain text. An address in it is shown as a link. */
      value: string;
      at: string;
    };
  }[];
};

export type ListSeenLinksResult = {
  /** Addresses seen in what the terminal showed and not kept as links: the last twenty, newest last. Held in memory only. */
  seen: {
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    label: string;
  }[];
};

export type KeepSeenLinkBody = {
  /** An address from the list of those seen in this terminal. */
  url: string;
};

export type KeepSeenLinkResult = {
  link: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  };
  /** False where the owner had set this link in their own words: what was sent is kept beside it as a suggestion, and the link is as it was. */
  kept: boolean;
};

export type DescribeSessionBody = {
  /** A name for the terminal, after the work. */
  name?: string;
  /** What is being done here, in a few lines. It replaces the summary of the note. */
  summary?: string;
};

export type DescribeSessionResult = {
  /** The name the terminal has now. */
  name: string;
  /** The summary it has now. */
  summary: string;
  /** For each that was sent: whether it was put in place. False where the owner wrote their own: what was sent is kept as a suggestion. */
  kept: {
    name: boolean;
    summary: boolean;
  };
  /** What is still missing from the terminal’s description of itself. */
  missing: ("name" | "summary")[];
};

export type CheckDescribedBody = {
  event: "start" | "stop" | "tool";
  /** For `stop`: the agent is stopping after having been told once already in this turn. */
  again?: boolean;
};

export type CheckDescribedResult = {
  /** What the agent is to be told, or null for nothing. Fixed sentences: nothing stored is in them. */
  say: string | null;
  /** For `stop`: whether the agent is asked to go on for one more turn and set what is missing. Never twice in a turn. */
  hold: boolean;
};

export type LookAgainResult = {
  /** What was found about the terminal’s folder, or null where nothing is known. */
  found: {
    branch: string | null;
    repository: string | null;
    repositoryUrl: string | null;
    pullRequest: {
      /** The address, kept and opened exactly as given. Only http and https. */
      url: string;
      number: number;
      title: string;
      state: "open" | "merged" | "closed" | "draft";
    } | null;
    at: string;
  } | null;
};

export type UseSuggestionBody = {
  what: "name" | "summary" | "link" | "field";
  /** For `link`: which one. */
  linkId?: string;
  /** For `field`: the label of the field. */
  label?: string;
};

export type UseSuggestionResult = {
  /** The links of the terminal, in the order they are drawn. */
  links: {
    id: string;
    /** The address, kept and opened exactly as given. Only http and https. */
    url: string;
    /** What it is, told from the address unless someone said otherwise. */
    kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
    /** A few plain words for it. */
    label: string;
    /** Who added it: the owner, the agent (or a program), or the server by looking. */
    source: "owner" | "agent" | "found";
    by?: string;
    /** When it was added. */
    at: string;
    ownerSet?: boolean;
    suggested?: {
      label: string;
      kind: "pull-request" | "issue" | "branch" | "commit" | "repository" | "ticket" | "chat" | "design" | "document" | "run" | "link";
      at: string;
    };
    fromTerminal?: boolean;
  }[];
};

export type ChangeDescribingBody = {
  /** Whether agents are reminded to describe their terminal. */
  remind: boolean;
};

export type ChangeDescribingResult = {
  /** Whether agents are reminded to describe their terminal. */
  remind: boolean;
};

export type ReportSessionRunBody = {
  type: "done";
  /** The step being finished. Without it: the current one. */
  elementId?: string;
  /** What was done, for whoever comes next. */
  note?: string;
  /** What the step produced, when it declares an output other than a note: for a checklist, `{"items": [{"text": "…"}]}`. */
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
    projectId?: string;
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
};

export type GetSessionBriefResult = {
  text: string;
  kind: "workflow" | "element";
  status: "requested" | "waiting" | "returned";
};

export interface ListSessionDraftsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
          /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
          id: string;
          /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
          kind: string;
          /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
          name: string;
          /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
          instructions: string;
          /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
          ask: string;
          /** For an approval, if you like: what the person should look at before deciding. */
          lookAt: string;
          /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
          doneWhen: string;
          /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
          needs: {
            kind: "mcp" | "command" | "access" | "other";
            name: string;
            note?: string;
          }[];
          /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
          produces: string;
          /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
          origin: {
            kind: string;
            name?: string;
            [key: string]: unknown;
          };
          /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Text added to every step: rules that hold from start to finish. */
    standing?: string;
    /** What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`. */
    inputs?: {
      key: string;
      label: string;
      description?: string;
      required?: boolean;
    }[];
    /** The steps, in the order they are gone through. */
    elements: {
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id?: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind?: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions?: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask?: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt?: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen?: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs?: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces?: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin?: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
  /** One step, for the shelf. */
  element?: {
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id?: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind?: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions?: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask?: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt?: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen?: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs?: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces?: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin?: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
    /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
    id: string;
    /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
    kind: string;
    /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
    name: string;
    /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
    instructions: string;
    /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
    ask: string;
    /** For an approval, if you like: what the person should look at before deciding. */
    lookAt: string;
    /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
    doneWhen: string;
    /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
    needs: {
      kind: "mcp" | "command" | "access" | "other";
      name: string;
      note?: string;
    }[];
    /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
    produces: string;
    /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
    origin: {
      kind: string;
      name?: string;
      [key: string]: unknown;
    };
    /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
        /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
        id: string;
        /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
        kind: string;
        /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
        name: string;
        /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
        instructions: string;
        /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
        ask: string;
        /** For an approval, if you like: what the person should look at before deciding. */
        lookAt: string;
        /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
        doneWhen: string;
        /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
        needs: {
          kind: "mcp" | "command" | "access" | "other";
          name: string;
          note?: string;
        }[];
        /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
        produces: string;
        /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
        origin: {
          kind: string;
          name?: string;
          [key: string]: unknown;
        };
        /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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
      /** Its ID inside its workflow. It stays the same when the step is edited, so that a run can tell which step it is on. You do not write it: it is made for you. */
      id: string;
      /** What sort of step it is: `instructions` (text an agent reads and follows) or `approval` (a place where the run stops until a person has decided). Nothing in a step is run by a computer. */
      kind: string;
      /** What it is called: one line of plain text, shown in lists, in the strip of a run and in terminals. */
      name: string;
      /** What to do, written for whoever does the work and knows nothing else about it. Plain text or Markdown. `{{task}}` and the other inputs of a run are filled in. */
      instructions: string;
      /** For an approval: what the person is asked to decide, in plain text. It is shown to the person beside the buttons; an approval has no instructions for an agent. */
      ask: string;
      /** For an approval, if you like: what the person should look at before deciding. */
      lookAt: string;
      /** One line: how to tell that the step is finished. The agent is told to report done when this is true. */
      doneWhen: string;
      /** What whoever does it must have and Aubergine does not supply: an MCP server, a command, access to something. Shown before a run, with what the agent's setup has; nothing here is checked or installed. */
      needs: {
        kind: "mcp" | "command" | "access" | "other";
        name: string;
        note?: string;
      }[];
      /** What it hands over when it is done: `note` (a few words, which every step can hand over) or `checklist` (a list the next step and you can tick). */
      produces: string;
      /** Where it came from: made here, a template, a file, a draft an agent wrote, a repository. Kept for you to see; nothing is decided by it. */
      origin: {
        kind: string;
        name?: string;
        [key: string]: unknown;
      };
      /** For a copy of a saved step: which step and which of its versions it was copied from, and a mark of the content as copied. From these the editor says whether the copy is unchanged, was changed here, or has a newer version on the shelf. Null for a step that is not such a copy. */
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

export interface ListSessionThemesQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListSessionThemesResult = {
  items: {
    /** What a setting, a menu and a request call it. */
    id: string;
    /** What Settings calls it. */
    name: string;
    /** Whether it is drawn as the light page or the dark one. */
    kind: "light" | "dark";
    /** The built-in theme it is laid over: itself, for a built-in one. */
    base: "light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula";
    /** True for a theme file of the owner’s; false for one that comes with Aubergine. */
    own: boolean;
  }[];
  nextCursor: string | null;
};

export interface ListSessionThemeProposalsQuery {
  /**
   * Which project: its ID, or `all`. Left out: the first project the caller reaches. A request that names a thing of a project (a session, a canvas, a task) is about that project.
   */
  projectId?: string | "all";
  /**
   * How many items to return at most.
   */
  limit?: number;
  /**
   * The `nextCursor` of the page before. Opaque: do not build or change it.
   */
  cursor?: string;
}

export type ListSessionThemeProposalsResult = {
  items: {
    id: string;
    themeId: string;
    /** What the theme would be called. */
    name: string;
    /** Light or dark; null for one that was decided. */
    kind: ("light" | "dark") | null;
    /** The built-in theme it is laid over; null for one that was decided. */
    base: ("light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula") | null;
    /** How many of its colors are its own (0 for one that was decided). */
    colors: number;
    /** What in the file was skipped. Empty for one that was decided. */
    problems: string[];
    /** Why it was proposed, in the words of whoever proposed it. */
    why: string;
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
    /** `waiting` for the owner; `accepted`: it is a theme file now; `declined`: it was not taken, and nothing of it is kept. */
    state: "waiting" | "accepted" | "declined";
    /** When it was proposed, or when it was decided. */
    at: string;
  }[];
  nextCursor: string | null;
};

export type ProposeSessionThemeBody = {
  /** The ID it would have: the name of its file without `.json`. Not the ID of a theme that comes with Aubergine. */
  id: string;
  /** The theme file, as text: the same form as a file in `themes/` (docs/themes.md). It is read as it arrives; one that cannot be read is refused whole and nothing is kept. */
  text: string;
  /** Why it is proposed, in one line, for the owner to read. */
  why?: string;
};

export type ProposeSessionThemeResult = {
  id: string;
  themeId: string;
  /** What the theme would be called. */
  name: string;
  /** Light or dark; null for one that was decided. */
  kind: ("light" | "dark") | null;
  /** The built-in theme it is laid over; null for one that was decided. */
  base: ("light" | "high-contrast-light" | "solarized-light" | "gruvbox-light" | "dark" | "high-contrast-dark" | "solarized-dark" | "gruvbox-dark" | "nord" | "dracula") | null;
  /** How many of its colors are its own (0 for one that was decided). */
  colors: number;
  /** What in the file was skipped. Empty for one that was decided. */
  problems: string[];
  /** Why it was proposed, in the words of whoever proposed it. */
  why: string;
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
  /** `waiting` for the owner; `accepted`: it is a theme file now; `declined`: it was not taken, and nothing of it is kept. */
  state: "waiting" | "accepted" | "declined";
  /** When it was proposed, or when it was decided. */
  at: string;
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
  openSessionOnDesktop: { method: 'POST', path: '/v1/sessions/{sessionId}/desktop', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  changeDesktopSettings: { method: 'PUT', path: '/v1/settings/desktop', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  changeAppearance: { method: 'PUT', path: '/v1/settings/appearance', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  readThemes: { method: 'POST', path: '/v1/settings/themes/read', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  readStylesheet: { method: 'POST', path: '/v1/settings/stylesheet/read', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
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
  approveRun: { method: 'POST', path: '/v1/runs/{runId}/approve', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  sendBackRun: { method: 'POST', path: '/v1/runs/{runId}/send-back', params: ["runId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  startRuns: { method: 'POST', path: '/v1/workflows/{workflowId}/runs', params: ["workflowId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "runs:write" } },
  getBoard: { method: 'GET', path: '/v1/board', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
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
  listThemes: { method: 'GET', path: '/v1/themes', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  listThemeProposals: { method: 'GET', path: '/v1/themes/proposals', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  proposeTheme: { method: 'POST', path: '/v1/themes/proposals', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "workflows:write" } },
  acceptThemeProposal: { method: 'POST', path: '/v1/themes/proposals/{proposalId}/accept', params: ["proposalId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  declineThemeProposal: { method: 'DELETE', path: '/v1/themes/proposals/{proposalId}', params: ["proposalId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listLibrarySources: { method: 'GET', path: '/v1/library/sources', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  addLibrarySource: { method: 'POST', path: '/v1/library/sources', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  removeLibrarySource: { method: 'DELETE', path: '/v1/library/sources/{sourceId}', params: ["sourceId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  refreshLibrarySource: { method: 'POST', path: '/v1/library/sources/{sourceId}/refresh', params: ["sourceId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listLibraryItems: { method: 'GET', path: '/v1/library/items', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getLibraryItem: { method: 'GET', path: '/v1/library/sources/{sourceId}/items/{itemId}', params: ["sourceId", "itemId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  requestLibraryInstall: { method: 'POST', path: '/v1/library/installs', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "workflows:write" } },
  listLibraryRequests: { method: 'GET', path: '/v1/library/requests', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getLibraryRequest: { method: 'GET', path: '/v1/library/requests/{requestId}', params: ["requestId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  discardLibraryRequest: { method: 'DELETE', path: '/v1/library/requests/{requestId}', params: ["requestId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  acceptLibraryRequest: { method: 'POST', path: '/v1/library/requests/{requestId}/accept', params: ["requestId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listLibraryInstalled: { method: 'GET', path: '/v1/library/installed', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getLibraryInstalledUsage: { method: 'GET', path: '/v1/library/installed/{installedId}/usage', params: ["installedId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  removeLibraryInstalled: { method: 'DELETE', path: '/v1/library/installed/{installedId}', params: ["installedId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
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
  listTasks: { method: 'GET', path: '/v1/tasks', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  addTask: { method: 'POST', path: '/v1/tasks', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "tasks:write" } },
  getTask: { method: 'GET', path: '/v1/tasks/{taskId}', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  changeTask: { method: 'PATCH', path: '/v1/tasks/{taskId}', params: ["taskId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  withdrawTask: { method: 'POST', path: '/v1/tasks/{taskId}/withdraw', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "tasks:write" } },
  acceptTask: { method: 'POST', path: '/v1/tasks/{taskId}/accept', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  declineTask: { method: 'POST', path: '/v1/tasks/{taskId}/decline', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  retryTask: { method: 'POST', path: '/v1/tasks/{taskId}/again', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  clearTask: { method: 'POST', path: '/v1/tasks/{taskId}/clear', params: ["taskId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  reorderTasks: { method: 'PUT', path: '/v1/tasks/order', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  startTasks: { method: 'POST', path: '/v1/tasks/start', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getQueue: { method: 'GET', path: '/v1/queue', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  changeQueue: { method: 'PUT', path: '/v1/queue', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getForYou: { method: 'GET', path: '/v1/for-you', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  addAsk: { method: 'POST', path: '/v1/asks', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'token', scope: "tasks:write" } },
  finishAsk: { method: 'POST', path: '/v1/asks/{askId}/done', params: ["askId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  dismissAsk: { method: 'POST', path: '/v1/asks/{askId}/dismiss', params: ["askId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listRules: { method: 'GET', path: '/v1/rules', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  addRule: { method: 'POST', path: '/v1/rules', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  switchRule: { method: 'PATCH', path: '/v1/rules/{ruleId}', params: ["ruleId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  removeRule: { method: 'DELETE', path: '/v1/rules/{ruleId}', params: ["ruleId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listProjects: { method: 'GET', path: '/v1/projects', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  addProject: { method: 'POST', path: '/v1/projects', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'browser', scope: null } },
  getProject: { method: 'GET', path: '/v1/projects/{projectId}', params: ["projectId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  changeProject: { method: 'PATCH', path: '/v1/projects/{projectId}', params: ["projectId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  removeProject: { method: 'DELETE', path: '/v1/projects/{projectId}', params: ["projectId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  moveCanvasToProject: { method: 'POST', path: '/v1/canvases/{canvasId}/project', params: ["canvasId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  archiveProject: { method: 'POST', path: '/v1/projects/{projectId}/archive', params: ["projectId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  reopenProject: { method: 'POST', path: '/v1/projects/{projectId}/reopen', params: ["projectId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  exportProject: { method: 'GET', path: '/v1/projects/{projectId}/file', params: ["projectId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  readProjectFile: { method: 'POST', path: '/v1/project-files/read', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  importProjectFile: { method: 'POST', path: '/v1/project-files/import', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listProjectTemplates: { method: 'GET', path: '/v1/project-templates', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getProjectTemplate: { method: 'GET', path: '/v1/project-templates/{templateId}', params: ["templateId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  saveProjectTemplate: { method: 'POST', path: '/v1/projects/{projectId}/template', params: ["projectId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getSharing: { method: 'GET', path: '/v1/sharing', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  changeSharing: { method: 'PUT', path: '/v1/sharing', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  moveSharedThing: { method: 'POST', path: '/v1/sharing/move', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getSessionProject: { method: 'GET', path: '/v1/sessions/{sessionId}/project', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSchedules: { method: 'GET', path: '/v1/schedules', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  addSchedule: { method: 'POST', path: '/v1/schedules', params: [], hasBody: true, paged: false, idempotent: true, stream: false, access: { who: 'browser', scope: null } },
  changeSchedule: { method: 'PATCH', path: '/v1/schedules/{scheduleId}', params: ["scheduleId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  removeSchedule: { method: 'DELETE', path: '/v1/schedules/{scheduleId}', params: ["scheduleId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  runSchedule: { method: 'POST', path: '/v1/schedules/{scheduleId}/run', params: ["scheduleId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  proposeSessionTask: { method: 'POST', path: '/v1/sessions/{sessionId}/tasks', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  addSessionAsk: { method: 'POST', path: '/v1/sessions/{sessionId}/asks', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  getSessionQueue: { method: 'GET', path: '/v1/sessions/{sessionId}/queue', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  getEnvironmentOffers: { method: 'GET', path: '/v1/environments/offers', params: [], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  listEnvironments: { method: 'GET', path: '/v1/environments', params: [], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getEnvironment: { method: 'GET', path: '/v1/environments/{environmentId}', params: ["environmentId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "read" } },
  getEnvironmentDifference: { method: 'GET', path: '/v1/environments/{environmentId}/difference', params: ["environmentId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getEnvironmentEndings: { method: 'GET', path: '/v1/environments/{environmentId}/endings', params: ["environmentId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  endEnvironment: { method: 'POST', path: '/v1/environments/{environmentId}/end', params: ["environmentId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  getSessionEnvironment: { method: 'GET', path: '/v1/sessions/{sessionId}/environment', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "read" } },
  getSessionDifference: { method: 'GET', path: '/v1/sessions/{sessionId}/environment/difference', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:read" } },
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
  listLinks: { method: 'GET', path: '/v1/sessions/{sessionId}/links', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "read" } },
  addLink: { method: 'POST', path: '/v1/sessions/{sessionId}/links', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "notes:write" } },
  changeLink: { method: 'PATCH', path: '/v1/sessions/{sessionId}/links/{linkId}', params: ["sessionId", "linkId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "notes:write" } },
  removeLink: { method: 'DELETE', path: '/v1/sessions/{sessionId}/links/{linkId}', params: ["sessionId", "linkId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "notes:write" } },
  listOwnFields: { method: 'GET', path: '/v1/sessions/{sessionId}/fields', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  setOwnField: { method: 'PUT', path: '/v1/sessions/{sessionId}/fields', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  removeOwnField: { method: 'DELETE', path: '/v1/sessions/{sessionId}/fields/{label}', params: ["sessionId", "label"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSeenLinks: { method: 'GET', path: '/v1/sessions/{sessionId}/links/seen', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'token', scope: "terminal:read" } },
  keepSeenLink: { method: 'POST', path: '/v1/sessions/{sessionId}/links/keep', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  describeSession: { method: 'PUT', path: '/v1/sessions/{sessionId}/described', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  checkDescribed: { method: 'POST', path: '/v1/sessions/{sessionId}/described/check', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  lookAgain: { method: 'POST', path: '/v1/sessions/{sessionId}/found', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  useSuggestion: { method: 'POST', path: '/v1/sessions/{sessionId}/described/use', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  changeDescribing: { method: 'PUT', path: '/v1/settings/describing', params: [], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'browser', scope: null } },
  reportSessionRun: { method: 'POST', path: '/v1/sessions/{sessionId}/run/report', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: "runs:write" } },
  getSessionBrief: { method: 'GET', path: '/v1/sessions/{sessionId}/brief', params: ["sessionId"], hasBody: false, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSessionDrafts: { method: 'GET', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  proposeSessionDraft: { method: 'POST', path: '/v1/sessions/{sessionId}/drafts', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSessionThemes: { method: 'GET', path: '/v1/sessions/{sessionId}/themes', params: ["sessionId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  listSessionThemeProposals: { method: 'GET', path: '/v1/sessions/{sessionId}/theme-proposals', params: ["sessionId"], hasBody: false, paged: true, idempotent: false, stream: false, access: { who: 'session', scope: null } },
  proposeSessionTheme: { method: 'POST', path: '/v1/sessions/{sessionId}/theme-proposals', params: ["sessionId"], hasBody: true, paged: false, idempotent: false, stream: false, access: { who: 'session', scope: null } },
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
   * Rename or tag a session, change its fields or its color theme, or change its pinned note.
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
   * Open a session in the owner's terminal application.
   *
   * `POST /v1/sessions/{sessionId}/desktop`. Signed-in browser only: no API token may call this.
   */
  openSessionOnDesktop(args: { sessionId: string } & CallOptions): Promise<OpenSessionOnDesktopResult>;
  /**
   * Say whether new terminals made in the page also open on the desktop.
   *
   * `PUT /v1/settings/desktop`. Signed-in browser only: no API token may call this.
   */
  changeDesktopSettings(args: { body: ChangeDesktopSettingsBody } & CallOptions): Promise<ChangeDesktopSettingsResult>;
  /**
   * Choose how the page looks: light, dark or matching the system, each one's color theme, the default theme of terminals, a terminal's font and cursor.
   *
   * `PUT /v1/settings/appearance`. Signed-in browser only: no API token may call this.
   */
  changeAppearance(args: { body: ChangeAppearanceBody } & CallOptions): Promise<ChangeAppearanceResult>;
  /**
   * Read the owner's theme files again.
   *
   * `POST /v1/settings/themes/read`. Signed-in browser only: no API token may call this.
   */
  readThemes(args?: CallOptions): Promise<ReadThemesResult>;
  /**
   * Read the owner's own stylesheet again.
   *
   * `POST /v1/settings/stylesheet/read`. Signed-in browser only: no API token may call this.
   */
  readStylesheet(args?: CallOptions): Promise<ReadStylesheetResult>;
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
   * Approve the step a run waits on.
   *
   * `POST /v1/runs/{runId}/approve`. Signed-in browser only: no API token may call this.
   */
  approveRun(args: { runId: string; body: ApproveRunBody } & CallOptions): Promise<ApproveRunResult>;
  /**
   * Send a run that waits for approval back to an earlier step.
   *
   * `POST /v1/runs/{runId}/send-back`. Signed-in browser only: no API token may call this.
   */
  sendBackRun(args: { runId: string; body: SendBackRunBody } & CallOptions): Promise<SendBackRunResult>;
  /**
   * Start a workflow on several sessions at once.
   *
   * `POST /v1/workflows/{workflowId}/runs`. Scope: `runs:write`.
   */
  startRuns(args: { workflowId: string; body: StartRunsBody } & CallOptions): Promise<StartRunsResult>;
  /**
   * The board: every run that is going, by workflow and step.
   *
   * `GET /v1/board`. Scope: `read`.
   */
  getBoard(args?: { query?: GetBoardQuery } & CallOptions): Promise<GetBoardResult>;
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
   * Propose a workflow or a step as a draft.
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
   * Ask the agent in a session to write a workflow or a step.
   *
   * `POST /v1/draft-requests`. Signed-in browser only: no API token may call this.
   */
  requestDraft(args: { body: RequestDraftBody } & CallOptions): Promise<RequestDraftResult>;
  /**
   * List the color themes there are.
   *
   * `GET /v1/themes`. Scope: `read`.
   */
  listThemes(args?: { query?: ListThemesQuery } & CallOptions): Promise<ListThemesResult>;
  /**
   * List the color themes proposed, and what became of the latest.
   *
   * `GET /v1/themes/proposals`. Scope: `read`.
   */
  listThemeProposals(args?: { query?: ListThemeProposalsQuery } & CallOptions): Promise<ListThemeProposalsResult>;
  /**
   * Propose a color theme.
   *
   * `POST /v1/themes/proposals`. Scope: `workflows:write`.
   */
  proposeTheme(args: { body: ProposeThemeBody } & CallOptions): Promise<ProposeThemeResult>;
  /**
   * Accept a proposed color theme.
   *
   * `POST /v1/themes/proposals/{proposalId}/accept`. Signed-in browser only: no API token may call this.
   */
  acceptThemeProposal(args: { proposalId: string; body: AcceptThemeProposalBody } & CallOptions): Promise<AcceptThemeProposalResult>;
  /**
   * Decline a proposed color theme.
   *
   * `DELETE /v1/themes/proposals/{proposalId}`. Signed-in browser only: no API token may call this.
   */
  declineThemeProposal(args: { proposalId: string } & CallOptions): Promise<void>;
  /**
   * List the sources of the library.
   *
   * `GET /v1/library/sources`. Scope: `read`.
   */
  listLibrarySources(args?: { query?: ListLibrarySourcesQuery } & CallOptions): Promise<ListLibrarySourcesResult>;
  /**
   * Add a source.
   *
   * `POST /v1/library/sources`. Signed-in browser only: no API token may call this.
   */
  addLibrarySource(args: { body: AddLibrarySourceBody } & CallOptions): Promise<AddLibrarySourceResult>;
  /**
   * Remove a source.
   *
   * `DELETE /v1/library/sources/{sourceId}`. Signed-in browser only: no API token may call this.
   */
  removeLibrarySource(args: { sourceId: string } & CallOptions): Promise<void>;
  /**
   * Read a source again.
   *
   * `POST /v1/library/sources/{sourceId}/refresh`. Signed-in browser only: no API token may call this.
   */
  refreshLibrarySource(args: { sourceId: string } & CallOptions): Promise<RefreshLibrarySourceResult>;
  /**
   * List what the sources offer.
   *
   * `GET /v1/library/items`. Scope: `read`.
   */
  listLibraryItems(args?: CallOptions): Promise<ListLibraryItemsResult>;
  /**
   * One item, with what it says.
   *
   * `GET /v1/library/sources/{sourceId}/items/{itemId}`. Scope: `read`.
   */
  getLibraryItem(args: { sourceId: string; itemId: string } & CallOptions): Promise<GetLibraryItemResult>;
  /**
   * Ask for an item to be installed, or brought up to date.
   *
   * `POST /v1/library/installs`. Scope: `workflows:write`.
   */
  requestLibraryInstall(args: { body: RequestLibraryInstallBody } & CallOptions): Promise<RequestLibraryInstallResult>;
  /**
   * The installs that wait for the owner.
   *
   * `GET /v1/library/requests`. Signed-in browser only: no API token may call this.
   */
  listLibraryRequests(args?: CallOptions): Promise<ListLibraryRequestsResult>;
  /**
   * One waiting install, with everything its reviewer reads.
   *
   * `GET /v1/library/requests/{requestId}`. Signed-in browser only: no API token may call this.
   */
  getLibraryRequest(args: { requestId: string } & CallOptions): Promise<GetLibraryRequestResult>;
  /**
   * Discard a waiting install.
   *
   * `DELETE /v1/library/requests/{requestId}`. Signed-in browser only: no API token may call this.
   */
  discardLibraryRequest(args: { requestId: string } & CallOptions): Promise<void>;
  /**
   * Install what a request asks for.
   *
   * `POST /v1/library/requests/{requestId}/accept`. Signed-in browser only: no API token may call this.
   */
  acceptLibraryRequest(args: { requestId: string; body: AcceptLibraryRequestBody } & CallOptions): Promise<AcceptLibraryRequestResult>;
  /**
   * What was installed from the library.
   *
   * `GET /v1/library/installed`. Scope: `read`.
   */
  listLibraryInstalled(args?: CallOptions): Promise<ListLibraryInstalledResult>;
  /**
   * Where an installed item is used.
   *
   * `GET /v1/library/installed/{installedId}/usage`. Scope: `read`.
   */
  getLibraryInstalledUsage(args: { installedId: string } & CallOptions): Promise<GetLibraryInstalledUsageResult>;
  /**
   * Remove what was installed.
   *
   * `DELETE /v1/library/installed/{installedId}`. Signed-in browser only: no API token may call this.
   */
  removeLibraryInstalled(args: { installedId: string } & CallOptions): Promise<void>;
  /**
   * List the saved steps.
   *
   * `GET /v1/elements`. Scope: `read`.
   */
  listElements(args?: { query?: ListElementsQuery } & CallOptions): Promise<ListElementsResult>;
  /**
   * Put a saved step.
   *
   * `POST /v1/elements`. Scope: `workflows:write`.
   */
  createElement(args: { body: CreateElementBody } & CallOptions): Promise<CreateElementResult>;
  /**
   * Change a saved step.
   *
   * `PATCH /v1/elements/{elementId}`. Scope: `workflows:write`.
   */
  updateElement(args: { elementId: string; body: UpdateElementBody } & CallOptions): Promise<UpdateElementResult>;
  /**
   * Take a step off the shelf.
   *
   * `DELETE /v1/elements/{elementId}`. Scope: `workflows:write`.
   */
  removeElement(args: { elementId: string } & CallOptions): Promise<void>;
  /**
   * Duplicate a saved step.
   *
   * `POST /v1/elements/{elementId}/copy`. Scope: `workflows:write`.
   */
  copyElement(args: { elementId: string } & CallOptions): Promise<CopyElementResult>;
  /**
   * The versions of a saved step.
   *
   * `GET /v1/elements/{elementId}/versions`. Scope: `read`.
   */
  listElementVersions(args: { elementId: string; query?: ListElementVersionsQuery } & CallOptions): Promise<ListElementVersionsResult>;
  /**
   * Where a saved step is used.
   *
   * `GET /v1/elements/{elementId}/usage`. Scope: `read`.
   */
  getElementUsage(args: { elementId: string } & CallOptions): Promise<GetElementUsageResult>;
  /**
   * Retire a saved step.
   *
   * `POST /v1/elements/{elementId}/retire`. Signed-in browser only: no API token may call this.
   */
  retireElement(args: { elementId: string; body?: RetireElementBody } & CallOptions): Promise<RetireElementResult>;
  /**
   * Bring a retired saved step back.
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
   * Run one step by itself, on a session.
   *
   * `POST /v1/elements/{elementId}/run`. Scope: `runs:write`.
   */
  runElement(args: { elementId: string; body: RunElementBody } & CallOptions): Promise<RunElementResult>;
  /**
   * Tick an item of what a step produced.
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
   * List the tasks of the queue.
   *
   * `GET /v1/tasks`. Scope: `read`.
   */
  listTasks(args?: { query?: ListTasksQuery } & CallOptions): Promise<ListTasksResult>;
  /**
   * Add a task to the queue.
   *
   * `POST /v1/tasks`. Scope: `tasks:write`.
   */
  addTask(args: { body: AddTaskBody } & CallOptions): Promise<AddTaskResult>;
  /**
   * Read one task.
   *
   * `GET /v1/tasks/{taskId}`. Scope: `read`.
   */
  getTask(args: { taskId: string } & CallOptions): Promise<GetTaskResult>;
  /**
   * Change a task that has not started.
   *
   * `PATCH /v1/tasks/{taskId}`. Signed-in browser only: no API token may call this.
   */
  changeTask(args: { taskId: string; body: ChangeTaskBody } & CallOptions): Promise<ChangeTaskResult>;
  /**
   * Take a task back before it starts.
   *
   * `POST /v1/tasks/{taskId}/withdraw`. Scope: `tasks:write`.
   */
  withdrawTask(args: { taskId: string } & CallOptions): Promise<WithdrawTaskResult>;
  /**
   * Say yes to a proposed task.
   *
   * `POST /v1/tasks/{taskId}/accept`. Signed-in browser only: no API token may call this.
   */
  acceptTask(args: { taskId: string } & CallOptions): Promise<AcceptTaskResult>;
  /**
   * Say no to a proposed task.
   *
   * `POST /v1/tasks/{taskId}/decline`. Signed-in browser only: no API token may call this.
   */
  declineTask(args: { taskId: string } & CallOptions): Promise<DeclineTaskResult>;
  /**
   * Put a failed task back among those that wait.
   *
   * `POST /v1/tasks/{taskId}/again`. Signed-in browser only: no API token may call this.
   */
  retryTask(args: { taskId: string } & CallOptions): Promise<RetryTaskResult>;
  /**
   * Put away a task that is over.
   *
   * `POST /v1/tasks/{taskId}/clear`. Signed-in browser only: no API token may call this.
   */
  clearTask(args: { taskId: string } & CallOptions): Promise<ClearTaskResult>;
  /**
   * Say in which order the waiting tasks start.
   *
   * `PUT /v1/tasks/order`. Signed-in browser only: no API token may call this.
   */
  reorderTasks(args: { body: ReorderTasksBody } & CallOptions): Promise<ReorderTasksResult>;
  /**
   * Start the next task, or one named.
   *
   * `POST /v1/tasks/start`. Signed-in browser only: no API token may call this.
   */
  startTasks(args?: { body?: StartTasksBody } & CallOptions): Promise<StartTasksResult>;
  /**
   * How tasks are started, and how the queue stands.
   *
   * `GET /v1/queue`. Scope: `read`.
   */
  getQueue(args?: { query?: GetQueueQuery } & CallOptions): Promise<GetQueueResult>;
  /**
   * Change the limit, hold new starts, or switch automatic starting.
   *
   * `PUT /v1/queue`. Signed-in browser only: no API token may call this.
   */
  changeQueue(args: { body: ChangeQueueBody } & CallOptions): Promise<ChangeQueueResult>;
  /**
   * What waits on the owner.
   *
   * `GET /v1/for-you`. Scope: `read`.
   */
  getForYou(args?: { query?: GetForYouQuery } & CallOptions): Promise<GetForYouResult>;
  /**
   * Ask the owner for something, in writing.
   *
   * `POST /v1/asks`. Scope: `tasks:write`.
   */
  addAsk(args: { body: AddAskBody } & CallOptions): Promise<AddAskResult>;
  /**
   * Mark something written on the list as done.
   *
   * `POST /v1/asks/{askId}/done`. Signed-in browser only: no API token may call this.
   */
  finishAsk(args: { askId: string } & CallOptions): Promise<FinishAskResult>;
  /**
   * Take something written off the list without doing it.
   *
   * `POST /v1/asks/{askId}/dismiss`. Signed-in browser only: no API token may call this.
   */
  dismissAsk(args: { askId: string } & CallOptions): Promise<DismissAskResult>;
  /**
   * List the rules.
   *
   * `GET /v1/rules`. Signed-in browser only: no API token may call this.
   */
  listRules(args?: { query?: ListRulesQuery } & CallOptions): Promise<ListRulesResult>;
  /**
   * Write a rule.
   *
   * `POST /v1/rules`. Signed-in browser only: no API token may call this.
   */
  addRule(args: { body: AddRuleBody } & CallOptions): Promise<AddRuleResult>;
  /**
   * Switch a rule on or off.
   *
   * `PATCH /v1/rules/{ruleId}`. Signed-in browser only: no API token may call this.
   */
  switchRule(args: { ruleId: string; body: SwitchRuleBody } & CallOptions): Promise<SwitchRuleResult>;
  /**
   * Remove a rule.
   *
   * `DELETE /v1/rules/{ruleId}`. Signed-in browser only: no API token may call this.
   */
  removeRule(args: { ruleId: string } & CallOptions): Promise<void>;
  /**
   * List the projects.
   *
   * `GET /v1/projects`. Scope: `read`.
   */
  listProjects(args?: { query?: ListProjectsQuery } & CallOptions): Promise<ListProjectsResult>;
  /**
   * Make a project.
   *
   * `POST /v1/projects`. Signed-in browser only: no API token may call this.
   */
  addProject(args: { body: AddProjectBody } & CallOptions): Promise<AddProjectResult>;
  /**
   * One project.
   *
   * `GET /v1/projects/{projectId}`. Scope: `read`.
   */
  getProject(args: { projectId: string } & CallOptions): Promise<GetProjectResult>;
  /**
   * Change a project: its name, color, folders, color themes, or its place in the order.
   *
   * `PATCH /v1/projects/{projectId}`. Signed-in browser only: no API token may call this.
   */
  changeProject(args: { projectId: string; body: ChangeProjectBody } & CallOptions): Promise<ChangeProjectResult>;
  /**
   * Remove a project for good.
   *
   * `DELETE /v1/projects/{projectId}`. Signed-in browser only: no API token may call this.
   */
  removeProject(args: { projectId: string } & CallOptions): Promise<void>;
  /**
   * Move a canvas to another project.
   *
   * `POST /v1/canvases/{canvasId}/project`. Signed-in browser only: no API token may call this.
   */
  moveCanvasToProject(args: { canvasId: string; body: MoveCanvasToProjectBody } & CallOptions): Promise<MoveCanvasToProjectResult>;
  /**
   * Archive a project.
   *
   * `POST /v1/projects/{projectId}/archive`. Signed-in browser only: no API token may call this.
   */
  archiveProject(args: { projectId: string; body?: ArchiveProjectBody } & CallOptions): Promise<ArchiveProjectResult>;
  /**
   * Reopen an archived project.
   *
   * `POST /v1/projects/{projectId}/reopen`. Signed-in browser only: no API token may call this.
   */
  reopenProject(args: { projectId: string } & CallOptions): Promise<ReopenProjectResult>;
  /**
   * Write a project out as a file.
   *
   * `GET /v1/projects/{projectId}/file`. Signed-in browser only: no API token may call this.
   */
  exportProject(args: { projectId: string; query?: ExportProjectQuery } & CallOptions): Promise<ExportProjectResult>;
  /**
   * Read a project file, and make nothing.
   *
   * `POST /v1/project-files/read`. Signed-in browser only: no API token may call this.
   */
  readProjectFile(args: { body: ReadProjectFileBody } & CallOptions): Promise<ReadProjectFileResult>;
  /**
   * Make a project from a file that was read.
   *
   * `POST /v1/project-files/import`. Signed-in browser only: no API token may call this.
   */
  importProjectFile(args: { body: ImportProjectFileBody } & CallOptions): Promise<ImportProjectFileResult>;
  /**
   * List the templates a project can be made from.
   *
   * `GET /v1/project-templates`. Signed-in browser only: no API token may call this.
   */
  listProjectTemplates(args?: CallOptions): Promise<ListProjectTemplatesResult>;
  /**
   * A template's file, as text.
   *
   * `GET /v1/project-templates/{templateId}`. Signed-in browser only: no API token may call this.
   */
  getProjectTemplate(args: { templateId: string } & CallOptions): Promise<GetProjectTemplateResult>;
  /**
   * Save a project as a template.
   *
   * `POST /v1/projects/{projectId}/template`. Signed-in browser only: no API token may call this.
   */
  saveProjectTemplate(args: { projectId: string; body?: SaveProjectTemplateBody } & CallOptions): Promise<SaveProjectTemplateResult>;
  /**
   * What is shared between projects.
   *
   * `GET /v1/sharing`. Signed-in browser only: no API token may call this.
   */
  getSharing(args?: CallOptions): Promise<GetSharingResult>;
  /**
   * Say what a new thing of a kind is: shared, or of the project it is made in.
   *
   * `PUT /v1/sharing`. Signed-in browser only: no API token may call this.
   */
  changeSharing(args: { body: ChangeSharingBody } & CallOptions): Promise<ChangeSharingResult>;
  /**
   * Make one thing belong to a project, or to all.
   *
   * `POST /v1/sharing/move`. Signed-in browser only: no API token may call this.
   */
  moveSharedThing(args: { body: MoveSharedThingBody } & CallOptions): Promise<MoveSharedThingResult>;
  /**
   * The project this session is in.
   *
   * `GET /v1/sessions/{sessionId}/project`. A session's own token.
   */
  getSessionProject(args: { sessionId: string } & CallOptions): Promise<GetSessionProjectResult>;
  /**
   * List the schedules.
   *
   * `GET /v1/schedules`. Scope: `read`.
   */
  listSchedules(args?: { query?: ListSchedulesQuery } & CallOptions): Promise<ListSchedulesResult>;
  /**
   * Make a schedule.
   *
   * `POST /v1/schedules`. Signed-in browser only: no API token may call this.
   */
  addSchedule(args: { body: AddScheduleBody } & CallOptions): Promise<AddScheduleResult>;
  /**
   * Change a schedule, or switch it on or off.
   *
   * `PATCH /v1/schedules/{scheduleId}`. Signed-in browser only: no API token may call this.
   */
  changeSchedule(args: { scheduleId: string; body: ChangeScheduleBody } & CallOptions): Promise<ChangeScheduleResult>;
  /**
   * Remove a schedule.
   *
   * `DELETE /v1/schedules/{scheduleId}`. Signed-in browser only: no API token may call this.
   */
  removeSchedule(args: { scheduleId: string } & CallOptions): Promise<void>;
  /**
   * Run a schedule now.
   *
   * `POST /v1/schedules/{scheduleId}/run`. Signed-in browser only: no API token may call this.
   */
  runSchedule(args: { scheduleId: string } & CallOptions): Promise<RunScheduleResult>;
  /**
   * Propose a task for the queue.
   *
   * `POST /v1/sessions/{sessionId}/tasks`. A session's own token.
   */
  proposeSessionTask(args: { sessionId: string; body: ProposeSessionTaskBody } & CallOptions): Promise<ProposeSessionTaskResult>;
  /**
   * Ask the owner for something, in writing.
   *
   * `POST /v1/sessions/{sessionId}/asks`. A session's own token.
   */
  addSessionAsk(args: { sessionId: string; body: AddSessionAskBody } & CallOptions): Promise<AddSessionAskResult>;
  /**
   * What is in the queue, and what the session itself proposed and asked.
   *
   * `GET /v1/sessions/{sessionId}/queue`. A session's own token.
   */
  getSessionQueue(args: { sessionId: string } & CallOptions): Promise<GetSessionQueueResult>;
  /**
   * Where a new session in a folder could work.
   *
   * `GET /v1/environments/offers`. Signed-in browser only: no API token may call this.
   */
  getEnvironmentOffers(args?: { query?: GetEnvironmentOffersQuery } & CallOptions): Promise<GetEnvironmentOffersResult>;
  /**
   * List what was prepared for sessions to work in.
   *
   * `GET /v1/environments`. Scope: `read`.
   */
  listEnvironments(args?: { query?: ListEnvironmentsQuery } & CallOptions): Promise<ListEnvironmentsResult>;
  /**
   * Read one environment: what it is, and which files changed.
   *
   * `GET /v1/environments/{environmentId}`. Scope: `read`.
   */
  getEnvironment(args: { environmentId: string } & CallOptions): Promise<GetEnvironmentResult>;
  /**
   * The difference of one file in an environment, as text.
   *
   * `GET /v1/environments/{environmentId}/difference`. Signed-in browser only: no API token may call this.
   */
  getEnvironmentDifference(args: { environmentId: string; query: GetEnvironmentDifferenceQuery } & CallOptions): Promise<GetEnvironmentDifferenceResult>;
  /**
   * What can be done with an environment when its session ends.
   *
   * `GET /v1/environments/{environmentId}/endings`. Signed-in browser only: no API token may call this.
   */
  getEnvironmentEndings(args: { environmentId: string } & CallOptions): Promise<GetEnvironmentEndingsResult>;
  /**
   * Keep, remove or discard an environment.
   *
   * `POST /v1/environments/{environmentId}/end`. Signed-in browser only: no API token may call this.
   */
  endEnvironment(args: { environmentId: string; body: EndEnvironmentBody } & CallOptions): Promise<EndEnvironmentResult>;
  /**
   * Where a session works, and which files changed there.
   *
   * `GET /v1/sessions/{sessionId}/environment`. A session's own token, or an API token with `read`.
   */
  getSessionEnvironment(args: { sessionId: string } & CallOptions): Promise<GetSessionEnvironmentResult>;
  /**
   * The difference of one file in a session's working copy, as text.
   *
   * `GET /v1/sessions/{sessionId}/environment/difference`. Scope: `terminal:read`.
   */
  getSessionDifference(args: { sessionId: string; query: GetSessionDifferenceQuery } & CallOptions): Promise<GetSessionDifferenceResult>;
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
   * A session's links.
   *
   * `GET /v1/sessions/{sessionId}/links`. A session's own token, or an API token with `read`.
   */
  listLinks(args: { sessionId: string } & CallOptions): Promise<ListLinksResult>;
  /**
   * Add a link to a session.
   *
   * `POST /v1/sessions/{sessionId}/links`. A session's own token, or an API token with `notes:write`.
   */
  addLink(args: { sessionId: string; body: AddLinkBody } & CallOptions): Promise<AddLinkResult>;
  /**
   * Change the label or the kind of a link.
   *
   * `PATCH /v1/sessions/{sessionId}/links/{linkId}`. A session's own token, or an API token with `notes:write`.
   */
  changeLink(args: { sessionId: string; linkId: string; body: ChangeLinkBody } & CallOptions): Promise<ChangeLinkResult>;
  /**
   * Remove a link from a session.
   *
   * `DELETE /v1/sessions/{sessionId}/links/{linkId}`. A session's own token, or an API token with `notes:write`.
   */
  removeLink(args: { sessionId: string; linkId: string } & CallOptions): Promise<RemoveLinkResult>;
  /**
   * A session's fields.
   *
   * `GET /v1/sessions/{sessionId}/fields`. A session's own token.
   */
  listOwnFields(args: { sessionId: string } & CallOptions): Promise<ListOwnFieldsResult>;
  /**
   * Set one field of the session, as its agent.
   *
   * `PUT /v1/sessions/{sessionId}/fields`. A session's own token.
   */
  setOwnField(args: { sessionId: string; body: SetOwnFieldBody } & CallOptions): Promise<SetOwnFieldResult>;
  /**
   * Remove one field of the session, as its agent.
   *
   * `DELETE /v1/sessions/{sessionId}/fields/{label}`. A session's own token.
   */
  removeOwnField(args: { sessionId: string; label: string } & CallOptions): Promise<RemoveOwnFieldResult>;
  /**
   * Addresses seen in a terminal and not kept.
   *
   * `GET /v1/sessions/{sessionId}/links/seen`. Scope: `terminal:read`.
   */
  listSeenLinks(args: { sessionId: string } & CallOptions): Promise<ListSeenLinksResult>;
  /**
   * Keep an address that was seen in the terminal as a link.
   *
   * `POST /v1/sessions/{sessionId}/links/keep`. Signed-in browser only: no API token may call this.
   */
  keepSeenLink(args: { sessionId: string; body: KeepSeenLinkBody } & CallOptions): Promise<KeepSeenLinkResult>;
  /**
   * Name the session after its work, and say what it is doing.
   *
   * `PUT /v1/sessions/{sessionId}/described`. A session's own token.
   */
  describeSession(args: { sessionId: string; body: DescribeSessionBody } & CallOptions): Promise<DescribeSessionResult>;
  /**
   * Report a moment of an agent’s work, and learn what it is to be told.
   *
   * `POST /v1/sessions/{sessionId}/described/check`. A session's own token.
   */
  checkDescribed(args: { sessionId: string; body: CheckDescribedBody } & CallOptions): Promise<CheckDescribedResult>;
  /**
   * Look again at what can be found about a session.
   *
   * `POST /v1/sessions/{sessionId}/found`. Signed-in browser only: no API token may call this.
   */
  lookAgain(args: { sessionId: string } & CallOptions): Promise<LookAgainResult>;
  /**
   * Use what the agent suggested in place of the owner’s own words.
   *
   * `POST /v1/sessions/{sessionId}/described/use`. Signed-in browser only: no API token may call this.
   */
  useSuggestion(args: { sessionId: string; body: UseSuggestionBody } & CallOptions): Promise<UseSuggestionResult>;
  /**
   * Say whether agents are reminded to describe their terminal.
   *
   * `PUT /v1/settings/describing`. Signed-in browser only: no API token may call this.
   */
  changeDescribing(args: { body: ChangeDescribingBody } & CallOptions): Promise<ChangeDescribingResult>;
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
   * The color themes there are.
   *
   * `GET /v1/sessions/{sessionId}/themes`. A session's own token.
   */
  listSessionThemes(args: { sessionId: string; query?: ListSessionThemesQuery } & CallOptions): Promise<ListSessionThemesResult>;
  /**
   * The color themes a session proposed, and what became of them.
   *
   * `GET /v1/sessions/{sessionId}/theme-proposals`. A session's own token.
   */
  listSessionThemeProposals(args: { sessionId: string; query?: ListSessionThemeProposalsQuery } & CallOptions): Promise<ListSessionThemeProposalsResult>;
  /**
   * Propose a color theme from a session.
   *
   * `POST /v1/sessions/{sessionId}/theme-proposals`. A session's own token.
   */
  proposeSessionTheme(args: { sessionId: string; body: ProposeSessionThemeBody } & CallOptions): Promise<ProposeSessionThemeResult>;
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
     * Every item of `listThemes`, fetched a page at a time as they are asked for.
     */
    listThemes(args?: { query?: ListThemesQuery } & CallOptions): AsyncGenerator<ListThemesResult['items'][number], void, void>;
    /**
     * Every item of `listThemeProposals`, fetched a page at a time as they are asked for.
     */
    listThemeProposals(args?: { query?: ListThemeProposalsQuery } & CallOptions): AsyncGenerator<ListThemeProposalsResult['items'][number], void, void>;
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
     * Every item of `listTasks`, fetched a page at a time as they are asked for.
     */
    listTasks(args?: { query?: ListTasksQuery } & CallOptions): AsyncGenerator<ListTasksResult['items'][number], void, void>;
    /**
     * Every item of `listProjects`, fetched a page at a time as they are asked for.
     */
    listProjects(args?: { query?: ListProjectsQuery } & CallOptions): AsyncGenerator<ListProjectsResult['items'][number], void, void>;
    /**
     * Every item of `listSchedules`, fetched a page at a time as they are asked for.
     */
    listSchedules(args?: { query?: ListSchedulesQuery } & CallOptions): AsyncGenerator<ListSchedulesResult['items'][number], void, void>;
    /**
     * Every item of `listEnvironments`, fetched a page at a time as they are asked for.
     */
    listEnvironments(args?: { query?: ListEnvironmentsQuery } & CallOptions): AsyncGenerator<ListEnvironmentsResult['items'][number], void, void>;
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
    /**
     * Every item of `listSessionThemes`, fetched a page at a time as they are asked for.
     */
    listSessionThemes(args?: { sessionId: string; query?: ListSessionThemesQuery } & CallOptions): AsyncGenerator<ListSessionThemesResult['items'][number], void, void>;
    /**
     * Every item of `listSessionThemeProposals`, fetched a page at a time as they are asked for.
     */
    listSessionThemeProposals(args?: { sessionId: string; query?: ListSessionThemeProposalsQuery } & CallOptions): AsyncGenerator<ListSessionThemeProposalsResult['items'][number], void, void>;
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
