const { PrismaClient } = require('@prisma/client');
const { calculateDriverTripExpenses } = require('./src/services/calculations');

const prisma = new PrismaClient();

async function test() {
  const result = await calculateDriverTripExpenses(prisma, 'cmra759kx000c3rlgq4dvnucf');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

test().catch(console.error);
