/**
 * Utility Functions - Common helpers used across the app
 */

/**
 * Format number as Indian currency
 * @param {number|string} value - Value to format
 * @returns {string} - Formatted currency string
 */
export function currency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

/**
 * Format date for display
 * @param {string|Date|null} value - Date to format
 * @returns {string} - Formatted date string
 */
export function formatDate(value) {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

/**
 * Format datetime for display
 * @param {string|Date} value - Date to format
 * @returns {string} - Formatted datetime string
 */
export function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Format datetime for datetime-local input
 * @param {string|Date} value - Date to format
 * @returns {string} - ISO string slice (YYYY-MM-DDTHH:MM)
 */
export function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  return date.toISOString().slice(0, 16);
}

/**
 * Safely convert any value to number
 * @param {*} value - Value to convert
 * @returns {number} - Number or 0
 */
export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sum array items by selector
 * @param {Array} items - Array of items
 * @param {Function} selector - Function to extract value
 * @returns {number} - Sum
 */
export function sumBy(items, selector) {
  return items.reduce((total, item) => total + toNumber(selector(item)), 0);
}

/**
 * Generate option list HTML for select elements
 * @param {Array} items - Array of items
 * @param {Function} labelFn - Function to generate label
 * @param {string} placeholder - Placeholder text
 * @param {string} selectedValue - Currently selected value
 * @returns {string} - HTML options
 */
export function optionList(items, labelFn, placeholder, selectedValue = '') {
  const options = items.map(item => {
    const id = item.id;
    const selected = id === selectedValue ? 'selected' : '';
    return `<option value="${id}" ${selected}>${labelFn(item)}</option>`;
  });
  return [`<option value="">${placeholder}</option>`, ...options].join('');
}

/**
 * Generate delete button HTML
 * @param {string} entity - Entity name
 * @param {string} id - Entity ID
 * @returns {string} - Button HTML
 */
export function deleteButton(entity, id) {
  return `<button type="button" class="btn btn-ghost btn-danger" data-delete-entity="${entity}" data-delete-id="${id}">Delete</button>`;
}

/**
 * Generate edit button HTML
 * @param {string} entity - Entity name
 * @param {string} id - Entity ID
 * @returns {string} - Button HTML
 */
export function editButton(entity, id) {
  return `<button type="button" class="btn btn-ghost" data-edit-entity="${entity}" data-edit-id="${id}">Edit</button>`;
}

/**
 * Generate navigation item HTML
 * @param {string} hash - Route hash
 * @param {string} label - Navigation label
 * @returns {string} - Nav item HTML
 */
export function navItem(hash, label) {
  // Note: active state is handled by the router
  return `<a class="nav-item" href="${hash}">${label}</a>`;
}

/**
 * Create form field HTML
 * @param {Object} options - Field options
 * @returns {string} - Form field HTML
 */
export function formField({ label, type = 'text', id, name, placeholder = '', required = false, options = [], min, max, step, maxlength }) {
  const requiredAttr = required ? 'required' : '';
  const minAttr = min !== undefined ? `min="${min}"` : '';
  const maxAttr = max !== undefined ? `max="${max}"` : '';
  const stepAttr = step !== undefined ? `step="${step}"` : '';
  const maxlengthAttr = maxlength !== undefined ? `maxlength="${maxlength}"` : '';

  let inputHtml = '';

  if (type === 'select') {
    const optionsHtml = options.map(opt =>
      `<option value="${opt.value}">${opt.label}</option>`
    ).join('');
    inputHtml = `<select id="${id}" name="${name}" ${requiredAttr}>${optionsHtml}</select>`;
  } else {
    const typeAttr = type === 'date' ? 'date' : (type === 'number' ? 'number' : 'text');
    inputHtml = `<input type="${typeAttr}" id="${id}" name="${name}" placeholder="${placeholder}" ${requiredAttr} ${minAttr} ${maxAttr} ${stepAttr} ${maxlengthAttr} />`;
  }

  return `
    <div class="form-field">
      <label for="${id}">${label}</label>
      ${inputHtml}
    </div>
  `;
}

/**
 * Create driver multi-select HTML
 * @param {string} containerId - Container element ID
 * @returns {string} - Multi-select HTML
 */
export function createDriverMultiSelect(containerId = 'driver-multi-select-container') {
  return `
    <div class="driver-multi-select" id="${containerId}">
      <button type="button" class="driver-select-trigger" aria-expanded="false" aria-haspopup="listbox">
        <span class="driver-selected-chips"></span>
        <span class="driver-select-placeholder">Select drivers...</span>
        <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <input type="hidden" class="driver-multi-select-input" name="driverIds" value="[]" />
      </button>
      <div class="driver-select-dropdown" role="listbox" aria-label="Select drivers">
        <div class="driver-select-options"></div>
        <div class="driver-select-footer">
          <span class="driver-select-count">0 selected</span>
          <button type="button" class="driver-select-clear">Clear all</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate form submit button HTML
 * @param {string} type - Form type
 * @param {string} mode - 'active' | 'editing'
 * @returns {string} - Button HTML
 */
export function formSubmit(type, mode = 'active') {
  const isEditing = mode === 'editing';
  return `<button type="submit" class="btn btn-primary">${isEditing ? 'Update' : 'Save'} ${type.charAt(0).toUpperCase() + type.slice(1)}</button>`;
}

/**
 * Generate navigation item HTML
 * @param {string} hash - Route hash
 * @param {string} label - Navigation label
 * @returns {string} - Nav item HTML
 */
export function bottomNavItem(hash, label, icon, isMenu = false) {
  const menuClass = isMenu ? 'menu-item' : '';
  return `<a class="bottom-nav-item ${menuClass}" href="#" data-bottom-nav="${hash}">${icon}<span>${label}</span></a>`;
}

/**
 * Normalize form body for API submission
 * Handles dates, arrays, and special fields
 * @param {HTMLFormElement} form - Form element
 * @param {string} type - Form type
 * @param {Object} rawBody - Raw form data
 * @returns {Object} - Normalized body
 */
export function normalizeFormBody(form, type, rawBody) {
  const body = {};

  for (const [key, value] of Object.entries(rawBody)) {
    if (value === '') continue;

    // Handle dates
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

    // Handle driverIds for trips (both array and JSON string)
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
      } catch {
        // Not JSON, treat as single value
      }
    }

    body[key] = value;
  }

  return body;
}

/**
 * Format status for display
 * @param {string} status - Status string
 * @returns {string} - Formatted status
 */
export function formatStatus(status) {
  return status?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || '';
}

/**
 * Get status chip class
 * @param {string} status - Status string
 * @returns {string} - Chip class
 */
export function getStatusChipClass(status) {
  const statusClasses = {
    'DRAFT': '',
    'LOADING': 'info',
    'IN_TRANSIT': 'info',
    'DELIVERED': 'success',
    'POD_RECEIVED': 'success',
    'BILLED': 'warning',
    'SETTLED': 'success',
    'CANCELLED': 'danger'
  };
  return statusClasses[status] || '';
}

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} - Debounced function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} - Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}