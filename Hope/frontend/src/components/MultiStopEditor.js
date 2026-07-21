/**
 * MultiStopEditor — Sprint 2B
 *
 * An opt-in "Multi-stop trip" section for the trip create form. Default OFF,
 * in which case the trip form behaves EXACTLY as it did before this sprint
 * (single transporter, single freight). When ON, the single-leg-only fields
 * are hidden and an ordered list of stops + per-transporter loads takes over.
 *
 * This module is deliberately self-contained (its own DOM, its own state read
 * straight from the DOM at submit time) so it adds capability without touching
 * the existing single-leg code paths.
 */
import { escapeHtml } from '../utils/helpers.js';

// Single-leg-only fields, hidden (and un-required) while multi-stop is on.
// Kept visible: internalRef, lrNumber, vehicleId, material, departureDate,
// drivers, notes — all of which still apply to a multi-stop journey.
const SINGLE_LEG_FIELD_NAMES = [
  'transporterId', 'fromLocation', 'toLocation', 'weightTons',
  'freightPerTon', 'freightAmount', 'ratePerKm', 'commissionType', 'commissionValue'
];

const COMMISSION_TYPES = [
  { value: 'PERCENTAGE', label: '% of freight' },
  { value: 'FIXED_PER_TRIP', label: 'Fixed ₹' },
  { value: 'FIXED_PER_TON', label: 'Fixed ₹/ton' }
];

/**
 * HTML for the toggle + (initially empty, hidden) editor. Insert inside the
 * trip <form>, full-width.
 */
export function createMultiStopSection() {
  return `
    <div class="form-field full-width multistop-toggle-wrap">
      <!-- Same shape as the freight-mode options below: control on the left,
           name and explanation stacked beside it. The text is wrapped so the
           row stays a two-part layout rather than three flex items that
           centred themselves into a banner. -->
      <label class="form-field-option multistop-toggle">
        <input type="checkbox" id="multiStopToggle" />
        <span class="form-field-option-text">
          <span class="freight-option-label">Multi-stop trip</span>
          <span class="freight-option-desc">One journey, several pickup → drop legs — each leg billed to its own transporter.</span>
        </span>
      </label>
    </div>
    <div class="form-field full-width multistop-editor" data-ms-editor hidden>
      <div class="multistop-block">
        <div class="panel-sub">Stops — in the order the truck reaches them</div>
        <div class="ms-stop-list" data-ms-stop-list></div>
        <button type="button" class="btn btn-ghost btn-sm" data-ms-add-stop>+ Add stop</button>
      </div>
      <div class="multistop-block">
        <div class="panel-sub">Loads — each pickup → drop leg and who it's billed to</div>
        <div class="ms-load-list" data-ms-load-list></div>
        <button type="button" class="btn btn-ghost btn-sm" data-ms-add-load>+ Add load</button>
      </div>
      <div class="ms-error form-message error" data-ms-error></div>
    </div>
  `;
}

function stopRowHtml() {
  return `
    <div class="ms-stop-row" data-ms-stop>
      <span class="ms-seq" data-ms-seq></span>
      <input type="text" class="ms-stop-location" data-ms-stop-location placeholder="City / place" maxlength="120" />
      <input type="datetime-local" class="ms-stop-arrival" data-ms-stop-arrival />
      <button type="button" class="btn-icon ms-remove" data-ms-remove-stop title="Remove stop">✕</button>
    </div>
  `;
}

function loadRowHtml(transporters) {
  const transporterOptions = ['<option value="">Transporter…</option>']
    .concat(transporters.map(t => `<option value="${t.id}">${escapeHtml(t.firmName)}</option>`))
    .join('');
  const commissionOptions = COMMISSION_TYPES
    .map(c => `<option value="${c.value}">${c.label}</option>`).join('');
  return `
    <div class="ms-load-row" data-ms-load>
      <select class="ms-load-origin" data-ms-load-origin></select>
      <span class="ms-arrow">→</span>
      <select class="ms-load-dest" data-ms-load-dest></select>
      <select class="ms-load-transporter" data-ms-load-transporter>${transporterOptions}</select>
      <input type="number" class="ms-load-freight" data-ms-load-freight placeholder="Freight ₹" min="0" step="1" />
      <select class="ms-load-commtype" data-ms-load-commtype>${commissionOptions}</select>
      <input type="number" class="ms-load-commval" data-ms-load-commval placeholder="Comm." min="0" step="0.01" value="0" />
      <button type="button" class="btn-icon ms-remove" data-ms-remove-load title="Remove load">✕</button>
    </div>
  `;
}

/**
 * Wire the multi-stop editor inside a trip form.
 * @param {HTMLFormElement} form
 * @param {Array<{id:string, firmName:string}>} transporters
 */
export function bindMultiStopEditor(form, transporters) {
  if (!form) return;
  const toggle = form.querySelector('#multiStopToggle');
  const editor = form.querySelector('[data-ms-editor]');
  if (!toggle || !editor || toggle._msBound) return;
  toggle._msBound = true;

  const stopList = editor.querySelector('[data-ms-stop-list]');
  const loadList = editor.querySelector('[data-ms-load-list]');

  // Re-number stop rows and refresh every load's origin/dest <select> so they
  // always reflect the current stop list (value = stop's 0-based index).
  function refreshStops() {
    const stops = [...stopList.querySelectorAll('[data-ms-stop]')];
    stops.forEach((row, i) => {
      const seq = row.querySelector('[data-ms-seq]');
      if (seq) seq.textContent = String(i + 1);
    });
    const optionHtml = stops.map((row, i) => {
      const loc = row.querySelector('[data-ms-stop-location]').value.trim();
      return `<option value="${i}">${escapeHtml(loc || `Stop ${i + 1}`)}</option>`;
    }).join('');
    loadList.querySelectorAll('[data-ms-load]').forEach(loadRow => {
      ['[data-ms-load-origin]', '[data-ms-load-dest]'].forEach(sel => {
        const dd = loadRow.querySelector(sel);
        const prev = dd.value;
        dd.innerHTML = optionHtml;
        // preserve selection if the index still exists
        if (prev !== '' && Number(prev) < stops.length) dd.value = prev;
      });
    });
  }

  function addStop(location = '') {
    stopList.insertAdjacentHTML('beforeend', stopRowHtml());
    const row = stopList.lastElementChild;
    if (location) row.querySelector('[data-ms-stop-location]').value = location;
    refreshStops();
  }

  function addLoad() {
    loadList.insertAdjacentHTML('beforeend', loadRowHtml(transporters));
    refreshStops();
    // default a load to first→second stop when possible
    const row = loadList.lastElementChild;
    const origin = row.querySelector('[data-ms-load-origin]');
    const dest = row.querySelector('[data-ms-load-dest]');
    if (origin.options.length >= 1) origin.value = '0';
    if (dest.options.length >= 2) dest.value = '1';
  }

  // Hide/show + un-require/restore the single-leg-only fields.
  function setSingleLegVisible(visible) {
    SINGLE_LEG_FIELD_NAMES.forEach(name => {
      const control = form.querySelector(`[name="${name}"]`);
      if (!control) return;
      const wrap = control.closest('.form-field') || control.parentElement;
      if (wrap) wrap.hidden = !visible;
      if (visible) {
        if (control._msWasRequired) control.required = true;
      } else if (control.required) {
        control._msWasRequired = true;
        control.required = false;
      }
    });
    // the freight-mode radio group lives in its own .form-field wrapper
    const freightMode = form.querySelector('input[name="freightMode"]');
    if (freightMode) {
      const wrap = freightMode.closest('.form-field');
      if (wrap) wrap.hidden = !visible;
    }
  }

  toggle.addEventListener('change', () => {
    const on = toggle.checked;
    editor.hidden = !on;
    setSingleLegVisible(!on);
    if (on && stopList.children.length === 0) {
      addStop();
      addStop();
      addLoad();
    }
  });

  editor.addEventListener('click', (e) => {
    if (e.target.closest('[data-ms-add-stop]')) { addStop(); }
    else if (e.target.closest('[data-ms-add-load]')) { addLoad(); }
    else if (e.target.closest('[data-ms-remove-stop]')) {
      const row = e.target.closest('[data-ms-stop]');
      if (stopList.children.length > 2) { row.remove(); refreshStops(); }
    }
    else if (e.target.closest('[data-ms-remove-load]')) {
      const row = e.target.closest('[data-ms-load]');
      if (loadList.children.length > 1) { row.remove(); }
    }
  });

  editor.addEventListener('input', (e) => {
    if (e.target.matches('[data-ms-stop-location]')) refreshStops();
  });
}

/**
 * Read the editor's current state. Returns { isMultiStop:false } when the
 * toggle is off. Throws a friendly Error when on but incompletely filled, so
 * the form's submit handler surfaces the message.
 * @param {HTMLFormElement} form
 */
export function collectMultiStopPayload(form) {
  const toggle = form.querySelector('#multiStopToggle');
  if (!toggle || !toggle.checked) return { isMultiStop: false };

  const editor = form.querySelector('[data-ms-editor]');
  const stopRows = [...editor.querySelectorAll('[data-ms-stop]')];
  const stops = stopRows.map(row => ({
    location: row.querySelector('[data-ms-stop-location]').value.trim(),
    arrivalDate: row.querySelector('[data-ms-stop-arrival]').value || ''
  }));

  if (stops.length < 2 || stops.some(s => !s.location)) {
    throw new Error('A multi-stop trip needs at least 2 stops, each with a location.');
  }

  const loadRows = [...editor.querySelectorAll('[data-ms-load]')];
  if (loadRows.length === 0) {
    throw new Error('Add at least one load (a pickup → drop leg).');
  }

  const loads = loadRows.map((row, idx) => {
    const originIndex = Number(row.querySelector('[data-ms-load-origin]').value);
    const destinationIndex = Number(row.querySelector('[data-ms-load-dest]').value);
    const transporterId = row.querySelector('[data-ms-load-transporter]').value;
    const freightAmount = Number(row.querySelector('[data-ms-load-freight]').value);
    const commissionType = row.querySelector('[data-ms-load-commtype]').value;
    const commissionValue = Number(row.querySelector('[data-ms-load-commval]').value) || 0;

    if (!transporterId) throw new Error(`Load ${idx + 1}: pick a transporter.`);
    if (Number.isNaN(originIndex) || Number.isNaN(destinationIndex)) {
      throw new Error(`Load ${idx + 1}: pick its pickup and drop stops.`);
    }
    if (originIndex === destinationIndex) {
      throw new Error(`Load ${idx + 1}: pickup and drop stops must be different.`);
    }
    if (!(freightAmount > 0)) throw new Error(`Load ${idx + 1}: enter a freight amount.`);

    return { originIndex, destinationIndex, transporterId, freightAmount, commissionType, commissionValue };
  });

  // Arrival dates → ISO where present (backend expects datetime or '').
  const stopsOut = stops.map(s => ({
    location: s.location,
    arrivalDate: s.arrivalDate ? new Date(s.arrivalDate).toISOString() : ''
  }));

  return { isMultiStop: true, stops: stopsOut, loads };
}
