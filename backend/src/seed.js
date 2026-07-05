// Seed script — creates one demo org with vehicles, drivers, transporters,
// routes, rate cards, and parties. Run: node src/seed.js
require('dotenv').config();
const prisma = require('./prismaClient');

async function main() {
  console.log('Seeding...');

  // Org
  const org = await prisma.organisation.upsert({
    where: { id: 'org-demo-001' },
    update: {},
    create: { id: 'org-demo-001', name: 'Demo Transports Pvt Ltd' },
  });

  // Vehicles
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({ where: { vehicleNumber: 'GJ01AB1234' }, update: {}, create: { orgId: org.id, vehicleNumber: 'GJ01AB1234', capacity: 20, ownershipStatus: 'own' } }),
    prisma.vehicle.upsert({ where: { vehicleNumber: 'MH04CD5678' }, update: {}, create: { orgId: org.id, vehicleNumber: 'MH04CD5678', capacity: 15, ownershipStatus: 'own' } }),
    prisma.vehicle.upsert({ where: { vehicleNumber: 'RJ14EF9012' }, update: {}, create: { orgId: org.id, vehicleNumber: 'RJ14EF9012', capacity: 25, ownershipStatus: 'attached' } }),
  ]);

  // Drivers
  const drivers = await Promise.all([
    prisma.driver.upsert({ where: { id: 'drv-001' }, update: {}, create: { id: 'drv-001', orgId: org.id, name: 'Ramesh Kumar', licenseNumber: 'GJ0120220012345', mobileNumber: '9876543210' } }),
    prisma.driver.upsert({ where: { id: 'drv-002' }, update: {}, create: { id: 'drv-002', orgId: org.id, name: 'Suresh Yadav',  licenseNumber: 'MH0420210054321', mobileNumber: '9876543211' } }),
    prisma.driver.upsert({ where: { id: 'drv-003' }, update: {}, create: { id: 'drv-003', orgId: org.id, name: 'Mahesh Singh',  licenseNumber: 'RJ1420190087654', mobileNumber: '9876543212' } }),
  ]);

  // Transporters
  const t1 = await prisma.transporter.upsert({ where: { id: 'trp-001' }, update: {}, create: { id: 'trp-001', orgId: org.id, firmName: 'Mundra Freight Co.',    commissionType: 'percentage', commissionValue: 5, bankName: 'HDFC', bankAccount: '123400001111', ifsc: 'HDFC0001234' } });
  const t2 = await prisma.transporter.upsert({ where: { id: 'trp-002' }, update: {}, create: { id: 'trp-002', orgId: org.id, firmName: 'Bhiwandi Cargo Ltd.',  commissionType: 'percentage', commissionValue: 4, bankName: 'ICICI', bankAccount: '123400002222', ifsc: 'ICIC0001234' } });
  const t3 = await prisma.transporter.upsert({ where: { id: 'trp-003' }, update: {}, create: { id: 'trp-003', orgId: org.id, firmName: 'Pune Road Carriers',   commissionType: 'fixed',      commissionValue: 1500, bankName: 'SBI', bankAccount: '123400003333', ifsc: 'SBIN0001234' } });

  // Parties
  await Promise.all([
    prisma.party.upsert({ where: { id: 'pty-001' }, update: {}, create: { id: 'pty-001', orgId: org.id, partyName: 'Aslam Traders',     gstNumber: '24AABCT1234A1Z5' } }),
    prisma.party.upsert({ where: { id: 'pty-002' }, update: {}, create: { id: 'pty-002', orgId: org.id, partyName: 'Mohsin Enterprises', gstNumber: '27AABCM5678B1Z3' } }),
    prisma.party.upsert({ where: { id: 'pty-003' }, update: {}, create: { id: 'pty-003', orgId: org.id, partyName: 'HP Body Works',      gstNumber: '08AABHP9012C1Z1' } }),
  ]);

  // Routes
  const r1 = await prisma.route.upsert({ where: { id: 'rte-001' }, update: {}, create: { id: 'rte-001', orgId: org.id, origin: 'Mundra',  destination: 'Gandhidham' } });
  const r2 = await prisma.route.upsert({ where: { id: 'rte-002' }, update: {}, create: { id: 'rte-002', orgId: org.id, origin: 'Mumbai',  destination: 'Bhiwandi' } });
  const r3 = await prisma.route.upsert({ where: { id: 'rte-003' }, update: {}, create: { id: 'rte-003', orgId: org.id, origin: 'Mundra',  destination: 'Pune' } });
  const r4 = await prisma.route.upsert({ where: { id: 'rte-004' }, update: {}, create: { id: 'rte-004', orgId: org.id, origin: 'Thane',   destination: 'Bandung' } });

  // Rate Cards (Transporter x Route)
  await Promise.all([
    prisma.rateCard.upsert({ where: { transporterId_routeId: { transporterId: t1.id, routeId: r1.id } }, update: {}, create: { transporterId: t1.id, routeId: r1.id, ratePerUnit: 4200, unit: 'tonne' } }),
    prisma.rateCard.upsert({ where: { transporterId_routeId: { transporterId: t1.id, routeId: r3.id } }, update: {}, create: { transporterId: t1.id, routeId: r3.id, ratePerUnit: 4150, unit: 'tonne' } }),
    prisma.rateCard.upsert({ where: { transporterId_routeId: { transporterId: t2.id, routeId: r2.id } }, update: {}, create: { transporterId: t2.id, routeId: r2.id, ratePerUnit: 4270, unit: 'tonne' } }),
    prisma.rateCard.upsert({ where: { transporterId_routeId: { transporterId: t2.id, routeId: r4.id } }, update: {}, create: { transporterId: t2.id, routeId: r4.id, ratePerUnit: 4350, unit: 'tonne' } }),
    prisma.rateCard.upsert({ where: { transporterId_routeId: { transporterId: t3.id, routeId: r3.id } }, update: {}, create: { transporterId: t3.id, routeId: r3.id, ratePerUnit: 4000, unit: 'tonne' } }),
  ]);

  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
