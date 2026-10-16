import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';

import { startServer } from '../server/app';
import type { LudoState } from '../src/games/ludo/engine';
import type { SnakesState } from '../src/games/snakes/engine';
import type { ClientMessage, HostMessage, RoomView } from '../src/net/protocol';
import { RoomHost } from '../src/net/room-host';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Collects what one client receives from a RoomHost. */
function client(host: RoomHost, clientId: string, name: string) {
  const inbox: HostMessage[] = [];
  const handle = host.connect(clientId, name, (m) => inbox.push(m));
  const last = <T extends HostMessage['t']>(t: T) =>
    [...inbox].reverse().find((m) => m.t === t) as Extract<HostMessage, { t: T }> | undefined;
  return {
    send: (m: ClientMessage) => handle.receive(m),
    disconnect: () => handle.disconnect(),
    room: () => last('room')!.room,
    state: <S>() => last('state')?.state as S,
    error: () => last('error')?.message,
  };
}

test('room host: seats, host-only actions and move ownership', () => {
  const host = new RoomHost({ gameId: 'ludo', hostClientId: 'a', botDelayMs: 0 });
  const a = client(host, 'a', 'Asha');
  const b = client(host, 'b', 'Bala');
  assert.deepEqual(
    a.room().seats.map((s) => s.name),
    ['Asha', 'Bala'],
  );

  b.send({ t: 'start' });
  assert.match(b.error()!, /Only the host/);
  b.send({ t: 'addBot' });
  assert.match(b.error()!, /Only the host/);

  a.send({ t: 'start' });
  const s = a.state<LudoState>();
  assert.equal(s.turn, 0);

  b.send({ t: 'move', seat: 0, move: { type: 'roll' } });
  assert.match(b.error()!, /not your player/);
  a.send({ t: 'move', seat: 0, move: { type: 'roll' } });
  assert.ok(b.state<LudoState>().dice != null, 'everyone sees the roll');
  host.dispose();
});

test('room host: a reconnecting player gets their seat back', () => {
  const host = new RoomHost({ gameId: 'snakes', hostClientId: 'a', botDelayMs: 0 });
  client(host, 'a', 'Asha');
  const b = client(host, 'b', 'Bala');
  host['apply']('a', { t: 'start' });
  b.disconnect();
  const again = client(host, 'b', 'Bala');
  assert.equal(again.room().seats.length, 2);
  assert.equal(again.room().seats[1].connected, true);
  assert.ok(again.state<SnakesState>(), 'state is resent on reconnect');
  host.dispose();
});

test('room host: leaving the lobby frees the seat; full rooms refuse new players', () => {
  const host = new RoomHost({ gameId: 'ludo', hostClientId: 'a', botDelayMs: 0 });
  const a = client(host, 'a', 'Asha');
  const b = client(host, 'b', 'Bala');
  b.disconnect();
  assert.equal(a.room().seats.length, 1);
  a.send({ t: 'addBot' });
  a.send({ t: 'addBot' });
  a.send({ t: 'addLocal', name: 'Chitra' });
  const late = client(host, 'z', 'Zara');
  assert.match(late.error()!, /full/);
  assert.equal(a.room().seats.length, 4);
  host.dispose();
});

test('room host: same-device players and bots play a whole game', async () => {
  const host = new RoomHost({ gameId: 'ludo', hostClientId: 'me', botDelayMs: 0 });
  const me = client(host, 'me', 'Me');
  me.send({ t: 'addBot' });
  me.send({ t: 'replaceWithBot', seat: 0 }); // let a bot play my seat too
  me.send({ t: 'start' });
  for (let i = 0; i < 4000 && !me.state<LudoState>().over; i++) await tick(0);
  const final = me.state<LudoState>();
  assert.equal(final.over, true);
  assert.equal(final.rankings.length, 2);
  host.dispose();
});

// ---------- Online server, end to end over WebSockets ----------

let server: { port: number; close(): Promise<void> };
before(async () => {
  server = await startServer(0, { botDelayMs: 0 });
});
after(async () => {
  await server.close();
});

function wsClient() {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const inbox: HostMessage[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(String(d))));
  const opened = new Promise((r) => ws.on('open', r));
  return {
    ws,
    opened,
    send: (m: ClientMessage) => ws.send(JSON.stringify(m)),
    async waitFor<T extends HostMessage['t']>(t: T, pred: (m: Extract<HostMessage, { t: T }>) => boolean = () => true) {
      for (let i = 0; i < 400; i++) {
        const hit = [...inbox].reverse().find((m) => m.t === t && pred(m as never));
        if (hit) return hit as Extract<HostMessage, { t: T }>;
        await tick(5);
      }
      throw new Error(`timed out waiting for ${t}`);
    },
  };
}

test('server: create, join by code, play and rejoin after a drop', async () => {
  const a = wsClient();
  await a.opened;
  a.send({ t: 'create', gameId: 'snakes', clientId: 'a', name: 'Asha' });
  const { room } = await a.waitFor('room');
  assert.match(room.code!, /^[A-Z2-9]{5}$/);

  const b = wsClient();
  await b.opened;
  b.send({ t: 'join', code: room.code!.toLowerCase(), clientId: 'b', name: 'Bala' });
  await a.waitFor('room', (m) => m.room.seats.length === 2);

  a.send({ t: 'start' });
  await b.waitFor('state');
  a.send({ t: 'move', seat: 0, move: { type: 'roll' } });
  const moved = await b.waitFor('state', (m) => (m.state as SnakesState).last != null);
  assert.equal((moved.state as SnakesState).last!.seat, 0);

  // Bala's phone drops and comes back.
  b.ws.terminate();
  await a.waitFor('room', (m) => m.room.seats.length === 2 && !m.room.seats[1].connected);
  const b2 = wsClient();
  await b2.opened;
  b2.send({ t: 'join', code: room.code!, clientId: 'b', name: 'Bala' });
  const back = await b2.waitFor('room', (m: { room: RoomView }) => m.room.seats[1]?.connected === true);
  assert.equal(back.room.seats.length, 2);
  await b2.waitFor('state');

  const c = wsClient();
  await c.opened;
  c.send({ t: 'join', code: 'NOPE1', clientId: 'c', name: 'C' });
  assert.match((await c.waitFor('error')).message, /No room/);

  for (const x of [a, b2, c]) x.ws.close();
});
