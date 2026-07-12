const express = require('express');
const { createContext } = require('../context');
const errorHandler = require('../middleware/errorHandler');

const systemRoutes = require('./system');
const referenceRoutes = require('./reference');
const dashboardRoutes = require('./dashboard');
const transporterRoutes = require('./transporters');
const vehicleRoutes = require('./vehicles');
const driverRoutes = require('./drivers');
const routeMasterRoutes = require('./routeMaster');
const tripRoutes = require('./trips');
const paymentRoutes = require('./payments');
const ledgerRoutes = require('./ledger');
const ledgerAccountRoutes = require('./ledger-accounts');

/**
 * Assemble the full API router. Each domain module owns its own routes and
 * receives a shared request context (prisma + org/user helpers). The error
 * handler is mounted last so it catches everything above it.
 */
function createRoutes(prisma) {
  const ctx = createContext(prisma);
  const router = express.Router();

  router.use(systemRoutes(ctx));
  router.use(referenceRoutes(ctx));
  router.use(dashboardRoutes(ctx));
  router.use(transporterRoutes(ctx));
  router.use(vehicleRoutes(ctx));
  router.use(driverRoutes(ctx));
  router.use(routeMasterRoutes(ctx));
  router.use(tripRoutes(ctx));
  router.use(paymentRoutes(ctx));
  router.use(ledgerRoutes(ctx));
  router.use(ledgerAccountRoutes(ctx));

  router.use(errorHandler);

  return router;
}

module.exports = { createRoutes };
