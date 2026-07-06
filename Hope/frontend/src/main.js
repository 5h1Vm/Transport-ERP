import './styles.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const app = document.querySelector('#app');

const state = {
  route: window.location.hash || '#dashboard',
  loading: true,
  message: '',
  dashboard: null,
  refs: { transporters: [], vehicles: [], drivers: [], routes: [] },
  data: { transporters: [], vehicles: [], drivers: [], routes: [], trips: [] }
};

function currency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

async function loadData() {
  state.loading = true;
  render();

  const [dashboard, refs, transporters, vehicles, drivers, routes, trips] = await Promise.all([
    request('/dashboard'),
    request('/reference-data'),
    request('/transporters'),
    request('/vehicles'),
    request('/drivers'),
    request('/routes'),
    request('/trips')
  ]);

  state.dashboard = dashboard;
  state.refs = refs;
  state.data = { transporters, vehicles, drivers, routes, trips };
  state.loading = false;
  state.message = '';
  render();
}

function page() {
  return (state.route || '#dashboard').replace('#', '') || 'dashboard';
}

function navItem(hash, label) {
  const active = state.route === hash ? 'active' : '';
  return `<a class="nav-item ${active}" href="${hash}">${label}</a>`;
}

function optionList(items, labelFn, placeholder) {
  return [`<option value="">${placeholder}</option>`].concat(items.map((item) => `<option value="${item.id}">${labelFn(item)}</option>`)).join('');
}

function deleteButton(entity, id) {
  return `<button type="button" class="ghost-btn danger-btn" data-delete-entity="${entity}" data-delete-id="${id}">Delete</button>`;
}

function normalizeFormBody(form, type, rawBody) {
  const body = {};

  for (const [key, value] of Object.entries(rawBody)) {
    if (value === '') {
      continue;
    }

    if (key.toLowerCase().includes('date') && typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        body[key] = parsed.toISOString();
        continue;
      }
    }

    body[key] = value;
  }

  return body;
}

function renderDashboard() {
  const dashboard = state.dashboard || {};
  const metrics = dashboard.metrics || [];
  const recentTrips = dashboard.recentTrips || [];
  const transporterBalances = dashboard.transporterBalances || [];
  const pendingPodTrips = dashboard.pendingPodTrips || [];

  return `
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Dashboard</p>
        <h2>Operations at a glance</h2>
        <p class="page-copy">An operations dashboard for Indian transport businesses, organized for clarity and speed.</p>
      </div>
      <div class="hero-stats">
        <div><span>Payments today</span><strong>${currency(dashboard.paymentTotals?.today || 0)}</strong></div>
        <div><span>This month</span><strong>${currency(dashboard.paymentTotals?.month || 0)}</strong></div>
      </div>
    </section>
    <section class="metrics-grid white">
      ${metrics.length ? metrics.map((metric) => `<article class="metric-card white"><div class="metric-label">${metric.label}</div><div class="metric-value">${metric.value}</div><div class="metric-helper">Operational summary</div></article>`).join('') : `<section class="blank-card"><h3>No records yet</h3><p>Create masters and trips from the dedicated pages on the left.</p></section>`}
    </section>
    <section class="panel-grid white">
      <article class="panel white"><div class="panel-head"><div><p class="eyebrow dark">Trips</p><h3>Recent activity</h3></div><a class="text-link" href="#trips">Open page</a></div><div class="stack">${recentTrips.length ? recentTrips.map((trip) => `<article class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route'}</span><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.createdAt)}</span>${deleteButton('trip', trip.id)}</div></article>`).join('') : `<div class="empty-state">No trips created yet.</div>`}</div></article>
      <article class="panel white"><div class="panel-head"><div><p class="eyebrow dark">Ledger</p><h3>Outstanding transporters</h3></div><a class="text-link" href="#ledgers">Open page</a></div><div class="stack">${transporterBalances.length ? transporterBalances.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name || 'Transporter'}</h4><p>Running balance</p></div><span class="chip warning">${currency(item.outstanding || 0)}</span></div>${deleteButton('transporter', item.id)}</article>`).join('') : `<div class="empty-state">No transporter balances yet.</div>`}</div></article>
      <article class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">POD</p><h3>Waiting for proof of delivery</h3></div><span class="chip danger">${pendingPodTrips.length} pending</span></div><p class="page-copy">Only trips already marked delivered appear here. Draft and in-transit trips are shown in the trip workspace, not in the POD queue.</p><div class="stack">${pendingPodTrips.length ? pendingPodTrips.map((trip) => `<article class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div></article>`).join('') : `<div class="empty-state">No trips are waiting for POD.</div>`}</div></article>
    </section>
  `;
}

function renderTransportersPage() {
  const items = state.data.transporters || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Transporters</p><h2>Master records</h2><p class="page-copy">Dedicated page for transporter creation and review. Clean, fast, and searchable.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add transporter</h3><form data-form="transporter" class="form-grid white"><input name="firmName" placeholder="Transporter firm name" required /><input name="contactPerson" placeholder="Contact person" /><input name="phone" placeholder="Phone" /><input name="email" placeholder="Email" /><select name="commissionType"><option value="PERCENTAGE">Commission: Percentage</option><option value="FIXED_PER_TRIP">Commission: Fixed per trip</option><option value="FIXED_PER_TON">Commission: Fixed per ton</option></select><input name="commissionValue" type="number" step="0.01" placeholder="Commission value" value="5" /><button type="submit">Save transporter</button></form></article>
      <article class="panel white"><h3>Transporter list</h3><div class="stack">${items.length ? items.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.firmName}</h4><p>${item.contactPerson || 'No contact'} • ${item.phone || 'No phone'}</p></div><span class="chip warning">${currency(item.outstanding || 0)}</span></div><div class="record-meta">${deleteButton('transporter', item.id)}</div></article>`).join('') : `<div class="empty-state">No transporter records yet.</div>`}</div></article>
    </section>
  `;
}

function renderVehiclesPage() {
  const items = state.data.vehicles || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Vehicles</p><h2>Fleet records</h2><p class="page-copy">Track trucks and ownership in a dedicated page instead of mixing it into the dashboard.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add vehicle</h3><form data-form="vehicle" class="form-grid white"><input name="vehicleNumber" placeholder="Vehicle number" required /><input name="make" placeholder="Make" /><input name="model" placeholder="Model" /><select name="ownershipStatus"><option value="OWNED">Owned</option><option value="ATTACHED">Attached</option><option value="LEASED">Leased</option></select><button type="submit">Save vehicle</button></form></article>
      <article class="panel white"><h3>Vehicle list</h3><div class="stack">${items.length ? items.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.vehicleNumber}</h4><p>${item.make || 'Make not set'} • ${item.model || 'Model not set'}</p></div><span class="chip">${item.ownershipStatus}</span></div><div class="record-meta">${deleteButton('vehicle', item.id)}</div></article>`).join('') : `<div class="empty-state">No vehicles created yet.</div>`}</div></article>
    </section>
  `;
}

function renderDriversPage() {
  const items = state.data.drivers || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Drivers</p><h2>Driver records</h2><p class="page-copy">Separated driver workspace for salary, advances, and deductions.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add driver</h3><form data-form="driver" class="form-grid white"><input name="name" placeholder="Driver name" required /><input name="phone" placeholder="Phone" /><input name="licenseNumber" placeholder="License number" /><input name="monthlySalary" type="number" step="0.01" placeholder="Monthly salary" value="0" /><button type="submit">Save driver</button></form></article>
      <article class="panel white"><h3>Driver list</h3><div class="stack">${items.length ? items.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name}</h4><p>${item.phone || 'No phone'} • ${item.licenseNumber || 'No license'}</p></div><span class="chip info">${currency(item.settlementTotal || 0)}</span></div><div class="record-meta">${deleteButton('driver', item.id)}</div></article>`).join('') : `<div class="empty-state">No drivers created yet.</div>`}</div></article>
      <article class="panel white full-width">
        <div class="panel-head"><div><p class="eyebrow dark">Driver salary</p><h3>Record salary, advance, or deduction</h3></div></div>
        <form data-form="driver-settlement" class="form-grid white trip-grid">
          <select name="driverId" required>${optionList(items, (item) => item.name, 'Select driver')}</select>
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
          <select name="tripId">${optionList(state.data.trips || [], (trip) => trip.internalRef || trip.id.slice(0, 8), 'Optional trip')}</select>
          <input name="description" placeholder="Description" />
          <button type="submit">Save entry</button>
        </form>
      </article>
      <article class="panel white full-width">
        <div class="panel-head"><div><p class="eyebrow dark">Recent salary entries</p><h3>Latest driver settlements</h3></div></div>
        <div class="stack">
          ${items.length ? items.map((item) => (item.settlements || []).slice(0, 2).map((settlement) => `<article class="record-card"><div class="row"><div><h4>${item.name}</h4><p>${settlement.type} • ${formatDate(settlement.date)}</p></div><span class="chip">${currency(settlement.amount)}</span></div></article>`).join('')).join('') : `<div class="empty-state">No salary entries yet.</div>`}
        </div>
      </article>
    </section>
  `;
}

function renderRoutesPage() {
  const items = state.data.routes || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Routes</p><h2>Route library</h2><p class="page-copy">Save origin and destination once. Use them across trips.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add route</h3><form data-form="route" class="form-grid white"><input name="origin" placeholder="Origin" required /><input name="destination" placeholder="Destination" required /><input name="distanceKm" type="number" step="0.1" placeholder="Distance km" /><button type="submit">Save route</button></form></article>
      <article class="panel white"><h3>Route list</h3><div class="stack">${items.length ? items.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.origin} → ${item.destination}</h4><p>${item.distanceKm ? `${item.distanceKm} km` : 'Distance not set'}</p></div><span class="chip">Route</span></div><div class="record-meta">${deleteButton('route', item.id)}</div></article>`).join('') : `<div class="empty-state">No routes created yet.</div>`}</div></article>
    </section>
  `;
}

function renderTripsPage() {
  const trips = state.data.trips || [];
  const { transporters = [], vehicles = [], drivers = [], routes = [] } = state.refs || {};
  return `
    <section class="page-header"><div><p class="eyebrow dark">Trips</p><h2>Trip workspace</h2><p class="page-copy">This page owns trip creation and workflow updates. It is the business core.</p></div></section>
    <section class="panel white full-width form-panel"><h3>Create trip</h3><form data-form="trip" class="form-grid white trip-grid"><select name="transporterId" required>${optionList(transporters, (item) => item.firmName, 'Select transporter')}</select><select name="vehicleId" required>${optionList(vehicles, (item) => item.vehicleNumber, 'Select vehicle')}</select><select name="routeId">${optionList(routes, (item) => `${item.origin} → ${item.destination}`, 'Select route')}</select><select name="driverId">${optionList(drivers, (item) => item.name, 'Select driver')}</select><input name="material" placeholder="Material" /><input name="weightTons" type="number" step="0.1" placeholder="Weight tons" value="0" /><input name="freightAmount" type="number" step="0.01" placeholder="Freight amount" /><input name="freightPerTon" type="number" step="0.01" placeholder="Freight per ton" /><input name="internalRef" placeholder="Internal reference" /><input name="loadingDate" type="datetime-local" /><button type="submit">Save trip</button></form></section>
    <section class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">Trips overview</p><h3>Operational timeline</h3></div></div><div class="stack">${trips.length ? trips.map((trip) => `<article class="record-card trip-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route'}</span><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.loadingDate || trip.createdAt)}</span></div><div class="status-actions">${['LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED', 'SETTLED'].map((status) => `<button type="button" class="ghost-btn" data-trip-status="${status}" data-trip-id="${trip.id}">${status}</button>`).join('')}</div><form data-form="pod" class="form-grid white pod-grid"><input name="podImageUrl" placeholder="POD photo URL" /><input name="podNotes" placeholder="POD note" /><input name="tripId" value="${trip.id}" type="hidden" /><button type="submit">Mark POD received</button></form><div class="record-meta">${trip.podReceivedDate ? `<span>POD on ${formatDate(trip.podReceivedDate)}</span>` : `<span>POD pending</span>`}${trip.podImageUrl ? `<span><a class="text-link" href="${trip.podImageUrl}" target="_blank" rel="noreferrer">View POD</a></span>` : ''}${trip.podNotes ? `<span>${trip.podNotes}</span>` : ''}</div><div class="record-meta">${deleteButton('trip', trip.id)}</div></article>`).join('') : `<div class="empty-state">No trips created yet.</div>`}</div></section>
  `;
}

function renderLedgersPage() {
  const balances = state.dashboard?.transporterBalances || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Ledgers</p><h2>Balances and settlements</h2><p class="page-copy">This is the page the owner will open most often.</p></div></section>
    <section class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">Transporter ledger</p><h3>Outstanding by transporter</h3></div></div><div class="stack">${balances.length ? balances.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name}</h4><p>Running balance</p></div><span class="chip warning">${currency(item.outstanding || 0)}</span></div></article>`).join('') : `<div class="empty-state">No transporter balances yet.</div>`}</div></section>
  `;
}

function render() {
  app.innerHTML = `
    <div class="shell white-shell">
      <aside class="sidebar white">
        <div>
          <div class="brand-mark">TL</div>
          <div class="eyebrow dark">Transit Ledger</div>
          <h1 class="sidebar-title">Indian transport ERP</h1>
        </div>
        <nav class="nav white-nav">
          ${navItem('#dashboard', 'Dashboard')}
          ${navItem('#transporters', 'Transporters')}
          ${navItem('#vehicles', 'Vehicles')}
          ${navItem('#drivers', 'Drivers')}
          ${navItem('#routes', 'Routes')}
          ${navItem('#trips', 'Trips')}
          ${navItem('#ledgers', 'Ledgers')}
        </nav>
        <div class="sidebar-card white">
          <span class="eyebrow dark">Status</span>
          <strong>${state.loading ? 'Preparing...' : 'Connected'}</strong>
          <p>Workspace records are managed directly through the application.</p>
        </div>
      </aside>
      <main class="content white-content">
        ${state.message ? `<div class="toast">${state.message}</div>` : ''}
        ${state.loading ? '<div class="loading-card">Preparing workspace...</div>' : (page() === 'transporters' ? renderTransportersPage() : page() === 'vehicles' ? renderVehiclesPage() : page() === 'drivers' ? renderDriversPage() : page() === 'routes' ? renderRoutesPage() : page() === 'trips' ? renderTripsPage() : page() === 'ledgers' ? renderLedgersPage() : renderDashboard())}
      </main>
    </div>
  `;

  bindForms();
  bindTripStatusButtons();
  bindDeleteButtons();
}

function bindForms() {
  document.querySelectorAll('form[data-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const type = form.getAttribute('data-form');
      const rawBody = Object.fromEntries(new FormData(form).entries());
      const body = normalizeFormBody(form, type, rawBody);

      state.loading = true;
      state.message = '';
      render();

      try {
        if (type === 'transporter') await request('/transporters', { method: 'POST', body: JSON.stringify(body) });
        if (type === 'vehicle') await request('/vehicles', { method: 'POST', body: JSON.stringify(body) });
        if (type === 'driver') await request('/drivers', { method: 'POST', body: JSON.stringify(body) });
        if (type === 'route') await request('/routes', { method: 'POST', body: JSON.stringify(body) });
        if (type === 'trip') await request('/trips', { method: 'POST', body: JSON.stringify(body) });
        if (type === 'driver-settlement') await request(`/drivers/${body.driverId}/settlements`, { method: 'POST', body: JSON.stringify(body) });
        if (type === 'pod') await request(`/trips/${body.tripId}/pod`, { method: 'POST', body: JSON.stringify(body) });

        form.reset();
        state.message = 'Saved successfully.';
        await loadData();
      } catch (error) {
        state.loading = false;
        state.message = error.message;
        render();
      }
    });
  });
}

function bindDeleteButtons() {
  document.querySelectorAll('[data-delete-entity]').forEach((button) => {
    button.addEventListener('click', async () => {
      const entity = button.getAttribute('data-delete-entity');
      const id = button.getAttribute('data-delete-id');

      if (!window.confirm(`Delete this ${entity}?`)) {
        return;
      }

      state.loading = true;
      state.message = '';
      render();

      try {
        await request(`/${entity}s/${id}`, { method: 'DELETE' });
        state.message = 'Deleted successfully.';
        await loadData();
      } catch (error) {
        state.loading = false;
        state.message = error.message;
        render();
      }
    });
  });
}

function bindTripStatusButtons() {
  document.querySelectorAll('[data-trip-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const tripId = button.getAttribute('data-trip-id');
      const status = button.getAttribute('data-trip-status');

      state.loading = true;
      state.message = '';
      render();

      try {
        await request(`/trips/${tripId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        state.message = `Trip updated to ${status}.`;
        await loadData();
      } catch (error) {
        state.loading = false;
        state.message = error.message;
        render();
      }
    });
  });
}

window.addEventListener('hashchange', () => {
  state.route = window.location.hash || '#dashboard';
  render();
});

loadData().catch((error) => {
  state.loading = false;
  state.message = error.message;
  render();
});