/**
 * Vercel serverless entrypoint.
 *
 * src/index.js is still the entrypoint for a long-lived server (local dev,
 * Docker, Railway): it calls app.listen(). Vercel never calls listen — it
 * hands each request to the exported handler — so this file exports the same
 * Express app without binding a port. Both share createApp(), so there is one
 * definition of the API and no chance of the two drifting apart.
 *
 * Routing note, learned the hard way. A bare api/ directory on Vercel does not
 * do catch-alls: both [[...path]].js and [...path].js were read as a SINGLE
 * dynamic segment, so /api/trips reached Express while /api/reports/profit-loss
 * was rejected by the router with X-Vercel-Error: NOT_FOUND before the app ever
 * saw it. The vercel.json rewrite beside this file is what actually routes
 * every depth here.
 */
const prisma = require('../src/lib/prisma');
const { createApp } = require('../src/app');

const app = createApp(prisma);

// Same safety net as src/index.js. On Vercel an unhandled rejection would
// otherwise kill the invocation with no usable log line.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

/**
 * The app mounts its routes under `/api`, so it only matches if req.url still
 * carries that prefix. Filesystem routing preserved it, but a rewrite may hand
 * the function the rewritten path instead of the original — and if the prefix
 * were silently dropped, every route would 404 with nothing to explain why.
 * Restoring it here makes the handler correct under either behaviour rather
 * than depending on which one Vercel applies.
 */
module.exports = (req, res) => {
  if (!req.url.startsWith('/api')) {
    req.url = req.url === '/' ? '/api' : `/api${req.url}`;
  }
  return app(req, res);
};
