/**
 * Vercel serverless entrypoint.
 *
 * src/index.js is still the entrypoint for a long-lived server (local dev,
 * Docker, Railway): it calls app.listen(). Vercel never calls listen — it
 * hands each request to the exported handler — so this file exports the same
 * Express app without binding a port. Both share createApp(), so there is one
 * definition of the API and no chance of the two drifting apart.
 *
 * The vercel.json beside this file rewrites every /api/* request here, and
 * req.url still carries the full original path, so the app's own
 * `app.use('/api', ...)` mount continues to match unchanged.
 */
const prisma = require('../src/lib/prisma');
const { createApp } = require('../src/app');

// Same safety net as src/index.js. On Vercel an unhandled rejection would
// otherwise kill the invocation with no usable log line.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

module.exports = createApp(prisma);
