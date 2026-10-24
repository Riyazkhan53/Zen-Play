import { useSyncExternalStore } from 'react';

import type { Difficulty, GameId } from '../games/types';
import { displayName, getProfile } from '../lib/profile';
import { Connection, ConnectionEvents, connectLoopback, connectWebSocket } from './connection';
import { connectLan, LanServer, startLanServer } from './lan';
import type { ClientMessage, HostMessage, RoomView } from './protocol';
import { RoomHost } from './room-host';

// One active game session for the whole app. Screens read it with
// useSession() and act through the functions below.

export type SessionMode = 'local' | 'online' | 'lan-host' | 'lan-join';

export interface SessionState {
  mode: SessionMode | null;
  status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
  room: RoomView | null;
  game: unknown;
  seq: number;
  error: string | null;
  /** Wi-Fi host address for others to join, e.g. 192.168.1.20:7351 */
  lanAddress: string | null;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'ws://localhost:8787';
const MAX_RECONNECTS = 5;

const initial: SessionState = {
  mode: null,
  status: 'idle',
  room: null,
  game: null,
  seq: 0,
  error: null,
  lanAddress: null,
};

let state: SessionState = initial;
let conn: Connection | null = null;
let localHost: RoomHost | null = null;
let lanServer: LanServer | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnects = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function events(onDrop?: (reason?: string) => void): ConnectionEvents {
  return {
    onOpen: () => {
      reconnects = 0;
      set({ status: 'open' });
    },
    onMessage: (msg: HostMessage) => {
      if (msg.t === 'room') set({ room: msg.room });
      else if (msg.t === 'state') {
        if (msg.seq >= state.seq) set({ game: msg.state, seq: msg.seq, error: null });
      } else if (msg.t === 'error') set({ error: msg.message });
    },
    onClose: (reason) => {
      conn = null;
      if (onDrop) onDrop(reason);
      else set({ status: 'closed', error: reason ?? 'Disconnected' });
    },
  };
}

function reset() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  conn?.close();
  conn = null;
  lanServer?.stop();
  lanServer = null;
  localHost?.dispose();
  localHost = null;
  reconnects = 0;
  state = initial;
}

/** Same device: everyone plays on this phone/tablet. */
export function startLocal(gameId: GameId, botDifficulty?: Difficulty) {
  reset();
  const { clientId } = getProfile();
  localHost = new RoomHost({ gameId, hostClientId: clientId, botDifficulty });
  set({ mode: 'local', status: 'connecting' });
  conn = connectLoopback(localHost, clientId, displayName(), events());
}

/** Quick play: this player against `bots` computer players, started straight away. */
export function quickPlay(gameId: GameId, opts: { bots: number; difficulty: Difficulty; options?: unknown }) {
  startLocal(gameId, opts.difficulty);
  // The loopback host handles messages synchronously, so the seats and start land in order.
  for (let i = 0; i < opts.bots; i++) send({ t: 'addBot' });
  if (opts.options !== undefined) send({ t: 'setOptions', options: opts.options });
  send({ t: 'start' });
}

/** Online: create a room on the server and share its code. */
export function createOnline(gameId: GameId) {
  const { clientId } = getProfile();
  openOnline({ t: 'create', gameId, clientId, name: displayName() });
}

export function joinOnline(code: string) {
  const { clientId } = getProfile();
  openOnline({ t: 'join', code: code.trim().toUpperCase(), clientId, name: displayName() });
}

function openOnline(first: ClientMessage) {
  reset();
  set({ mode: 'online', status: 'connecting' });
  const connect = (msg: ClientMessage) => {
    conn = connectWebSocket(SERVER_URL, msg, events(onlineDrop));
  };
  // After a drop, rejoin the same room by code; the server gives our seat back.
  const onlineDrop = (reason?: string) => {
    const code = state.room?.code;
    if (!code || reconnects >= MAX_RECONNECTS) {
      set({ status: 'closed', error: reason ?? 'Disconnected' });
      return;
    }
    reconnects += 1;
    set({ status: 'reconnecting' });
    reconnectTimer = setTimeout(() => {
      const { clientId } = getProfile();
      connect({ t: 'join', code, clientId, name: displayName() });
    }, 1000 * reconnects);
  };
  connect(first);
}

/** Nearby Wi-Fi: this device hosts; others join with its address or QR code. */
export async function hostLan(gameId: GameId) {
  reset();
  const { clientId } = getProfile();
  set({ mode: 'lan-host', status: 'connecting' });
  const host = new RoomHost({ gameId, hostClientId: clientId });
  try {
    lanServer = await startLanServer(host);
  } catch (error) {
    host.dispose();
    set({ status: 'closed', error: error instanceof Error ? error.message : 'Could not start hosting' });
    return;
  }
  localHost = host;
  set({ lanAddress: lanServer.address });
  conn = connectLoopback(host, clientId, displayName(), events());
}

export function joinLan(address: string) {
  reset();
  const { clientId } = getProfile();
  set({ mode: 'lan-join', status: 'connecting' });
  try {
    conn = connectLan(address, { t: 'hello', clientId, name: displayName() }, events());
  } catch (error) {
    set({ status: 'closed', error: error instanceof Error ? error.message : 'Could not connect' });
  }
}

export function send(msg: ClientMessage) {
  if (!conn) {
    set({ error: 'Not connected' });
    return;
  }
  conn.send(msg);
}

export function clearError() {
  set({ error: null });
}

export function leaveSession() {
  reset();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getState, getState);
}
