/**
 * Vercel serverless entrypoint.
 *
 * src/index.js is still the entrypoint for a long-lived server (local dev,
 * Docker, Railway): it calls app.listen(). Vercel never calls listen — it
 * hands each request to the exported handler — so this file exports the same
 * Express app without binding a port. Both share createApp(), so there is one
 * definition of the API and no chance of the two drifting apart.
 *
 * The filename is an optional catch-all, so Vercel routes both /api and
 * /api/anything/deep here by filesystem convention and req.url arrives as the
 * full original path — which is what the app's own `app.use('/api', ...)`
 * mount needs to match. This replaced an api/index.js plus a vercel.json
 * rewrite: that combination depended on the rewrite layer preserving req.url
 * rather than collapsing it to /api, which is not something I could verify
 * without deploying. Filesystem routing has no such ambiguity.
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
