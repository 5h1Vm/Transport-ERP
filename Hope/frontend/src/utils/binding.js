/**
 * Event Binding Utilities - Centralized event binding for components
 */
import { state } from '../store/index.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * Bind form submit handlers
 * @param {Function} onSubmit - Submit handler function
 */
export function bindForms(onSubmit) {
  document.querySelectorAll('form[data-form]').forEach(form => {
    // Clean up existing listener
    form.removeEventListener('submit', form._submitHandler);

    const handler = async (event) => {
      event.preventDefault();
      const type = form.getAttribute('data-form');
      const formData = new FormData(form);
      const rawBody = Object.fromEntries(formData.entries());

      await onSubmit(type, rawBody, form);
    };

    form._submitHandler = handler;
    form.addEventListener('submit', handler);
  });
}

/**
 * Bind delete buttons
 * @param {Function} onDelete - Delete handler
 */
export function bindDeleteButtons(onDelete) {
  document.querySelectorAll('[data-delete-entity]').forEach(button => {
    button.removeEventListener('click', button._clickHandler);

    const handler = () => {
      const entity = button.getAttribute('data-delete-entity');
      const id = button.getAttribute('data-delete-id');
      onDelete(entity, id);
    };

    button._clickHandler = handler;
    button.addEventListener('click', handler);
  });
}

/**
 * Bind edit buttons
 * @param {Function} onEdit - Edit handler
 */
export function bindEditButtons(onEdit) {
  document.querySelectorAll('[data-edit-entity]').forEach(button => {
    button.removeEventListener('click', button._clickHandler);

    const handler = () => {
      const entity = button.getAttribute('data-edit-entity');
      const id = button.getAttribute('data-edit-id');
      onEdit(entity, id);
    };

    button._clickHandler = handler;
    button.addEventListener('click', handler);
  });
}

/**
 * Bind "cancel edit" buttons — visible only while a form is in edit mode.
 * @param {Function} onCancel - Cancel handler, called with the entity name
 */
export function bindCancelEditButtons(onCancel) {
  document.querySelectorAll('[data-cancel-edit]').forEach(button => {
    button.removeEventListener('click', button._clickHandler);

    const handler = () => {
      onCancel(button.getAttribute('data-cancel-edit'));
    };

    button._clickHandler = handler;
    button.addEventListener('click', handler);
  });
}

/**
 * Bind trip status buttons
 * @param {Function} onStatusChange - Status change handler
 */
export function bindTripStatusButtons(onStatusChange) {
  document.querySelectorAll('[data-trip-status]').forEach(button => {
    button.removeEventListener('click', button._clickHandler);

    const handler = (e) => {
      e.preventDefault();
      const tripId = button.getAttribute('data-trip-id');
      const status = button.getAttribute('data-trip-status');
      onStatusChange(tripId, status);
    };

    button._clickHandler = handler;
    button.addEventListener('click', handler);
  });
}

/**
 * Bind navigation (bottom nav + mobile menu)
 * @param {Function} onNavigate - Navigation handler
 * @param {Function} onMenuToggle - Menu toggle handler
 */
export function bindNavigation(onNavigate, onMenuToggle) {
  // Bottom navigation
  document.querySelectorAll('[data-bottom-nav]').forEach(item => {
    item.removeEventListener('click', item._clickHandler);

    const handler = (e) => {
      e.preventDefault();
      const targetHash = item.getAttribute('data-bottom-nav');

      if (targetHash === '#more') {
        onMenuToggle?.(true);
        return;
      }

      onNavigate(targetHash);
    };

    item._clickHandler = handler;
    item.addEventListener('click', handler);
  });

  // Mobile menu button
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    mobileMenuBtn.removeEventListener('click', mobileMenuBtn._clickHandler);

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onMenuToggle?.();
    };

    mobileMenuBtn._clickHandler = handler;
    mobileMenuBtn.addEventListener('click', handler);
  }

  // Sidebar overlay
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) {
    overlay.removeEventListener('click', overlay._clickHandler);

    const handler = () => {
      onMenuToggle?.(false);
    };

    overlay._clickHandler = handler;
    overlay.addEventListener('click', handler);
  }
}

// Select-all-on-focus for text filter inputs. Without this, clicking into a
// field that already has a value (carried over from a previous search, or
// restored after a re-render) places the cursor rather than selecting the
// text — typing then APPENDS instead of replacing (e.g. "TRP-001" + typing
// "TRP-999" becomes the query "TRP-001TRP-999", matching nothing, which
// reads exactly like "the filter is inverted" even though it isn't).
function bindSelectOnFocus(el) {
  if (!el || el._focusSelectHandler) return;
  el._focusSelectHandler = () => el.select();
  el.addEventListener('focus', el._focusSelectHandler);
}

/**
 * Bind search/filter inputs
 * @param {Object} handlers - Filter handlers
 */
export function bindFilters(handlers) {
  // Transporter search
  const transporterSearch = document.getElementById('transporter-search');
  if (transporterSearch && handlers.transporters) {
    transporterSearch.removeEventListener('input', transporterSearch._inputHandler);
    transporterSearch._inputHandler = (e) => handlers.transporters(e.target.value);
    transporterSearch.addEventListener('input', transporterSearch._inputHandler);
    bindSelectOnFocus(transporterSearch);
  }

  // Vehicle search
  const vehicleSearch = document.getElementById('vehicle-search');
  if (vehicleSearch && handlers.vehicles) {
    vehicleSearch.removeEventListener('input', vehicleSearch._inputHandler);
    vehicleSearch._inputHandler = (e) => handlers.vehicles(e.target.value);
    vehicleSearch.addEventListener('input', vehicleSearch._inputHandler);
    bindSelectOnFocus(vehicleSearch);
  }

  // Driver search
  const driverSearch = document.getElementById('driver-search');
  if (driverSearch && handlers.drivers) {
    driverSearch.removeEventListener('input', driverSearch._inputHandler);
    driverSearch._inputHandler = (e) => handlers.drivers(e.target.value);
    driverSearch.addEventListener('input', driverSearch._inputHandler);
    bindSelectOnFocus(driverSearch);
  }

  // Route search
  const routeSearch = document.getElementById('route-search');
  if (routeSearch && handlers.routes) {
    routeSearch.removeEventListener('input', routeSearch._inputHandler);
    routeSearch._inputHandler = (e) => handlers.routes(e.target.value);
    routeSearch.addEventListener('input', routeSearch._inputHandler);
    bindSelectOnFocus(routeSearch);
  }

  // Trips filters
  if (handlers.trips) {
    const tripFilters = {
      'trip-transporter-filter': 'transporter',
      'trip-status-filter': 'status',
      'trip-internalref-filter': 'internalRef',
      'trip-datefrom-filter': 'dateFrom',
      'trip-dateto-filter': 'dateTo'
    };

    Object.entries(tripFilters).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) {
        const event = el.tagName === 'SELECT' ? 'change' : 'input';
        el.removeEventListener(event, el._eventHandler);
        el._eventHandler = (e) => handlers.trips(key, e.target.value);
        el.addEventListener(event, el._eventHandler);
        if (el.tagName !== 'SELECT') bindSelectOnFocus(el);
      }
    });
  }
}

/**
 * Bind driver multi-select dropdown
 * @param {Object} state - Form state reference
 */
export function bindDriverMultiSelect(state) {
  const container = document.getElementById('driver-multi-select-container');
  // The component uses classes, not IDs — query within the container.
  const trigger = container?.querySelector('.driver-select-trigger');
  const dropdown = container?.querySelector('.driver-select-dropdown');
  const form = document.querySelector('form[data-form="trip"]');

  // Populate driver options if container exists and has options element
  if (container) {
    const optionsEl = container.querySelector('.driver-select-options');
    const footerEl = container.querySelector('.driver-select-footer');
    // Dropdown data comes from the reference payload (route-scoped loading);
    // fall back to the rich list if it happens to be loaded.
    const drivers = (state.refs.drivers && state.refs.drivers.length ? state.refs.drivers : state.data.drivers) || [];

    if (optionsEl && drivers.length > 0) {
      optionsEl.innerHTML = drivers.map(d => `
        <label class="driver-select-option">
          <input type="checkbox" class="driver-option-checkbox" value="${d.id}" />
          <span>${escapeHtml(d.name)}</span>
        </label>
      `).join('');

      // Add footer if missing
      if (!footerEl) {
        const footer = document.createElement('div');
        footer.className = 'driver-select-footer';
        footer.innerHTML = `
          <span class="driver-select-count">0 selected</span>
          <button type="button" class="driver-select-clear">Clear all</button>
        `;
        container.querySelector('.driver-select-dropdown').appendChild(footer);
      }
    }

    // Re-bind checkboxes and clear button after populating
    const clearBtn = container.querySelector('.driver-select-clear');
    const countEl = container.querySelector('.driver-select-count');

    if (clearBtn) {
      clearBtn.removeEventListener('click', clearBtn._clickHandler);
      clearBtn._clickHandler = () => {
        container.querySelectorAll('input.driver-option-checkbox').forEach(cb => {
          cb.checked = false;
        });
        updateDriverSelect();
        trigger.querySelector('.driver-select-placeholder').textContent = 'Select drivers';
        trigger.querySelector('.driver-select-placeholder').style.color = 'var(--muted)';
      };
      clearBtn.addEventListener('click', clearBtn._clickHandler);
    }

    function updateDriverSelect() {
      const selected = Array.from(container.querySelectorAll('input.driver-option-checkbox:checked'))
        .map(cb => cb.value);

      // Update count
      if (countEl) {
        countEl.textContent = `${selected.length} selected`;
      }

      // Update placeholder/chips
      const placeholder = trigger.querySelector('.driver-select-placeholder');
      const chipsContainer = trigger.querySelector('.driver-selected-chips');

      if (selected.length === 0) {
        placeholder.textContent = 'Select drivers';
        placeholder.style.color = 'var(--muted)';
        if (chipsContainer) chipsContainer.innerHTML = '';
      } else if (selected.length <= 2) {
        const names = Array.from(container.querySelectorAll('input.driver-option-checkbox:checked'))
          .map(cb => cb.parentElement.textContent.trim());
        placeholder.textContent = names.join(', ');
        placeholder.style.color = 'var(--text)';
        if (chipsContainer) chipsContainer.innerHTML = '';
      } else {
        placeholder.textContent = `${selected.length} drivers selected`;
        placeholder.style.color = 'var(--text)';
        if (chipsContainer) chipsContainer.innerHTML = '';
      }

      // Update hidden field
      let hiddenInput = form.querySelector('input[type="hidden"][name="driverIds"]');
      if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'driverIds';
        form.appendChild(hiddenInput);
      }
      hiddenInput.value = JSON.stringify(selected);
    }

    // Bind all checkboxes
    container.querySelectorAll('input.driver-option-checkbox').forEach(checkbox => {
      checkbox.removeEventListener('change', checkbox._changeHandler);
      checkbox._changeHandler = updateDriverSelect;
      checkbox.addEventListener('change', checkbox._changeHandler);
    });
  }

  if (!trigger || !dropdown || !form) return;

  if (trigger.dataset.bound === 'true') return;
  trigger.dataset.bound = 'true';

  // Toggle dropdown
  trigger.removeEventListener('click', trigger._clickHandler);
  trigger._clickHandler = (e) => {
    e.stopPropagation();
    // CSS reveals the panel on `.open` (not `.show`).
    trigger.classList.toggle('open');
    dropdown.classList.toggle('open');
  };
  trigger.addEventListener('click', trigger._clickHandler);

  // Close on outside click
  document.removeEventListener('click', document._driverDropdownClickHandler);
  document._driverDropdownClickHandler = (e) => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      trigger.classList.remove('open');
    }
  };
  document.addEventListener('click', document._driverDropdownClickHandler);
}

// A rate-per-km typo (e.g. an extra digit) can silently compute a freight
// amount in the crores with no feedback until someone notices on the invoice.
// This is a soft warning, not a hard block — legitimate high-value freight
// still goes through, just flagged for a second look before saving.
const FREIGHT_SANITY_THRESHOLD = 1000000; // ₹10,00,000

function flagFreightSanity(freightInput, value) {
  let warning = freightInput.parentElement.querySelector('.freight-sanity-warning');
  if (value > FREIGHT_SANITY_THRESHOLD) {
    freightInput.classList.add('field-error');
    if (!warning) {
      warning = document.createElement('span');
      warning.className = 'field-error-message freight-sanity-warning';
      freightInput.insertAdjacentElement('afterend', warning);
    }
    warning.textContent = `That's over ₹10,00,000 — double-check the rate before saving.`;
  } else {
    freightInput.classList.remove('field-error');
    if (warning) warning.remove();
  }
}

/**
 * Bind freight auto-calculator based on route distance and rate
 */
export function bindFreightCalculator() {
  const routeSelect = document.getElementById('routeId');
  const distanceInput = document.getElementById('distanceKm');
  const rateInput = document.getElementById('ratePerKm');
  const freightInput = document.getElementById('freightAmount');

  if (!routeSelect || !freightInput) return;

  routeSelect.removeEventListener('change', routeSelect._changeHandler);
  routeSelect._changeHandler = () => {
    const routes = (state.refs.routes && state.refs.routes.length ? state.refs.routes : state.data.routes) || [];
    const selectedRoute = routes.find(r => r.id === routeSelect.value);

    if (selectedRoute) {
      // Auto-fill distance if field exists
      if (distanceInput && selectedRoute.distanceKm) {
        distanceInput.value = selectedRoute.distanceKm;
      }

      // Calculate freight: baseRate or distance × ratePerKm
      const distance = selectedRoute.distanceKm || 0;
      const baseRate = selectedRoute.baseRate || 0;
      const currentRate = rateInput ? parseFloat(rateInput.value) : 0;

      // Use baseRate from route, or calculate from ratePerKm × distance
      if (baseRate > 0) {
        freightInput.value = baseRate;
        flagFreightSanity(freightInput, baseRate);
      } else if (currentRate > 0 && distance > 0) {
        const computed = Math.round(currentRate * distance);
        freightInput.value = computed;
        flagFreightSanity(freightInput, computed);
      }
    }
  };
  routeSelect.addEventListener('change', routeSelect._changeHandler);

  // Also recalculate when ratePerKm changes
  if (rateInput) {
    rateInput.removeEventListener('input', rateInput._inputHandler);
    rateInput._inputHandler = () => {
      const routes = (state.refs.routes && state.refs.routes.length ? state.refs.routes : state.data.routes) || [];
      const selectedRoute = routes.find(r => r.id === routeSelect.value);
      if (selectedRoute && rateInput.value) {
        const distance = selectedRoute.distanceKm || 0;
        const rate = parseFloat(rateInput.value);
        if (distance > 0 && rate > 0) {
          const computed = Math.round(rate * distance);
          freightInput.value = computed;
          flagFreightSanity(freightInput, computed);
        }
      }
    };
    rateInput.addEventListener('input', rateInput._inputHandler);
  }
}

/**
 * Restore driver checkboxes when opening a trip for edit. populateForm()
 * can't do this generically — the API returns drivers as [{ role, driver }]
 * (a join, not a plain driverIds field), and the checkboxes intentionally
 * carry no `name` (see bindDriverMultiSelect) so a generic name-matching
 * populate pass finds nothing to restore.
 * @param {string[]} driverIds - IDs of drivers currently assigned to the trip
 */
export function populateDriverMultiSelect(driverIds = []) {
  const container = document.getElementById('driver-multi-select-container');
  const form = document.querySelector('form[data-form="trip"]');
  if (!container || !form) return;

  const idSet = new Set(driverIds);
  const checkboxes = container.querySelectorAll('input.driver-option-checkbox');
  checkboxes.forEach((cb) => { cb.checked = idSet.has(cb.value); });

  // Re-use the change handler bindDriverMultiSelect already attached (it
  // recomputes placeholder/count/hidden-field from whatever is checked, not
  // just the event target) instead of duplicating that logic here.
  if (checkboxes.length > 0) {
    checkboxes[0].dispatchEvent(new Event('change'));
  }
}

/**
 * Apply validation errors to form fields
 * @param {Object} errors - Validation errors object
 */
export function applyValidationErrors(errors) {
  if (!errors || Object.keys(errors).length === 0) return;

  document.querySelectorAll('form[data-form]').forEach(form => {
    Object.keys(errors).forEach(field => {
      const input = form.elements.namedItem(field);
      if (input) {
        input.classList.add('field-error');
        const existingError = input.parentNode.querySelector('.field-error-message');
        if (existingError) existingError.remove();

        const errorMsg = document.createElement('span');
        errorMsg.className = 'field-error-message';
        errorMsg.textContent = errors[field].join(', ');
        input.parentNode.appendChild(errorMsg);
      }
    });
  });
}

/**
 * Clear validation errors from form
 */
export function clearValidationErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  document.querySelectorAll('.field-error-message').forEach(el => el.remove());
}

/**
 * Initialize form with data (for editing)
 * @param {HTMLFormElement} form - Form element
 * @param {Object} data - Data to populate
 */
export function populateForm(form, data) {
  Object.keys(data).forEach(key => {
    const input = form.elements.namedItem(key);
    if (!input) return;

    if (input.type === 'checkbox') {
      input.checked = data[key];
    } else if (input.tagName === 'SELECT') {
      if (input.multiple && Array.isArray(data[key])) {
        input.value = data[key];
      } else {
        input.value = data[key] || '';
      }
    } else if (key.endsWith('Date') && data[key]) {
      const date = new Date(data[key]);
      // Plain date inputs need YYYY-MM-DD; datetime-local needs the time too.
      // A mismatched format is silently rejected by the browser, leaving the
      // field blank (this is why departureDate wasn't restoring on edit).
      input.value = input.type === 'date' ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 16);
    } else {
      input.value = data[key];
    }
  });

  // Update submit button text
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = 'Update';
  }

  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Reset form to initial state
 * @param {HTMLFormElement} form - Form element
 */
export function resetForm(form) {
  form.reset();
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = 'Save';
  }
  clearValidationErrors();
}