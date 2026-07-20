/**
 * Delete every business record, keeping the schema and the organization.
 *
 *   npm run db:reset-data -- --yes
 *
 * Why this exists: the API guards deletion on purpose — a settled trip cannot
 * be removed, nor a transporter that carries payments — so a database used for
 * demos or testing accumulates records that no endpoint can clear. Those guards
 * are right for an operator and wrong for a reset, so the reset goes around
 * them at the database level instead of weakening them.
 *
 * Runs against whatever DATABASE_URL points at, so it prints the host and
 * requires --yes before touching anything. The Organization and User rows
 * survive: the app resolves an organization on every request and would 500
 * without one.
 */
const prisma = require('../src/lib/prisma');

// Children before parents. CASCADE would make the order moot, but naming it
// keeps the intent readable and the failure legible if a model is added later.
const TABLES = [
  'Payment', 'TripLoad', 'TripStop', 'TripPod', 'TripDriver', 'TripExpense',
  'TransporterLedgerEntry', 'DriverSettlement', 'VehicleExpense', 'Document',
  'LedgerEntry', 'LedgerAccount', 'VehicleLoan', 'RateCard',
  'Trip', 'Route', 'Driver', 'Vehicle', 'Transporter', 'Party'
];

function describeTarget() {
  const url = process.env.DATABASE_URL || '';
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`; // host and database name only — never the credentials
  } catch {
    return '(DATABASE_URL not set or unparseable)';
  }
}

async function main() {
  const target = describeTarget();

  if (!process.argv.includes('--yes')) {
    console.error(
      `\nThis deletes every trip, transporter, vehicle, driver, payment and\n` +
      `ledger entry in:\n\n    ${target}\n\n` +
      `Nothing has been changed. Re-run with --yes to proceed:\n\n` +
      `    npm run db:reset-data -- --yes\n`
    );
    process.exit(1);
  }

  console.log(`Clearing business data in ${target} ...`);
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);

  const [trips, transporters] = await Promise.all([
    prisma.trip.count(),
    prisma.transporter.count()
  ]);
  const org = await prisma.organization.findFirst({ select: { name: true } });

  console.log(`Done. trips=${trips}, transporters=${transporters}.`);
  console.log(org ? `Organization kept: ${org.name}` : 'WARNING: no organization row — run the seed before using the app.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
