# Zen-Play

Multiplayer board and card games for **Android, iOS, iPad and the web**, built with Expo.

| Game | Status |
| --- | --- |
| 🎲 Ludo (2–4) | ✅ Playable |
| 🐍 Snakes & Ladders (2–6) | ✅ Playable |
| ♟️ Chess (2) | ✅ Playable |
| 🎯 Carrom (2, or 4 in teams) | ✅ Playable |
| 🃏 UNO (2–8) | ✅ Playable |
| ♠️ Rummy — 13-card Indian (2–6): Points, Pool 101/201/custom, Best of 3/5, 7 rounds with hidden joker | ✅ Playable |

## Ways to play

- **On this device** — pass the phone or tablet around, add computer players. Works fully offline.
- **Online** — create a room and share the 5-letter code or invite link. Friends join from anywhere.
- **Nearby Wi-Fi** — no internet needed. One phone hosts and shows a QR code; others on the same Wi-Fi
  (or the host's hotspot) scan it or type the address. *Android/iOS app only — browsers can't open
  local network sockets.*

You can mix all three: people sharing one phone can join an online or Wi-Fi room together, and the
host can fill empty seats with computer players. If someone drops mid-game, they rejoin and get their
seat back; the host can also hand their seat to a computer player.

## Run it

```bash
npm install
npm run server          # online server on ws://localhost:8787 (in one terminal)
npm start               # Expo dev server; press w for web
```

Wi-Fi play uses a native module (`react-native-tcp-socket`), so it does **not** work in Expo Go.
Use a development build:

```bash
npx eas-cli@latest build --profile development --platform android   # or ios
```

Point the app at a deployed server with `EXPO_PUBLIC_SERVER_URL=wss://your-server` (already set for
the `preview` and `production` EAS profiles in `eas.json`).

## Checks

```bash
npm test          # game rules, room host, online server end-to-end
npm run typecheck
npm run lint
```

## Deploy

`render.yaml` defines the online server (`zen-play-server`) and the static web app (`zen-play`).
Update the server URL in `render.yaml` and `eas.json` if your Render service gets a different name.

## How it fits together

```
src/games/      Rules engines (pure TypeScript, no UI): ludo/, snakes/, registry.ts
src/net/        Multiplayer: room-host.ts (authoritative room), protocol.ts, session.ts (app state),
                connection.ts (same-device + WebSocket), lan.native.ts (Wi-Fi TCP host/join)
server/         Online server: WebSocket rooms keyed by code, reusing the same RoomHost
src/app/        Screens: home, game/[id] (choose mode), room (lobby), play, scan, join (deep links)
src/components/ Boards, dice and shared UI
tests/          node:test suites run with tsx
```

Every game runs through one `RoomHost`: on the server for online rooms, on the host phone for Wi-Fi,
and inside the app for same-device play. It validates each move with the game engine, runs computer
players and broadcasts state, so all three modes behave identically.
