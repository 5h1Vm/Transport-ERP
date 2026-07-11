/**
 * Transit Ledger - Main Entry Point
 * Modular architecture with clean separation of concerns
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

// Components
import { createMainLayout } from './components/Layout.js';
import { showToast, showStateMessages } from './components/Toast.js';
import { confirmDialog } from './components/Dialog.js';

// Utils
import { bindForms, bindDeleteButtons, bindEditButtons, bindTripStatusButtons, bindNavigation, bindFilters, bindDriverMultiSelect, bindVehicleFilterByTransporter, bindFreightCalculator, applyValidationErrors, clearValidationErrors, populateForm, resetForm } from './utils/binding.js';

// App container
const app = document.querySelector('#app');

// Initialize hash change listener (keeps state.route in sync + closes mobile nav)
initHashChangeListener();

// Repaint the page whenever the route changes. The store's hashchange listener
// (registered above) updates state.route first, then this repaints for it. Without
// this, clicking a nav link updated state but never re-rendered — you had to refresh.
window.addEventListener('hashchange', () => { render(); });

// Main render function
async function render() {
  const page = currentPage.value;
  let contentHtml;

  try {
    // Handle async detail pages
    if (page.startsWith('transporter/')) {
      const id = page.split('/')[1];
      contentHtml = await renderTransporterDetail(id);
    } else if (page.startsWith('trip/')) {
      const id = page.split('/')[1];
      contentHtml = await renderTripDetail(id);
    } else if (page.startsWith('driver/')) {
      const id = page.split('/')[1];
      contentHtml = await renderDriverDetail(id);
    } else if (page.startsWith('route/')) {
      const id = page.split('/')[1];
      contentHtml = await renderRouteDetail(id);
    } else {
      // Sync pages
      contentHtml = state.loading ? '<div class="loading-card">Preparing workspace...</div>' :
        page === 'transporters' ? renderTransportersPage() :
        page === 'vehicles' ? renderVehiclesPage() :
        page === 'drivers' ? renderDriversPage() :
        page === 'routes' ? renderRoutesPage() :
        page === 'trips' ? renderTripsPage() :
        page === 'ledgers' ? renderLedgersPage() :
        page === 'dashboard' ? renderDashboardPage() :
        renderDashboardPage();
    }
  } catch (error) {
    contentHtml = `<div class="error-card">Failed to load page: ${error.message}</div>`;
  }

  app.innerHTML = createMainLayout(page, contentHtml);

  // Bind all event handlers
  bindEventHandlers();

  // Show toast messages from state
  showStateMessages();
}

function bindEventHandlers() {
  // Forms
  bindForms(handleFormSubmit);

  // Delete buttons
  bindDeleteButtons(handleDelete);

  // Edit buttons
  bindEditButtons(handleEdit);

  // Trip status buttons
  bindTripStatusButtons(handleTripStatusChange);

  // Navigation
  bindNavigation(
    (hash) => { window.location.hash = hash; },
    (forceOpen) => toggleSidebar(forceOpen)
  );

  // Filters
  bindFilters({
    transporters: (value) => { actions.setFilter('transporters', value); render(); },
    vehicles: (value) => { actions.setFilter('vehicles', value); render(); },
    drivers: (value) => { actions.setFilter('drivers', value); render(); },
    trips: (key, value) => { actions.setFilter('trips', { [key]: value }); render(); }
  });

  // Driver multi-select
  bindDriverMultiSelect(state);

  // Vehicle filter by transporter
  bindVehicleFilterByTransporter(() => state.data.vehicles);

  // Freight auto-calculator
  bindFreightCalculator();

  // Apply validation errors
  applyValidationErrors(state.validationErrors);
}

// Form submit handler
async function handleFormSubmit(type, rawBody, form) {
  const body = normalizeFormBody(form, type, rawBody);

  actions.setLoading(true);
  actions.setMessage('');
  actions.setError('');
  render();

  try {
    let response;
    if (state.editing && state.editing.entity === type) {
      // Update
      response = await api.request(`/${type}s/${state.editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      actions.setMessage(`${capitalize(type)} updated successfully.`);
    } else {
      // Create
      response = await createEntity(type, body);
      actions.setMessage(`${capitalize(type)} created successfully.`);
    }

    form.reset();
    if (type === 'driver-settlement') {
      actions.resetDriverSettlementForm();
    }
    if (state.editing && state.editing.entity === type) {
      actions.clearEditing();
    }
    await loadData();
  } catch (error) {
    actions.setLoading(false);
    actions.setError(error.message);

    // Store form data for re-population
    actions.setFailedFormData(type, body);

    // Handle validation errors
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

// Delete handler
async function handleDelete(entity, id) {
  const confirmed = await confirmDialog({
    title: `Delete ${capitalize(entity)}?`,
    message: `Are you sure you want to delete this ${entity}? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });

  if (!confirmed) return;

  actions.setLoading(true);
  actions.setMessage('');
  actions.setError('');
  render();

  try {
    await api.request(`/${entity}s/${id}`, { method: 'DELETE' });
    actions.setMessage('Deleted successfully.');
    await loadData();
  } catch (error) {
    actions.setLoading(false);
    actions.setError(error.message);
    render();
  }
}

// Edit handler
async function handleEdit(entity, id) {
  actions.setEditing(entity, id);
  actions.clearError();

  try {
    const data = await api.request(`/${entity}s/${id}`);
    const form = document.querySelector(`form[data-form="${entity}"]`);
    if (form) {
      populateForm(form, data);
    }
  } catch (error) {
    actions.setError(`Failed to load ${entity} for editing: ${error.message}`);
    render();
  }
}

// Trip status change handler
async function handleTripStatusChange(tripId, status) {
  actions.setLoading(true);
  actions.setError('');
  render();

  try {
    await api.trip.updateStatus(tripId, status);
    actions.setMessage(`Trip updated to ${status}.`);
    await loadData();
  } catch (error) {
    actions.setLoading(false);
    actions.setError(error.message);
    render();
  }
}

// Toggle sidebar
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

// Normalize form body
function normalizeFormBody(form, type, rawBody) {
  const body = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (value === '') continue;

    if (key.toLowerCase().includes('date') && typeof value === 'string') {
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

    if (type === 'trip' && key === 'driverId') {
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

// Create entity based on type
async function createEntity(type, body) {
  switch (type) {
    case 'transporter': return api.transporter.create(body);
    case 'vehicle': return api.vehicle.create(body);
    case 'driver': return api.driver.create(body);
    case 'route': return api.route.create(body);
    case 'trip': return api.trip.create(body);
    case 'driver-settlement': return api.driver.addSettlement(body.driverId, body);
    case 'trip-payment': return api.trip.addPayment(body);
    case 'transporter-payment': return api.transporter.addPayment(body.transporterId, body);
    case 'pod': return api.trip.addPod(body.tripId, body);
    default: throw new Error(`Unknown form type: ${type}`);
  }
}

// Load all data
async function loadData() {
  actions.setLoading(true);
  render();

  try {
    const [dashboard, refs, transporters, vehicles, drivers, routes, trips, ledgerEntries, payments] = await Promise.all([
      api.dashboard.get(),
      api.reference.get(),
      api.transporter.list(),
      api.vehicle.list(),
      api.driver.list(),
      api.route.list(),
      api.trip.list(),
      api.ledger.getTransporterEntries(),
      api.ledger.getPayments()
    ]);

    actions.setDashboard(dashboard);
    actions.setRefs(refs);
    actions.setData({ transporters, vehicles, drivers, routes, trips, transporterLedgerEntries: ledgerEntries, payments });
    actions.setLoading(false);
    actions.setMessage('');
    render();
  } catch (error) {
    actions.setLoading(false);
    actions.setMessage(error.message);
    render();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initialize app
loadData().catch(error => {
  actions.setLoading(false);
  actions.setMessage(error.message);
  render();
});