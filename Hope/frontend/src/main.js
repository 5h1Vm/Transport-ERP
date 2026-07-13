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
import { bindForms, bindDeleteButtons, bindEditButtons, bindCancelEditButtons, bindTripStatusButtons, bindNavigation, bindFilters, bindDriverMultiSelect, bindFreightCalculator, applyValidationErrors, populateForm, populateDriverMultiSelect } from './utils/binding.js';
import { debounce, formatStatus, currency } from './utils/helpers.js';

// App container
const app = document.querySelector('#app');

// Initialize hash change listener (keeps state.route in sync + closes mobile nav)
initHashChangeListener();

// On navigation: paint instantly from cache, then fetch anything missing/stale
// for the new page and repaint. No full-app reload.
window.addEventListener('hashchange', () => {
  actions.setLoading(true);
  render();
  loadPageData(currentPage.value)
    .finally(() => {
      actions.setLoading(false);
      render();
    });
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
    contentHtml = `<div class="error-card">Failed to load page: ${escapeHtml(error.message)}</div>`;
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

  // Re-queried on every call — the trip form is a fresh DOM node after each
  // render() innerHTML swap, so this can't be hoisted to module scope.
  const tripForm = document.querySelector('form[data-form="trip"]');

  // Handle From/To location selection in trip form to auto-set routeId
  const fromSelect = tripForm ? tripForm.querySelector('#fromLocation') : null;
  const toSelect = tripForm ? tripForm.querySelector('#toLocation') : null;
  const routeIdInput = tripForm ? tripForm.querySelector('#routeId') : null;
  const validationMessage = tripForm ? tripForm.querySelector('#route-validation-message') : null;

  if (fromSelect && toSelect && routeIdInput && validationMessage) {
      const updateRouteId = () => {
        const fromValue = fromSelect.value;
        const toValue = toSelect.value;

        // Clear validation message
        if (validationMessage) {
          validationMessage.textContent = '';
        }

        // If both From and To are selected, find matching route
        if (fromValue && toValue) {
          // Find the route with matching origin and destination
          const matchingRoute = (state.refs.routes || []).find(
            route => route.origin === fromValue && route.destination === toValue
          );

          if (matchingRoute) {
            // Set the hidden routeId field
            if (routeIdInput) {
              routeIdInput.value = matchingRoute.id;
            }
          } else {
            // No route found for this combination
            if (routeIdInput) {
              routeIdInput.value = ''; // Clear the routeId
            }
            if (validationMessage) {
              validationMessage.textContent = 'No route on file for this pair — add it under Routes first';
            }
          }
        } else {
          // Clear routeId if either From or To is not selected
          if (routeIdInput) {
            routeIdInput.value = '';
          }
        }
      };

      // Add event listeners to both selects
      if (fromSelect) {
        fromSelect.addEventListener('change', updateRouteId);
      }
      if (toSelect) {
        toSelect.addEventListener('change', updateRouteId);
      }

      // Initialize routeId on form load (in case we're editing)
      // Note: The actual value will be set by populateForm when editing an existing trip
  }

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
      actions.setFilter('trips', { status: '', dateFrom: '', dateTo: '', internalRef: '' });
      try {
        await fetchTrips();
      } catch (error) {
        actions.setError(error.message);
      }
      render();
    });
  });

  bindDriverMultiSelect(state);
  bindFreightCalculator();

  // Handle freight mode switching (Fixed vs Weight×Rate)
  if (tripForm) {
    const freightModeRadios = tripForm.querySelectorAll('input[name="freightMode"]');
    const weightTonsInput = tripForm.querySelector('#weightTons');
    const freightPerTonInput = tripForm.querySelector('#freightPerTon');
    const freightAmountInput = tripForm.querySelector('#freightAmount');
    const ratePerKmInput = tripForm.querySelector('#ratePerKm');

    if (freightModeRadios.length && weightTonsInput && freightPerTonInput && freightAmountInput && ratePerKmInput) {
      const updateFreightFields = () => {
        const isWeightRateMode = Array.from(freightModeRadios).find(radio =>
          radio.checked && radio.value === 'weight_rate');

        if (isWeightRateMode) {
          // Weight × Rate mode: show weightTons and freightPerTon, calculate freightAmount
          weightTonsInput.disabled = false;
          freightPerTonInput.disabled = false;
          // readOnly, not disabled — a disabled input is excluded from
          // FormData entirely, which silently dropped freightAmount from
          // the submitted trip body while the UI still showed a computed value.
          freightAmountInput.readOnly = true;
          freightAmountInput.placeholder = 'Auto-calculated from Weight × Rate';

          // Calculate freightAmount when weightTons or freightPerTon changes
          const calculateFreightAmount = () => {
            const weight = parseFloat(weightTonsInput.value) || 0;
            const ratePerTon = parseFloat(freightPerTonInput.value) || 0;
            if (weight > 0 && ratePerTon > 0) {
              freightAmountInput.value = Math.round(weight * ratePerTon);
            } else {
              freightAmountInput.value = '';
            }
          };

          weightTonsInput.removeEventListener('input', weightTonsInput._freightCalcHandler);
          weightTonsInput._freightCalcHandler = calculateFreightAmount;
          weightTonsInput.addEventListener('input', calculateFreightAmount);

          freightPerTonInput.removeEventListener('input', freightPerTonInput._freightCalcHandler);
          freightPerTonInput._freightCalcHandler = calculateFreightAmount;
          freightPerTonInput.addEventListener('input', calculateFreightAmount);

          // Initial calculation
          calculateFreightAmount();
        } else {
          // Fixed mode: hide calculation, allow manual freight amount entry
          weightTonsInput.disabled = false;
          freightPerTonInput.disabled = false;
          freightAmountInput.readOnly = false;
          freightAmountInput.placeholder = 'e.g. 50000 (auto-calculated from route/rate)';

          // Remove weight×rate calculation listeners
          if (weightTonsInput._freightCalcHandler) {
            weightTonsInput.removeEventListener('input', weightTonsInput._freightCalcHandler);
            weightTonsInput._freightCalcHandler = null;
          }
          if (freightPerTonInput._freightCalcHandler) {
            freightPerTonInput.removeEventListener('input', freightPerTonInput._freightCalcHandler);
            freightPerTonInput._freightCalcHandler = null;
          }
        }
      };

      // Add event listeners to radio buttons
      freightModeRadios.forEach(radio => {
        radio.removeEventListener('change', radio._freightModeHandler);
        radio._freightModeHandler = updateFreightFields;
        radio.addEventListener('change', updateFreightFields);
      });

      // Initialize based on current state
      updateFreightFields();
    }
  }

  // Handle vehicle → driver auto-select in trip form (using existing tripForm from above)
  if (tripForm) {
    const vehicleSelect = tripForm.querySelector('#vehicleId');
    const driverMultiSelectContainer = document.getElementById('driver-multi-select-container');

    if (vehicleSelect && driverMultiSelectContainer) {
      const updateSelectedDriver = () => {
        const vehicleId = vehicleSelect.value;

        // Find the selected vehicle
        const selectedVehicle = (state.refs.vehicles || []).find(
          vehicle => vehicle.id === vehicleId
        );

        if (selectedVehicle && selectedVehicle.currentDriverId) {
          // Vehicle has a current driver, select it in the multi-select
          const driverCheckboxes = driverMultiSelectContainer.querySelectorAll(
            'input.driver-option-checkbox'
          );
          driverCheckboxes.forEach(checkbox => {
            checkbox.checked = (checkbox.value === selectedVehicle.currentDriverId);
          });

          // Trigger change event to update the UI
          if (driverCheckboxes.length > 0) {
            driverCheckboxes[0].dispatchEvent(new Event('change'));
          }
        } else {
          // No vehicle or no current driver, clear selection
          const driverCheckboxes = driverMultiSelectContainer.querySelectorAll(
            'input.driver-option-checkbox'
          );
          driverCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
          });

          // Trigger change event to update the UI
          if (driverCheckboxes.length > 0) {
            driverCheckboxes[0].dispatchEvent(new Event('change'));
          }
        }
      };

      // Add event listener to vehicle select
      vehicleSelect.removeEventListener('change', vehicleSelect._vehicleChangeHandler);
      vehicleSelect._vehicleChangeHandler = updateSelectedDriver;
      vehicleSelect.addEventListener('change', updateSelectedDriver);

      // Initialize based on current state (in case we're editing an existing trip)
      updateSelectedDriver();
    }
  }

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
    // Set more detailed error message with field-specific information
    if (error.issues && Array.isArray(error.issues)) {
      const fieldErrors = error.issues.map(issue => {
        const fieldName = issue.path.length > 0 ? issue.path[0] : 'unknown';
        const fieldLabels = {
          'transporterId': 'Transporter',
          'vehicleId': 'Vehicle',
          'routeId': 'Route',
          'driverIds': 'Drivers',
          'freightAmount': 'Freight Amount',
          'internalRef': 'Internal Reference',
          'lrNumber': 'LR Number'
        };
        const label = fieldLabels[fieldName] || fieldName;
        return `${label}: ${issue.message}`;
      });
      actions.setError(`Validation failed: ${fieldErrors.join('; ')}`);
    } else {
      actions.setError(error.message);
    }
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

    // Populate form with failed data to retain user input
    if (state.failedFormData && state.failedFormData.type === type) {
      const form = document.querySelector(`form[data-form="${type}"]`);
      if (form) {
        populateForm(form, state.failedFormData.body);

        // Special handling for trip driver multi-select
        if (type === 'trip') {
          let driverIds = [];
          if (Array.isArray(state.failedFormData.body.driverIds)) {
            driverIds = state.failedFormData.body.driverIds;
          } else if (typeof state.failedFormData.body.driverIds === 'string') {
            try {
              driverIds = JSON.parse(state.failedFormData.body.driverIds);
            } catch (e) {
              driverIds = [];
            }
          }
          populateDriverMultiSelect(driverIds);
        }
      }
      // Clear failed form data after use to prevent staleness
      actions.clearFailedFormData();
    }
  }
}

// Build a human-readable "here's what's attached" line for the delete
// confirmation, from data already on hand where possible (list pages already
// carry tripCount/paidTotal etc.) so most deletes need no extra request.
async function getDeleteDependencySummary(entity, id) {
  if (entity === 'transporter') {
    const t = (state.data.transporters || []).find((x) => x.id === id);
    if (t) {
      const parts = [];
      if (t.tripCount) parts.push(`${t.tripCount} trip${t.tripCount === 1 ? '' : 's'}`);
      if (t.paidTotal > 0) parts.push(`${currency(t.paidTotal)} in payment history`);
      if (parts.length) return `This transporter has ${parts.join(' and ')}.`;
    }
  } else if (entity === 'driver') {
    const d = (state.data.drivers || []).find((x) => x.id === id);
    if (d) {
      const parts = [];
      if (d.tripCount) parts.push(`${d.tripCount} trip${d.tripCount === 1 ? '' : 's'}`);
      if (d.settlementTotal > 0) parts.push(`${currency(d.settlementTotal)} in settlement history`);
      if (parts.length) return `This driver has ${parts.join(' and ')}.`;
    }
  } else if (entity === 'vehicle' || entity === 'route') {
    try {
      const data = await api.request(`/${entity}s/${id}`);
      const tripCount = (data.trips || []).length;
      if (tripCount) return `This ${entity} has ${tripCount}${tripCount >= 3 ? '+' : ''} linked trip${tripCount === 1 ? '' : 's'}.`;
    } catch {
      // Detail fetch failing here shouldn't block showing the dialog — the
      // delete itself will still be validated server-side.
    }
  }
  return '';
}

async function handleDelete(entity, id) {
  const dependencySummary = await getDeleteDependencySummary(entity, id);
  const confirmed = await confirmDialog({
    title: `Delete ${capitalize(entity)}?`,
    message: `${dependencySummary ? dependencySummary + ' ' : ''}Are you sure you want to delete this ${entity}? This action cannot be undone.`,
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
  actions.clearError();

  try {
    // Fetch first so the edit form only ever renders already-populated —
    // switching to edit mode before the data arrives caused a visible
    // empty-form flash (fields blank for a moment, then filled in).
    const data = await api.request(`/${entity}s/${id}`);
    actions.setEditing(entity, id);
    render();

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
    actions.setMessage(`Trip updated to ${formatStatus(status)}.`);
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
