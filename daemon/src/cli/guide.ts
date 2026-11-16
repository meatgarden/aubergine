import { AubergineError, createClient } from '@aubergine/client';
import { GUIDE_SNIPPET, SESSION_ENV, renderGuide, type GuideReader } from '@aubergine/shared';

/**
 * `aubergine guide`: the guide for agents, for whoever is asking.
 *
 * Who is asking is what the server says about the credentials in the
 * environment: the terminal's own (`AUBERGINE_TOKEN`) and an API token
 * (`AUBERGINE_API_TOKEN`), each asked about with `GET /v1`. Nothing else is
 * read: not the owner's access file, not the settings. When the server
 * cannot be asked, the whole guide is printed with a line saying so.
 *
 * What is printed is the guide's own fixed text. Nothing from the server,
 * the environment or a credential is in it.
 */

export type Env = Record<string, string | undefined>;

export const API_TOKEN_ENV = 'AUBERGINE_API_TOKEN';

type Asked = { kind: 'session' } | { kind: 'token'; scopes: readonly string[] } | { kind: 'other' } | { kind: 'refused' } | { kind: 'away' };

async function ask(url: string, token: string, fetchWith: typeof fetch | undefined, timeoutMs: number): Promise<Asked> {
  try {
    const { caller } = await createClient({ baseUrl: url, token, ...(fetchWith ? { fetch: fetchWith } : {}) }).getCapabilities({ signal: AbortSignal.timeout(timeoutMs) });
    if (caller.kind === 'session') return { kind: 'session' };
    if (caller.kind === 'token') return { kind: 'token', scopes: caller.scopes };
    return { kind: 'other' };
  } catch (error) {
    return error instanceof AubergineError && error.code !== 'network' ? { kind: 'refused' } : { kind: 'away' };
  }
}

export interface GuideOptions {
  all: boolean;
  snippet: boolean;
}

/** The text `aubergine guide` prints. */
export async function guideText(options: GuideOptions, env: Env, fetchWith?: typeof fetch, timeoutMs = 3000): Promise<string> {
  if (options.snippet) return GUIDE_SNIPPET;
  if (options.all) return renderGuide({ all: true });

  const url = env[SESSION_ENV.url]?.trim() ?? '';
  const own = env[SESSION_ENV.token]?.trim() ?? '';
  const api = env[API_TOKEN_ENV]?.trim() ?? '';
  if (url === '' || (own === '' && api === '')) {
    return renderGuide({ all: true, because: 'This is not an Aubergine terminal and no API token is set here, so it could not be told what applies to you.' });
  }

  const [asOwn, asApi] = await Promise.all([own !== '' ? ask(url, own, fetchWith, timeoutMs) : null, api !== '' ? ask(url, api, fetchWith, timeoutMs) : null]);
  const answers = [asOwn, asApi].filter((answer): answer is Asked => answer !== null);
  if (answers.some((answer) => answer.kind === 'away')) {
    return renderGuide({ all: true, because: 'The Aubergine server did not answer, so it could not be told what applies to you. Until it answers, the commands below will fail.' });
  }
  const reader: GuideReader = {
    session: asOwn?.kind === 'session',
    scopes: asApi?.kind === 'token' ? asApi.scopes : [],
  };
  if (!reader.session && asApi?.kind !== 'token') {
    return renderGuide({ all: true, because: 'The server did not accept the credential set here, so it could not be told what applies to you.' });
  }
  const text = renderGuide({ reader });
  // One of two was refused: say so, and show what the other allows.
  return answers.some((answer) => answer.kind === 'refused') ? `${text}\n\nOne of the two credentials set here was not accepted by the server; this guide is for the other.` : text;
}
