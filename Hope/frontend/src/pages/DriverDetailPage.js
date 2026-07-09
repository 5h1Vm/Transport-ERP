/**
 * Driver Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import { createRecordCard, createEmptyState, createHeroStat } from '../components/CardComponents.js';
import { currency, formatDate, formatDateTime, editButton, deleteButton, formField, formSubmit } from '../utils/helpers.js';
import { state } from '../store/index.js';

export async function renderDriverDetail(id) {
  const driver = state.data.drivers?.find(d => d.id === id);
  if (!driver) return createEmptyState('Driver not found.');

  const trips = state.data.trips?.filter(t => t.driverIds?.includes(driver.id)) || [];
  const settlements = state.data.driverSettlements?.filter(s => s.driverId === driver.id) || [];
  const advances = state.data.driverAdvances?.filter(a => a.driverId === driver.id) || [];

  const totalTrips = trips.length;
  const settledAmount = settlements.reduce((s, st) => s + st.amount, 0);
  const advanceTotal = advances.reduce((s, a) => s + a.amount, 0);
  const advanceGiven = trips.reduce((s, trip) => {
    const ledger = state.data.driverLedgerEntries?.find(e => e.tripId === trip.id);
    return s + (ledger?.advanceGiven || 0);
  }, 0);
  const outstanding = (driver.advanceBalance || 0) + advanceGiven - settledAmount;

  // This month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const thisMonthTrips = trips.filter(t => t.date && new Date(t.date) >= thisMonthStart && new Date(t.date) <= thisMonthEnd);
  const thisMonthSettlements = settlements.filter(s => s.date && new Date(s.date) >= thisMonthStart && new Date(s.date) <= thisMonthEnd);

  // Calculate this month earnings from trips (via driver ledger entries)
  const thisMonthEarnings = thisMonthTrips.reduce((sum, trip) => {
    const ledger = state.data.driverLedgerEntries?.find(e => e.tripId === trip.id && e.driverId === driver.id);
    return sum + (ledger?.netPayable || ledger?.amount || trip.freightAmount || 0);
  }, 0);

  const thisMonthSettled = thisMonthSettlements.reduce((sum, s) => sum + s.amount, 0);
  const thisMonthOutstanding = thisMonthEarnings - thisMonthSettled;

  // Helper for month display
  const monthName = thisMonthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Hero stats
  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Total Trips', value: totalTrips, helper: 'All time' })}
      ${createHeroStat({ label: `This Month (${monthName})`, value: currency(thisMonthEarnings), helper: `${thisMonthTrips.length} trips • ${currency(thisMonthOutstanding)} outstanding`, className: thisMonthOutstanding > 0 ? 'warning' : 'success' })}
      ${createHeroStat({ label: 'Settled', value: currency(settledAmount), helper: 'Total paid', className: 'success' })}
      ${createHeroStat({ label: 'Outstanding', value: currency(outstanding), helper: 'Advances - Settlements', className: outstanding > 0 ? 'warning' : 'success' })}
      ${createHeroStat({ label: 'Daily Rate', value: currency(driver.dailyRate || 0), helper: 'Per day' })}
    </div>
  `;

  // Settlement form
  const settlementForm = `
    <form data-form="driver-settlement" class="form-grid two-col" data-entity-id="${driver.id}">
      <input type="hidden" name="driverId" value="${driver.id}" />
      ${formField({ label: 'Amount (₹)', type: 'number', id: 'settlement-amount', name: 'amount', placeholder: outstanding > 0 ? outstanding : 0, min: '0', step: '1', required: true })}
      ${formField({ label: 'Date', type: 'date', id: 'settlement-date', name: 'date', required: true })}
      ${formField({ label: 'Method', type: 'select', id: 'settlement-method', name: 'method', options: [
          { value: 'CASH', label: 'Cash' },
          { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
          { value: 'UPI', label: 'UPI' },
          { value: 'CHEQUE', label: 'Cheque' }
        ] })}
      ${formField({ label: 'Reference', type: 'text', id: 'settlement-ref', name: 'reference', placeholder: 'UTR / Note' })}
      <div class="form-field full-width">${formSubmit('driver-settlement')}</div>
    </form>
  `;

  // Settlement history
  const settlementsHtml = settlements.length ? settlements.map(s => createRecordCard({
    title: currency(s.amount),
    subtitle: `${s.method || '—'} • ${s.reference || 'No ref'}`,
    meta: [formatDateTime(s.createdAt), formatDateTime(s.date)],
    actions: deleteButton('driver-settlement', s.id)
  })).join('') : createEmptyState('No settlements recorded.');

  // Advance history
  const advancesHtml = advances.length ? advances.map(a => createRecordCard({
    title: currency(a.amount),
    subtitle: a.reason || 'Advance',
    meta: [formatDateTime(a.createdAt), formatDateTime(a.date)],
    actions: deleteButton('driver-advance', a.id)
  })).join('') : createEmptyState('No advances recorded.');

  // Trip list
  const tripsHtml = trips.length ? trips.map(trip => createRecordCard({
    title: trip.internalRef || trip.id.slice(0, 8),
    subtitle: `${trip.status}${trip.route ? ` • ${trip.route.fromCity} → ${trip.route.toCity}` : ''}`,
    meta: [formatDate(trip.date), currency(trip.freightAmount || 0)],
    chip: trip.status,
    actions: `<a href="#trip/${trip.id}" class="text-link">Detail</a>`
  })).join('') : createEmptyState('No trips assigned.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Driver',
      title: driver.name,
      copy: `${driver.phone} • ${driver.licenseNumber || 'No license'} • ${driver.status || 'Active'}`
    })}
    ${heroStats}

    <!-- This Month Breakdown -->
    <section class="panel-grid white two-col">
      <article class="panel white">
        <div class="panel-head">
          <div><p class="eyebrow dark">${monthName}</p><h3>Earnings</h3></div>
          <span class="chip primary">${thisMonthTrips.length} trips</span>
        </div>
        <p class="page-copy">Gross earnings from trips completed this month</p>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-text);">${currency(thisMonthEarnings)}</div>
      </article>
      <article class="panel white">
        <div class="panel-head">
          <div><p class="eyebrow dark">${monthName}</p><h3>Settlements</h3></div>
          <span class="chip success">${thisMonthSettlements.length} paid</span>
        </div>
        <p class="page-copy">Total amount settled this month</p>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-success);">${currency(thisMonthSettled)}</div>
      </article>
    </section>

    ${thisMonthOutstanding !== 0 ? `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <div class="panel-head">
          <div><p class="eyebrow dark">${monthName}</p><h3>Outstanding Balance</h3></div>
          <span class="chip ${thisMonthOutstanding > 0 ? 'warning' : 'success'}">${thisMonthOutstanding > 0 ? 'Pending' : 'Overpaid'}</span>
        </div>
        <p class="page-copy">${thisMonthOutstanding > 0 ? 'Amount owed to driver' : 'Amount to recover from driver'}</p>
        <div style="font-size: 1.5rem; font-weight: 700; color: ${thisMonthOutstanding > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">
          ${currency(Math.abs(thisMonthOutstanding))}
        </div>
      </article>
    </section>
    ` : ''}

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record settlement</h3>
        ${settlementForm}
      </article>
      <article class="panel white">
        <h3>Settlements (${settlements.length})</h3>
        <div class="stack">${settlementsHtml}</div>
      </article>
    </section>

    <section class="panel-grid white two-col">
      <article class="panel white form-panel">
        <h3>Record advance</h3>
        <form data-form="driver-advance" class="form-grid two-col" data-entity-id="${driver.id}">
          <input type="hidden" name="driverId" value="${driver.id}" />
          ${formField({ label: 'Amount (₹)', type: 'number', id: 'advance-amount', name: 'amount', placeholder: '0', min: '0', step: '1', required: true })}
          ${formField({ label: 'Date', type: 'date', id: 'advance-date', name: 'date', required: true })}
          ${formField({ label: 'Reason', type: 'text', id: 'advance-reason', name: 'reason', placeholder: 'Diesel, Food, etc.' })}
          <div class="form-field full-width">${formSubmit('driver-advance')}</div>
        </form>
      </article>
      <article class="panel white">
        <h3>Advances (${advances.length})</h3>
        <div class="stack">${advancesHtml}</div>
      </article>
    </section>

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Trips (${trips.length})</h3>
        <div class="stack">${tripsHtml}</div>
      </article>
    </section>
  `;

  return content;
}