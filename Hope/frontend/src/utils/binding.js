/**
 * Event Binding Utilities - Centralized event binding for components
 */

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
    transporterSearch.addEventListener('input', transportersSearch._inputHandler);
  }

  // Vehicle search
  const vehicleSearch = document.getElementById('vehicle-search');
  if (vehicleSearch && handlers.vehicles) {
    vehicleSearch.removeEventListener('input', vehicleSearch._inputHandler);
    vehicleSearch._inputHandler = (e) => handlers.vehicles(e.target.value);
    vehicleSearch.addEventListener('input', vehicleSearch._inputHandler);
  }

  // Driver search
  const driverSearch = document.getElementById('driver-search');
  if (driverSearch && handlers.drivers) {
    driverSearch.removeEventListener('input', driverSearch._inputHandler);
    driverSearch._inputHandler = (e) => handlers.drivers(e.target.value);
    driverSearch.addEventListener('input', driverSearch._inputHandler);
  }

  // Trips filters
  if (handlers.trips) {
    const tripFilters = {
      'transporter-filter': 'transporter',
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
      }
    });
  }
}

/**
 * Bind driver multi-select dropdown
 * @param {Object} state - Form state reference
 */
export function bindDriverMultiSelect(state) {
  const trigger = document.getElementById('driver-select-trigger');
  const dropdown = document.getElementById('driver-select-dropdown');
  const form = document.querySelector('form[data-form="trip"]');

  if (!trigger || !dropdown || !form) return;

  if (trigger.dataset.bound === 'true') return;
  trigger.dataset.bound = 'true';

  // Toggle dropdown
  trigger.removeEventListener('click', trigger._clickHandler);
  trigger._clickHandler = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  };
  trigger.addEventListener('click', trigger._clickHandler);

  // Close on outside click
  document.removeEventListener('click', document._driverDropdownClickHandler);
  document._driverDropdownClickHandler = (e) => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  };
  document.addEventListener('click', document._driverDropdownClickHandler);

  // Handle checkbox changes
  dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]').forEach(checkbox => {
    checkbox.removeEventListener('change', checkbox._changeHandler);
    checkbox._changeHandler = () => {
      const selected = Array.from(dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]:checked'))
        .map(cb => cb.value);

      const placeholder = trigger.querySelector('.driver-select-placeholder');
      if (selected.length === 0) {
        placeholder.textContent = 'Select drivers';
        placeholder.style.color = 'var(--muted)';
      } else if (selected.length <= 2) {
        const names = Array.from(dropdown.querySelectorAll('input[type="checkbox"][name="driverId"]:checked'))
          .map(cb => cb.parentElement.textContent.trim());
        placeholder.textContent = names.join(', ');
        placeholder.style.color = 'var(--text)';
      } else {
        placeholder.textContent = `${selected.length} drivers selected`;
        placeholder.style.color = 'var(--text)';
      }

      // Update hidden field
      let hiddenInput = form.querySelector('input[type="hidden"][name="driverId"]');
      if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'driverId';
        form.appendChild(hiddenInput);
      }
      hiddenInput.value = JSON.stringify(selected);
    };
    checkbox.addEventListener('change', checkbox._changeHandler);
  });
}

/**
 * Bind vehicle filter by transporter
 * @param {Function} getVehicles - Function to get vehicles list
 */
export function bindVehicleFilterByTransporter(getVehicles) {
  const transporterSelect = document.getElementById('trip-transporter-select');
  const vehicleSelect = document.getElementById('trip-vehicle-select');
  if (!transporterSelect || !vehicleSelect) return;

  transporterSelect.removeEventListener('change', transporterSelect._changeHandler);
  transporterSelect._changeHandler = () => {
    const selectedTransporterId = transporterSelect.value;
    const currentVehicleValue = vehicleSelect.value;

    const allVehicles = getVehicles();
    const filteredVehicles = selectedTransporterId
      ? allVehicles.filter(v => v.transporterId === selectedTransporterId)
      : allVehicles;

    vehicleSelect.innerHTML = '<option value="">Select vehicle</option>' +
      filteredVehicles.map(v => `<option value="${v.id}" data-transporter-id="${v.transporterId || ''}">${v.vehicleNumber}</option>`).join('');

    if (filteredVehicles.some(v => v.id === currentVehicleValue)) {
      vehicleSelect.value = currentVehicleValue;
    }
  };
  transporterSelect.addEventListener('change', transporterSelect._changeHandler);
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
      input.value = date.toISOString().slice(0, 16);
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