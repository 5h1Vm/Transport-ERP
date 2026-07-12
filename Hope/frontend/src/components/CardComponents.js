/**
 * Card Components - Reusable UI cards
 */

import { editButton, deleteButton } from '../utils/helpers.js';
import { currency, formatDate, formatStatus } from '../utils/helpers.js';

/**
 * Create a hero stat card
 */
export function createHeroStat({ label, value, helper = '', className = '' }) {
  const cls = className ? ` ${className}` : '';
  return `
    <div class="hero-stat${cls}">
      <span>${label}</span>
      <strong>${value}</strong>
      ${helper ? `<div class="hero-stat-helper">${helper}</div>` : ''}
    </div>
  `;
}

/**
 * Create a compact key-value table for metadata that doesn't need a full
 * card each (e.g. trip Internal Ref / Transporter / Vehicle / Route / Status)
 * @param {Array<{label: string, value: string}>} rows
 */
export function createKeyValueTable(rows) {
  return `
    <dl class="kv-table">
      ${rows.filter(r => r.value !== undefined && r.value !== null && r.value !== '').map(r => `
        <div class="kv-row">
          <dt>${r.label}</dt>
          <dd>${r.value}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

/**
 * Create a metric card
 */
export function createMetricCard({ label, value, helper = '' }) {
  return `
    <article class="metric-card white">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-helper">${helper}</div>
    </article>
  `;
}

/**
 * Create a blank card
 */
export function createBlankCard({ title, message, action = '' }) {
  return `
    <section class="blank-card">
      <h3>${title}</h3>
      <p>${message}</p>
      ${action}
    </section>
  `;
}

/**
 * Create an empty state
 * @param {string} message
 * @param {string} action - optional HTML for a CTA (e.g. a link/button telling
 *   the user what to do next — the happy path on most pages IS adding data,
 *   so a bare "nothing here" message wastes the moment).
 */
export function createEmptyState(message, action = '') {
  return `<div class="empty-state">${message}${action ? `<div class="empty-state-action">${action}</div>` : ''}</div>`;
}

/**
 * Create a loading card
 */
export function createLoadingCard(message = 'Preparing workspace...') {
  return `<div class="loading-card">${message}</div>`;
}

/**
 * Create a panel
 */
export function createPanel({ title, children, className = 'white', fullWidth = false }) {
  const widthClass = fullWidth ? 'full-width' : '';
  return `
    <article class="panel ${className} ${widthClass}">
      <h3>${title}</h3>
      ${children}
    </article>
  `;
}

/**
 * Create a record card
 */
export function createRecordCard({ title, subtitle = '', chip = '', chipClass = '', meta = [], actions = '' }) {
  // Wrap each meta entry in its own chip-like span so values never run together
  // ("Trips: 1Freight: ₹…"). Entries that are already HTML elements pass through.
  const metaHtml = meta
    .filter(Boolean)
    .map((item) => (/^\s*</.test(String(item)) ? item : `<span class="meta-item">${item}</span>`))
    .join('');

  return `
    <article class="record-card">
      <div class="row">
        <div>
          <h4>${title}</h4>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        ${chip !== '' ? `<span class="chip ${chipClass ? `chip-${chipClass}` : ''}">${chip}</span>` : ''}
      </div>
      ${metaHtml ? `<div class="record-meta">${metaHtml}</div>` : ''}
      ${actions ? `<div class="record-actions">${actions}</div>` : ''}
    </article>
  `;
}

/**
 * Create a payment summary
 */
export function createPaymentSummary({ totalPaid, totalAmount, status }) {
  const remaining = Math.max(0, totalAmount - totalPaid);
  const isComplete = remaining === 0;
  const statusClass = isComplete ? 'success' : 'warning';
  const statusText = isComplete ? '(Fully Paid)' : `(${currency(remaining)} remaining)`;

  return `
    <div class="trip-payments">
      <h4>Trip Payments</h4>
      <div class="payment-summary">
        <span>Paid: </span><strong>${currency(totalPaid)}</strong>
        <span> / Due: </span><strong>${currency(totalAmount)}</strong>
        <span class="chip chip-${statusClass}">${statusText}</span>
      </div>
    </div>
  `;
}

/**
 * Create payment history list
 */
export function createPaymentHistory(payments = []) {
  if (!payments.length) return '';

  return `
    <div class="payment-history">
      ${payments.map(p => `
        <div class="payment-entry">
          <span>${formatDate(p.paymentDate)}</span>
          <span>${p.paymentType || 'OTHER'}</span>:
          <strong>${currency(p.amount)}</strong>
          ${p.notes ? ' - ' + p.notes : ''}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Create trip expenses display
 */
export function createTripExpenses(expenses = [], showDriver = true) {
  if (!expenses.length) return '';

  return `
    <div class="trip-expenses">
      ${expenses.map(e => `
        <div class="expense-entry">
          <span class="expense-category">${e.category.toLowerCase().replace(/_/g, ' ')}</span>
          <span class="expense-amount">${currency(e.amount)}</span>
          <span class="expense-desc">${e.description || ''}</span>
          ${showDriver && e.paidToDriver ? `<span class="expense-driver">→ ${e.paidToDriver.name}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Create trip expense entry form (FUEL/TOLL/FOOD/etc — DAILY_EXPENSE is
 * server-generated only, on marking a trip DELIVERED, so it's excluded here).
 */
export function createExpenseForm(tripId, drivers = []) {
  const driverOptions = drivers.map((td) => `<option value="${td.driver?.id}">${td.driver?.name}</option>`).join('');

  return `
    <form data-form="trip-expense" class="form-grid white" style="margin-top: 12px;">
      <input name="tripId" value="${tripId}" type="hidden" />
      <select name="category" required>
        <option value="">Select category</option>
        <option value="FUEL">Fuel</option>
        <option value="TOLL">Toll</option>
        <option value="FOOD">Food</option>
        <option value="LOADING_UNLOADING">Loading / Unloading</option>
        <option value="REPAIR_EN_ROUTE">Repair (en route)</option>
        <option value="EMERGENCY">Emergency</option>
        <option value="OTHER">Other</option>
      </select>
      <input name="amount" type="number" step="1" min="1" placeholder="Amount (₹)" required />
      <input name="description" placeholder="Notes" maxlength="200" />
      ${driverOptions ? `<select name="paidToDriverId"><option value="">Not paid to a driver</option>${driverOptions}</select>` : ''}
      <button type="submit">Add expense</button>
    </form>
  `;
}

// The full trip lifecycle, in order. CANCELLED is a terminal branch from any
// non-final state, not a step in this line — handled separately.
const TRIP_LIFECYCLE = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED'];

/**
 * Create a visual step indicator for the trip lifecycle — done / current /
 * upcoming states, so where a trip stands is obvious without reading raw
 * status text.
 */
export function createStatusStepper(status) {
  if (status === 'CANCELLED') {
    return `<div class="status-stepper"><span class="chip danger chip-lg">Cancelled</span></div>`;
  }

  const currentIndex = TRIP_LIFECYCLE.indexOf(status);
  const steps = TRIP_LIFECYCLE.map((step, i) => {
    const stepState = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
    return `
      <div class="status-step status-step--${stepState}">
        <span class="status-step-dot">${stepState === 'done' ? '✓' : ''}</span>
        <span class="status-step-label">${formatStatus(step)}</span>
      </div>
      ${i < TRIP_LIFECYCLE.length - 1 ? `<span class="status-step-connector status-step-connector--${i < currentIndex ? 'done' : 'upcoming'}"></span>` : ''}
    `;
  }).join('');

  return `<div class="status-stepper">${steps}</div>`;
}

/**
 * Create status action buttons — the actual controls to advance a trip,
 * shown below the (passive) stepper.
 */
export function createStatusActions(tripId, status) {
  const nextStatusMap = {
    DRAFT: ['LOADING'],
    LOADING: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERED'],
    DELIVERED: ['POD_RECEIVED'],
    POD_RECEIVED: ['BILLED'],
    BILLED: ['SETTLED'],
    SETTLED: [],
    CANCELLED: []
  };

  const allowed = nextStatusMap[status] || [];
  const transitionsAllowingCancel = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED'];
  if (!allowed.length && !transitionsAllowingCancel.includes(status)) return '';

  let html = '<div class="status-actions-wrap"><span class="status-actions-label">Advance to:</span><div class="status-actions">';

  allowed.forEach(s => {
    html += `<button type="button" class="btn btn-primary btn-sm" data-trip-status="${s}" data-trip-id="${tripId}">${formatStatus(s)}</button>`;
  });

  if (transitionsAllowingCancel.includes(status)) {
    html += `<button type="button" class="btn btn-ghost btn-danger btn-sm" data-trip-status="CANCELLED" data-trip-id="${tripId}">Cancel trip</button>`;
  }

  html += '</div></div>';
  return html;
}

/**
 * Create POD form
 */
export function createPodForm(tripId, status, podReceivedDate) {
  if (status !== 'DELIVERED' || podReceivedDate) return '';

  return `
    <form data-form="pod" class="form-grid white pod-grid">
      <input name="podImageUrl" placeholder="POD photo URL" />
      <input name="podNotes" placeholder="POD note" />
      <input name="tripId" value="${tripId}" type="hidden" />
      <button type="submit">Mark POD received</button>
    </form>
  `;
}

/**
 * Create POD meta display
 */
export function createPodMeta(trip) {
  const parts = [];
  if (trip.podReceivedDate) {
    parts.push(`<span>POD on ${formatDate(trip.podReceivedDate)}</span>`);
  } else {
    parts.push('<span>POD pending</span>');
  }
  if (trip.podImageUrl) {
    parts.push(`<span><a class="text-link" href="${trip.podImageUrl}" target="_blank" rel="noreferrer">View POD</a></span>`);
  }
  if (trip.podNotes) {
    parts.push(`<span>${trip.podNotes}</span>`);
  }
  return `<div class="record-meta">${parts.join('')}</div>`;
}

/**
 * Create payment form
 */
export function createPaymentForm(tripId, transporterId, isCancelledOrSettled = false) {
  if (isCancelledOrSettled) return '';

  // Prefill "now" so the field is never left blank by omission — the server
  // already defaults to now() if empty, but making that explicit in the UI
  // avoids the field looking optional when it isn't really meant to be.
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowLocal = now.toISOString().slice(0, 16);

  return `
    <form data-form="trip-payment" class="form-grid white" style="margin-top: 12px;">
      <select name="paymentType" required>
        <option value="">Select Payment Type</option>
        <option value="ADVANCE">Advance</option>
        <option value="DIESEL_ADVANCE">Diesel Advance</option>
        <option value="PART_PAYMENT">Part Payment</option>
        <option value="FULL_SETTLEMENT">Full Settlement</option>
        <option value="OTHER">Other</option>
      </select>
      <select name="mode" required>
        <option value="">Select Mode</option>
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
        <option value="UPI">UPI</option>
        <option value="CHEQUE">Cheque</option>
      </select>
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount (₹)" required />
      <input name="paymentDate" type="datetime-local" value="${nowLocal}" required />
      <input name="referenceNumber" placeholder="Reference (UTR/Cheque #)" maxlength="60" />
      <input name="notes" placeholder="Notes" maxlength="200" />
      <input name="tripId" value="${tripId}" type="hidden" />
      <input name="transporterId" value="${transporterId}" type="hidden" />
      <button type="submit">Record Payment</button>
    </form>
  `;
}

/**
 * Create transporter payment form
 */
export function createTransporterPaymentForm(transporterId) {
  return `
    <form data-form="transporter-payment" class="form-grid white">
      <h3>Record Payment to Transporter</h3>
      <input type="hidden" name="transporterId" value="${transporterId}" />
      <select name="paymentType" required>
        <option value="ADVANCE">Advance</option>
        <option value="DIESEL_ADVANCE">Diesel Advance</option>
        <option value="PART_PAYMENT">Part Payment</option>
        <option value="FULL_SETTLEMENT">Full Settlement</option>
        <option value="OTHER">Other</option>
      </select>
      <select name="mode" required>
        <option value="">Select Mode</option>
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
        <option value="UPI">UPI</option>
        <option value="CHEQUE">Cheque</option>
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" required />
      <input name="referenceNumber" placeholder="Reference number (UTR, Cheque #, etc.)" />
      <input name="notes" placeholder="Notes" />
      <button type="submit">Record Payment</button>
    </form>
  `;
}

/**
 * Create driver settlement form
 */
export function createDriverSettlementForm(drivers = [], trips = []) {
  const driverOptions = drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const tripOptions = trips.map(t => `<option value="${t.id}">${t.internalRef || t.id.slice(0, 8)}</option>`).join('');

  return `
    <form data-form="driver-settlement" class="form-grid white trip-grid">
      <h3>Record Settlement</h3>
      <select name="driverId" required><option value="">Select driver</option>${driverOptions}</select>
      <select name="type">
        <option value="SALARY">Salary</option>
        <option value="INCENTIVE">Incentive</option>
        <option value="ADVANCE">Advance</option>
        <option value="DEDUCTION">Deduction</option>
        <option value="PENALTY">Penalty</option>
        <option value="CASH_COLLECTED">Cash collected</option>
        <option value="ALLOWANCE">Allowance</option>
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" required />
      <input name="description" placeholder="Description" />
      <select name="tripId"><option value="">Optional trip</option>${tripOptions}</select>
      <button type="submit">Save entry</button>
    </form>
  `;
}