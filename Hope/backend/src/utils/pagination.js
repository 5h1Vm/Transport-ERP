/**
 * Pagination helpers — clamp client-supplied values so a single request can
 * never ask the database for an unbounded result set.
 */

function parseLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

module.exports = { parseLimit, parseOffset };
