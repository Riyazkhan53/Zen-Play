This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Zen-Play architecture

- **Games are pure engines** in `src/games/<game>/engine.ts` implementing `GameDef` (`src/games/types.ts`):
  `setup`, `currentSeat`, `applyMove` (returns new state or throws `IllegalMoveError`, never mutates),
  `botMove`, `rankings`. State must be JSON-serialisable. Register new games in `src/games/registry.ts`
  (`ENGINES` + flip `available` in `GAMES`).
- **All multiplayer goes through `RoomHost`** (`src/net/room-host.ts`) — the online server, the Wi-Fi host
  phone and same-device play all use it. Don't add game logic to screens or transports.
- Hidden information: implement `viewFor(state, seats)` on the engine (see UNO). `RoomHost` sends each
  peer only the view for the seats it owns, so other hands and the deck order never leave the host.
  Card UIs use `useHandToShow`/`PassCurtain` so players sharing a device can't see each other's cards.
- Lobby settings: a game's UI module can export `Options` (see Rummy's match format). The host sends
  `setOptions`; `RoomHost` passes them to `engine.setup(seats, rng, options)`. Validate them in the engine.
- Multi-round games keep `currentSeat` non-null between rounds (null means the match is over) and can
  return a longer `botDelayMs` so results stay on screen.
- Each game also has a UI module in `src/game-ui/<game>.tsx` (board, controls, status text) registered
  in `src/game-ui/index.ts`; `src/app/play.tsx` is shared and shouldn't need game-specific code.
- `src/net/lan.native.ts` is native-only (TCP); `src/net/lan.ts` is the web stub. Keep their exports in sync.
- Shared code under `src/games` and `src/net` is imported by `server/` — use relative imports there, not `@/`.
- Run `npm test`, `npm run typecheck` and `npm run lint` before finishing. In this sandbox, prefix Expo
  CLI commands with `EXPO_OFFLINE=1` (expo.dev is not reachable).
