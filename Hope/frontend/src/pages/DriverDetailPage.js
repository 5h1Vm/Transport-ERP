/**
 * Driver Detail Page
 */
import { createPageHeader } from '../components/Layout.js';
import { createRecordCard, createEmptyState, createHeroStat } from '../components/CardComponents.js';
import { currency, formatDate, formatDateTime, formatStatus, getStatusChipClass, deleteButton } from '../utils/helpers.js';
import * as api from '../services/api.js';

const SETTLEMENT_TYPES = ['SALARY', 'INCENTIVE', 'ADVANCE', 'DEDUCTION', 'PENALTY', 'CASH_COLLECTED', 'ALLOWANCE'];

export async function renderDriverDetail(id) {
  let driver, trips;
  try {
    [driver, trips] = await Promise.all([
      api.driver.get(id),
      api.trip.list({ driverId: id, limit: 200 })
    ]);
  } catch (error) {
    return `<div class="error-card">Failed to load driver: ${error.message}</div>`;
  }
  if (!driver) return createEmptyState('Driver not found.');

  const settlements = driver.settlements || [];
  // Trip expenses this driver was paid directly (diesel/toll/etc handed to them).
  const expenses = driver.expenses || [];

  const heroStats = `
    <div class="hero-stats">
      ${createHeroStat({ label: 'Trips', value: trips.length, helper: 'All time' })}
      ${createHeroStat({ label: 'Settlements paid', value: currency(driver.settlementTotal || 0), helper: `${settlements.length} entries`, className: 'success' })}
      ${createHeroStat({ label: 'Accrued (owed)', value: currency(driver.outstandingBalance || 0), helper: 'Settlements + expenses + daily bhatta', className: (driver.outstandingBalance || 0) > 0 ? 'warning' : 'success' })}
      ${createHeroStat({ label: 'Daily rate', value: currency(driver.dailyExpenseRate || 0), helper: 'Per day on trip' })}
    </div>
  `;

  // Matches the real settlementSchema on the backend: type, amount, tripId
  // (optional), description, date. There is no separate "advance" record —
  // an advance is just a settlement with type=ADVANCE.
  const tripOptions = trips.map(t => `<option value="${t.id}">${t.internalRef || t.id.slice(0, 8)}</option>`).join('');
  const settlementForm = `
    <form data-form="driver-settlement" class="form-grid two-col" data-entity-id="${driver.id}">
      <input type="hidden" name="driverId" value="${driver.id}" />
      <div class="form-field">
        <label>Type</label>
        <select name="type" required>${SETTLEMENT_TYPES.map(t => `<option value="${t}">${formatStatus(t)}</option>`).join('')}</select>
      </div>
      <div class="form-field">
        <label>Amount (₹)</label>
        <input name="amount" type="number" min="1" step="1" required />
      </div>
      <div class="form-field">
        <label>Date</label>
        <input name="date" type="datetime-local" />
      </div>
      <div class="form-field">
        <label>Trip (optional)</label>
        <select name="tripId"><option value="">No trip</option>${tripOptions}</select>
      </div>
      <div class="form-field full-width">
        <label>Description</label>
        <input name="description" placeholder="Notes" maxlength="200" />
      </div>
      <div class="form-field full-width"><button type="submit" class="btn btn-primary">Record settlement</button></div>
    </form>
  `;

  const settlementsHtml = settlements.length ? settlements.map(s => createRecordCard({
    title: currency(s.amount),
    subtitle: formatStatus(s.type),
    meta: [formatDateTime(s.date || s.createdAt), s.description || '', s.tripId ? `<a href="#trip/${s.tripId}" class="text-link">Trip</a>` : ''].filter(Boolean)
  })).join('') : createEmptyState('No settlements recorded.');

  const expensesHtml = expenses.length ? expenses.map(e => createRecordCard({
    title: currency(e.amount),
    subtitle: (e.category || '').replace(/_/g, ' '),
    meta: [formatDateTime(e.createdAt), e.description || '', e.tripId ? `<a href="#trip/${e.tripId}" class="text-link">Trip</a>` : ''].filter(Boolean)
  })).join('') : createEmptyState('No expenses paid to this driver.');

  const tripsHtml = trips.length ? trips.map(trip => createRecordCard({
    title: trip.internalRef || trip.id.slice(0, 8),
    subtitle: trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route',
    meta: [formatDate(trip.departureDate || trip.loadingDate || trip.createdAt), currency(trip.freightAmount || 0)],
    chip: formatStatus(trip.status),
    chipClass: getStatusChipClass(trip.status),
    actions: `<a href="#trip/${trip.id}" class="text-link">Detail</a>`
  })).join('') : createEmptyState('No trips assigned.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Driver',
      title: driver.name,
      copy: `${driver.phone || 'No phone'} • ${driver.licenseNumber || 'No license'}`
    })}
    ${heroStats}

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

    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Expenses paid to driver (${expenses.length})</h3>
        <div class="stack">${expensesHtml}</div>
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
