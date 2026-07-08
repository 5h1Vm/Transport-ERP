const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Finding duplicate transporters...');

  const transporters = await prisma.transporter.findMany({
    select: { id: true, firmName: true, organizationId: true }
  });

  // Group by orgId + firmName
  const groups = {};
  transporters.forEach(t => {
    const key = t.organizationId + '|' + t.firmName;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  let deletedCount = 0;

  for (const [key, items] of Object.entries(groups)) {
    if (items.length > 1) {
      console.log('Duplicate group:', key);
      // Keep the first one, delete the rest
      const keep = items[0];
      const toDelete = items.slice(1);

      // Update related records to point to the kept transporter
      for (const dup of toDelete) {
        console.log('  Deleting:', dup.id, dup.firmName);

        // Update trips to use the kept transporter
        await prisma.trip.updateMany({
          where: { transporterId: dup.id },
          data: { transporterId: keep.id }
        });

        // Update rate cards
        await prisma.rateCard.updateMany({
          where: { transporterId: dup.id },
          data: { transporterId: keep.id }
        });

        // Update ledger entries
        await prisma.transporterLedgerEntry.updateMany({
          where: { transporterId: dup.id },
          data: { transporterId: keep.id }
        });

        // Update payments
        await prisma.payment.updateMany({
          where: { transporterId: dup.id },
          data: { transporterId: keep.id }
        });

        // Delete the duplicate transporter
        await prisma.transporter.delete({ where: { id: dup.id } });
        deletedCount++;
      }
    }
  }

  console.log(`Fixed ${deletedCount} duplicate transporters.`);
  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });