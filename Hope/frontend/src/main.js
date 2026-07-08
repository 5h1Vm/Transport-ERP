import './styles.css';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const app = document.querySelector('#app');

const state = {
  route: window.location.hash || '#dashboard',
  loading: true,
  message: '',
  error: '',
  dashboard: null,
  refs: { transporters: [], vehicles: [], drivers: [], routes: [] },
  data: { transporters: [], vehicles: [], drivers: [], routes: [], trips: [] },
  editing: null,
  failedFormData: null,
  transporterFilter: '',
  driverSettlementFormData: { driverId: '', type: 'SALARY', amount: '', tripId: '', description: '' },
  validationErrors: {},
  // Search filters
  filters: {
    transporters: '',
    vehicles: '',
    drivers: '',
    trips: { transporter: '', status: '', dateFrom: '', dateTo: '', internalRef: '' }
  }
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
  state.error = ''; // Clear previous error
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

  const [dashboard, refs, transporters, vehicles, drivers, routes, trips, ledgerEntries, payments] = await Promise.all([
    request('/dashboard'),
    request('/reference-data'),
    request('/transporters'),
    request('/vehicles'),
    request('/drivers'),
    request('/routes'),
    request('/trips'),
    request('/transporter-ledger-entries'),
    request('/payments')
  ]);

  state.dashboard = dashboard;
  state.refs = refs;
  state.data = { transporters, vehicles, drivers, routes, trips, transporterLedgerEntries: ledgerEntries, payments };
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

function bottomNavItem(hash, label, icon, isMenu = false) {
  const active = state.route === hash ? 'active' : '';
  const menuClass = isMenu ? 'menu-item' : '';
  return `<a class="bottom-nav-item ${active} ${menuClass}" href="#" data-bottom-nav="${hash}">${icon}<span>${label}</span></a>`;
}

function optionList(items, labelFn, placeholder, selectedValue = '') {
  return [`<option value="">${placeholder}</option>`].concat(items.map((item) => `<option value="${item.id}" ${item.id === selectedValue ? 'selected' : ''}>${labelFn(item)}</option>`)).join('');
}

function deleteButton(entity, id) {
  return `<button type="button" class="ghost-btn danger-btn" data-delete-entity="${entity}" data-delete-id="${id}">Delete</button>`;
}

function editButton(entity, id) {
  return `<button type="button" class="ghost-btn" data-edit-entity="${entity}" data-edit-id="${id}">Edit</button>`;
}

function normalizeFormBody(form, type, rawBody) {
  const body = {};

  for (const [key, value] of Object.entries(rawBody)) {
    if (value === '') {
      continue;
    }

    // Robust date parsing for datetime-local (format: "YYYY-MM-DDTHH:MM") and ISO strings
    if (key.toLowerCase().includes('date') && typeof value === 'string') {
      let parsed;
      // Handle datetime-local format (no seconds): "2026-07-08T15:00"
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
        parsed = new Date(value + ':00');
      } else {
        parsed = new Date(value);
      }
      if (!Number.isNaN(parsed.getTime())) {
        body[key] = parsed.toISOString();
        continue;
      }
    }

    // Handle multiple select fields (like driverId for trips)
    // Check both array (legacy multi-select) and JSON string (new custom dropdown)
    if (type === 'trip' && key === 'driverId') {
      if (Array.isArray(value)) {
        body[key] = value;
        continue;
      }
      // Handle JSON string from custom multi-select dropdown
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          body[key] = parsed;
          continue;
        }
      } catch {
        // Not JSON, treat as single value
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
      <article class="panel white"><div class="panel-head"><div><p class="eyebrow dark">Trips</p><h3>Recent activity</h3></div><a class="text-link" href="#trips">Open page</a></div><div class="stack">${recentTrips.length ? recentTrips.map((trip) => `<article class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route'}</span><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.createdAt)}</span>${editButton('trip', trip.id)}${deleteButton('trip', trip.id)}</div></article>`).join('') : `<div class="empty-state">No trips created yet.</div>`}</div></article>
      <article class="panel white"><div class="panel-head"><div><p class="eyebrow dark">Ledger</p><h3>Outstanding transporters</h3></div><a class="text-link" href="#ledgers">Open page</a></div><div class="stack">${transporterBalances.length ? transporterBalances.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name || 'Transporter'}</h4><p>Running balance</p></div><span class="chip warning">${currency(item.outstanding || 0)}</span></div><div class="record-meta"><a href="#transporter/${item.id}" class="text-link">View Details</a></div></article>`).join('') : `<div class="empty-state">No transporter balances yet.</div>`}</div></article>
      <article class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">POD</p><h3>Waiting for proof of delivery</h3></div><span class="chip danger">${pendingPodTrips.length} pending</span></div><p class="page-copy">Only trips already marked delivered appear here. Draft and in-transit trips are shown in the trip workspace, not in the POD queue.</p><div class="stack">${pendingPodTrips.length ? pendingPodTrips.map((trip) => `<article class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div></article>`).join('') : `<div class="empty-state">No trips are waiting for POD.</div>`}</div></article>
    </section>
  `;
}

function renderTransportersPage() {
  const items = state.data.transporters || [];
  const filter = state.filters.transporters?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.firmName?.toLowerCase().includes(filter)) ||
        (item.contactPerson?.toLowerCase().includes(filter)) ||
        (item.phone?.toLowerCase().includes(filter)) ||
        (item.email?.toLowerCase().includes(filter))
      )
    : items;

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="transporter-search" placeholder="Search by firm name, contact, phone, email"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search transporters" />
    </div>
  `;

  return `
    <section class="page-header"><div><p class="eyebrow dark">Transporters</p><h2>Master records</h2><p class="page-copy">Dedicated page for transporter creation and review. Clean, fast, and searchable.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add transporter</h3><form data-form="transporter" class="form-grid white"><input name="firmName" placeholder="Transporter firm name" required /><input name="contactPerson" placeholder="Contact person" /><input name="phone" placeholder="Phone" /><input name="email" placeholder="Email" /><select name="commissionType"><option value="PERCENTAGE">Commission: Percentage</option><option value="FIXED_PER_TRIP">Commission: Fixed per trip</option><option value="FIXED_PER_TON">Commission: Fixed per ton</option></select><input name="commissionValue" type="number" step="0.01" placeholder="Commission value" value="5" /><button type="submit">Save transporter</button></form></article>
      <article class="panel white"><h3>Transporter list</h3>${filterHtml}<div class="stack">${filteredItems.length ? filteredItems.map((item) => {
        // Calculate outstanding amount for this transporter
        const trips = state.data.trips?.filter(t => t.transporterId === item.id) || [];
        const payments = state.data.payments?.filter(p => p.transporterId === item.id) || [];

        const totalEarned = trips.reduce((sum, trip) => {
          const ledgerEntry = state.data.transporterLedgerEntries?.find(e => e.tripId === trip.id);
          return sum + (ledgerEntry ? ledgerEntry.netReceivable : trip.freightAmount || 0);
        }, 0);

        const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
        const outstanding = totalEarned - totalPaid;

        return `<article class="record-card"><div class="row"><div><h4>${item.firmName}</h4><p>${item.contactPerson || 'No contact'} • ${item.phone || 'No phone'}</p></div><span class="chip warning">${currency(outstanding)}</span></div><div class="record-meta">${editButton('transporter', item.id)}${deleteButton('transporter', item.id)} <a href="#transporter/${item.id}" class="text-link">View Details</a></div></article>`;
      }).join('') : `<div class="empty-state">No transporter records yet.</div>`}</div></article>
    </section>
  `;
}

async function renderTransporterDetail(transporterId) {
  try {
    const apiTransporter = await request(`/transporters/${transporterId}`);
    if (!apiTransporter) {
      return `<div class="error-card">Transporter not found</div>`;
    }

    // Use state.data for full calculations (has all trips, payments, ledger entries)
    const transporter = apiTransporter;
    const trips = state.data.trips?.filter(t => t.transporterId === transporterId) || [];
    const payments = state.data.payments?.filter(p => p.transporterId === transporterId) || [];

    const totalEarnings = trips.reduce((sum, trip) => {
      const ledgerEntry = state.data.transporterLedgerEntries?.find(e => e.tripId === trip.id);
      return sum + (ledgerEntry ? ledgerEntry.netReceivable : trip.freightAmount || 0);
    }, 0);

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = totalEarnings - totalPaid;

    return `
      <section class="panel-grid white two-col">
        <article class="panel white"><h3>Transporter Details</h3><div class="record-card"><div class="row"><div><h4>${transporter.firmName}</h4><p>${transporter.contactPerson || 'No contact'} • ${transporter.phone || 'No phone'}</p></div><span class="chip ${outstanding > 0 ? 'warning' : 'success'}">${currency(outstanding)}</span></div></div></article>
        <article class="panel white"><h3>Financial Summary</h3><div class="record-card"><div class="row"><div><h4>Total Earnings</h4><p>${currency(totalEarnings)}</p></div><div><h4>Total Paid</h4><p>${currency(totalPaid)}</p></div><div><h4>Outstanding</h4><p>${currency(outstanding)}</p></div></div></article>
        <article class="panel white"><h3>Recent Trips</h3><div class="stack">${trips.slice(0, 5).map(trip => {
          const ledgerEntry = state.data.transporterLedgerEntries?.find(e => e.tripId === trip.id);
          const earnings = ledgerEntry ? ledgerEntry.netReceivable : trip.freightAmount || 0;
          return `<article class="record-card"><div class="row"><div><h4>Trip #${trip.id.substring(0, 8)}</h4><p>${trip.material || 'General cargo'} • ${trip.weightTons}T</p></div><span class="chip info">${currency(earnings)}</span></div><div class="record-meta"><a href="#trip/${trip.id}" class="text-link">View Trip</a></div></article>`;
        }).join('')}${trips.length === 0 ? '<div class="empty-state">No trips found.</div>' : ''}</div></article>
        <article class="panel white"><h3>Payment History</h3><div class="stack">${payments.slice(0, 5).map(payment => `
          <article class="record-card"><div class="row"><div><h4>${payment.paymentType}</h4><p>${payment.referenceNumber || 'No reference'} • ${new Date(payment.paymentDate).toLocaleDateString()}</p></div><span class="chip success">${currency(payment.amount)}</span></div></article>`).join('')}${payments.length === 0 ? '<div class="empty-state">No payments recorded.</div>' : ''}</div></article>
        <article class="panel white full-width"><form data-form="transporter-payment" class="form-grid white"><h3>Record Payment to Transporter</h3><input type="hidden" name="transporterId" value="${transporter.id}" /><select name="paymentType" required><option value="ADVANCE">Advance</option><option value="DIESEL_ADVANCE">Diesel Advance</option><option value="PART_PAYMENT">Part Payment</option><option value="FULL_SETTLEMENT">Full Settlement</option><option value="OTHER">Other</option></select><select name="mode" required><option value="">Select Mode</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="UPI">UPI</option><option value="CHEQUE">Cheque</option></select><input name="amount" type="number" step="0.01" placeholder="Amount" required /><input name="referenceNumber" placeholder="Reference number (UTR, Cheque #, etc.)" /><input name="notes" placeholder="Notes" /><button type="submit">Record Payment</button></form></article>
      </section>
    `;
  } catch (error) {
    return `<div class="error-card">Failed to load transporter details: ${error.message}</div>`;
  }
}

async function renderRouteDetail(routeId) {
  try {
    const route = await request(`/routes/${routeId}`);
    if (!route) {
      return `<div class="error-card">Route not found</div>`;
    }

    // Find trips using this route
    const trips = state.data.trips?.filter(t => t.routeId === routeId) || [];

    return `
      <section class="panel-grid white two-col">
        <article class="panel white"><h3>Route Details</h3><div class="record-card"><div class="row"><div><h4>${route.origin} → ${route.destination}</h4><p>${route.distanceKm !== null && route.distanceKm !== undefined ? `${route.distanceKm} km` : 'Distance not set'}</p></div><span class="chip">Route</span></div></div></article>
        <article class="panel white"><h3>Trips on this Route</h3><div class="stack">${trips.length ? trips.map(trip => `
          <article class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.createdAt)}</span><a href="#trip/${trip.id}" class="text-link">View</a></div></article>
        `).join('') : '<div class="empty-state">No trips on this route.</div>'}</div></article>
        <article class="panel white full-width"><div class="record-meta"><a href="#routes" class="text-link">← Back to Routes</a></div></article>
      </section>
    `;
  } catch (error) {
    return `<div class="error-card">Failed to load route details: ${error.message}</div>`;
  }
}

async function renderTripDetail(tripId) {
  try {
    const trip = await request(`/trips/${tripId}`);
    if (!trip) {
      return `<div class="error-card">Trip not found</div>`;
    }

    const payments = trip.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const tripAmount = trip.freightAmount || 0;
    const remainingDue = Math.max(0, tripAmount - totalPaid);

    const driverNames = trip.drivers && trip.drivers.length > 0
      ? ' • ' + trip.drivers.map(d => d.driver?.name || 'Unknown').join(', ')
      : '';
    const routeText = trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route';

    // Expenses display
    const expenses = trip.expenses || [];
    const expensesHtml = expenses.length > 0
      ? `<div class="trip-expenses" style="margin-top: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel);"><h5 style="margin: 0 0 8px; font-size: 0.85rem; color: var(--muted);">Trip Expenses</h5>${expenses.map(expense => `
          <div class="expense-entry" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border);">
            <span class="expense-category" style="background: var(--primary-light); color: var(--primary); padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;">${expense.category.toLowerCase().replace(/_/g, ' ')}</span>
            <span class="expense-amount" style="font-weight: 600;">${currency(expense.amount)}</span>
            <span class="expense-desc" style="color: var(--muted); font-size: 0.85rem; flex: 1; min-width: 120px;">${expense.description || ''}</span>
            ${expense.paidToDriver ? `<span class="expense-driver" style="color: var(--primary); font-size: 0.78rem;">→ ${expense.paidToDriver.name}</span>` : ''}
          </div>
        `).join('')}</div>`
      : '';

    // Status action buttons
    let statusActionsHtml = '';
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
    const allowed = nextStatusMap[trip.status] || [];
    allowed.forEach(s => {
      statusActionsHtml += `<button type="button" class="ghost-btn" data-trip-status="${s}" data-trip-id="${trip.id}">${s}</button>`;
    });
    const transitionsAllowingCancel = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED'];
    if (transitionsAllowingCancel.includes(trip.status)) {
      statusActionsHtml += `<button type="button" class="ghost-btn danger-btn" data-trip-status="CANCELLED" data-trip-id="${trip.id}">CANCELLED</button>`;
    }

    // POD form
    const podFormHtml = (trip.status === 'DELIVERED' && !trip.podReceivedDate)
      ? `<form data-form="pod" class="form-grid white pod-grid"><input name="podImageUrl" placeholder="POD photo URL" /><input name="podNotes" placeholder="POD note" /><input name="tripId" value="${trip.id}" type="hidden" /><button type="submit">Mark POD received</button></form>`
      : '';
    const podMetaHtml = trip.podReceivedDate
      ? `<span>POD on ${formatDate(trip.podReceivedDate)}</span>`
      : `<span>POD pending</span>`;
    const podImageHtml = trip.podImageUrl
      ? `<span><a class="text-link" href="${trip.podImageUrl}" target="_blank" rel="noreferrer">View POD</a></span>`
      : '';
    const podNotesHtml = trip.podNotes
      ? `<span>${trip.podNotes}</span>`
      : '';

    // Payment summary
    let paymentSummaryHtml = '';
    const isCancelledOrSettled = ['CANCELLED', 'SETTLED'].includes(trip.status);
    if (isCancelledOrSettled) {
      const badgeClass = trip.status === 'CANCELLED' ? 'danger' : 'success';
      const badgeText = trip.status === 'CANCELLED' ? 'Trip Cancelled' : 'Fully Settled';
      paymentSummaryHtml = `<div class="payment-summary"><span class="chip ${badgeClass}">${badgeText} - Payment actions disabled</span></div>`;
    } else if (totalPaid > 0) {
      const statusClass = remainingDue === 0 ? 'payment-complete' : 'payment-pending';
      const statusText = remainingDue === 0 ? '(Fully Paid)' : '(' + currency(remainingDue) + ' remaining)';
      paymentSummaryHtml = `<div class="payment-summary"><span>Paid: </span><strong>${currency(totalPaid)}</strong> / <span>Due: </span><strong>${currency(tripAmount)}</strong> <span class="${statusClass}">${statusText}</span></div>`;
    } else {
      paymentSummaryHtml = `<div class="payment-summary"><span>Amount Due: </span><strong>${currency(tripAmount)}</strong></div>`;
    }

    // Payment history
    const paymentHistoryHtml = payments.length > 0
      ? `<div class="payment-history"><h5>Payment History</h5>${payments.map(payment => `<div class="payment-entry"><span>${formatDate(payment.paymentDate)}</span> <span>${payment.paymentType || 'OTHER'}</span>: <strong>${currency(payment.amount)}</strong>${payment.notes ? ' - ' + payment.notes : ''}</div>`).join('')} </div>`
      : '';

    // Payment form - hide for cancelled/settled trips
    const transporterId = trip.transporter?.id || trip.transporterId || '';
    const paymentFormHtml = isCancelledOrSettled ? '' : `<form data-form="trip-payment" class="form-grid white" style="margin-top: 12px;"><select name="paymentType" required><option value="">Select Payment Type</option><option value="ADVANCE">Advance</option><option value="DIESEL_ADVANCE">Diesel Advance</option><option value="PART_PAYMENT">Part Payment</option><option value="FULL_SETTLEMENT">Full Settlement</option><option value="OTHER">Other</option></select><select name="mode" required><option value="">Select Mode</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="UPI">UPI</option><option value="CHEQUE">Cheque</option></select><input name="amount" type="number" step="0.01" placeholder="Amount (₹)" required /><input name="paymentDate" type="datetime-local" /><input name="referenceNumber" placeholder="Reference (UTR/Cheque #)" /><input name="notes" placeholder="Notes" /><input name="tripId" value="${trip.id}" type="hidden" /><input name="transporterId" value="${transporterId}" type="hidden" /><button type="submit">Record Payment</button></form>`;

    return `<section class="panel-grid white two-col">
      <article class="panel white"><h3>Trip Details</h3><div class="record-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}${driverNames}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${routeText}</span><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.loadingDate || trip.createdAt)}</span></div></article>
      <article class="panel white"><h3>Actions</h3><div class="status-actions">${statusActionsHtml}</div>${podFormHtml}<div class="record-meta">${podMetaHtml}${podImageHtml}${podNotesHtml}</div></article>
      <article class="panel white full-width"><h3>Expenses</h3>${expensesHtml}</article>
      <article class="panel white full-width"><h3>Payments</h3><div class="trip-payments"><h4>Trip Payments</h4>${paymentSummaryHtml}</div>${paymentHistoryHtml}${paymentFormHtml}</article>
      <article class="panel white full-width"><div class="record-meta">${editButton('trip', trip.id)}${deleteButton('trip', trip.id)} <a href="#trips" class="text-link">← Back to Trips</a></div></article>
    </section>`;
  } catch (error) {
    return `<div class="error-card">Failed to load trip details: ${error.message}</div>`;
  }
}

function renderVehiclesPage() {
  const items = state.data.vehicles || [];
  const transporters = state.data.transporters || [];
  const transporterOptions = optionList(transporters, (item) => item.firmName, 'Select transporter (optional)');

  const filter = state.filters.vehicles?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.vehicleNumber?.toLowerCase().includes(filter)) ||
        (item.make?.toLowerCase().includes(filter)) ||
        (item.model?.toLowerCase().includes(filter))
      )
    : items;

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="vehicle-search" placeholder="Search by vehicle number, make, model"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search vehicles" />
    </div>
  `;

  return `
    <section class="page-header"><div><p class="eyebrow dark">Vehicles</p><h2>Fleet records</h2><p class="page-copy">Track trucks and ownership in a dedicated page instead of mixing it into the dashboard.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add vehicle</h3><form data-form="vehicle" class="form-grid white"><input name="vehicleNumber" placeholder="Vehicle number" required /><input name="make" placeholder="Make" /><input name="model" placeholder="Model" /><select name="ownershipStatus"><option value="OWNED">Owned</option><option value="ATTACHED">Attached</option><option value="LEASED">Leased</option></select><select name="transporterId">${transporterOptions}</select><button type="submit">Save vehicle</button></form></article>
      <article class="panel white"><h3>Vehicle list</h3>${filterHtml}<div class="stack">${filteredItems.length ? filteredItems.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.vehicleNumber}</h4><p>${item.make || 'Make not set'} • ${item.model || 'Model not set'}</p></div><span class="chip">${item.ownershipStatus}</span></div><div class="record-meta">${editButton('vehicle', item.id)}${deleteButton('vehicle', item.id)}</div></article>`).join('') : `<div class="empty-state">No vehicles created yet.</div>`}</div></article>
    </section>
  `;
}

function renderDriversPage() {
  const items = state.data.drivers || [];

  const filter = state.filters.drivers?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.name?.toLowerCase().includes(filter)) ||
        (item.phone?.toLowerCase().includes(filter)) ||
        (item.licenseNumber?.toLowerCase().includes(filter))
      )
    : items;

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="driver-search" placeholder="Search by name, phone, license number"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search drivers" />
    </div>
  `;

  return `
    <section class="page-header"><div><p class="eyebrow dark">Drivers</p><h2>Driver records</h2><p class="page-copy">Separated driver workspace for salary, advances, and deductions.</p></div></section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add driver</h3><form data-form="driver" class="form-grid white"><input name="name" placeholder="Driver name" required /><input name="phone" placeholder="Phone" /><input name="licenseNumber" placeholder="License number" /><input name="monthlySalary" type="number" step="0.01" placeholder="Monthly salary" value="0" /><input name="dailyExpenseRate" type="number" step="0.01" placeholder="Daily expense rate" value="0" /><button type="submit">Save driver</button></form></article>
      <article class="panel white"><h3>Driver list</h3>${filterHtml}<div class="stack">${filteredItems.length ? filteredItems.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name}</h4><p>${item.phone || 'No phone'} • ${item.licenseNumber || 'No license'}</p></div><span class="chip info">${currency(item.settlementTotal || 0)}</span></div><div class="record-meta">${editButton('driver', item.id)}${deleteButton('driver', item.id)} <a href="#driver/${item.id}" class="text-link">View Details</a></div></article>`).join('') : `<div class="empty-state">No drivers created yet.</div>`}</div></article>
      <article class="panel white full-width">
        <div class="panel-head"><div><p class="eyebrow dark">Driver salary</p><h3>Record salary, advance, or deduction</h3></div></div>
        <form data-form="driver-settlement" class="form-grid white trip-grid">
          <select name="driverId" required
            onchange="state.driverSettlementFormData.driverId = this.value; render()"
            value="${state.driverSettlementFormData.driverId || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.driverId : '')}">
            ${optionList(items, (item) => item.name, 'Select driver', state.driverSettlementFormData.driverId || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.driverId : ''))}
          </select>
          <select name="type"
            onchange="state.driverSettlementFormData.type = this.value; render()"
            value="${state.driverSettlementFormData.type || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.type : 'SALARY')}">
            <option value="SALARY" ${state.driverSettlementFormData.type === 'SALARY' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'SALARY') ? 'selected' : ''}>Salary</option>
            <option value="INCENTIVE" ${state.driverSettlementFormData.type === 'INCENTIVE' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'INCENTIVE') ? 'selected' : ''}>Incentive</option>
            <option value="ADVANCE" ${state.driverSettlementFormData.type === 'ADVANCE' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'ADVANCE') ? 'selected' : ''}>Advance</option>
            <option value="DEDUCTION" ${state.driverSettlementFormData.type === 'DEDUCTION' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'DEDUCTION') ? 'selected' : ''}>Deduction</option>
            <option value="PENALTY" ${state.driverSettlementFormData.type === 'PENALTY' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'PENALTY') ? 'selected' : ''}>Penalty</option>
            <option value="CASH_COLLECTED" ${state.driverSettlementFormData.type === 'CASH_COLLECTED' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'CASH_COLLECTED') ? 'selected' : ''}>Cash collected</option>
            <option value="ALLOWANCE" ${state.driverSettlementFormData.type === 'ALLOWANCE' || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.type === 'ALLOWANCE') ? 'selected' : ''}>Allowance</option>
          </select>
          <input name="amount" type="number" step="0.01" placeholder="Amount" required
            oninput="state.driverSettlementFormData.amount = this.value; render()"
            value="${state.driverSettlementFormData.amount || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.amount : '')}" />
          <select name="tripId"
            onchange="state.driverSettlementFormData.tripId = this.value; render()"
            value="${state.driverSettlementFormData.tripId || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.tripId : '')}">
            <option value="">Optional trip</option>
            ${(state.data.trips || []).map(trip => {
              const selected = (state.driverSettlementFormData.tripId === trip.id) || (state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.tripId === trip.id) ? 'selected' : '';
              return `<option value="${trip.id}" ${selected}>${trip.internalRef || trip.id.slice(0, 8)}</option>`;
            }).join('')}
          </select>
          <input name="description" placeholder="Description"
            oninput="state.driverSettlementFormData.description = this.value; render()"
            value="${state.driverSettlementFormData.description || (state.failedFormData && state.failedFormData.type === 'driver-settlement' ? state.failedFormData.body.description : '')}" />
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
      <article class="panel white"><h3>Route list</h3><div class="stack">${items.length ? items.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.origin} → ${item.destination}</h4><p>${item.distanceKm !== null && item.distanceKm !== undefined ? `${item.distanceKm} km` : 'Distance not set'}</p></div><span class="chip">Route</span></div><div class="record-meta">${editButton('route', item.id)}${deleteButton('route', item.id)} <a href="#route/${item.id}" class="text-link">View</a></div></article>`).join('') : `<div class="empty-state">No routes created yet.</div>`}</div></article>
    </section>
  `;
}

async function renderDriverDetail(driverId) {
  try {
    const driver = await request(`/drivers/${driverId}`);
    if (!driver) {
      return `<div class="error-card">Driver not found</div>`;
    }

    // Get settlements for this driver
    const settlements = driver.settlements || [];

    // Trip expense details from backend
    const tripExpenses = driver.tripExpenseDetails || [];
    const tripExpensesPaid = driver.tripExpensesPaid || 0;
    const dailyExpenses = driver.dailyExpenses || 0;
    const outstandingBalance = driver.outstandingBalance !== undefined ? driver.outstandingBalance : (driver.settlementTotal || 0);

    return `
      <section class="panel-grid white two-col">
        <article class="panel white"><h3>Driver Details</h3><div class="record-card"><div class="row"><div><h4>${driver.name}</h4><p>${driver.phone || 'No phone'} • ${driver.licenseNumber || 'No license'}</p></div></div></article>
        <article class="panel white"><h3>Financial Summary</h3><div class="record-card"><div class="row"><div><h4>Total Earnings (Settlements)</h4><p>${currency(driver.settlementTotal || 0)}</p></div><div><h4>Monthly Salary</h4><p>${currency(driver.monthlySalary)}</p></div><div><h4>Daily Expense Rate</h4><p>${currency(driver.dailyExpenseRate)}</p></div><div><h4>Trip Expenses Paid</h4><p>${currency(tripExpensesPaid)}</p></div><div><h4>Auto Daily Expenses</h4><p>${currency(dailyExpenses)}</p></div><div><h4>Outstanding Balance</h4><p>${currency(outstandingBalance)}</p></div></div></article>

        ${tripExpenses.length > 0 ? `
        <article class="panel white full-width">
          <h3>Auto-Calculated Daily Expenses (Trip Duration × Daily Rate)</h3>
          <div class="stack">
            ${tripExpenses.map(te => `
              <article class="record-card">
                <div class="row">
                  <div>
                    <h4>Trip #${te.tripId.slice(0, 8)}</h4>
                    <p>${formatDate(te.departureDate)} to ${formatDate(te.deliveryDate)} (${te.tripDays} days)</p>
                  </div>
                  <span class="chip">${currency(te.totalExpense)}</span>
                </div>
                <div class="record-meta">
                  <span>Daily Rate: ${currency(te.dailyRate)}</span>
                  <span>${te.tripDays} days × ${currency(te.dailyRate)} = ${currency(te.totalExpense)}</span>
                </div>
              </article>`).join('')}
          </div>
        </article>` : ''}

        <article class="panel white"><h3>Recent Settlements</h3><div class="stack">${settlements.slice(0, 5).map(settlement => `
          <article class="record-card"><div class="row"><div><h4>${settlement.type}</h4><p>${new Date(settlement.date).toLocaleDateString()}${settlement.description ? ' - ' + settlement.description : ''}</p></div><span class="chip">${currency(settlement.amount)}</span></div></article>`).join('')}${settlements.length === 0 ? '<div class="empty-state">No settlements found.</div>' : ''}</div></article>
        <article class="panel white full-width"><form data-form="driver-settlement" class="form-grid white trip-grid"><h3>Record Settlement</h3><input type="hidden" name="driverId" value="${driver.id}" /><select name="type"><option value="SALARY">Salary</option><option value="INCENTIVE">Incentive</option><option value="ADVANCE">Advance</option><option value="DEDUCTION">Deduction</option><option value="PENALTY">Penalty</option><option value="CASH_COLLECTED">Cash collected</option><option value="ALLOWANCE">Allowance</option></select><input name="amount" type="number" step="0.01" placeholder="Amount" required /><input name="description" placeholder="Description" /><select name="tripId"><option value="">Optional trip</option>${(state.data.trips || []).map(trip => {
          const selected = state.failedFormData && state.failedFormData.type === 'driver-settlement' && state.failedFormData.body.tripId === trip.id ? 'selected' : '';
          return `<option value="${trip.id}" ${selected}>${trip.internalRef || trip.id.slice(0, 8)}</option>`;
        }).join('')}</select><button type="submit">Save entry</button></form></article>
      </section>
    `;
  } catch (error) {
    return `<div class="error-card">Failed to load driver details: ${error.message}</div>`;
  }
}

function renderTripsPage() {
  const allTrips = state.data.trips || [];
  const { transporters = [], vehicles = [], drivers = [], routes = [] } = state.refs || {};

  // Filter trips by selected filters
  const filteredTrips = allTrips.filter(trip => {
    const matchesTransporter = !state.filters.trips.transporter || trip.transporterId === state.filters.trips.transporter;
    const matchesStatus = !state.filters.trips.status || trip.status === state.filters.trips.status;
    const matchesInternalRef = !state.filters.trips.internalRef ||
      (trip.internalRef?.toLowerCase().includes(state.filters.trips.internalRef.toLowerCase()));

    const tripDate = trip.loadingDate ? new Date(trip.loadingDate) : new Date(trip.createdAt);
    const matchesDateFrom = !state.filters.trips.dateFrom || tripDate >= new Date(state.filters.trips.dateFrom);
    const matchesDateTo = !state.filters.trips.dateTo || tripDate <= new Date(state.filters.trips.dateTo + 'T23:59:59');

    return matchesTransporter && matchesStatus && matchesInternalRef && matchesDateFrom && matchesDateTo;
  });

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

  function renderTripCard(trip) {
    const payments = trip.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const tripAmount = trip.freightAmount || 0;
    const remainingDue = Math.max(0, tripAmount - totalPaid);

    // Status action buttons
    let statusActionsHtml = '';
    const allowed = nextStatusMap[trip.status] || [];
    allowed.forEach(s => {
      statusActionsHtml += `<button type="button" class="ghost-btn" data-trip-status="${s}" data-trip-id="${trip.id}">${s}</button>`;
    });
    const transitionsAllowingCancel = ['DRAFT', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'POD_RECEIVED', 'BILLED'];
    if (transitionsAllowingCancel.includes(trip.status)) {
      statusActionsHtml += `<button type="button" class="ghost-btn danger-btn" data-trip-status="CANCELLED" data-trip-id="${trip.id}">CANCELLED</button>`;
    }

    // POD form
    const podFormHtml = (trip.status === 'DELIVERED' && !trip.podReceivedDate)
      ? `<form data-form="pod" class="form-grid white pod-grid"><input name="podImageUrl" placeholder="POD photo URL" /><input name="podNotes" placeholder="POD note" /><input name="tripId" value="${trip.id}" type="hidden" /><button type="submit">Mark POD received</button></form>`
      : '';

    // POD meta
    const podMetaHtml = trip.podReceivedDate
      ? `<span>POD on ${formatDate(trip.podReceivedDate)}</span>`
      : `<span>POD pending</span>`;
    const podImageHtml = trip.podImageUrl
      ? `<span><a class="text-link" href="${trip.podImageUrl}" target="_blank" rel="noreferrer">View POD</a></span>`
      : '';
    const podNotesHtml = trip.podNotes
      ? `<span>${trip.podNotes}</span>`
      : '';

    // Payment summary
    let paymentSummaryHtml = '';
    const isCancelledOrSettled = ['CANCELLED', 'SETTLED'].includes(trip.status);
    if (isCancelledOrSettled) {
      const badgeClass = trip.status === 'CANCELLED' ? 'danger' : 'success';
      const badgeText = trip.status === 'CANCELLED' ? 'Trip Cancelled' : 'Fully Settled';
      paymentSummaryHtml = `<div class="payment-summary"><span class="chip ${badgeClass}">${badgeText} - Payment actions disabled</span></div>`;
    } else if (totalPaid > 0) {
      const statusClass = remainingDue === 0 ? 'payment-complete' : 'payment-pending';
      const statusText = remainingDue === 0 ? '(Fully Paid)' : '(' + currency(remainingDue) + ' remaining)';
      paymentSummaryHtml = `<div class="payment-summary"><span>Paid: </span><strong>${currency(totalPaid)}</strong> / <span>Due: </span><strong>${currency(tripAmount)}</strong> <span class="${statusClass}">${statusText}</span></div>`;
    } else {
      paymentSummaryHtml = `<div class="payment-summary"><span>Amount Due: </span><strong>${currency(tripAmount)}</strong></div>`;
    }

    // Payment history
    const paymentHistoryHtml = payments.length > 0
      ? `<div class="payment-history"><h5>Payment History</h5>${payments.map(payment => `<div class="payment-entry"><span>${formatDate(payment.paymentDate)}</span> <span>${payment.paymentType || 'OTHER'}</span>: <strong>${currency(payment.amount)}</strong>${payment.notes ? ' - ' + payment.notes : ''}</div>`).join('')} </div>`
      : '';

    // Expenses for trip card
    const expenses = trip.expenses || [];
    const expensesHtml = expenses.length > 0
      ? `<div class="trip-expenses" style="margin-top: 12px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel);"><h5 style="margin: 0 0 8px; font-size: 0.8rem; color: var(--muted);">Expenses</h5>${expenses.map(expense => `
          <div class="expense-entry" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 0.8rem;">
            <span class="expense-category" style="background: var(--primary-light); color: var(--primary); padding: 2px 6px; border-radius: 999px; font-size: 0.65rem; font-weight: 600; text-transform: capitalize;">${expense.category.toLowerCase().replace(/_/g, ' ')}</span>
            <span class="expense-amount" style="font-weight: 600;">${currency(expense.amount)}</span>
            <span class="expense-desc" style="color: var(--muted); font-size: 0.75rem; flex: 1; min-width: 100px;">${expense.description || ''}</span>
            ${expense.paidToDriver ? `<span class="expense-driver" style="color: var(--primary); font-size: 0.7rem;">→ ${expense.paidToDriver.name}</span>` : ''}
          </div>
        `).join('')}</div>`
      : '';

    // Payment form - hide for cancelled/settled trips
    const transporterId = trip.transporter?.id || trip.transporterId || '';
    const paymentFormHtml = isCancelledOrSettled ? '' : `<form data-form="trip-payment" class="form-grid white" style="margin-top: 12px;"><select name="paymentType" required><option value="">Select Payment Type</option><option value="ADVANCE">Advance</option><option value="DIESEL_ADVANCE">Diesel Advance</option><option value="PART_PAYMENT">Part Payment</option><option value="FULL_SETTLEMENT">Full Settlement</option><option value="OTHER">Other</option></select><select name="mode" required><option value="">Select Mode</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="UPI">UPI</option><option value="CHEQUE">Cheque</option></select><input name="amount" type="number" step="0.01" placeholder="Amount (₹)" required /><input name="paymentDate" type="datetime-local" /><input name="referenceNumber" placeholder="Reference (UTR/Cheque #)" /><input name="notes" placeholder="Notes" /><input name="tripId" value="${trip.id}" type="hidden" /><input name="transporterId" value="${transporterId}" type="hidden" /><button type="submit">Record Payment</button></form>`;

    const driverNames = trip.drivers && trip.drivers.length > 0
      ? ' • ' + trip.drivers.map(d => d.driver?.name || 'Unknown').join(', ')
      : '';
    const routeText = trip.route ? `${trip.route.origin} → ${trip.route.destination}` : 'No route';

    return `<article class="record-card trip-card"><div class="row"><div><h4>${trip.internalRef || trip.id.slice(0, 8)}</h4><p>${trip.transporter?.firmName || 'Transporter'} • ${trip.vehicle?.vehicleNumber || 'Vehicle'}${driverNames}</p></div><span class="chip">${trip.status}</span></div><div class="record-meta"><span>${routeText}</span><span>${currency(trip.freightAmount)}</span><span>${formatDate(trip.loadingDate || trip.createdAt)}</span></div><div class="status-actions">${statusActionsHtml}</div>${podFormHtml}<div class="record-meta">${podMetaHtml}${podImageHtml}${podNotesHtml}</div><div class="trip-payments"><h4>Trip Payments</h4>${paymentSummaryHtml}</div>${paymentHistoryHtml}${expensesHtml}${paymentFormHtml}<div class="record-meta">${editButton('trip', trip.id)}${deleteButton('trip', trip.id)}<a href="#trip/${trip.id}" class="text-link">View Details</a></div></article>`;
  }

  // Comprehensive filter row
  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 180px;">
        <label style="font-size: 12px; color: var(--muted);">Transporter</label>
        <select id="transporter-filter" style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;">
          <option value="">All Transporters</option>
          ${transporters.map(t => `<option value="${t.id}" ${state.filters.trips.transporter === t.id ? 'selected' : ''}>${t.firmName}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 160px;">
        <label style="font-size: 12px; color: var(--muted);">Status</label>
        <select id="trip-status-filter" style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;">
          <option value="">All Statuses</option>
          <option value="DRAFT" ${state.filters.trips.status === 'DRAFT' ? 'selected' : ''}>Draft</option>
          <option value="LOADING" ${state.filters.trips.status === 'LOADING' ? 'selected' : ''}>Loading</option>
          <option value="IN_TRANSIT" ${state.filters.trips.status === 'IN_TRANSIT' ? 'selected' : ''}>In Transit</option>
          <option value="DELIVERED" ${state.filters.trips.status === 'DELIVERED' ? 'selected' : ''}>Delivered</option>
          <option value="POD_RECEIVED" ${state.filters.trips.status === 'POD_RECEIVED' ? 'selected' : ''}>POD Received</option>
          <option value="BILLED" ${state.filters.trips.status === 'BILLED' ? 'selected' : ''}>Billed</option>
          <option value="SETTLED" ${state.filters.trips.status === 'SETTLED' ? 'selected' : ''}>Settled</option>
          <option value="CANCELLED" ${state.filters.trips.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 160px;">
        <label style="font-size: 12px; color: var(--muted);">Internal Ref</label>
        <input type="text" id="trip-internalref-filter" placeholder="TRP-001..."
               value="${state.filters.trips.internalRef || ''}"
               style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;" />
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 160px;">
        <label style="font-size: 12px; color: var(--muted);">Date From</label>
        <input type="date" id="trip-datefrom-filter"
               value="${state.filters.trips.dateFrom || ''}"
               style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;" />
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 160px;">
        <label style="font-size: 12px; color: var(--muted);">Date To</label>
        <input type="date" id="trip-dateto-filter"
               value="${state.filters.trips.dateTo || ''}"
               style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;" />
      </div>
    </div>
  `;

  return `
    <section class="page-header"><div><p class="eyebrow dark">Trips</p><h2>Trip workspace</h2><p class="page-copy">This page owns trip creation and workflow updates. It is the business core.</p></div></section>
    <section class="panel white full-width form-panel"><h3>Create trip</h3><form data-form="trip" class="form-grid white trip-grid"><select name="transporterId" required id="trip-transporter-select">${optionList(transporters, (item) => item.firmName, 'Select transporter')}</select><select name="vehicleId" required id="trip-vehicle-select"><option value="">Select vehicle</option>${vehicles.map(v => `<option value="${v.id}" data-transporter-id="${v.transporterId || ''}">${v.vehicleNumber}</option>`).join('')}</select><select name="routeId">${optionList(routes.filter(route => route.origin.trim().toLowerCase() !== route.destination.trim().toLowerCase()), (item) => item.origin + ' → ' + item.destination, 'Select route')}</select><div class="driver-multi-select" id="driver-multi-select"><button type="button" class="driver-select-trigger" id="driver-select-trigger"><span class="driver-select-placeholder">Select drivers</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></button><div class="driver-select-dropdown" id="driver-select-dropdown">${drivers.map(d => `<label class="driver-select-option"><input type="checkbox" name="driverId" value="${d.id}" />${d.name}</label>`).join('')}</div></div><input name="material" placeholder="Material" /><input name="weightTons" type="number" step="0.1" placeholder="Weight tons" value="0" /><input name="freightAmount" type="number" step="0.01" placeholder="Freight amount" /><input name="freightPerTon" type="number" step="0.01" placeholder="Freight per ton" /><input name="internalRef" placeholder="Internal reference" /><input name="lrNumber" placeholder="LR Number" /><input name="loadingDate" type="datetime-local" /><button type="submit">Save trip</button></form></section>
    <section class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">Trips overview</p><h3>Operational timeline</h3></div></div>${filterHtml}<div class="stack">${filteredTrips.length ? filteredTrips.map(renderTripCard).join('') : '<div class="empty-state">No trips created yet.</div>'}</div></section>
  `;
}

function renderLedgersPage() {
  const balances = state.dashboard?.transporterBalances || [];
  return `
    <section class="page-header"><div><p class="eyebrow dark">Ledgers</p><h2>Balances and settlements</h2><p class="page-copy">This is the page the owner will open most often.</p></div></section>
    <section class="panel white full-width"><div class="panel-head"><div><p class="eyebrow dark">Transporter ledger</p><h3>Outstanding by transporter</h3></div></div><div class="stack">${balances.length ? balances.map((item) => `<article class="record-card"><div class="row"><div><h4>${item.name}</h4><p>Running balance</p></div><span class="chip warning">${currency(item.outstanding || 0)}</span></div><div class="record-meta"><a href="#transporter/${item.id}" class="text-link">View Details</a></div></article>`).join('') : `<div class="empty-state">No transporter balances yet.</div>`}</div></section>
  `;
}

async function render() {
  const currentPage = page();

  // Handle async detail pages
  let contentHtml;
  if (currentPage.startsWith('driver/')) {
    const driverId = currentPage.split('/')[1];
    state.loading = true;
    contentHtml = await renderDriverDetail(driverId);
    state.loading = false;
  } else if (currentPage.startsWith('transporter/')) {
    const transporterId = currentPage.split('/')[1];
    state.loading = true;
    contentHtml = await renderTransporterDetail(transporterId);
    state.loading = false;
  } else if (currentPage.startsWith('trip/')) {
    const tripId = currentPage.split('/')[1];
    state.loading = true;
    contentHtml = await renderTripDetail(tripId);
    state.loading = false;
  } else if (currentPage.startsWith('route/')) {
    const routeId = currentPage.split('/')[1];
    state.loading = true;
    contentHtml = await renderRouteDetail(routeId);
    state.loading = false;
  } else {
    contentHtml = state.loading ? '<div class="loading-card">Preparing workspace...</div>' : (
      currentPage === 'transporters' ? renderTransportersPage() :
      currentPage === 'vehicles' ? renderVehiclesPage() :
      currentPage === 'drivers' ? renderDriversPage() :
      currentPage === 'routes' ? renderRoutesPage() :
      currentPage === 'trips' ? renderTripsPage() :
      currentPage === 'ledgers' ? renderLedgersPage() :
      currentPage === 'dashboard' ? renderDashboard() :
      renderDashboard()
    );
  }

  app.innerHTML = `
    <!-- Mobile header bar (like normal apps) -->
    <header class="mobile-header" role="banner">
      <div class="mobile-header-brand">
        <button class="mobile-menu-btn ghost-btn" id="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" style="min-width: 40px; min-height: 40px; padding: 6px; display: flex; align-items: center; justify-content: center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div class="brand-mark">TL</div>
        <div class="mobile-header-text">
          <h1>Transit Ledger</h1>
          <span class="eyebrow dark">Fleet Operating System</span>
        </div>
      </div>
    </header>

    <!-- Mobile bottom navigation -->
    <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
      <ul class="bottom-nav-list">
        ${bottomNavItem('#dashboard', 'Dashboard', `<svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`)}
        ${bottomNavItem('#trips', 'Trips', `<svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`)}
        ${bottomNavItem('#ledgers', 'Ledgers', `<svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M3 21h18"/></svg>`)}
        ${bottomNavItem('#drivers', 'Drivers', `<svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`)}
        ${bottomNavItem('#more', 'Menu', `<svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`, true)}
      </ul>
    </nav>

    <!-- Sidebar overlay for mobile (shown when Menu is clicked) -->
    <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>

    <div class="shell white-shell">
      <aside class="sidebar white" id="sidebar" role="navigation" aria-label="Main navigation">
        <div class="sidebar-brand-row">
          <div class="brand-mark">TL</div>
          <div class="sidebar-brand-text">
            <div class="eyebrow dark">Transit Ledger</div>
            <h1 class="sidebar-title">Indian transport ERP</h1>
          </div>
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
        ${state.error ? `<div class="toast error">${state.error}</div>` : ''}
        ${state.message ? `<div class="toast success">${state.message}</div>` : ''}
        ${contentHtml}
      </main>
    </div>
  `;

  bindForms();
  applyValidationErrors();
  bindTripStatusButtons();
  bindDeleteButtons();
  bindEditButtons();
  bindTransporterFilter();
  bindVehicleFilterByTransporter();
  bindDriverSettlementForm();
  bindDriverMultiSelect();
  bindVehicleSearch();
  bindDriverSearch();
  bindTripsSearch();
  bindNavigation();
}

function bindTransporterFilter() {
  // Trips page transporter dropdown filter
  const filterSelect = document.getElementById('transporter-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.transporterFilter = e.target.value;
      render();
    });
  }

  // Transporters page search
  const searchInput = document.getElementById('transporter-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.filters.transporters = e.target.value;
      render();
    });
  }
}

function bindVehicleSearch() {
  const searchInput = document.getElementById('vehicle-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.filters.vehicles = e.target.value;
      render();
    });
  }
}

function bindDriverSearch() {
  const searchInput = document.getElementById('driver-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.filters.drivers = e.target.value;
      render();
    });
  }
}

function bindTripsSearch() {
  const transporterFilter = document.getElementById('transporter-filter');
  if (transporterFilter) {
    transporterFilter.addEventListener('change', (e) => {
      state.filters.trips.transporter = e.target.value;
      render();
    });
  }

  const statusFilter = document.getElementById('trip-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      state.filters.trips.status = e.target.value;
      render();
    });
  }

  const internalRefFilter = document.getElementById('trip-internalref-filter');
  if (internalRefFilter) {
    internalRefFilter.addEventListener('input', (e) => {
      state.filters.trips.internalRef = e.target.value;
      render();
    });
  }

  const dateFromFilter = document.getElementById('trip-datefrom-filter');
  if (dateFromFilter) {
    dateFromFilter.addEventListener('change', (e) => {
      state.filters.trips.dateFrom = e.target.value;
      render();
    });
  }

  const dateToFilter = document.getElementById('trip-dateto-filter');
  if (dateToFilter) {
    dateToFilter.addEventListener('change', (e) => {
      state.filters.trips.dateTo = e.target.value;
      render();
    });
  }
}

function bindDriverSettlementForm() {
  const form = document.querySelector('form[data-form="driver-settlement"]');
  if (!form) return;

  const driverIdSelect = form.querySelector('select[name="driverId"]');
  const typeSelect = form.querySelector('select[name="type"]');
  const amountInput = form.querySelector('input[name="amount"]');
  const tripIdSelect = form.querySelector('select[name="tripId"]');
  const descriptionInput = form.querySelector('input[name="description"]');

  if (driverIdSelect) {
    driverIdSelect.addEventListener('change', (e) => {
      state.driverSettlementFormData.driverId = e.target.value;
    });
  }
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      state.driverSettlementFormData.type = e.target.value;
    });
  }
  if (amountInput) {
    amountInput.addEventListener('input', (e) => {
      state.driverSettlementFormData.amount = e.target.value;
    });
  }
  if (tripIdSelect) {
    tripIdSelect.addEventListener('change', (e) => {
      state.driverSettlementFormData.tripId = e.target.value;
    });
  }
  if (descriptionInput) {
    descriptionInput.addEventListener('input', (e) => {
      state.driverSettlementFormData.description = e.target.value;
    });
  }

  // Initialize selects with current state values
  if (driverIdSelect) driverIdSelect.value = state.driverSettlementFormData.driverId || '';
  if (typeSelect) typeSelect.value = state.driverSettlementFormData.type || 'SALARY';
  if (amountInput) amountInput.value = state.driverSettlementFormData.amount || '';
  if (tripIdSelect) tripIdSelect.value = state.driverSettlementFormData.tripId || '';
  if (descriptionInput) descriptionInput.value = state.driverSettlementFormData.description || '';
}

// Custom driver multi-select dropdown for trip form
function bindDriverMultiSelect() {
  const trigger = document.getElementById('driver-select-trigger');
  const dropdown = document.getElementById('driver-select-dropdown');
  const form = document.querySelector('form[data-form="trip"]');
  if (!trigger || !dropdown || !form) return;

  // Prevent multiple bindings
  if (trigger.dataset.bound === 'true') return;
  trigger.dataset.bound = 'true';

  // Toggle dropdown on trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Handle checkbox changes
  dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const selected = Array.from(dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]:checked'))
        .map(cb => cb.value);
      const placeholder = trigger.querySelector('.driver-select-placeholder');
      if (selected.length === 0) {
        placeholder.textContent = 'Select drivers';
        placeholder.style.color = 'var(--muted)';
      } else if (selected.length <= 2) {
        // Show driver names
        const names = Array.from(dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]:checked'))
          .map(cb => cb.parentElement.textContent.trim());
        placeholder.textContent = names.join(', ');
        placeholder.style.color = 'var(--text)';
      } else {
        placeholder.textContent = `${selected.length} drivers selected`;
        placeholder.style.color = 'var(--text)';
      }
      // Update hidden field for form submission
      let hiddenInput = form.querySelector('input[type="hidden"][name="driverId"]');
      if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'driverId';
        form.appendChild(hiddenInput);
      }
      hiddenInput.value = JSON.stringify(selected);
    });
  });

  // Restore selection from state if editing
  if (state.editing && state.editing.entity === 'trip') {
    // Would need to fetch trip data to restore - handled in edit button click
  }
}

function bindVehicleFilterByTransporter() {
  const transporterSelect = document.getElementById('trip-transporter-select');
  const vehicleSelect = document.getElementById('trip-vehicle-select');
  if (!transporterSelect || !vehicleSelect) return;

  // Store all vehicles for filtering
  const allVehicles = Array.from(vehicleSelect.options).slice(1).map(opt => ({
    id: opt.value,
    number: opt.text,
    transporterId: opt.dataset.transporterId
  }));

  transporterSelect.addEventListener('change', () => {
    const selectedTransporterId = transporterSelect.value;
    const currentVehicleValue = vehicleSelect.value;

    // Filter vehicles
    const filteredVehicles = selectedTransporterId
      ? allVehicles.filter(v => v.transporterId === selectedTransporterId)
      : allVehicles;

    // Rebuild vehicle select
    vehicleSelect.innerHTML = '<option value="">Select vehicle</option>' +
      filteredVehicles.map(v => `<option value="${v.id}" data-transporter-id="${v.transporterId || ''}">${v.number}</option>`).join('');

    // Restore selection if still valid
    if (filteredVehicles.some(v => v.id === currentVehicleValue)) {
      vehicleSelect.value = currentVehicleValue;
    }
  });
}

function bindForms() {
  document.querySelectorAll('form[data-form]').forEach((form) => {
    const submitButton = form.querySelector('button[type="submit"]');
    const updateSubmitState = () => {
      const requiredFields = form.querySelectorAll('[required]');
      let allFilled = true;
      requiredFields.forEach(field => {
        // ignore fieldset etc
        if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.tagName === 'SELECT') {
          const value = field.value;
          if (value === null || value.trim() === '') {
            allFilled = false;
          }
        }
      });
      if (submitButton) {
        submitButton.disabled = !allFilled;
      }
    };
    // initial state
    updateSubmitState();
    // listen for changes
    form.addEventListener('input', updateSubmitState);
    form.addEventListener('change', updateSubmitState);
    // Clear field error when user interacts with the field
    form.addEventListener('input', (e) => {
      const input = e.target;
      if (input.classList.contains('field-error')) {
        input.classList.remove('field-error');
        const errorMsg = input.parentNode.querySelector('.field-error-message');
        if (errorMsg) errorMsg.remove();
      }
    });
    form.addEventListener('change', (e) => {
      const input = e.target;
      if (input.classList.contains('field-error')) {
        input.classList.remove('field-error');
        const errorMsg = input.parentNode.querySelector('.field-error-message');
        if (errorMsg) errorMsg.remove();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const type = form.getAttribute('data-form');
      const rawBody = Object.fromEntries(new FormData(form).entries());
      const body = normalizeFormBody(form, type, rawBody);

      state.loading = true;
      state.message = '';
      state.error = '';
      render();

      try {
        let response;
        if (state.editing && state.editing.entity === type) {
          // Update existing entity
          response = await request(`/${type}s/${state.editing.id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
          });
          state.message = `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully.`;
        } else {
          // Create new entity
          switch (type) {
            case 'transporter':
              response = await request('/transporters', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'vehicle':
              response = await request('/vehicles', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'driver':
              response = await request('/drivers', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'route':
              response = await request('/routes', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'trip':
              response = await request('/trips', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'driver-settlement':
              response = await request(`/drivers/${body.driverId}/settlements`, { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'trip-payment':
              response = await request('/payments', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'transporter-payment':
              response = await request('/payments', { method: 'POST', body: JSON.stringify(body) });
              break;
            case 'pod':
              response = await request(`/trips/${body.tripId}/pod`, { method: 'POST', body: JSON.stringify(body) });
              break;
            default:
              throw new Error(`Unknown form type: ${type}`);
          }
          state.message = `${type.charAt(0).toUpperCase() + type.slice(1)} created successfully.`;

          // Special message for trip payments
          if (type === 'trip-payment') {
            state.message = 'Payment recorded successfully.';
          }
          // Special message for transporter payments
          if (type === 'transporter-payment') {
            state.message = 'Payment to transporter recorded successfully.';
          }
        }

        form.reset();
        // Clear driver settlement form data after successful submission
        if (type === 'driver-settlement') {
          state.driverSettlementFormData = { driverId: '', type: 'SALARY', amount: '', tripId: '', description: '' };
        }
        // Clear editing state after successful update
        if (state.editing && state.editing.entity === type) {
          state.editing = null;
        }
        await loadData();
      } catch (error) {
        state.loading = false;
        state.error = error.message;
        // Store form data for re-populating on error
        state.failedFormData = { type, body };
        // If it's a Zod validation error with field-level issues, store them for inline display
        if (error.issues && Array.isArray(error.issues)) {
          state.validationErrors = error.issues.reduce((acc, issue) => {
            const field = issue.path.join('.');
            if (!acc[field]) acc[field] = [];
            acc[field].push(issue.message);
            return acc;
          }, {});
        } else {
          state.validationErrors = {};
        }
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
      state.error = '';
      render();

      try {
        // Use entity-specific ID parameter name (e.g., transporterId, vehicleId)
        await request(`/${entity}s/${id}`, { method: 'DELETE' });
        state.message = 'Deleted successfully.';
        await loadData();
      } catch (error) {
        state.loading = false;
        state.error = error.message;
        render();
      }
    });
  });
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit-entity]').forEach((button) => {
    button.addEventListener('click', async () => {
      const entity = button.getAttribute('data-edit-entity');
      const id = button.getAttribute('data-edit-id');

      state.editing = { entity, id };
      state.message = '';
      state.error = '';

      try {
        // Fetch the entity data to populate the form
        const data = await request(`/${entity}s/${id}`);

        // Populate the form with the entity data
        const form = document.querySelector(`form[data-form="${entity}"]`);
        if (form) {
          Object.keys(data).forEach(key => {
            // Special handling for trip drivers when editing
            if (entity === 'trip' && key === 'drivers' && Array.isArray(data[key])) {
              const driverIds = data[key].map(driver => driver.driver?.id).filter(id => id);
              // Handle new custom multi-select dropdown
              const dropdown = document.getElementById('driver-select-dropdown');
              const trigger = document.getElementById('driver-select-trigger');
              if (dropdown && trigger) {
                const checkboxes = dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]');
                checkboxes.forEach(cb => {
                  cb.checked = driverIds.includes(cb.value);
                });
                // Update placeholder text
                const placeholder = trigger.querySelector('.driver-select-placeholder');
                if (driverIds.length === 0) {
                  placeholder.textContent = 'Select drivers';
                  placeholder.style.color = 'var(--muted)';
                } else if (driverIds.length <= 2) {
                  const names = Array.from(checkboxes)
                    .filter(cb => driverIds.includes(cb.value))
                    .map(cb => cb.parentElement.textContent.trim());
                  placeholder.textContent = names.join(', ');
                  placeholder.style.color = 'var(--text)';
                } else {
                  placeholder.textContent = `${driverIds.length} drivers selected`;
                  placeholder.style.color = 'var(--text)';
                }
                // Update hidden input
                let hiddenInput = form.querySelector('input[type="hidden"][name="driverId"]');
                if (!hiddenInput) {
                  hiddenInput = document.createElement('input');
                  hiddenInput.type = 'hidden';
                  hiddenInput.name = 'driverId';
                  form.appendChild(hiddenInput);
                }
                hiddenInput.value = JSON.stringify(driverIds);
              }
              return; // Skip normal processing for this key
            }

            const input = form.elements.namedItem(key);
            if (input) {
              if (input.type === 'checkbox') {
                input.checked = data[key];
              } else if (input.tagName === 'SELECT') {
                // Handle multiple select for drivers (legacy)
                if (input.multiple && key === 'driverId' && Array.isArray(data[key])) {
                  input.value = data[key];
                } else {
                  input.value = data[key] || '';
                }
              } else if (key.endsWith('Date') && data[key]) {
                // Handle date fields
                const date = new Date(data[key]);
                input.value = date.toISOString().slice(0, 16);
              } else {
                input.value = data[key];
              }
            }
          });

          // Change submit button text to indicate update
          const submitButton = form.querySelector('button[type="submit"]');
          if (submitButton) {
            submitButton.textContent = 'Update';
          }

          // Scroll to form
          form.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (error) {
        state.error = `Failed to load ${entity} for editing: ${error.message}`;
        render();
      }
    });
  });
}

function bindTripStatusButtons() {
  document.querySelectorAll('[data-trip-status]').forEach((button) => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const tripId = button.getAttribute('data-trip-id');
      const status = button.getAttribute('data-trip-status');

      state.loading = true;
      state.error = '';
      render();

      try {
        await request(`/trips/${tripId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        state.message = `Trip updated to ${status}.`;
        await loadData();
      } catch (error) {
        state.loading = false;
        state.error = error.message;
        render();
      }
    });
  });
}

function applyValidationErrors() {
  if (!state.validationErrors || Object.keys(state.validationErrors).length === 0) return;

  document.querySelectorAll('form[data-form]').forEach((form) => {
    Object.keys(state.validationErrors).forEach((field) => {
      const input = form.elements.namedItem(field);
      if (input) {
        input.classList.add('field-error');
        // Remove any existing error message
        const existingError = input.parentNode.querySelector('.field-error-message');
        if (existingError) existingError.remove();
        // Add error message
        const errorMsg = document.createElement('span');
        errorMsg.className = 'field-error-message';
        errorMsg.textContent = state.validationErrors[field].join(', ');
        input.parentNode.appendChild(errorMsg);
      }
    });
  });
}

function bindNavigation() {
  // Handle bottom navigation items
  document.querySelectorAll('[data-bottom-nav]').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetHash = item.getAttribute('data-bottom-nav');

      // Check if it's the "Menu" button
      if (targetHash === '#more') {
        // Open sidebar
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar && overlay) {
          sidebar.classList.add('open');
          overlay.classList.add('visible');
          document.body.classList.add('sidebar-open');
        }
        return;
      }

      // Navigate to the target route
      window.location.hash = targetHash;
    });
  });

  // Handle mobile header hamburger menu button
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    // Remove existing listener to avoid duplicates
    mobileMenuBtn.replaceWith(mobileMenuBtn.cloneNode(true));
    const newMobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (newMobileMenuBtn) {
      newMobileMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar && overlay) {
          const isOpen = sidebar.classList.toggle('open');
          overlay.classList.toggle('visible');
          document.body.classList.toggle('sidebar-open');
          newMobileMenuBtn.setAttribute('aria-expanded', isOpen);
        }
      });
    }
  }

  // Close sidebar when overlay is clicked
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const mobileMenuBtn = document.getElementById('mobile-menu-btn');
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      document.body.classList.remove('sidebar-open');
      if (mobileMenuBtn) {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

loadData().catch((error) => {
  state.loading = false;
  state.message = error.message;
  render();
});

// Set up hashchange listener once (not in render cycle)
window.addEventListener('hashchange', () => {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (sidebar && overlay) {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
    if (mobileMenuBtn) {
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  state.route = window.location.hash || '#dashboard';
  state.error = ''; // Clear error when changing routes
  render();
});