import type { ClientMessage, HostMessage } from './protocol';
import type { RoomHost } from './room-host';

export interface Connection {
  send(msg: ClientMessage): void;
  close(): void;
}

export interface ConnectionEvents {
  onOpen?(): void;
  onMessage(msg: HostMessage): void;
  /** Called once when the connection ends without close() being called. */
  onClose(reason?: string): void;
}

/** Talk to a RoomHost running in this app (same-device play, Wi-Fi host). */
export function connectLoopback(host: RoomHost, clientId: string, name: string, events: ConnectionEvents): Connection {
  // Deliver asynchronously, like a real network, so UI updates never re-enter.
  const handle = host.connect(clientId, name, (msg) => setTimeout(() => events.onMessage(msg), 0));
  setTimeout(() => events.onOpen?.(), 0);
  return {
    send: (msg) => handle.receive(msg),
    close: () => handle.disconnect(),
  };
}

/** Talk to the online server. `first` is the create/join message. */
export function connectWebSocket(url: string, first: ClientMessage, events: ConnectionEvents): Connection {
  const ws = new WebSocket(url);
  let closedByUs = false;
  let opened = false;

  ws.onopen = () => {
    opened = true;
    ws.send(JSON.stringify(first));
    events.onOpen?.();
  };
  ws.onmessage = (event) => {
    try {
      events.onMessage(JSON.parse(String(event.data)));
    } catch {
      // ignore malformed frames
    }
  };
  ws.onclose = () => {
    if (!closedByUs) events.onClose(opened ? 'Connection lost' : 'Could not reach the game server');
  };

  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}

/** Splits a TCP byte stream into newline-delimited JSON messages. */
export function lineReader(onLine: (line: string) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(line);
      newline = buffer.indexOf('\n');
    }
  };
}
