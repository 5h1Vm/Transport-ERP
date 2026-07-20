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
      <label class="ms-tds-toggle"><input type="checkbox" name="applyTds" /> 1% TDS</label>
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

const COMMISSION_TYPE_OPTS = [
  { value: 'PERCENTAGE', label: '% of freight' },
  { value: 'FIXED_PER_TRIP', label: 'Fixed ₹' },
  { value: 'FIXED_PER_TON', label: 'Fixed ₹/ton' }
];

function formatPodWhen(pod) {
  try { return new Date(pod.receivedDate).toLocaleDateString('en-IN'); } catch { return ''; }
}

/**
 * Management panel shown on the trip detail page for any non-terminal trip:
 * grow the journey (add stop), add a billed leg (add load), and record extra
 * PODs — without ever ending the trip. For terminal trips it still lists PODs
 * read-only. Returns '' when there is nothing to show.
 *
 * @param {Object} trip
 * @param {boolean} isTerminal - SETTLED/CANCELLED → no add forms
 * @param {Array<{id:string, firmName:string}>} transporters
 */
export function createTripManagementPanel(trip, isTerminal, transporters = []) {
  const stops = (trip.stops || []).slice().sort((a, b) => a.sequence - b.sequence);
  const pods = trip.pods || [];

  const stopOptions = stops.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.location)}</option>`).join('');
  const transporterOptions = ['<option value="">Transporter…</option>']
    .concat(transporters.map(t => `<option value="${t.id}">${escapeHtml(t.firmName)}</option>`)).join('');
  const commissionOptions = COMMISSION_TYPE_OPTS.map(c => `<option value="${c.value}">${c.label}</option>`).join('');

  const podList = pods.length
    ? `<ul class="ms-pod-list">${pods.map(p => `
        <li>
          <strong>${escapeHtml(p.stop?.location || p.location || 'Whole trip')}</strong>
          <span class="text-muted">${formatPodWhen(p)}</span>
          ${p.note ? `<span class="ms-pod-note">${escapeHtml(p.note)}</span>` : ''}
          ${p.imageUrl ? `<a href="${escapeHtml(p.imageUrl)}" target="_blank" rel="noopener" class="text-link">Image</a>` : ''}
        </li>`).join('')}</ul>`
    : '<p class="text-muted ms-load-empty">No extra PODs recorded.</p>';

  const addStopForm = isTerminal ? '' : `
    <form class="ms-inline-form" data-add-stop data-trip-id="${escapeHtml(trip.id)}">
      <input type="text" name="location" placeholder="Next stop / place" maxlength="120" required />
      <input type="datetime-local" name="arrivalDate" />
      <button type="submit" class="btn btn-ghost btn-sm">Add stop</button>
    </form>`;

  const addLoadForm = isTerminal ? '' : (stops.length >= 2 ? `
    <form class="ms-inline-form ms-add-load" data-add-load data-trip-id="${escapeHtml(trip.id)}">
      <select name="originStopId" required>${stopOptions}</select>
      <span class="ms-arrow">→</span>
      <select name="destinationStopId" required>${stopOptions}</select>
      <select name="transporterId" required>${transporterOptions}</select>
      <input type="number" name="freightAmount" placeholder="Freight ₹" min="0" step="1" required />
      <select name="commissionType">${commissionOptions}</select>
      <input type="number" name="commissionValue" placeholder="Comm." min="0" step="0.01" value="0" />
      <button type="submit" class="btn btn-ghost btn-sm">Add load</button>
    </form>`
    : '<p class="text-muted ms-load-empty">Add at least 2 stops to bill a load between them.</p>');

  const addPodForm = isTerminal ? '' : `
    <form class="ms-inline-form" data-add-pod data-trip-id="${escapeHtml(trip.id)}">
      <select name="stopId"><option value="">Whole trip</option>${stopOptions}</select>
      <input type="text" name="note" placeholder="POD note (optional)" maxlength="200" />
      <input type="url" name="imageUrl" placeholder="Image URL (optional)" />
      <input type="datetime-local" name="receivedDate" />
      <button type="submit" class="btn btn-ghost btn-sm">Add POD</button>
    </form>`;

  return `
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Extend this trip</h3>
        <p class="text-muted panel-sub">Send the truck on to the next place, or bill another leg — the trip stays open.</p>
        <div class="multistop-block">
          <div class="panel-sub">Add a stop</div>
          ${addStopForm}
        </div>
        <div class="multistop-block">
          <div class="panel-sub">Add a load (bill a leg to a transporter)</div>
          ${addLoadForm}
        </div>
      </article>
    </section>
    <section class="panel-grid white">
      <article class="panel white full-width">
        <h3>Proof of delivery (${pods.length})</h3>
        ${podList}
        ${addPodForm}
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
    const applyTds = form.querySelector('[name="applyTds"]').checked;
    if (!(amount > 0)) { actions.setError('Enter a payment amount.'); return; }

    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    actions.setError('');
    try {
      // loadId set, NO tripId — reduces only this load's transporter (the
      // trip-level overpayment guard is intentionally bypassed for loads).
      await api.trip.addPayment({ transporterId, loadId, amount, mode, paymentType: 'PART_PAYMENT', applyTds });
      actions.setMessage('Payment recorded.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      actions.setError(err.message || 'Failed to record payment.');
    }
  });
}

const readForm = (form, names) => {
  const out = {};
  names.forEach(n => {
    const el = form.querySelector(`[name="${n}"]`);
    if (el && el.value !== '') out[n] = el.value;
  });
  return out;
};

/**
 * Bind the "extend this trip" forms (add stop / add load / add POD).
 * Idempotent document-level delegation, same pattern as the load-pay forms.
 */
export function bindTripManagementForms() {
  if (document._msManageBound) return;
  document._msManageBound = true;

  document.addEventListener('submit', async (e) => {
    const stopForm = e.target.closest('form[data-add-stop]');
    const loadForm = e.target.closest('form[data-add-load]');
    const podForm = e.target.closest('form[data-add-pod]');
    const form = stopForm || loadForm || podForm;
    if (!form) return;
    e.preventDefault();

    const tripId = form.dataset.tripId;
    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    actions.setError('');
    try {
      if (stopForm) {
        const data = readForm(form, ['location', 'arrivalDate']);
        if (data.arrivalDate) data.arrivalDate = new Date(data.arrivalDate).toISOString();
        await api.trip.addStop(tripId, data);
        actions.setMessage('Stop added.');
      } else if (loadForm) {
        const data = readForm(form, ['originStopId', 'destinationStopId', 'transporterId', 'freightAmount', 'commissionType', 'commissionValue']);
        if (data.originStopId === data.destinationStopId) throw new Error('Pickup and drop stops must differ.');
        await api.trip.addLoad(tripId, data);
        actions.setMessage('Load added.');
      } else {
        const data = readForm(form, ['stopId', 'note', 'imageUrl', 'receivedDate']);
        if (data.receivedDate) data.receivedDate = new Date(data.receivedDate).toISOString();
        await api.trip.addAnotherPod(tripId, data);
        actions.setMessage('POD added.');
      }
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      actions.setError(err.message || 'Failed to save.');
    }
  });
}
