/**
 * Vercel serverless entrypoint.
 *
 * src/index.js is still the entrypoint for a long-lived server (local dev,
 * Docker, Railway): it calls app.listen(). Vercel never calls listen — it
 * hands each request to the exported handler — so this file exports the same
 * Express app without binding a port. Both share createApp(), so there is one
 * definition of the API and no chance of the two drifting apart.
 *
 * The filename is a catch-all, so Vercel routes /api/trips and
 * /api/reports/profit-loss alike here and req.url arrives as the full original
 * path — which is what the app's own `app.use('/api', ...)` mount needs.
 *
 * Single brackets, deliberately. The optional-catch-all spelling [[...path]]
 * is a Next.js convention; in a bare api/ directory Vercel read it as one
 * dynamic segment, so /api/trips resolved but /api/reports/profit-loss came
 * back as an X-Vercel-Error: NOT_FOUND from the router before Express ever
 * saw it. [...path] matches one segment or many.
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
