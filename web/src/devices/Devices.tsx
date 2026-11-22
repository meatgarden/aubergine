import { DeviceName, deviceStatus, readPairingCode, showPairingCode, type Device, type PairingCodeAnswer } from '@aubergine/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { runCommand } from '../commands';
import { useApp } from '../store';
import { Badge, Button, EmptyState, ScreenHead } from '../ui';
import { QrCode } from './QrCode';
import { countdownWords, deviceWords, devicesInOrder, signInAddress } from './words';

const NO_DEVICES: Device[] = [];

/**
 * Settings → Devices: the browsers on other devices that were signed in with a code, drawn from the state as it
 * follows the server; which of them is this browser is asked of the server when Settings opens. Each can be revoked,
 * after a question; revoking this browser's own signs it out, and the page then asks for a code.
 */
export function DevicesPart() {
  const devices = useApp((s) => s.whole?.devices ?? NO_DEVICES);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let gone = false;
    api.listDevices().then(
      (list) => !gone && setCurrentId(list.devices.find((d) => d.current)?.id ?? null),
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, []);

  const revoke = async (device: Device): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const { device: after } = await api.revokeDevice(device.id);
      if (after.revokedAt) useApp.getState().apply({ type: 'device.revoked', deviceId: device.id, at: after.revokedAt });
      setRevoking(null);
      // This browser was the device: it is signed out, and the page asks for a code.
      if (device.id === currentId) useApp.setState({ phase: 'unauthorized', panel: null, addingDevice: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = (
    <Button onClick={() => runCommand('devices.add')} data-testid="devices-add">
      Add a device
    </Button>
  );
  const list = devicesInOrder(devices, now);
  return (
    <section className="settings-devices" data-testid="settings-devices">
      <h3>Devices</h3>
      <p className="ui-meta">Browsers on your other devices, signed in from an outside address with a code. Each can do everything you can here.</p>
      {list.length === 0 ? (
        <EmptyState action={add} data-testid="devices-empty">
          No device has been added yet.
        </EmptyState>
      ) : (
        <>
          <ul className="device-list" data-testid="device-list">
            {list.map((device) => {
              const words = deviceWords(device, now, device.id === currentId);
              const active = deviceStatus(device, now) === 'active';
              return (
                <li key={device.id} className="device-row" data-testid="device-row" data-current={words.thisDevice || undefined}>
                  <div className="device-text">
                    <span className="device-name">{words.name}</span>
                    <span className="ui-meta">{[...(words.thisDevice ? ['This device'] : []), ...words.known].join(' · ')}</span>
                  </div>
                  {words.chip && <Badge>{words.chip}</Badge>}
                  {active &&
                    (revoking === device.id ? (
                      <span className="device-confirm" data-testid="device-confirm">
                        <span>{words.thisDevice ? 'This browser is signed out at once.' : 'It is signed out at once.'}</span>
                        <Button kind="danger" busy={busy} onClick={() => void revoke(device)} data-testid="device-revoke-confirm">
                          Revoke
                        </Button>
                        <Button kind="quiet" onClick={() => setRevoking(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button kind="quiet" onClick={() => setRevoking(device.id)} aria-label={`Revoke ${device.name}`} data-testid="device-revoke">
                        Revoke…
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
          <p className="device-add">{add}</p>
        </>
      )}
      {error && <p className="dialog-error">{error}</p>}
    </section>
  );
}

/** Adding a device: a question about one thing that ends with a decision, so a dialog. The code is in it and nowhere else. */
export function AddDeviceDialog() {
  const open = useApp((s) => s.addingDevice);
  if (!open) return null;
  return <AddDevice close={() => useApp.getState().addDevice(false)} />;
}

function AddDevice({ close }: { close: () => void }) {
  const [name, setName] = useState('Phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The code and where it is used. Held here only: dropped when the dialog closes or the code runs out. */
  const [made, setMade] = useState<PairingCodeAnswer | null>(null);
  const [ranOut, setRanOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const valid = DeviceName.safeParse(name.trim()).success;

  useEffect(() => field.current?.focus(), []);
  // Once a second while a code is shown; a timer, so it goes on in a tab that is not showing.
  useEffect(() => {
    if (!made) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [made]);
  const left = made ? countdownWords(made.expiresAt, now) : null;
  useEffect(() => {
    if (!left?.over) return;
    setMade(null);
    setRanOut(true);
  }, [left?.over]);

  const ask = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setRanOut(false);
    try {
      const answer = await api.makePairingCode(name.trim());
      setNow(Date.now());
      setMade(answer);
      // The form it was typed in is gone: the dialog keeps the keyboard, so that Escape still closes it.
      window.setTimeout(() => box.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet add-device" role="dialog" aria-label="Add a device" tabIndex={-1} ref={box} data-testid="add-device-dialog">
        <ScreenHead title="Add a device" onClose={close} closeTestid="add-device-close" />
        {error ? (
          <p className="dialog-error" role="alert" data-testid="add-device-error">
            {error}
          </p>
        ) : made ? (
          <div className="add-device-code" data-testid="add-device-made">
            <p>On the other device, scan the code or open the address, then type this code if it is asked for:</p>
            <p className="device-code" data-testid="device-code">
              {/* The server sends it as it is shown; drawn the same whichever way it came. */}
              {showPairingCode(readPairingCode(made.code) ?? made.code)}
            </p>
            <p className="ui-meta" role="timer" data-testid="device-code-left">
              {left?.words}
            </p>
            {made.addresses.map((address) => {
              const where = signInAddress(address, made.code);
              return (
                <div key={address} className="add-device-address" data-testid="device-address">
                  <QrCode text={where} label="QR code of the sign-in address" testid="device-qr" />
                  <code className="add-device-text" data-testid="device-address-text">
                    {where}
                  </code>
                </div>
              );
            })}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) void ask();
            }}
          >
            {ranOut && (
              <p data-testid="device-code-over">This code has run out.</p>
            )}
            <p>A code works once, for a few minutes, from an outside address of this server. The device it signs in can do everything you can.</p>
            <label className="wf-field">
              <span>What the device is called</span>
              <input className="ui-field" ref={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="add-device-name" />
            </label>
            <div className="dialog-actions">
              <Button kind="primary" type="submit" busy={busy} disabled={!valid} data-testid="add-device-go">
                {ranOut ? 'Make another code' : 'Make a code'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
