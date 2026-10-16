import { startServer } from './app';

const PORT = Number(process.env.PORT) || 8787;

startServer(PORT).then(({ port }) => {
  console.log(`[zen-play] multiplayer server on :${port}`);
});
