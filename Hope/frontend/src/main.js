/**
 * Transit Ledger - Main Entry Point
 *
 * Data loading is ROUTE-SCOPED: each page declares the resources it needs and
 * only those are fetched (stale-while-revalidate). Nothing ever re-downloads
 * the whole database — that was the source of the lag at scale.
 */
import './styles/main.css';

// Core
import { state, actions, initHashChangeListener, currentPage } from './store/index.js';

// Services
import * as api from './services/api.js';

// Pages
import { renderDashboardPage } from './pages/DashboardPage.js';
import { renderTransportersPage } from './pages/TransportersPage.js';
import { renderVehiclesPage } from './pages/VehiclesPage.js';
import { renderDriversPage } from './pages/DriversPage.js';
import { renderRoutesPage } from './pages/RoutesPage.js';
import { renderTripsPage } from './pages/TripsPage.js';
import { renderLedgersPage } from './pages/LedgersPage.js';
import { renderTransporterDetail } from './pages/TransporterDetailPage.js';
import { renderTripDetail } from './pages/TripDetailPage.js';
import { renderDriverDetail } from './pages/DriverDetailPage.js';
import { renderRouteDetail } from './pages/RouteDetailPage.js';
import { renderVehicleDetail } from './pages/VehicleDetailPage.js';

// Components
import { createMainLayout } from './components/Layout.js';
import { showStateMessages } from './components/Toast.js';
import { confirmDialog } from './components/Dialog.js';

// Utils
import { bindForms, bindDeleteButtons, bindEditButtons, bindCancelEditButtons, bindTripStatusButtons, bindNavigation, bindFilters, bindDriverMultiSelect, bindVehicleFilterByTransporter, bindFreightCalculator, applyValidationErrors, populateForm, populateDriverMultiSelect } from './utils/binding.js';
import { debounce } from './utils/helpers.js';

// App container
const app = document.querySelector('#app');

// Initialize hash change listener (keeps state.route in sync + closes mobile nav)
initHashChangeListener();

// On navigation: paint instantly from cache, then fetch anything missing/stale
// for the new page and repaint. No full-app reload.
window.addEventListener('hashchange', () => {
  render();
  loadPageData(currentPage.value)
    .then((fetched) => { if (fetched) render(); })
    .catch((error) => { actions.setError(error.message); render(); });
});

/* ------------------------------------------------------------------ */
/* Route-scoped data loading                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 50;
const FRESH_MS = 15000; // within this window a resource is reused, not refetched
const loadedAt = {};    // resource name -> last successful fetch timestamp

const RESOURCE_LOADERS = {
  dashboard: async () => { actions.setDashboard(await api.dashboard.get()); },
  reference: async () => { actions.setRefs(await api.reference.get()); },
  transporters: async () => { actions.setData({ transporters: await api.transporter.list() }); },
  vehicles: async () => { actions.setData({ vehicles: await api.vehicle.list() }); },
  drivers: async () => { actions.setData({ drivers: await api.driver.list() }); },
  routes: async () => { actions.setData({ routes: await api.route.list() }); },
  trips: async () => { await fetchTrips(); }
};

// What each list page needs. Detail pages fetch their own data inside their
// renderers (via GET /<entity>/:id), so they are intentionally absent here.
const PAGE_RESOURCES = {
  dashboard: ['dashboard'],
  transporters: ['transporters'],
  vehicles: ['vehicles', 'reference'],
  drivers: ['drivers'],
  routes: ['routes'],
  trips: ['trips', 'reference'],
  ledgers: ['transporters', 'drivers']
};

async function loadPageData(page, { force = false } = {}) {
  const wanted = PAGE_RESOURCES[page] || [];
  const stale = wanted.filter((r) => force || !loadedAt[r] || Date.now() - loadedAt[r] > FRESH_MS);
  if (!stale.length) return false;

  await Promise.all(stale.map(async (r) => {
    await RESOURCE_LOADERS[r]();
    loadedAt[r] = Date.now();
  }));
  return true;
}

// Server-side trip filters, built from the filter UI state.
function tripQueryParams() {
  const f = state.filters.trips || {};
  return {
    transporterId: f.transporter || undefined,
    status: f.status || undefined,
    search: f.internalRef || undefined,
    fromDate: f.dateFrom ? new Date(f.dateFrom).toISOString() : undefined,
    toDate: f.dateTo ? new Date(f.dateTo + 'T23:59:59').toISOString() : undefined
  };
}

// Fetch trips with current filters. `append` loads the next page; otherwise it
// reloads from the top, keeping at least as many rows as were already visible
// so a background refresh never shrinks the list under the user.
//
// Sequenced: two overlapping requests can resolve out of order (e.g. typing
// fast in the Ref filter fires several searches, and a slower earlier one can
// finish after a faster later one). Only the response to the MOST RECENTLY
// issued request is applied — a stale one is silently dropped instead of
// overwriting fresher results with the wrong filter's data.
let tripsFetchSeq = 0;
async function fetchTrips({ append = false } = {}) {
  const token = ++tripsFetchSeq;
  const current = state.data.trips || [];
  const offset = append ? current.length : 0;
  const limit = append ? PAGE_SIZE : Math.min(Math.max(current.length, PAGE_SIZE), 200);

  const batch = await api.trip.list({ ...tripQueryParams(), limit, offset });
  if (token !== tripsFetchSeq) return; // a newer fetch superseded this one

  state.tripsHasMore = batch.length === limit;
  actions.setData({ trips: append ? [...current, ...batch] : batch });
}

// After any mutation: everything cached is suspect. Drop freshness stamps and
// reload only what the CURRENT page needs — silently, no loading-card flash.
async function refreshAfterMutation() {
  Object.keys(loadedAt).forEach((k) => delete loadedAt[k]);
  try {
    await loadPageData(currentPage.value, { force: true });
  } catch (error) {
    actions.setError(error.message);
  }
  render();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

// Monotonic token: if a newer render starts while an async detail page is
// loading, the stale render aborts instead of overwriting fresh content.
let renderSeq = 0;

async function render() {
  const token = ++renderSeq;
  const page = currentPage.value;
  let contentHtml;

  try {
    // Detail pages fetch their own data (async)
    if (page.startsWith('transporter/')) {
      contentHtml = await renderTransporterDetail(page.split('/')[1]);
    } else if (page.startsWith('trip/')) {
      contentHtml = await renderTripDetail(page.split('/')[1]);
    } else if (page.startsWith('driver/')) {
      contentHtml = await renderDriverDetail(page.split('/')[1]);
    } else if (page.startsWith('route/')) {
      contentHtml = await renderRouteDetail(page.split('/')[1]);
    } else if (page.startsWith('vehicle/')) {
      contentHtml = await renderVehicleDetail(page.split('/')[1]);
    } else {
      // Sync list pages render from the store
      contentHtml = state.loading ? '<div class="loading-card">Preparing workspace...</div>' :
        page === 'transporters' ? renderTransportersPage() :
        page === 'vehicles' ? renderVehiclesPage() :
        page === 'drivers' ? renderDriversPage() :
        page === 'routes' ? renderRoutesPage() :
        page === 'trips' ? renderTripsPage() :
        page === 'ledgers' ? renderLedgersPage() :
        renderDashboardPage();
    }
  } catch (error) {
    contentHtml = `<div class="error-card">Failed to load page: ${error.message}</div>`;
  }

  if (token !== renderSeq) return; // superseded by a newer render

  // Preserve focus + caret across the innerHTML swap (search/filter inputs).
  const active = document.activeElement;
  const activeId = active && active.id;
  let selStart = null;
  let selEnd = null;
  try { selStart = active && active.selectionStart; selEnd = active && active.selectionEnd; } catch { /* not a text input */ }

  app.innerHTML = createMainLayout(page, contentHtml);
  bindEventHandlers();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && typeof el.focus === 'function') {
      el.focus();
      if (selStart != null && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(selStart, selEnd); } catch { /* number/date inputs */ }
      }
    }
  }

  showStateMessages();
}

// Trip filter changes hit the server — debounce so typing doesn't spam it.
const refreshTripsDebounced = debounce(async () => {
  try {
    await fetchTrips();
  } catch (error) {
    actions.setError(error.message);
  }
  render();
}, 350);

function bindEventHandlers() {
  bindForms(handleFormSubmit);
  bindDeleteButtons(handleDelete);
  bindEditButtons(handleEdit);
  bindCancelEditButtons(handleCancelEdit);
  bindTripStatusButtons(handleTripStatusChange);

  bindNavigation(
    (hash) => { window.location.hash = hash; },
    (forceOpen) => toggleSidebar(forceOpen)
  );

  // Master-list searches filter in memory (lists are ≤ a few hundred rows);
  // trip filters are server-side and refetch.
  bindFilters({
    transporters: (value) => { actions.setFilter('transporters', value); render(); },
    vehicles: (value) => { actions.setFilter('vehicles', value); render(); },
    drivers: (value) => { actions.setFilter('drivers', value); render(); },
    routes: (value) => { actions.setFilter('routes', value); render(); },
    trips: (key, value) => { actions.setFilter('trips', { [key]: value }); refreshTripsDebounced(); }
  });

  // "Load more" for the paginated trip list (fresh node each render — no cleanup needed).
  const loadMoreBtn = document.getElementById('trips-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading…';
      try {
        await fetchTrips({ append: true });
      } catch (error) {
        actions.setError(error.message);
      }
      render();
    });
  }

  // "Clear filters" — appears in the trip list header and in the empty state
  // when active filters return nothing.
  document.querySelectorAll('[data-clear-trip-filters]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      actions.setFilter('trips', { transporter: '', status: '', dateFrom: '', dateTo: '', internalRef: '' });
      try {
        await fetchTrips();
      } catch (error) {
        actions.setError(error.message);
      }
      render();
    });
  });

  bindDriverMultiSelect(state);
  bindVehicleFilterByTransporter(() => state.refs.vehicles || []);
  bindFreightCalculator();
  applyValidationErrors(state.validationErrors);
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

async function handleFormSubmit(type, rawBody, form) {
  const body = normalizeFormBody(form, type, rawBody);

  // Disable the submit button instead of swapping the page for a loading card.
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
  }
  actions.setError('');
  actions.clearValidationErrors();

  try {
    if (state.editing && state.editing.entity === type) {
      await api.request(`/${type}s/${state.editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      actions.setMessage(`${capitalize(type)} updated successfully.`);
    } else {
      await createEntity(type, body);
      actions.setMessage(`${capitalize(type)} created successfully.`);
    }

    form.reset();
    if (type === 'driver-settlement') {
      actions.resetDriverSettlementForm();
    }
    if (state.editing && state.editing.entity === type) {
      actions.clearEditing();
    }
    await refreshAfterMutation();
  } catch (error) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
    actions.setError(error.message);
    actions.setFailedFormData(type, body);

    if (error.issues && Array.isArray(error.issues)) {
      actions.setValidationErrors(
        error.issues.reduce((acc, issue) => {
          const field = issue.path.join('.');
          if (!acc[field]) acc[field] = [];
          acc[field].push(issue.message);
          return acc;
        }, {})
      );
    } else {
      actions.clearValidationErrors();
    }
    render();
  }
}

async function handleDelete(entity, id) {
  const confirmed = await confirmDialog({
    title: `Delete ${capitalize(entity)}?`,
    message: `Are you sure you want to delete this ${entity}? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });

  if (!confirmed) return;

  actions.setError('');
  try {
    await api.request(`/${entity}s/${id}`, { method: 'DELETE' });
    actions.setMessage('Deleted successfully.');
    await refreshAfterMutation();
  } catch (error) {
    actions.setError(error.message);
    render();
  }
}

async function handleEdit(entity, id) {
  actions.setEditing(entity, id);
  actions.clearError();
  render();

  try {
    const data = await api.request(`/${entity}s/${id}`);
    const form = document.querySelector(`form[data-form="${entity}"]`);
    if (form) {
      populateForm(form, data);
      // Trips: restore the driver multi-select (data.drivers is a join
      // [{ role, driver }], not a plain field populateForm can match by name).
      if (entity === 'trip') {
        populateDriverMultiSelect((data.drivers || []).map((td) => td.driver?.id || td.driverId).filter(Boolean));
      }
    }
  } catch (error) {
    actions.setError(`Failed to load ${entity} for editing: ${error.message}`);
    render();
  }
}

function handleCancelEdit(entity) {
  actions.clearEditing();
  actions.clearValidationErrors();
  actions.clearFailedFormData();
  const form = document.querySelector(`form[data-form="${entity}"]`);
  if (form) form.reset();
  render();
}

async function handleTripStatusChange(tripId, status) {
  actions.setError('');
  try {
    await api.trip.updateStatus(tripId, status);
    actions.setMessage(`Trip updated to ${status}.`);
    await refreshAfterMutation();
  } catch (error) {
    actions.setError(error.message);
    render();
  }
}

function toggleSidebar(forceOpen) {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');

  if (!sidebar || !overlay) return;

  const isOpen = forceOpen !== undefined ? forceOpen : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', isOpen);
  overlay.classList.toggle('visible', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);

  if (mobileMenuBtn) {
    mobileMenuBtn.setAttribute('aria-expanded', isOpen);
  }
}

// Normalize form body: coerce date-ish fields to ISO, parse driverIds JSON.
function normalizeFormBody(form, type, rawBody) {
  const body = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (value === '') continue;

    const lower = key.toLowerCase();
    if ((lower.includes('date') || lower.endsWith('expiry')) && typeof value === 'string') {
      let parsed;
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

    if (type === 'trip' && key === 'driverIds') {
      if (Array.isArray(value)) {
        body[key] = value;
        continue;
      }
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          body[key] = parsed;
          continue;
        }
      } catch { }
    }

    body[key] = value;
  }
  return body;
}

async function createEntity(type, body) {
  switch (type) {
    case 'transporter': return api.transporter.create(body);
    case 'vehicle': return api.vehicle.create(body);
    case 'driver': return api.driver.create(body);
    case 'route': return api.route.create(body);
    case 'trip': return api.trip.create(body);
    case 'driver-settlement': return api.driver.addSettlement(body.driverId, body);
    // Both trip and transporter payments post to /payments (transporterId
    // required, tripId optional). There is no /transporters/:id/payments route.
    case 'trip-payment': return api.trip.addPayment(body);
    case 'transporter-payment': return api.trip.addPayment(body);
    case 'pod': return api.trip.addPod(body.tripId, body);
    case 'trip-expense': return api.request(`/trips/${body.tripId}/expenses`, { method: 'POST', body: JSON.stringify(body) });
    default: throw new Error(`Unknown form type: ${type}`);
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

(async function init() {
  actions.setLoading(true);
  render();
  try {
    await loadPageData(currentPage.value, { force: true });
    actions.setLoading(false);
  } catch (error) {
    actions.setLoading(false);
    actions.setError(error.message);
  }
  render();
})();
