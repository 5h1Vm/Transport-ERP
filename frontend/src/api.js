import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const getVehicles     = () => api.get('/vehicles');
export const getDrivers      = () => api.get('/drivers');
export const getTransporters = () => api.get('/transporters');
export const getParties      = () => api.get('/parties');
export const getRoutes       = () => api.get('/routes');
export const getRateCard     = (transporterId, routeId) => api.get(`/ratecards?transporterId=${transporterId}&routeId=${routeId}`);

export const getTrips        = () => api.get('/trips');
export const getTrip         = (id) => api.get(`/trips/${id}`);
export const createTrip      = (data) => api.post('/trips', data);
export const updateTripStatus = (id, status) => api.patch(`/trips/${id}/status`, { status });
export const uploadPOD       = (id, formData) => api.patch(`/trips/${id}/pod`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const getLedger       = (transporterId) => api.get(`/ledger/${transporterId}`);
export const recordPayment   = (transporterId, data) => api.post(`/ledger/${transporterId}/payment`, data);

export default api;
