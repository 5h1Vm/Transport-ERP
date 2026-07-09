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

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || `Request failed: ${response.status}`,
      response.status,
      error.issues || null
    );
  }

  return response.status === 204 ? null : response.json();
}

// Transporter API
export const transporterApi = {
  list: () => request('/transporters'),
  get: (id) => request(`/transporters/${id}`),
  create: (data) => request('/transporters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/transporters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/transporters/${id}`, { method: 'DELETE' }),
  getPayments: (id) => request(`/transporters/${id}/payments`),
  addPayment: (id, data) => request(`/transporters/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
};

// Vehicle API
export const vehicleApi = {
  list: () => request('/vehicles'),
  get: (id) => request(`/vehicles/${id}`),
  create: (data) => request('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),
};

// Driver API
export const driverApi = {
  list: () => request('/drivers'),
  get: (id) => request(`/drivers/${id}`),
  create: (data) => request('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/drivers/${id}`, { method: 'DELETE' }),
  addSettlement: (id, data) => request(`/drivers/${id}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  getMonthlyBreakdown: (id) => request(`/drivers/${id}/monthly-breakdown`),
};

// Route API
export const routeApi = {
  list: () => request('/routes'),
  get: (id) => request(`/routes/${id}`),
  create: (data) => request('/routes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/routes/${id}`, { method: 'DELETE' }),
};

// Trip API
export const tripApi = {
  list: () => request('/trips'),
  get: (id) => request(`/trips/${id}`),
  create: (data) => request('/trips', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/trips/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/trips/${id}`, { method: 'DELETE' }),
  updateStatus: (id, status) => request(`/trips/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  addPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  addPod: (id, data) => request(`/trips/${id}/pod`, { method: 'POST', body: JSON.stringify(data) }),
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
  getTransporterEntries: () => request('/transporter-ledger-entries'),
  getPayments: () => request('/payments'),
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
};