const prisma = require('../src/lib/prisma');

async function seed() {
  console.log('Seed command is intentionally empty. Use the app to create real records.');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });