/**
 * MultiStopPanel — Sprint 2B
 *
 * Read-only display of a multi-stop trip's journey (ordered stops) and its
 * per-transporter loads, plus a compact "money got" form on each load so a
 * payment can be recorded against that specific leg (loadId), which reduces
 * only that load's / that transporter's outstanding.
 *
 * Renders nothing for a legacy single-leg trip (no loads), so the caller can
 * drop it in unconditionally.
 */
import { currency, escapeHtml } from '../utils/helpers.js';
import * as api from '../services/api.js';
import { actions } from '../store/index.js';

export function isMultiStopTrip(trip) {
  return !!trip && Array.isArray(trip.loads) && trip.loads.length > 0;
}

function journeyHtml(trip) {
  const stops = (trip.stops || []).slice().sort((a, b) => a.sequence - b.sequence);
  if (stops.length === 0) return '';
  const chips = stops.map((s, i) =>
    `<span class="ms-city">${escapeHtml(s.location)}</span>${i < stops.length - 1 ? '<span class="ms-city-sep">→</span>' : ''}`
  ).join('');
  return `
    <article class="panel white full-width">
      <h3>Journey (${stops.length} stops)</h3>
      <div class="ms-journey">${chips}</div>
    </article>
  `;
}

function loadCardHtml(load, summary, isTerminal) {
  const paid = summary ? summary.paid : 0;
  const outstanding = summary ? summary.outstanding : 0;
  const commission = summary ? summary.commission : 0;
  const net = summary ? summary.netReceivable : 0;
  const freight = summary ? summary.freight : (load.freightAmount || 0);

  const history = (load.payments || []).length
    ? `<ul class="ms-load-payments">${load.payments.map(p =>
        `<li><span>${currency(p.amount)}</span> <span class="text-muted">${escapeHtml((p.mode || '').replace('_', ' '))}</span>${p.tdsAmount > 0 ? ` <span class="text-muted" title="TDS withheld — recorded for filing, not deducted">TDS ${currency(p.tdsAmount)}</span>` : ''}</li>`
      ).join('')}</ul>`
    : '<p class="text-muted ms-load-empty">No payments yet.</p>';

  const payForm = isTerminal ? '' : `
    <form class="ms-load-pay" data-load-pay data-load-id="${escapeHtml(load.id)}" data-transporter-id="${escapeHtml(load.transporterId)}">
      <input type="number" name="amount" placeholder="Amount ₹" min="0" step="1" required />
      <select name="mode">
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="UPI">UPI</option>
        <option value="CHEQUE">Cheque</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm">Record payment</button>
    </form>`;

  return `
    <article class="panel white ms-load-card">
      <div class="panel-head">
        <h4>${escapeHtml(summary?.transporterName || load.transporter?.firmName || 'Transporter')}</h4>
        <span class="chip chip-sm chip-muted">${escapeHtml(summary?.originStop || load.originStop?.location || '?')} → ${escapeHtml(summary?.destinationStop || load.destinationStop?.location || '?')}</span>
      </div>
      <div class="ms-load-figures">
        <div><span class="text-muted">Freight</span><strong>${currency(freight)}</strong></div>
        <div><span class="text-muted">Commission</span><strong>${currency(commission)}</strong></div>
        <div><span class="text-muted">Net receivable</span><strong>${currency(net)}</strong></div>
        <div><span class="text-muted">Paid</span><strong>${currency(paid)}</strong></div>
        <div><span class="text-muted">Outstanding</span><strong class="${outstanding > 0 ? 'text-warning' : 'text-success'}">${currency(outstanding)}</strong></div>
      </div>
      ${history}
      ${payForm}
    </article>
  `;
}

/**
 * Full multi-stop section for the trip detail page. Returns '' for single-leg.
 * @param {Object} trip - trip loaded with stops/loads + loadSummaries
 * @param {boolean} isTerminal - trip SETTLED/CANCELLED → hide payment forms
 */
export function createMultiStopPanel(trip, isTerminal) {
  if (!isMultiStopTrip(trip)) return '';
  const summaries = new Map((trip.loadSummaries || []).map(s => [s.loadId, s]));
  const cards = trip.loads.map(load => loadCardHtml(load, summaries.get(load.id), isTerminal)).join('');
  return `
    <section class="panel-grid white">
      ${journeyHtml(trip)}
    </section>
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Loads (${trip.loads.length})</h3>
        <p class="text-muted panel-sub">Each leg is billed to its own transporter. Record a payment on the leg it settles.</p>
        <div class="ms-load-grid">${cards}</div>
      </article>
    </section>
  `;
}

/**
 * Bind the per-load payment forms. Idempotent — safe to call after every
 * render. Delegates from document so it survives DOM swaps.
 */
export function bindLoadPaymentForms() {
  if (document._msLoadPayBound) return;
  document._msLoadPayBound = true;

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-load-pay]');
    if (!form) return;
    e.preventDefault();

    const loadId = form.dataset.loadId;
    const transporterId = form.dataset.transporterId;
    const amount = Number(form.querySelector('[name="amount"]').value);
    const mode = form.querySelector('[name="mode"]').value;
    if (!(amount > 0)) { actions.setError('Enter a payment amount.'); return; }

    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    actions.setError('');
    try {
      // loadId set, NO tripId — reduces only this load's transporter (the
      // trip-level overpayment guard is intentionally bypassed for loads).
      await api.trip.addPayment({ transporterId, loadId, amount, mode, paymentType: 'PART_PAYMENT' });
      actions.setMessage('Payment recorded.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      actions.setError(err.message || 'Failed to record payment.');
    }
  });
}
