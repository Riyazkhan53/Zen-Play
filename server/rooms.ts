import { ENGINES } from '../src/games/registry';
import type { ClientMessage, HostMessage } from '../src/net/protocol';
import { PeerHandle, RoomHost } from '../src/net/room-host';

// No I/O/O/0/1 so codes are easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;

export interface ServerConnection {
  send(msg: HostMessage): void;
}

interface Room {
  host: RoomHost;
  emptySince: number | null;
}

/**
 * Online lobby: maps room codes to RoomHosts. The transport (WebSocket) feeds
 * each connection's messages in through `attach`.
 */
export class RoomRegistry {
  private rooms = new Map<string, Room>();

  constructor(private readonly botDelayMs?: number) {}

  get size() {
    return this.rooms.size;
  }

  /** Returns a handler for one connection's messages and its close event. */
  attach(conn: ServerConnection) {
    let handle: PeerHandle | null = null;
    let room: Room | null = null;

    return {
      message: (msg: ClientMessage) => {
        if (handle) {
          handle.receive(msg);
          return;
        }
        if (msg.t === 'create') {
          if (!ENGINES[msg.gameId]) return conn.send({ t: 'error', message: 'That game is not available yet' });
          const code = this.newCode();
          room = {
            host: new RoomHost({ gameId: msg.gameId, hostClientId: msg.clientId, code, botDelayMs: this.botDelayMs }),
            emptySince: null,
          };
          this.rooms.set(code, room);
          handle = room.host.connect(msg.clientId, msg.name, (m) => conn.send(m));
          return;
        }
        if (msg.t === 'join') {
          room = this.rooms.get(msg.code.trim().toUpperCase()) ?? null;
          if (!room) return conn.send({ t: 'error', message: 'No room with that code' });
          room.emptySince = null;
          handle = room.host.connect(msg.clientId, msg.name, (m) => conn.send(m));
          return;
        }
        conn.send({ t: 'error', message: 'Create or join a room first' });
      },
      close: () => {
        handle?.disconnect();
        if (room && room.host.peerCount === 0) room.emptySince = Date.now();
        handle = null;
      },
    };
  }

  /** Drop rooms nobody has been connected to for a while. */
  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      if (room.emptySince != null && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        room.host.dispose();
        this.rooms.delete(code);
      }
    }
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
