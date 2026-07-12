/**
 * Money utilities using Prisma.Decimal for exact arithmetic.
 * All money values stored as Decimal in the DB; these helpers
 * ensure we never lose precision via float intermediate values.
 */
const { Prisma } = require('@prisma/client');

/**
 * Convert a value to a Prisma.Decimal.
 * Accepts number, string, or Prisma.Decimal.
 * Null/undefined/NaN treated as 0.
 * @param {*} value
 * @returns {Prisma.Decimal}
 */
function money(value) {
  if (value == null) return new Prisma.Decimal(0);
  // If already a Prisma.Decimal, return it
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

/**
 * Add two Decimals.
 * @param {Prisma.Decimal|number|string} a
 * @param {Prisma.Decimal|number|string} b
 * @returns {Prisma.Decimal}
 */
function add(a, b) {
  return money(a).plus(money(b));
}

/**
 * Subtract b from a.
 * @param {Prisma.Decimal|number|string} a
 * @param {Prisma.Decimal|number|string} b
 * @returns {Prisma.Decimal}
 */
function sub(a, b) {
  return money(a).minus(money(b));
}

/**
 * Multiply two Decimals.
 * @param {Prisma.Decimal|number|string} a
 * @param {Prisma.Decimal|number|string} b
 * @returns {Prisma.Decimal}
 */
function mul(a, b) {
  return money(a).times(money(b));
}

/**
 * Sum array items by selector returning Decimal.
 * @param {Array} items
 * @param {Function} selector - returns value to sum
 * @returns {Prisma.Decimal}
 */
function sumBy(items, selector) {
  return items.reduce((total, item) => total.plus(money(selector(item))), new Prisma.Decimal(0));
}

/**
 * Convert a Decimal to a JS number rounded to 2 decimal places
 * using ROUND_HALF_UP, for safe JSON output.
 * @param {Prisma.Decimal} decimal
 * @returns {number}
 */
function toRupees(decimal) {
  const dec = money(decimal);
  // round to 2 decimal places, ROUND_HALF_UP
  return dec.round(2).toNumber();
}

module.exports = {
  money,
  add,
  sub,
  mul,
  sumBy,
  toRupees,
};

