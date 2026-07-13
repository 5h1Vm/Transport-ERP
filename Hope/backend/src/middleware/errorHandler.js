const { z } = require('zod');

/**
 * Central error handler. Must be registered last, after all routes.
 * Translates Zod validation errors and known Prisma error codes into clean
 * client responses, and hides internal details for anything unexpected.
 */
function errorHandler(error, req, res, next) {
  // Business-logic errors raised inside a transaction (e.g. an overpayment
  // guard) carry their intended HTTP status explicitly, since they can't
  // call res.status() directly without risking a second response after the
  // transaction unwinds.
  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      issues: error.issues
    });
  }

  console.error(error);

  // Unique constraint violation
  if (error.code === 'P2002') {
    return res.status(400).json({
      message: 'A record with these values already exists. Please check for duplicates.'
    });
  }

  // Any other known Prisma error
  if (error.code && error.code.startsWith('P')) {
    return res.status(400).json({
      message: 'Database constraint violation. Please check your input.'
    });
  }

  res.status(500).json({ message: 'Internal server error' });
}

module.exports = errorHandler;
