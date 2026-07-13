/**
 * Store - Centralized state management
 * Single source of truth for the application state
 */
import { ref, reactive, computed } from './reactive.js';

// Global reactive state
export const state = reactive({
  // Routing
  route: window.location.hash || '#dashboard',

  // Loading & messages
  loading: true,
  message: '',
  error: '',

  // Data
  dashboard: null,
  refs: {
    transporters: [],
    vehicles: [],
    drivers: [],
    routes: []
  },
  data: {
    transporters: [],
    vehicles: [],
    drivers: [],
    routes: [],
    trips: [],
    transporterLedgerEntries: [],
    payments: []
  },

  // Trips pagination (server-side)
  tripsHasMore: false,

  // Editing state
  editing: null,
  showMobileForm: false,
  failedFormData: null,
  validationErrors: {},

  // Filters
  filters: {
    transporters: '',
    vehicles: '',
    drivers: '',
    routes: '',
    trips: {
      transporter: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      internalRef: ''
    }
  },

  // Driver settlement form data
  driverSettlementFormData: {
    driverId: '',
    type: 'SALARY',
    amount: '',
    tripId: '',
    description: ''
  }
});

// Computed helpers
export const currentPage = computed(() => {
  return (state.route || '#dashboard').replace('#', '') || 'dashboard';
});

export const isMobile = computed(() => window.innerWidth < 640);
export const isTablet = computed(() => window.innerWidth >= 640 && window.innerWidth < 1024);
export const isDesktop = computed(() => window.innerWidth >= 1024);

// Actions
export const actions = {
  setRoute(hash) {
    state.route = hash;
  },

  setLoading(loading) {
    state.loading = loading;
  },

  setMessage(message) {
    state.message = message;
    // Auto-clear after 3 seconds
    setTimeout(() => {
      if (state.message === message) state.message = '';
    }, 3000);
  },

  setError(error) {
    state.error = error;
  },

  clearError() {
    state.error = '';
  },

  setEditing(entity, id) {
    state.editing = { entity, id };
  },

  clearEditing() {
    state.editing = null;
  },

  setMobileForm(show) {
    state.showMobileForm = show;
  },

  toggleMobileForm() {
    state.showMobileForm = !state.showMobileForm;
  },

  setFailedFormData(type, body) {
    state.failedFormData = { type, body };
  },

  clearFailedFormData() {
    state.failedFormData = null;
  },

  setValidationErrors(errors) {
    state.validationErrors = errors;
  },

  clearValidationErrors() {
    state.validationErrors = {};
  },

  // Data loading
  setDashboard(data) {
    state.dashboard = data;
  },

  setRefs(refs) {
    state.refs = refs;
  },

  setData(data) {
    state.data = { ...state.data, ...data };
  },

  // Filter actions
  setFilter(category, value) {
    if (typeof value === 'object' && state.filters[category]) {
      state.filters[category] = { ...state.filters[category], ...value };
    } else {
      state.filters[category] = value;
    }
  },

  clearFilters() {
    state.filters = {
      transporters: '',
      vehicles: '',
      drivers: '',
      routes: '',
      trips: { transporter: '', status: '', dateFrom: '', dateTo: '', internalRef: '' }
    };
  },

  // Driver settlement form
  updateDriverSettlementForm(field, value) {
    state.driverSettlementFormData[field] = value;
  },

  resetDriverSettlementForm() {
    state.driverSettlementFormData = {
      driverId: '',
      type: 'SALARY',
      amount: '',
      tripId: '',
      description: ''
    };
  }
};

// Initialize hashchange listener
let hashChangeInitialized = false;
export function initHashChangeListener() {
  if (hashChangeInitialized) return;
  hashChangeInitialized = true;

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
    state.error = '';
    // A validation error (or its failed-form-data snapshot) belongs to the
    // form that produced it. Left uncleared, it silently re-applies (red
    // borders + messages) to a completely fresh, untouched form the next
    // time this same page type is visited — looks like eager/premature
    // validation on page load, but is really stale state from a previous visit.
    state.validationErrors = {};
    state.failedFormData = null;
  });
}