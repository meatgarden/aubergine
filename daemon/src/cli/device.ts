import qrcode from 'qrcode';
import { DeviceList, DeviceName, ErrorResponse, PairingCodeAnswer, PersonName, RevokedDevice, paths, showControl, type DeviceView } from '@aubergine/shared';
import { UsageError } from './commands';

/**
 * `aubergine device`: pairing another device with this server, and the
 * devices there are. Like every command it calls the server over HTTP as
 * the owner; it reads nothing of the state itself. A code is printed once
 * and kept nowhere: the server holds it, as a hash, for three minutes.
 */

export type DeviceCommand = { action: 'add'; name: string; page?: string; person?: string } | { action: 'list' } | { action: 'revoke'; query: string; yes: boolean };

/** What a new device is called when no name is given. */
export const DEFAULT_DEVICE_NAME = 'Another device';
/** What a linked page is called when no name is given. */
export const DEFAULT_PAGE_NAME = 'Linked page';

export function parseDeviceCommand(words: readonly string[]): DeviceCommand {
  const [action, ...rest] = words;
  if (action === undefined || action === 'list' || action === 'ls') {
    if (rest.length > 0) throw new UsageError('device list takes no arguments');
    return { action: 'list' };
  }
  if (action === 'add' || action === 'pair') {
    let name: string | null = null;
    let page: string | null = null;
    let person: string | null = null;
    for (let index = 0; index < rest.length; index += 1) {
      const word = rest[index] as string;
      if (word === '--page' || word.startsWith('--page=')) {
        const origin = word === '--page' ? rest[(index += 1)] : word.slice('--page='.length);
        if (origin === undefined || origin.trim() === '' || origin.startsWith('--')) throw new UsageError('--page needs the origin of the page, like http://127.0.0.1:4600');
        page = origin;
        continue;
      }
      if (word === '--person' || word.startsWith('--person=')) {
        const who = word === '--person' ? rest[(index += 1)] : word.slice('--person='.length);
        const named = PersonName.safeParse(who === undefined || who.startsWith('--') ? '' : who);
        if (!named.success) throw new UsageError('--person needs the name of who the device is for: one line of plain text, at most 80 characters.');
        person = named.data;
        continue;
      }
      const given = word === '--name' ? rest[(index += 1)] : word.startsWith('--name=') ? word.slice('--name='.length) : null;
      if (given === null) throw new UsageError(`device add does not know ${word}`);
      if (given === undefined || given.trim() === '' || given.startsWith('--')) throw new UsageError('--name needs a name');
      name = given;
    }
    const checked = DeviceName.safeParse(name ?? (page === null ? DEFAULT_DEVICE_NAME : DEFAULT_PAGE_NAME));
    if (!checked.success) throw new UsageError('A device’s name is one line of plain text, at most 80 characters.');
    return { action: 'add', name: checked.data, ...(page === null ? {} : { page }), ...(person === null ? {} : { person }) };
  }
  if (action === 'revoke' || action === 'remove') {
    const unknown = rest.find((word) => word.startsWith('--') && word !== '--yes');
    if (unknown) throw new UsageError(`device revoke does not know ${unknown}`);
    const query = rest.filter((word) => word !== '--yes').join(' ').trim();
    if (query === '') throw new UsageError('device revoke needs the name or the ID of one device (see: aubergine device list)');
    return { action: 'revoke', query, yes: rest.includes('--yes') };
  }
  throw new UsageError('device needs "add [--name <name>] [--person <who>] [--page <origin>]", "list" or "revoke <name|id>"');
}

export interface DeviceCommandDeps {
  /** One call to the server as the owner. Answers whatever the server answered; fails only when it is not there. */
  request: (method: string, url: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
  print: (text: string) => void;
  ask: (question: string) => Promise<string>;
  /** Whether there is a person at a terminal to ask, and to draw a code for in colours. */
  interactive: boolean;
  now?: () => number;
}

/** What the server said when it refused, as a sentence. */
function refusal(answer: { status: number; body: unknown }): string {
  const parsed = ErrorResponse.safeParse(answer.body);
  return parsed.success ? parsed.data.error.message : `The server answered HTTP ${answer.status}.`;
}

/** The device a name or an ID means: an ID or the start of one (eight characters at least), else a name, ignoring case. Revoked ones only by ID. */
export function resolveDevice<T extends { id: string; name: string; revokedAt: string | null }>(devices: readonly T[], query: string): T {
  const byId = devices.filter((device) => device.id === query || (query.length >= 8 && device.id.startsWith(query.toLowerCase())));
  if (byId.length === 1) return byId[0] as T;
  const wanted = query.trim().toLowerCase();
  const named = devices.filter((device) => device.revokedAt === null && device.name.toLowerCase() === wanted);
  if (named.length === 1) return named[0] as T;
  if (named.length > 1) throw new UsageError(`${named.length} devices are named "${showControl(query)}". Give the ID of the one you mean (see: aubergine device list).`);
  throw new UsageError(`No device named "${showControl(query)}". See: aubergine device list`);
}

const day = (iso: string | null): string => (iso === null ? 'never' : iso.slice(0, 10));

/** The list as a table. Names were typed by whoever paired: control characters are shown, not sent to the terminal. */
export function formatDevices(devices: readonly DeviceView[]): string {
  if (devices.length === 0) return 'No devices. Pair one with: aubergine device add --name <name>';
  // A page's origin was checked against the settings when it was paired; shown through showControl all the same.
  const kindOf = (device: DeviceView): string => (device.kind === 'page' ? `page ${showControl(device.origin ?? '?')}` : device.kind);
  // Who each was made for, where any was made for someone: a word written by whoever made its code.
  const people = devices.some((device) => device.person !== null);
  const who = (device: DeviceView): string[] => (people ? [device.person === null ? '-' : showControl(device.person)] : []);
  const rows = [['NAME', ...(people ? ['FOR'] : []), 'KIND', 'STATE', 'ADDED', 'LAST USED', 'ID'], ...devices.map((device) => [showControl(device.name) + (device.current ? ' (this one)' : ''), ...who(device), kindOf(device), device.status === 'unused' ? 'unused 90 days' : device.status, day(device.createdAt), day(device.lastUsedAt), device.id])];
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length)));
  return rows.map((row) => row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? 0))).join('  ')).join('\n');
}

/** The address a new device opens: the outside address, with the code after `#`, which a browser never sends. */
export const pairingLink = (address: string, code: string): string => `${address}/#pair=${code}`;

/** A code of an address drawn as text. Coloured for a terminal; plain blocks otherwise. */
async function qrOf(text: string, interactive: boolean): Promise<string> {
  return qrcode.toString(text, { type: interactive ? 'terminal' : 'utf8', small: true, errorCorrectionLevel: 'M' });
}

export async function runDeviceCommand(command: DeviceCommand, deps: DeviceCommandDeps): Promise<number> {
  const { request, print } = deps;
  if (command.action === 'add' && command.page !== undefined) {
    const answer = await request('POST', paths.pairingCodes, { name: command.name, kind: 'page', origin: command.page, ...(command.person === undefined ? {} : { person: command.person }) });
    if (answer.status === 409) {
      print(refusal(answer));
      print('For example, in config.json in the data folder:\n  "access": { "pages": ["http://127.0.0.1:4600"] }\nSee "Letting another Aubergine\u2019s page show this server" in the README.');
      return 1;
    }
    if (answer.status !== 201) throw new UsageError(refusal(answer));
    const made = PairingCodeAnswer.parse(answer.body);
    const until = new Date(made.expiresAt);
    print(`Pairing code for the page "${showControl(command.name)}": ${made.code}`);
    print(`It works once, for three minutes (until ${until.toTimeString().slice(0, 5)}). Whoever has it can sign in as you, with a shell on this computer.`);
    if (command.person !== undefined) print(`The device will be listed as ${showControl(command.person)}’s. That is a word about the device: it can do everything you can.`);
    print(`\nIn the page at ${showControl(command.page)}, choose "Link a server\u2026" and type this code there.`);
    return 0;
  }
  if (command.action === 'add') {
    const answer = await request('POST', paths.pairingCodes, { name: command.name, kind: 'browser', ...(command.person === undefined ? {} : { person: command.person }) });
    if (answer.status === 409) {
      print(refusal(answer));
      print('For example, in config.json in the data folder:\n  "access": { "addresses": ["https://aubergine.example.net"] }\nThe address is one that something on this computer carries HTTPS for, to this server. See "From another device" in the README.');
      return 1;
    }
    if (answer.status !== 201) throw new UsageError(refusal(answer));
    const made = PairingCodeAnswer.parse(answer.body);
    const until = new Date(made.expiresAt);
    print(`Pairing code for "${showControl(command.name)}": ${made.code}`);
    print(`It works once, for three minutes (until ${until.toTimeString().slice(0, 5)}). Whoever has it can sign in as you, with a shell on this computer.`);
    if (command.person !== undefined) print(`The device will be listed as ${showControl(command.person)}’s. That is a word about the device: it can do everything you can.`);
    for (const address of made.addresses) {
      const link = pairingLink(address, made.code);
      print(`\nOn the other device, open:\n  ${link}`);
      print(await qrOf(link, deps.interactive));
    }
    return 0;
  }

  const listed = await request('GET', paths.devices);
  if (listed.status !== 200) throw new UsageError(refusal(listed));
  const { devices } = DeviceList.parse(listed.body);
  if (command.action === 'list') {
    print(formatDevices(devices));
    return 0;
  }

  const device = resolveDevice(devices, command.query);
  if (device.revokedAt !== null) {
    print(`"${showControl(device.name)}" was already revoked.`);
    return 0;
  }
  if (!command.yes) {
    if (!deps.interactive) throw new UsageError('device revoke asks before revoking; run it in a terminal, or add --yes.');
    const yes = await deps.ask(`Revoke "${showControl(device.name)}"? It is signed out at once. [y/N] `);
    if (!/^y(es)?$/i.test(yes.trim())) {
      print('Nothing was revoked.');
      return 0;
    }
  }
  const revoked = await request('DELETE', paths.device(device.id));
  if (revoked.status !== 200) throw new UsageError(refusal(revoked));
  RevokedDevice.parse(revoked.body);
  print(`Revoked "${showControl(device.name)}". It is signed out at once, and its open pages lose their connection.`);
  return 0;
}
