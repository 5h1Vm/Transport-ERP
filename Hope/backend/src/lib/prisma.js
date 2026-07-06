const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.__transitLedgerPrisma || new PrismaClient({
  log: ['error', 'warn']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__transitLedgerPrisma = prisma;
}

module.exports = prisma;