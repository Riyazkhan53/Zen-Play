import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';

import { Connection, ConnectionEvents, lineReader } from './connection';
import { ClientMessage, HostMessage, LAN_PORT } from './protocol';
import type { PeerHandle, RoomHost } from './room-host';

// Wi-Fi play: one device runs the RoomHost and a TCP server on the local
// network; the others connect to its IP. Messages are newline-delimited JSON.

export const lanSupported = true;

export interface LanServer {
  address: string;
  stop(): void;
}

export async function startLanServer(host: RoomHost): Promise<LanServer> {
  const ip = await Network.getIpAddressAsync();
  if (!ip || ip === '0.0.0.0') throw new Error('Connect to Wi-Fi (or turn on your hotspot) to host a game');

  const server = TcpSocket.createServer((socket) => {
    socket.setEncoding('utf8');
    let handle: PeerHandle | null = null;
    const send = (msg: HostMessage) => {
      if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
    };
    socket.on(
      'data',
      lineReader((line) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (handle) handle.receive(msg);
        else if (msg.t === 'hello') handle = host.connect(msg.clientId, msg.name, send);
      }) as (data: string | Buffer) => void,
    );
    const drop = () => {
      handle?.disconnect();
      handle = null;
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: LAN_PORT, host: '0.0.0.0' }, () => resolve());
  });

  return {
    address: `${ip}:${LAN_PORT}`,
    stop: () => server.close(),
  };
}

export function connectLan(address: string, hello: ClientMessage, events: ConnectionEvents): Connection {
  const [hostIp, portText] = address.trim().split(':');
  const port = Number(portText) || LAN_PORT;
  let closedByUs = false;
  let opened = false;

  const socket = TcpSocket.createConnection({ host: hostIp, port }, () => {
    opened = true;
    socket.write(JSON.stringify(hello) + '\n');
    events.onOpen?.();
  });
  socket.setEncoding('utf8');
  socket.on(
    'data',
    lineReader((line) => {
      try {
        events.onMessage(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }) as (data: string | Buffer) => void,
  );
  let reported = false;
  const end = () => {
    if (closedByUs || reported) return;
    reported = true;
    events.onClose(opened ? 'Lost connection to the host' : 'Could not reach the host. Are you on the same Wi-Fi?');
  };
  socket.on('error', end);
  socket.on('close', end);

  return {
    send: (msg) => {
      if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
    },
    close: () => {
      closedByUs = true;
      socket.destroy();
    },
  };
}
