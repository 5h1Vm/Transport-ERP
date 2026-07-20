const { PrismaClient, Prisma } = require('@prisma/client');

const globalForPrisma = global;

// Create base Prisma client
const prismaBase = globalForPrisma.__transitLedgerPrisma || new PrismaClient({
  log: ['error', 'warn']
});

// Function to convert Prisma.Decimal to number.
//
// NOTE: this used to check `value.constructor.name === 'Decimal'`, which
// never matches — this Prisma build's bundled decimal.js minifies the class
// to a single-letter name (e.g. "i"), not the literal string "Decimal". Use
// `instanceof Prisma.Decimal` instead, which references the same class the
// values are actually built from regardless of minification.
function decimalToNumber(value) {
  if (value instanceof Prisma.Decimal) {
    return Number(value);
  }
  return value;
}

// Extend the Prisma client with result transformation
//
// Two non-obvious Prisma $extends `result` API rules, both violated in an
// earlier version of this file (which is why it silently had zero effect):
//
// 1. Keys must be the lowercase, camelCase model property name as it
//    appears on the Prisma Client (prisma.driver, prisma.trip, ...), NOT the
//    PascalCase schema model name (Driver, Trip, ...). A mismatch is
//    silently ignored, not an error.
// 2. `compute()` does NOT receive the raw field value. It receives an
//    object containing exactly the fields listed in `needs` — so
//    `needs: { amount: true }` means `compute({ amount }) { ... }`, not
//    `compute(amount) { ... }`. Passing the wrapper object straight into
//    decimalToNumber() is a no-op (it's a plain Object, not a Decimal), so
//    the field silently kept its original Decimal value.
const prisma = prismaBase.$extends({
  result: {
    driver: {
      monthlySalary: {
        needs: { monthlySalary: true },
        compute({ monthlySalary }) {
          return decimalToNumber(monthlySalary);
        }
      },
      dailyExpenseRate: {
        needs: { dailyExpenseRate: true },
        compute({ dailyExpenseRate }) {
          return decimalToNumber(dailyExpenseRate);
        }
      }
    },

    driverSettlement: {
      amount: {
        needs: { amount: true },
        compute({ amount }) {
          return decimalToNumber(amount);
        }
      }
    },

    ledgerEntry: {
      amount: {
        needs: { amount: true },
        compute({ amount }) {
          return decimalToNumber(amount);
        }
      }
    },

    payment: {
      amount: {
        needs: { amount: true },
        compute({ amount }) {
          return decimalToNumber(amount);
        }
      },
      tdsAmount: {
        needs: { tdsAmount: true },
        compute({ tdsAmount }) {
          return decimalToNumber(tdsAmount);
        }
      }
    },

    rateCard: {
      ratePerTon: {
        needs: { ratePerTon: true },
        compute({ ratePerTon }) {
          return decimalToNumber(ratePerTon);
        }
      }
    },

    route: {
      ratePerTon: {
        needs: { ratePerTon: true },
        compute({ ratePerTon }) {
          return decimalToNumber(ratePerTon);
        }
      },
      distanceKm: {
        needs: { distanceKm: true },
        compute({ distanceKm }) {
          return distanceKm === null ? null : Number(distanceKm);
        }
      }
    },

    transporter: {
      commissionValue: {
        needs: { commissionValue: true },
        compute({ commissionValue }) {
          return decimalToNumber(commissionValue);
        }
      }
    },

    transporterLedgerEntry: {
      freightCredited: {
        needs: { freightCredited: true },
        compute({ freightCredited }) {
          return decimalToNumber(freightCredited);
        }
      },
      commissionDeducted: {
        needs: { commissionDeducted: true },
        compute({ commissionDeducted }) {
          return decimalToNumber(commissionDeducted);
        }
      },
      netReceivable: {
        needs: { netReceivable: true },
        compute({ netReceivable }) {
          return decimalToNumber(netReceivable);
        }
      },
      outstandingBefore: {
        needs: { outstandingBefore: true },
        compute({ outstandingBefore }) {
          return decimalToNumber(outstandingBefore);
        }
      },
      outstandingAfter: {
        needs: { outstandingAfter: true },
        compute({ outstandingAfter }) {
          return decimalToNumber(outstandingAfter);
        }
      }
    },

    trip: {
      weightTons: {
        needs: { weightTons: true },
        compute({ weightTons }) {
          return decimalToNumber(weightTons);
        }
      },
      freightAmount: {
        needs: { freightAmount: true },
        compute({ freightAmount }) {
          return decimalToNumber(freightAmount);
        }
      },
      freightPerTon: {
        needs: { freightPerTon: true },
        compute({ freightPerTon }) {
          return decimalToNumber(freightPerTon);
        }
      },
      advanceGiven: {
        needs: { advanceGiven: true },
        compute({ advanceGiven }) {
          return decimalToNumber(advanceGiven);
        }
      }
    },

    tripExpense: {
      amount: {
        needs: { amount: true },
        compute({ amount }) {
          return decimalToNumber(amount);
        }
      }
    },

    // Sprint 2B — multi-stop load billing fields, same Decimal→number
    // treatment as Trip's own money/weight fields above.
    tripLoad: {
      weightTons: {
        needs: { weightTons: true },
        compute({ weightTons }) {
          return decimalToNumber(weightTons);
        }
      },
      freightAmount: {
        needs: { freightAmount: true },
        compute({ freightAmount }) {
          return decimalToNumber(freightAmount);
        }
      },
      freightPerTon: {
        needs: { freightPerTon: true },
        compute({ freightPerTon }) {
          return freightPerTon === null ? null : decimalToNumber(freightPerTon);
        }
      },
      commissionValue: {
        needs: { commissionValue: true },
        compute({ commissionValue }) {
          return decimalToNumber(commissionValue);
        }
      }
    },

    vehicle: {
      year: {
        needs: { year: true },
        compute({ year }) {
          return year === null ? null : Number(year);
        }
      }
    },

    vehicleExpense: {
      amount: {
        needs: { amount: true },
        compute({ amount }) {
          return decimalToNumber(amount);
        }
      }
    },

    vehicleLoan: {
      principal: {
        needs: { principal: true },
        compute({ principal }) {
          return decimalToNumber(principal);
        }
      },
      emiAmount: {
        needs: { emiAmount: true },
        compute({ emiAmount }) {
          return decimalToNumber(emiAmount);
        }
      }
    }
  }
});

// Cache the client on the global in EVERY environment, not just development.
//
// The old `NODE_ENV !== 'production'` guard is the standard advice for a
// long-lived server, where the module is required once and the global is
// pointless. On serverless it is actively harmful: NODE_ENV is 'production',
// so each warm invocation re-ran this module and built another PrismaClient,
// each opening its own connection pool against Postgres and never releasing
// it. A few minutes of traffic exhausts max_connections and the API starts
// failing on connection limit rather than anything in the query itself.
// Caching unconditionally means a warm container reuses one client.
globalForPrisma.__transitLedgerPrisma = prismaBase;

module.exports = prisma;
