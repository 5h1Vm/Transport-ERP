/**
 * Ledgers Page - Transporter & Driver ledger summaries
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createPageHeader, createMainLayout } from '../components/Layout.js';
import { currency, formatDate } from '../utils/helpers.js';
import { state } from '../store/index.js';

function renderLedgersPage() {
  const transporters = state.data.transporters || [];
  const drivers = state.data.drivers || [];
  const trips = state.data.trips || [];
  const transporterEntries = state.data.transporterLedgerEntries || [];
  const transporterPayments = state.data.payments?.filter(p => p.type === 'TRANSPORTER') || [];
  const driverSettlements = state.data.driverSettlements || [];

  // Transporter ledger summary
  const transporterSummary = transporters.map(t => {
    const tTrips = trips.filter(tr => tr.transporterId === t.id);
    const tEntries = tTrips.flatMap(tr => transporterEntries.filter(e => e.tripId === tr.id));
    const tPayments = transporterPayments.filter(p => p.transporterId === t.id);

    const totalFreight = tEntries.reduce((sum, e) => sum + (e.netReceivable || 0), 0);
    const totalPaid = tPayments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = totalFreight - totalPaid;

    // Advance given to drivers on these trips
    const driverEntries = tTrips.flatMap(tr => {
      const de = state.data.driverLedgerEntries?.filter(e => e.tripId === tr.id);
      return de || [];
    });
    const totalAdvance = driverEntries.reduce((sum, e) => sum + (e.advanceGiven || 0), 0);

    return { transporter: t, totalFreight: currency(totalFreight), totalPaid: currency(totalPaid), outstanding: currency(outstanding), totalAdvance: currency(totalAdvance), trips: tTrips.length };
  });

  // Driver ledger summary
  const driverSummary = drivers.map(d => {
    const dTrips = trips.filter(tr => tr.driverIds?.includes(d.id));
    const dSettlements = driverSettlements.filter(s => s.driverId === d.id);
    const dEntries = dTrips.flatMap(tr => {
      const de = state.data.driverLedgerEntries?.filter(e => e.tripId === tr.id);
      return de || [];
    });

    const totalAdvance = dEntries.reduce((sum, e) => sum + (e.advanceGiven || 0), 0);
    const totalSettled = dSettlements.reduce((sum, s) => sum + s.amount, 0);
    const openingBalance = d.advanceBalance || 0;
    const outstanding = openingBalance + totalAdvance - totalSettled;

    return { driver: d, trips: dTrips.length, totalAdvance: currency(totalAdvance), totalSettled: currency(totalSettled), outstanding: currency(outstanding), openingBalance: currency(openingBalance) };
  });

  const transporterHtml = transporterSummary.length
    ? transporterSummary.map(item => createRecordCard({
        title: item.transporter.firmName,
        subtitle: `${item.transporter.contactPerson || 'No contact'} • ${item.transporter.phone || 'No phone'}`,
        meta: [
          `Trips: ${item.trips}`,
          `Freight: ${item.totalFreight}`,
          `Paid: ${item.totalPaid}`,
          `Advance: ${item.totalAdvance}`,
          `Outstanding: ${item.outstanding}`
        ],
        actions: `<a href="#transporter/${item.transporter.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No transporter records.');

  const driverHtml = driverSummary.length
    ? driverSummary.map(item => createRecordCard({
        title: item.driver.name,
        subtitle: `${item.driver.phone || 'No phone'} • License: ${item.driver.licenseNumber || 'N/A'}`,
        meta: [
          `Trips: ${item.trips}`,
          `Opening: ${item.openingBalance}`,
          `Advance: ${item.totalAdvance}`,
          `Settled: ${item.totalSettled}`,
          `Outstanding: ${item.outstanding}`
        ],
        actions: `<a href="#driver/${item.driver.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No driver records.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Ledgers',
      title: 'Outstanding balances',
      copy: 'Consolidated view of transporter and driver balances. Click through for detailed ledger.'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white full-width">
        <h3>Transporter outstanding</h3>
        <div class="stack">${transporterHtml}</div>
      </article>
      <article class="panel white full-width">
        <h3>Driver outstanding</h3>
        <div class="stack">${driverHtml}</div>
      </article>
    </section>
  `;

  return createMainLayout('ledgers', content);
}

export { renderLedgersPage };