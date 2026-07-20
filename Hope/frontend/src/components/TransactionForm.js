/**
 * Unified "Money Gave / Money Got" transaction form.
 *
 * One entry pattern for every place money is recorded, so the first question
 * is always the same one the khata asks: did cash leave, did cash arrive, or
 * is this only an adjustment on paper? The category picked underneath decides
 * which record actually gets written — a Payment, a DriverSettlement, or a
 * TripExpense — but the user never has to know that.
 *
 * Option values encode `CHANNEL:TYPE` (e.g. `SETTLEMENT:ADVANCE`), which is
 * what main.js's createTransaction() routes on.
 *
 * On the three directions:
 *   GAVE / GOT are real cash movements. ADJUST exists because four settlement
 *   types (INCENTIVE, ALLOWANCE, DEDUCTION, PENALTY) move a balance without
 *   any cash changing hands. Filing those under GAVE or GOT would claim a cash
 *   movement that never happened — the exact ambiguity this form exists to
 *   remove. See calculations.js: INCENTIVE/ALLOWANCE raise what we owe a
 *   driver, DEDUCTION/PENALTY cut it, and none of them are cash.
 */
import { escapeHtml } from '../utils/helpers.js';

// Cash movement is the organising principle here, not balance direction.
// Every GAVE and GOT entry below is real cash; every ADJUST entry is not.
const PAYMENT_TYPES = [
  { value: 'PAYMENT:ADVANCE', label: 'Advance' },
  { value: 'PAYMENT:DIESEL_ADVANCE', label: 'Diesel advance' },
  { value: 'PAYMENT:PART_PAYMENT', label: 'Part payment' },
  { value: 'PAYMENT:FULL_SETTLEMENT', label: 'Full settlement' },
  { value: 'PAYMENT:OTHER', label: 'Other' }
];

const CATALOG = {
  trip: {
    GAVE: [
      { value: 'EXPENSE:FUEL', label: 'Fuel / diesel' },
      { value: 'EXPENSE:TOLL', label: 'Toll / FASTag' },
      { value: 'EXPENSE:FOOD', label: 'Food' },
      { value: 'EXPENSE:LOADING_UNLOADING', label: 'Loading / unloading' },
      { value: 'EXPENSE:REPAIR_EN_ROUTE', label: 'Repair (en route)' },
      { value: 'EXPENSE:EMERGENCY', label: 'Emergency' },
      { value: 'EXPENSE:OTHER', label: 'Other expense' }
    ],
    GOT: PAYMENT_TYPES,
    ADJUST: []
  },
  driver: {
    GAVE: [
      { value: 'SETTLEMENT:ADVANCE', label: 'Advance paid to driver' },
      { value: 'SETTLEMENT:EXPENSE_REIMBURSEMENT', label: 'Expense reimbursement (bhatta / toll payout)' }
    ],
    GOT: [
      { value: 'SETTLEMENT:CASH_COLLECTED', label: 'Cash collected from driver' }
    ],
    ADJUST: [
      { value: 'SETTLEMENT:INCENTIVE', label: 'Incentive — adds to what we owe' },
      { value: 'SETTLEMENT:ALLOWANCE', label: 'Allowance — adds to what we owe' },
      { value: 'SETTLEMENT:DEDUCTION', label: 'Deduction — cuts what we owe' },
      { value: 'SETTLEMENT:PENALTY', label: 'Penalty — cuts what we owe' }
    ]
  },
  transporter: {
    GAVE: [],
    GOT: PAYMENT_TYPES,
    ADJUST: []
  }
};

const DIRECTION_LABELS = {
  GAVE: 'Money gave',
  GOT: 'Money got',
  ADJUST: 'Adjustment'
};

// Shown in place of the category picker when a direction has nothing valid for
// this context — an empty dropdown reads as a bug, an explanation doesn't.
const EMPTY_DIRECTION_HINT = {
  'trip:ADJUST': 'Adjustments are recorded against a driver or transporter, not a trip.',
  'transporter:GAVE': 'Money paid out to a transporter is not tracked here. If a transporter handed cash to your driver, record it on that driver as an advance.',
  'transporter:ADJUST': 'Adjustments are recorded against a driver.'
};

export function getTransactionCatalog(context) {
  return CATALOG[context] || null;
}

/**
 * @param {object}   opts
 * @param {'trip'|'driver'|'transporter'} opts.context - which entity page this sits on
 * @param {string}  [opts.tripId]        - locked trip, when context === 'trip'
 * @param {string}  [opts.transporterId] - locked transporter (trip's or the page's)
 * @param {string}  [opts.driverId]      - locked driver, when context === 'driver'
 * @param {Array}   [opts.drivers]       - TripDriver[] for a trip's expense payee picker
 * @param {Array}   [opts.trips]         - Trip[] for a driver's optional trip link
 */
export function createTransactionForm({
  context,
  tripId = '',
  transporterId = '',
  driverId = '',
  drivers = [],
  trips = [],
  transporters = []
}) {
  const catalog = CATALOG[context];
  if (!catalog) return '';

  // Default to whichever direction this context actually leads with: a
  // transporter page is somewhere money arrives, everywhere else money leaves.
  const defaultDirection = context === 'transporter' ? 'GOT' : 'GAVE';

  // ADJUST only earns a slot where it has something to offer (drivers today).
  // GAVE/GOT always appear, even when empty for this context — the pair is the
  // question the form asks, and silently dropping one hides that it was asked.
  const directions = ['GAVE', 'GOT', 'ADJUST']
    .filter((d) => d !== 'ADJUST' || catalog[d].length)
    .map((d) => {
      const isDefault = d === defaultDirection;
      return `
        <label class="form-field-option txn-direction txn-direction--${d.toLowerCase()}">
          <input type="radio" name="direction" value="${d}" ${isDefault ? 'checked' : ''} />
          <span>${escapeHtml(DIRECTION_LABELS[d])}</span>
        </label>
      `;
    })
    .join('');

  const nowLocal = toLocalDatetimeValue(new Date());

  const driverOptions = drivers
    .map((td) => {
      const d = td.driver || td;
      return d && d.id ? `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || '')}</option>` : '';
    })
    .filter(Boolean)
    .join('');

  const tripOptions = trips
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.internalRef || t.id.slice(0, 8))}</option>`)
    .join('');

  const transporterOptions = context === 'driver'
    ? transporters.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.firmName)}</option>`).join('')
    : '';

  return `
    <form data-form="transaction" class="form-grid two-col txn-form" data-context="${escapeHtml(context)}">
      ${tripId ? `<input type="hidden" name="tripId" value="${escapeHtml(tripId)}" />` : ''}
      ${transporterId ? `<input type="hidden" name="transporterId" value="${escapeHtml(transporterId)}" />` : ''}
      ${driverId ? `<input type="hidden" name="driverId" value="${escapeHtml(driverId)}" />` : ''}

      <div class="form-field full-width">
        <label>Direction</label>
        <div class="form-field-options txn-directions" role="radiogroup" aria-label="Direction of money">
          ${directions}
        </div>
      </div>

      <div class="form-field full-width" data-txn-field="category">
        <label for="txn-category">What for?</label>
        <select id="txn-category" name="category" required></select>
        <p class="txn-hint" data-txn-hint hidden></p>
      </div>

      <div class="form-field">
        <label for="txn-amount">Amount (₹)</label>
        <input id="txn-amount" name="amount" type="number" min="1" step="1" required />
      </div>

      <div class="form-field">
        <label for="txn-date">Date</label>
        <input id="txn-date" name="date" type="datetime-local" value="${nowLocal}" />
      </div>

      <div class="form-field" data-txn-field="mode" hidden>
        <label for="txn-mode">Mode</label>
        <select id="txn-mode" name="mode">
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option>
        </select>
      </div>

      <div class="form-field" data-txn-field="reference" hidden>
        <label for="txn-reference">Reference (UTR / cheque no.)</label>
        <input id="txn-reference" name="referenceNumber" maxlength="60" />
      </div>

      <div class="form-field full-width txn-tds-field" data-txn-field="tds" hidden>
        <label class="form-field-option txn-tds-toggle">
          <input type="checkbox" id="txn-apply-tds" name="applyTds" value="on" />
          <span>Deduct 1% TDS</span>
        </label>
        <p class="txn-hint" data-txn-tds hidden></p>
      </div>

      ${driverOptions ? `
      <div class="form-field" data-txn-field="paidToDriver" hidden>
        <label for="txn-paid-driver">Handed to driver (optional)</label>
        <select id="txn-paid-driver" name="paidToDriverId">
          <option value="">Not handed to a driver</option>
          ${driverOptions}
        </select>
      </div>` : ''}

      ${tripOptions ? `
      <div class="form-field" data-txn-field="tripLink" hidden>
        <label for="txn-trip">Against trip (optional)</label>
        <select id="txn-trip" name="tripId">
          <option value="">No trip</option>
          ${tripOptions}
        </select>
      </div>` : ''}

      ${transporterOptions ? `
      <div class="form-field full-width" data-txn-field="fundedBy" hidden>
        <label class="form-field-option txn-funded-toggle">
          <input type="checkbox" id="txn-funded-toggle" />
          <span>Funded by a transporter (they handed the driver cash directly)</span>
        </label>
        <select id="txn-funded-transporter" name="fundedByTransporterId" hidden disabled>
          <option value="">Select transporter…</option>
          ${transporterOptions}
        </select>
      </div>` : ''}

      <div class="form-field full-width">
        <label for="txn-note">Note</label>
        <input id="txn-note" name="note" maxlength="200" placeholder="What was this for?" />
      </div>

      <div class="form-field full-width">
        <button type="submit" class="btn btn-primary">Record entry</button>
      </div>
    </form>
  `;
}

function toLocalDatetimeValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Wire a rendered transaction form: repopulate categories when the direction
 * changes, show only the fields the chosen channel actually uses, and preview
 * the TDS that will be withheld. Called from bindEventHandlers on every render,
 * since the DOM is rebuilt each time.
 */
export function bindTransactionForm() {
  const form = document.querySelector('form[data-form="transaction"]');
  if (!form) return;

  const context = form.dataset.context;
  const catalog = CATALOG[context];
  if (!catalog) return;

  const categorySelect = form.querySelector('select[name="category"]');
  const hint = form.querySelector('[data-txn-hint]');
  const tdsHint = form.querySelector('[data-txn-tds]');
  const amountInput = form.querySelector('input[name="amount"]');
  const modeSelect = form.querySelector('select[name="mode"]');
  const applyTdsCheckbox = form.querySelector('input[name="applyTds"]');

  const fieldEl = (name) => form.querySelector(`[data-txn-field="${name}"]`);
  const setShown = (name, shown) => {
    const el = fieldEl(name);
    if (!el) return;
    el.hidden = !shown;
    // A hidden-but-required field blocks submit with an unfocusable field,
    // and a hidden-but-named field still posts. Keep both in step with
    // whatever is actually on screen.
    el.querySelectorAll('input, select').forEach((input) => {
      input.disabled = !shown;
    });
  };

  function currentDirection() {
    const checked = form.querySelector('input[name="direction"]:checked');
    return checked ? checked.value : 'GAVE';
  }

  function currentChannel() {
    const value = categorySelect.value || '';
    return value.split(':')[0];
  }

  function renderTds() {
    if (!tdsHint) return;
    const isPayment = currentChannel() === 'PAYMENT';
    const applyTds = applyTdsCheckbox ? applyTdsCheckbox.checked : false;
    const amount = Number(amountInput.value);

    // Preview only when the user has opted in — TDS is never automatic now.
    if (!isPayment || !applyTds || !amount || amount <= 0) {
      tdsHint.hidden = true;
      return;
    }
    const tds = Math.round(amount * 0.01 * 100) / 100;
    tdsHint.hidden = false;
    tdsHint.textContent = `1% TDS of ₹${tds.toLocaleString('en-IN')} will be recorded. The full ₹${amount.toLocaleString('en-IN')} still comes off the outstanding.`;
  }

  function renderCategories() {
    const direction = currentDirection();
    const options = catalog[direction] || [];
    const categoryLabel = form.querySelector('label[for="txn-category"]');
    const hasOptions = options.length > 0;

    // The field container always stays visible — when a direction has nothing
    // to offer, the container is what carries the explanation.
    categorySelect.innerHTML = hasOptions
      ? options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')
      : '';
    categorySelect.hidden = !hasOptions;
    categorySelect.disabled = !hasOptions;
    if (categoryLabel) categoryLabel.hidden = !hasOptions;

    if (hint) {
      hint.hidden = hasOptions;
      if (!hasOptions) {
        hint.textContent =
          EMPTY_DIRECTION_HINT[`${context}:${direction}`] || 'Nothing to record in this direction here.';
      }
    }

    renderChannelFields();
  }

  const fundedByToggle = form.querySelector('#txn-funded-toggle');
  const fundedByTransporterSelect = form.querySelector('select[name="fundedByTransporterId"]');

  function renderFundedBy() {
    if (!fundedByToggle || !fundedByTransporterSelect) return;
    const isAdvance = categorySelect.value === 'SETTLEMENT:ADVANCE';
    setShown('fundedBy', isAdvance);
    if (!isAdvance) fundedByToggle.checked = false;
    const on = isAdvance && fundedByToggle.checked;
    fundedByTransporterSelect.hidden = !on;
    fundedByTransporterSelect.disabled = !on;
    if (!on) fundedByTransporterSelect.value = '';
  }

  function renderChannelFields() {
    const channel = currentChannel();
    setShown('mode', channel === 'PAYMENT');
    setShown('reference', channel === 'PAYMENT');
    setShown('tds', channel === 'PAYMENT');
    setShown('paidToDriver', channel === 'EXPENSE');
    setShown('tripLink', channel === 'SETTLEMENT');

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !channel;

    renderTds();
    renderFundedBy();
  }

  form.querySelectorAll('input[name="direction"]').forEach((radio) => {
    radio.addEventListener('change', renderCategories);
  });
  categorySelect.addEventListener('change', renderChannelFields);
  if (applyTdsCheckbox) applyTdsCheckbox.addEventListener('change', renderTds);
  if (amountInput) amountInput.addEventListener('input', renderTds);
  if (fundedByToggle) fundedByToggle.addEventListener('change', renderFundedBy);

  renderCategories();
}
