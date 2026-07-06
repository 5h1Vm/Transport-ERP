const prisma = require('./lib/prisma');
const { createApp } = require('./app');

async function main() {
  const app = createApp(prisma);
  const port = Number(process.env.PORT || 4000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Transit Ledger API listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});