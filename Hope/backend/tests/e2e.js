/**
 * End-to-end behavioural test of the Transit Ledger API.
 *
 * Drives the real HTTP API exactly as the UI does, asserting the arithmetic at
 * every step: commission across all three types, the status lifecycle and its
 * illegal transitions, TDS, the overpayment guard, cancellation, multi-stop
 * loads, the driver ledger, and the profit-and-loss totals.
 *
 *   npm run test:e2e          # against a local server on :4000
 *
 * THIS SUITE WRITES DATA. It creates fixtures prefixed QA<timestamp> and
 * removes them afterwards — but not all of them can go: the API deliberately
 * refuses to delete a settled trip, or a transporter carrying payments, so a
 * fully-exercised fixture set survives its own cleanup by design. On a
 * throwaway local database that is harmless. On a real one it is permanent
 * litter that no endpoint can remove.
 *
 * Hence the guard below. Pointing this at anything but localhost needs
 * ALLOW_REMOTE=1 set deliberately, because that is a decision to leave
 * residue in whatever database is on the other end.
 */
const API = process.env.API || 'http://localhost:4000/api';

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(API);
if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
  console.error(
    `\nRefusing to run against a non-local API: ${API}\n\n` +
    `This suite creates records it cannot fully delete afterwards.\n` +
    `If you really mean to leave test data there, set ALLOW_REMOTE=1.\n`
  );
  process.exit(2);
}

let pass = 0, fail = 0;
const failures = [];
const cleanup = { trips: [], transporters: [], vehicles: [], drivers: [] };

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else {
    fail++; failures.push(`${name}\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`);
    console.log(`  FAIL  ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function checkThat(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name} ${detail}`); console.log(`  FAIL  ${name} ${detail}`); }
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
const get = (p) => api(p);
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });
const patch = (p, b) => api(p, { method: 'PATCH', body: JSON.stringify(b) });
const del = (p) => api(p, { method: 'DELETE' });

const iso = (d) => new Date(d).toISOString();
const tag = `QA${Date.now().toString().slice(-6)}`;

async function main() {
  console.log(`\n=== Transit Ledger E2E (${API}) ===\n`);

  // ---- Fixtures -----------------------------------------------------------
  console.log('[fixtures]');
  const tA = (await post('/transporters', { firmName: `${tag} Rajasthan Cargo`, contactPerson: 'A', phone: '9000000011' })).body;
  const tB = (await post('/transporters', { firmName: `${tag} Punjab Speed`, contactPerson: 'B', phone: '9000000012' })).body;
  const veh = (await post('/vehicles', { vehicleNumber: `RJ14${tag.slice(-4)}`, make: 'Tata', model: 'Truck', ownershipStatus: 'OWNED' })).body;
  const drv = (await post('/drivers', { name: `${tag} Kuldeep`, phone: '9000000013', monthlySalary: 20000 })).body;
  cleanup.transporters.push(tA.id, tB.id); cleanup.vehicles.push(veh.id); cleanup.drivers.push(drv.id);
  checkThat('fixtures created', !!(tA.id && tB.id && veh.id && drv.id));

  // ---- 1. Fixed-amount trip, no commission --------------------------------
  console.log('\n[1] fixed-amount trip, zero commission');
  const t1 = (await post('/trips', {
    transporterId: tA.id, vehicleId: veh.id, driverIds: [drv.id],
    originCity: 'Jaipur', destinationCity: 'Delhi', material: 'Cement',
    freightAmount: 42000, commissionType: 'PERCENTAGE', commissionValue: 0,
    departureDate: iso('2026-07-05'), deliveryDate: iso('2026-07-06')
  })).body;
  cleanup.trips.push(t1.id);
  check('freight stored', Number(t1.freightAmount), 42000);
  check('starts as DRAFT', t1.status, 'DRAFT');
  check('outstanding = freight', (await get(`/trips/${t1.id}`)).body.financialSummary.outstanding, 42000);
  check('driver linked', (await get(`/trips/${t1.id}`)).body.drivers.length, 1);

  // ---- 2. Weight x rate + percentage commission ----------------------------
  console.log('\n[2] weight x rate trip, 2% commission');
  const t2 = (await post('/trips', {
    transporterId: tB.id, vehicleId: veh.id,
    originCity: 'Mumbai', destinationCity: 'Pune',
    weightTons: 20, freightPerTon: 2000,
    commissionType: 'PERCENTAGE', commissionValue: 2,
    departureDate: iso('2026-07-07'), deliveryDate: iso('2026-07-08')
  })).body;
  cleanup.trips.push(t2.id);
  check('20t x Rs2000 = 40000', Number(t2.freightAmount), 40000);
  check('2% commission deducted -> 39200 outstanding', (await get(`/trips/${t2.id}`)).body.financialSummary.outstanding, 39200);
  check('ledger entry commission = 800', Number((await get(`/trips/${t2.id}`)).body.ledgerEntries[0].commissionDeducted), 800);

  // ---- 3. Commission types -------------------------------------------------
  console.log('\n[3] other commission types');
  const t3 = (await post('/trips', {
    transporterId: tA.id, vehicleId: veh.id, originCity: 'X', destinationCity: 'Y',
    freightAmount: 10000, commissionType: 'FIXED_PER_TRIP', commissionValue: 1500,
    departureDate: iso('2026-07-09'), deliveryDate: iso('2026-07-09')
  })).body;
  cleanup.trips.push(t3.id);
  check('FIXED_PER_TRIP 1500 -> 8500', (await get(`/trips/${t3.id}`)).body.financialSummary.outstanding, 8500);

  const t4 = (await post('/trips', {
    transporterId: tA.id, vehicleId: veh.id, originCity: 'X', destinationCity: 'Y',
    weightTons: 10, freightAmount: 30000, commissionType: 'FIXED_PER_TON', commissionValue: 100,
    departureDate: iso('2026-07-09'), deliveryDate: iso('2026-07-09')
  })).body;
  cleanup.trips.push(t4.id);
  check('FIXED_PER_TON 10t x 100 -> 29000', (await get(`/trips/${t4.id}`)).body.financialSummary.outstanding, 29000);

  // ---- 4. Status lifecycle -------------------------------------------------
  console.log('\n[4] status lifecycle');
  for (const s of ['LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED']) {
    const r = await patch(`/trips/${t1.id}/status`, { status: s });
    checkThat(`DRAFT..->${s}`, r.status === 200, `HTTP ${r.status}`);
  }
  const skip = await patch(`/trips/${t2.id}/status`, { status: 'DELIVERED' });
  check('illegal skip DRAFT->DELIVERED blocked', skip.status, 400);
  const settleEarly = await patch(`/trips/${t1.id}/status`, { status: 'SETTLED' });
  check('SETTLED blocked while money outstanding', settleEarly.status, 400);
  checkThat('...with an explanatory message', /outstanding/i.test(settleEarly.body.message || ''), settleEarly.body.message);
  const podDate = (await get(`/trips/${t1.id}`)).body.podReceivedDate;
  checkThat('POD date auto-stamped', !!podDate, String(podDate));

  // ---- 5. Payments, TDS, overpayment --------------------------------------
  console.log('\n[5] payments');
  const over = await post('/payments', { transporterId: tA.id, tripId: t1.id, amount: 50000, mode: 'CASH', paymentType: 'FULL_SETTLEMENT' });
  check('overpayment blocked', over.status, 400);
  checkThat('...names the allowed amount', /42000/.test(over.body.message || ''), over.body.message);

  const part = await post('/payments', { transporterId: tA.id, tripId: t1.id, amount: 20000, mode: 'BANK_TRANSFER', paymentType: 'PART_PAYMENT', referenceNumber: 'NEFT/QA/1' });
  check('partial payment accepted', part.status, 201);
  check('outstanding after 20000 of 42000', (await get(`/trips/${t1.id}`)).body.financialSummary.outstanding, 22000);
  check('paymentStatus PARTIALLY_PAID', (await get(`/trips/${t1.id}`)).body.financialSummary.paymentStatus, 'PARTIALLY_PAID');

  const tds = await post('/payments', { transporterId: tA.id, tripId: t1.id, amount: 22000, mode: 'BANK_TRANSFER', paymentType: 'FULL_SETTLEMENT', applyTds: true });
  check('final payment accepted', tds.status, 201);
  check('1% TDS recorded on 22000', Number(tds.body.tdsAmount ?? tds.body.payment?.tdsAmount), 220);
  const t1after = (await get(`/trips/${t1.id}`)).body;
  check('outstanding now zero', t1after.financialSummary.outstanding, 0);
  check('TDS did NOT reduce what came off outstanding', t1after.financialSummary.tripPaymentTotal, 42000);
  // Paying off a BILLED trip auto-advances it to SETTLED, so no manual step.
  check('fully-paid BILLED trip auto-settles', (await get(`/trips/${t1.id}`)).body.status, 'SETTLED');

  // ---- 6. Cancellation -----------------------------------------------------
  console.log('\n[6] cancellation');
  await patch(`/trips/${t3.id}/status`, { status: 'LOADING' });
  const cancel = await patch(`/trips/${t3.id}/status`, { status: 'CANCELLED' });
  check('cancel accepted', cancel.status, 200);
  const t3after = (await get(`/trips/${t3.id}`)).body;
  check('cancelled trip owes nothing', t3after.financialSummary.outstanding, 0);
  check('cancelled trip charges nothing', t3after.financialSummary.chargeTotal, 0);
  check('cancelled flag surfaced to UI', t3after.financialSummary.isCancelled, true);
  const reopen = await patch(`/trips/${t3.id}/status`, { status: 'LOADING' });
  check('cancelled trip cannot be reopened', reopen.status, 400);

  // Cancel one that has a delivery date, to prove it leaves the P&L.
  const t5 = (await post('/trips', {
    transporterId: tA.id, vehicleId: veh.id, originCity: 'P', destinationCity: 'Q',
    freightAmount: 77000, commissionType: 'PERCENTAGE', commissionValue: 0,
    departureDate: iso('2026-07-10'), deliveryDate: iso('2026-07-10')
  })).body;
  cleanup.trips.push(t5.id);
  const plBefore = (await get('/reports/profit-loss?from=2026-07-01&to=2026-07-31')).body;
  const revBefore = (plBefore.byTransporter.find(r => r.transporterId === tA.id) || {}).revenue || 0;
  for (const s of ['LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']) await patch(`/trips/${t5.id}/status`, { status: s });
  const plAfter = (await get('/reports/profit-loss?from=2026-07-01&to=2026-07-31')).body;
  const revAfter = (plAfter.byTransporter.find(r => r.transporterId === tA.id) || {}).revenue || 0;
  check('delivered-then-cancelled trip leaves P&L revenue', revBefore - revAfter, 77000);

  // ---- 7. Transporter ledger ----------------------------------------------
  console.log('\n[7] transporter ledger');
  const tAfull = (await get(`/transporters/${tA.id}`)).body;
  // Live trips for tA: t1 (42000, settled, paid 42000) and t4 (29000 net, unpaid).
  check('gross freight excludes cancelled', tAfull.grossFreightTotal, 72000);
  check('commission total', tAfull.commissionTotal, 1000);
  check('net freight', tAfull.freightTotal, 71000);
  check('paid total', tAfull.paidTotal, 42000);
  check('outstanding = net - paid', tAfull.outstanding, 29000);
  const tBfull = (await get(`/transporters/${tB.id}`)).body;
  check('second transporter isolated', tBfull.outstanding, 39200);

  const dash = (await get('/dashboard')).body;
  const dashA = dash.transporterBalances.find(b => b.id === tA.id);
  check('dashboard agrees with ledger', dashA.outstanding, 29000);

  // ---- 8. Driver settlements ----------------------------------------------
  console.log('\n[8] driver ledger');
  await post(`/drivers/${drv.id}/settlements`, { type: 'ALLOWANCE', amount: 5000, date: iso('2026-07-06') });
  let d = (await get(`/drivers/${drv.id}`)).body;
  check('allowance owed to driver', d.outstandingBalance, 5000);
  await post(`/drivers/${drv.id}/settlements`, { type: 'ADVANCE', amount: 2000, date: iso('2026-07-06') });
  d = (await get(`/drivers/${drv.id}`)).body;
  check('advance nets off what is owed', d.outstandingBalance, 3000);

  // Transporter-funded advance reduces that transporter's receivable.
  const beforeFunded = (await get(`/transporters/${tB.id}`)).body.outstanding;
  await post(`/drivers/${drv.id}/settlements`, { type: 'ADVANCE', amount: 1200, fundedByTransporterId: tB.id, date: iso('2026-07-08') });
  const afterFunded = (await get(`/transporters/${tB.id}`)).body.outstanding;
  check('transporter-funded advance cuts their outstanding', beforeFunded - afterFunded, 1200);

  // ---- 9. Multi-stop trip --------------------------------------------------
  console.log('\n[9] multi-stop trip');
  const ms = (await post('/trips', {
    transporterId: tA.id, vehicleId: veh.id,
    commissionType: 'PERCENTAGE', commissionValue: 0, freightAmount: 0,
    departureDate: iso('2026-07-12'), deliveryDate: iso('2026-07-14'),
    stops: [{ location: 'Jaipur' }, { location: 'Agra' }, { location: 'Kanpur' }],
    loads: [
      { originIndex: 0, destinationIndex: 1, transporterId: tA.id, freightAmount: 30000, commissionType: 'PERCENTAGE', commissionValue: 10 },
      { originIndex: 1, destinationIndex: 2, transporterId: tB.id, freightAmount: 20000, commissionType: 'FIXED_PER_TRIP', commissionValue: 2000 }
    ]
  }));
  checkThat('multi-stop trip created', ms.status === 201, `HTTP ${ms.status} ${JSON.stringify(ms.body).slice(0, 200)}`);
  const msTrip = ms.body;
  if (msTrip && msTrip.id) {
    cleanup.trips.push(msTrip.id);
    check('three stops recorded', msTrip.stops.length, 3);
    check('two loads recorded', msTrip.loads.length, 2);
    const full = (await get(`/trips/${msTrip.id}`)).body;
    const sums = full.loadSummaries;
    check('load 1 net = 30000 - 10%', sums[0].netReceivable, 27000);
    check('load 2 net = 20000 - 2000', sums[1].netReceivable, 18000);
    check('no legacy ledger entry for multi-stop', full.ledgerEntries.length, 0);

    // Each load bills its own transporter.
    const aOut = (await get(`/transporters/${tA.id}`)).body.outstanding;
    check('load 1 added to transporter A', aOut, 29000 + 27000);
    const bOut = (await get(`/transporters/${tB.id}`)).body.outstanding;
    check('load 2 added to transporter B', bOut, 39200 - 1200 + 18000);

    // Add a stop and a load to a live trip.
    const stop = await post(`/trips/${msTrip.id}/stops`, { location: 'Lucknow' });
    check('stop appended to live trip', stop.status, 201);
    const stops = (await get(`/trips/${msTrip.id}`)).body.stops;
    check('appended stop sequenced last', stops[stops.length - 1].sequence, 3);
    const addLoad = await post(`/trips/${msTrip.id}/loads`, {
      originStopId: stops[2].id, destinationStopId: stops[3].id,
      transporterId: tA.id, freightAmount: 5000, commissionType: 'PERCENTAGE', commissionValue: 0
    });
    check('load appended to live trip', addLoad.status, 201);
    check('appended load billed', (await get(`/transporters/${tA.id}`)).body.outstanding, 29000 + 27000 + 5000);
    const sameStop = await post(`/trips/${msTrip.id}/loads`, {
      originStopId: stops[0].id, destinationStopId: stops[0].id,
      transporterId: tA.id, freightAmount: 100, commissionType: 'PERCENTAGE', commissionValue: 0
    });
    check('load with same origin and destination rejected', sameStop.status, 400);

    // Pay off one load only.
    const loadPay = await post('/payments', { transporterId: tB.id, loadId: msTrip.loads[1].id, amount: 18000, mode: 'UPI', paymentType: 'FULL_SETTLEMENT' });
    check('per-load payment accepted', loadPay.status, 201);
    const bAfter = (await get(`/transporters/${tB.id}`)).body.outstanding;
    check('per-load payment cleared that load', bAfter, 39200 - 1200);
  }

  // ---- 10. Expenses and P&L ------------------------------------------------
  console.log('\n[10] expenses and profit & loss');
  const exp = await post(`/trips/${t2.id}/expenses`, { category: 'FUEL', amount: 8000, description: 'Diesel' });
  check('trip expense recorded', exp.status, 201);
  const pl = (await get('/reports/profit-loss?from=2026-07-01&to=2026-07-31')).body;
  checkThat('P&L revenue is a number', typeof pl.revenue === 'number', String(pl.revenue));
  checkThat('P&L costs include the fuel expense', pl.costs.total >= 8000, JSON.stringify(pl.costs).slice(0, 120));
  check('net profit = revenue - costs', Math.round((pl.revenue - pl.costs.total) * 100) / 100, Math.round(pl.netProfit * 100) / 100);
  const plVeh = pl.byVehicle.find(v => v.vehicleId === veh.id);
  checkThat('per-vehicle revenue reported', !!plVeh, JSON.stringify(pl.byVehicle).slice(0, 120));

  // ---- 11. Validation and guards -------------------------------------------
  console.log('\n[11] validation guards');
  check('negative payment rejected', (await post('/payments', { transporterId: tA.id, tripId: t4.id, amount: -100, mode: 'CASH' })).status, 400);
  check('bad payment mode rejected', (await post('/payments', { transporterId: tA.id, tripId: t4.id, amount: 100, mode: 'BITCOIN' })).status, 400);
  check('trip without transporter rejected', (await post('/trips', { vehicleId: veh.id, freightAmount: 1000 })).status, 400);
  check('unknown trip 404s', (await get('/trips/cmxxxxxxxxxxxxxxxxxxxxxxx')).status, 404);
  check('bad status value rejected', (await patch(`/trips/${t4.id}/status`, { status: 'TELEPORTED' })).status, 400);
  check('transporter with trips cannot be deleted', (await del(`/transporters/${tA.id}`)).status, 400);
  check('settled trip cannot be deleted', (await del(`/trips/${t1.id}`)).status, 400);

  // ---- 12. Reference data + listings --------------------------------------
  console.log('\n[12] listings');
  for (const p of ['/trips', '/transporters', '/vehicles', '/drivers', '/routes', '/payments', '/reference-data', '/dashboard', '/transporter-ledger-entries']) {
    const r = await get(p);
    checkThat(`GET ${p}`, r.status === 200, `HTTP ${r.status}`);
  }
  const filtered = await get(`/trips?status=SETTLED`);
  checkThat('trip status filter works', filtered.status === 200 && (filtered.body.trips || filtered.body).every(t => t.status === 'SETTLED'), 'filter returned other statuses');

  // ---- Cleanup -------------------------------------------------------------
  console.log('\n[cleanup]');
  for (const id of cleanup.trips.reverse()) await del(`/trips/${id}`);
  for (const id of cleanup.transporters) await del(`/transporters/${id}`);
  for (const id of cleanup.vehicles) await del(`/vehicles/${id}`);
  for (const id of cleanup.drivers) await del(`/drivers/${id}`);
  // A settled trip is deliberately undeletable, so its transporter survives
  // cleanup by design — report what is left rather than asserting zero.
  const leftover = (await get('/transporters')).body.filter(t => t.firmName.startsWith(tag));
  console.log(`  note  ${leftover.length} fixture transporter(s) retained (settled trips cannot be deleted)`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
