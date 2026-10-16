import type { Connection, ConnectionEvents } from './connection';
import type { ClientMessage } from './protocol';
import type { RoomHost } from './room-host';

// Web build: browsers can't open raw network sockets, so Wi-Fi play is
// native-only. Same-device and online play still work on the web.

export const lanSupported = false;

export interface LanServer {
  address: string;
  stop(): void;
}

export async function startLanServer(_host: RoomHost): Promise<LanServer> {
  throw new Error('Wi-Fi play needs the Android or iOS app');
}

export function connectLan(_address: string, _hello: ClientMessage, _events: ConnectionEvents): Connection {
  throw new Error('Wi-Fi play needs the Android or iOS app');
}
