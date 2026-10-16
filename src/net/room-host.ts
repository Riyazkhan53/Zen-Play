import { ENGINES } from '../games/registry';
import { GameDef, GameId, IllegalMoveError, Rng } from '../games/types';
import type { ClientMessage, HostMessage, RoomView, SeatView } from './protocol';

interface Seat {
  name: string;
  ownerId: string | null;
  bot: boolean;
}

interface Peer {
  clientId: string;
  send: (msg: HostMessage) => void;
}

export interface RoomHostOptions {
  gameId: GameId;
  hostClientId: string;
  code?: string;
  rng?: Rng;
  /** Pause before a computer player moves, so people can follow along. */
  botDelayMs?: number;
}

export interface PeerHandle {
  receive(msg: ClientMessage): void;
  disconnect(): void;
}

const BOT_NAMES = ['Zen Bot', 'Lotus Bot', 'Koi Bot', 'Bamboo Bot', 'Pebble Bot', 'Maple Bot'];

/**
 * Authoritative room: owns the seats and the game state, validates every move
 * with the game engine, runs computer players and broadcasts updates. Used by
 * the online server, by a phone hosting on Wi-Fi, and for same-device play.
 */
export class RoomHost {
  readonly gameId: GameId;
  readonly code?: string;
  private readonly engine: GameDef;
  private readonly hostClientId: string;
  private readonly rng: Rng;
  private readonly botDelayMs: number;
  private seats: Seat[] = [];
  private peers = new Set<Peer>();
  private state: unknown = null;
  private seq = 0;
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: RoomHostOptions) {
    const engine = ENGINES[opts.gameId];
    if (!engine) throw new Error(`Game not available: ${opts.gameId}`);
    this.engine = engine;
    this.gameId = opts.gameId;
    this.code = opts.code;
    this.hostClientId = opts.hostClientId;
    this.rng = opts.rng ?? Math.random;
    this.botDelayMs = opts.botDelayMs ?? 900;
  }

  get started() {
    return this.state != null;
  }

  get peerCount() {
    return this.peers.size;
  }

  connect(clientId: string, name: string, send: (msg: HostMessage) => void): PeerHandle {
    const peer: Peer = { clientId, send };
    this.peers.add(peer);
    const ownsSeat = this.seats.some((s) => s.ownerId === clientId);
    if (!ownsSeat && !this.started) {
      if (this.seats.length < this.engine.maxPlayers) {
        this.seats.push({ name: name.trim() || 'Player', ownerId: clientId, bot: false });
      } else {
        send({ t: 'error', message: 'This room is full. You can watch.' });
      }
    }
    this.broadcastRoom();
    if (this.started) send({ t: 'state', state: this.state, seq: this.seq });
    return {
      receive: (msg) => this.handle(peer, msg),
      disconnect: () => {
        this.peers.delete(peer);
        // Leaving the lobby frees the seat; mid-game it is kept for reconnects.
        if (!this.started) {
          const stillHere = [...this.peers].some((p) => p.clientId === clientId);
          if (!stillHere) this.seats = this.seats.filter((s) => s.ownerId !== clientId);
        }
        this.broadcastRoom();
      },
    };
  }

  /** Stop timers, e.g. when the room is thrown away. */
  dispose() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.peers.clear();
  }

  private handle(peer: Peer, msg: ClientMessage) {
    try {
      this.apply(peer.clientId, msg);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      peer.send({ t: 'error', message });
    }
  }

  private apply(clientId: string, msg: ClientMessage) {
    const isHost = clientId === this.hostClientId;
    switch (msg.t) {
      case 'addLocal':
      case 'addBot': {
        if (this.started) throw new IllegalMoveError('The game has already started');
        if (msg.t === 'addBot' && !isHost) throw new IllegalMoveError('Only the host can add computer players');
        if (this.seats.length >= this.engine.maxPlayers) throw new IllegalMoveError('All seats are taken');
        if (msg.t === 'addLocal') {
          this.seats.push({
            name: msg.name.trim() || `Player ${this.seats.length + 1}`,
            ownerId: clientId,
            bot: false,
          });
        } else {
          const used = new Set(this.seats.map((s) => s.name));
          const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.seats.length + 1}`;
          this.seats.push({ name, ownerId: null, bot: true });
        }
        this.broadcastRoom();
        return;
      }
      case 'removeSeat': {
        if (this.started) throw new IllegalMoveError('The game has already started');
        const seat = this.seats[msg.seat];
        if (!seat) throw new IllegalMoveError('No such seat');
        if (!isHost && seat.ownerId !== clientId) throw new IllegalMoveError('You can only remove your own players');
        this.seats.splice(msg.seat, 1);
        this.broadcastRoom();
        return;
      }
      case 'start':
      case 'rematch': {
        if (!isHost) throw new IllegalMoveError('Only the host can start the game');
        if (msg.t === 'start' && this.started) throw new IllegalMoveError('The game has already started');
        if (this.seats.length < this.engine.minPlayers) {
          throw new IllegalMoveError(`Need at least ${this.engine.minPlayers} players`);
        }
        this.state = this.engine.setup(
          this.seats.map((s) => ({ name: s.name })),
          this.rng,
        );
        this.afterChange();
        return;
      }
      case 'move': {
        if (!this.started) throw new IllegalMoveError('The game has not started');
        const seat = this.seats[msg.seat];
        if (!seat || seat.bot || seat.ownerId !== clientId) throw new IllegalMoveError('That is not your player');
        this.state = this.engine.applyMove(this.state, msg.seat, msg.move, this.rng);
        this.afterChange();
        return;
      }
      case 'replaceWithBot': {
        if (!isHost) throw new IllegalMoveError('Only the host can do that');
        const seat = this.seats[msg.seat];
        if (!seat) throw new IllegalMoveError('No such seat');
        this.seats[msg.seat] = { name: `${seat.name} (bot)`, ownerId: null, bot: true };
        this.broadcastRoom();
        this.scheduleBot();
        return;
      }
      default:
        throw new IllegalMoveError('Unknown message');
    }
  }

  private afterChange() {
    this.seq += 1;
    this.broadcast({ t: 'state', state: this.state, seq: this.seq });
    this.broadcastRoom();
    this.scheduleBot();
  }

  private scheduleBot() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    if (!this.started) return;
    const seat = this.engine.currentSeat(this.state);
    if (seat == null || !this.seats[seat]?.bot) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const current = this.engine.currentSeat(this.state);
      if (current !== seat) return;
      this.state = this.engine.applyMove(this.state, seat, this.engine.botMove(this.state, seat, this.rng), this.rng);
      this.afterChange();
    }, this.botDelayMs);
  }

  roomView(): RoomView {
    const online = new Set([...this.peers].map((p) => p.clientId));
    const seats: SeatView[] = this.seats.map((s) => ({
      name: s.name,
      ownerId: s.ownerId,
      bot: s.bot,
      connected: s.bot || (s.ownerId != null && online.has(s.ownerId)),
    }));
    return {
      gameId: this.gameId,
      code: this.code,
      hostClientId: this.hostClientId,
      seats,
      minPlayers: this.engine.minPlayers,
      maxPlayers: this.engine.maxPlayers,
      started: this.started,
    };
  }

  private broadcastRoom() {
    this.broadcast({ t: 'room', room: this.roomView() });
  }

  private broadcast(msg: HostMessage) {
    for (const peer of this.peers) {
      try {
        peer.send(msg);
      } catch {
        // A broken connection is cleaned up by its own close handler.
      }
    }
  }
}
