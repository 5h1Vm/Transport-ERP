/**
 * Wraps an async route handler so any rejected promise is forwarded to Express's
 * error handler instead of crashing the process as an unhandled rejection.
 */
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = asyncHandler;
