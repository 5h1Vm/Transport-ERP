/**
 * API Service - Centralized API communication
 * Handles all backend requests with consistent error handling
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

class ApiError extends Error {
  constructor(message, status, issues = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

// Build a query string from a params object, skipping empty values.
function qs(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15 seconds

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(
        error.message || `Request failed: ${response.status}`,
        response.status,
        error.issues || null
      );
    }

    return response.status === 204 ? null : await response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }
    throw err;
  }
}

// Transporter API
export const transporterApi = {
  list: (params) => request('/transporters' + qs(params)),
  get: (id) => request(`/transporters/${id}`),
  create: (data) => request('/transporters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/transporters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/transporters/${id}`, { method: 'DELETE' }),
  getPayments: (id) => request(`/transporters/${id}/payments`),
  addPayment: (id, data) => request(`/transporters/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
};

// Vehicle API
export const vehicleApi = {
  list: (params) => request('/vehicles' + qs(params)),
  get: (id) => request(`/vehicles/${id}`),
  create: (data) => request('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),
};

// Driver API
export const driverApi = {
  list: (params) => request('/drivers' + qs(params)),
  get: (id) => request(`/drivers/${id}`),
  create: (data) => request('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/drivers/${id}`, { method: 'DELETE' }),
  addSettlement: (id, data) => request(`/drivers/${id}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  getMonthlyBreakdown: (id) => request(`/drivers/${id}/monthly-breakdown`),
};

// Route API
export const routeApi = {
  list: (params) => request('/routes' + qs(params)),
  get: (id) => request(`/routes/${id}`),
  create: (data) => request('/routes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/routes/${id}`, { method: 'DELETE' }),
};

// Trip API
export const tripApi = {
  list: (params) => request('/trips' + qs(params)),
  get: (id) => request(`/trips/${id}`),
  create: (data) => request('/trips', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/trips/${id}`, { method: 'DELETE' }),
  updateStatus: (id, status) => request(`/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  // Steps the trip back one stage. Takes no body — the server derives the
  // previous stage, so the client can never ask for an arbitrary jump.
  undoStatus: (id) => request(`/trips/${id}/status/undo`, { method: 'PATCH' }),
  addPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  addPod: (id, data) => request(`/trips/${id}/pod`, { method: 'POST', body: JSON.stringify(data) }),
  // Sprint 2B follow-up: grow an ongoing trip in place.
  addStop: (id, data) => request(`/trips/${id}/stops`, { method: 'POST', body: JSON.stringify(data) }),
  addLoad: (id, data) => request(`/trips/${id}/loads`, { method: 'POST', body: JSON.stringify(data) }),
  addAnotherPod: (id, data) => request(`/trips/${id}/pods`, { method: 'POST', body: JSON.stringify(data) }),
};

// Dashboard API
export const dashboardApi = {
  get: () => request('/dashboard'),
};

// Reference Data API (for selects/dropdowns)
export const referenceApi = {
  get: () => request('/reference-data'),
};

// Ledger API
export const ledgerApi = {
  getTransporterEntries: (params) => request('/transporter-ledger-entries' + qs(params)),
  getPayments: (params) => request('/payments' + qs(params)),
};

// Reports API
export const reportsApi = {
  profitLoss: (params) => request('/reports/profit-loss' + qs(params)),
};

// Aliases for convenience (matches what main.js expects)
export const transporter = transporterApi;
export const vehicle = vehicleApi;
export const driver = driverApi;
export const route = routeApi;
export const trip = tripApi;
export const dashboard = dashboardApi;
export const reference = referenceApi;
export const ledger = ledgerApi;
export const reports = reportsApi;

export { request, ApiError };
export default {
  transporter: transporterApi,
  vehicle: vehicleApi,
  driver: driverApi,
  route: routeApi,
  trip: tripApi,
  dashboard: dashboardApi,
  reference: referenceApi,
  ledger: ledgerApi,
  reports: reportsApi,
};