const prisma = require('./lib/prisma');
const { createApp } = require('./app');

// Route-level errors are caught by asyncHandler and never reach here. This is
// the safety net for anything outside a request's promise chain (e.g. a
// Prisma connection-pool error firing async) — without it, Node kills the
// entire process on any unhandled rejection, taking the whole API down for
// one bad query.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

async function main() {
  const app = createApp(prisma);
  const port = Number(process.env.PORT || 4000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Transit Ledger API listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});