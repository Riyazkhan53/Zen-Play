import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import type { ClientMessage } from '../src/net/protocol';
import { RoomRegistry } from './rooms';

/** Starts the multiplayer server. Resolves once it is listening. */
export function startServer(port: number, opts: { botDelayMs?: number } = {}) {
  const registry = new RoomRegistry(opts.botDelayMs);

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: registry.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));

    const session = registry.attach({
      send: (msg) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      },
    });

    socket.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      session.message(msg);
    });
    socket.on('close', () => session.close());
  });

  // Drop dead connections (phones that lost signal) and empty rooms.
  const sweeper = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.get(socket)) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
    registry.sweep();
  }, 30_000);

  return new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
    http.listen(port, () => {
      const address = http.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(sweeper);
            wss.clients.forEach((c) => c.terminate());
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
