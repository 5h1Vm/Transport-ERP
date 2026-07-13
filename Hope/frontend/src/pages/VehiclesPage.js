/**
 * Vehicles Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createBackButton } from '../components/MobileHeader.js';
import { currency, formatDate, editButton, deleteButton } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderVehiclesPage() {
  const items = state.data.vehicles || [];
  // Dropdown options come from the always-loaded reference payload
  const filter = state.filters.vehicles?.toLowerCase() || '';
  const showForm = state.showMobileForm || isEditing;
  const filteredItems = filter
    ? items.filter(item =>
        (item.vehicleNumber?.toLowerCase().includes(filter)) ||
        (item.make?.toLowerCase().includes(filter))
      )
    : items;

  const isEditing = state.editing && state.editing.entity === 'vehicle';

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="vehicle-search" placeholder="Search by vehicle #, type"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search vehicles" />
    </div>
  `;

  const formHtml = `
    <form data-form="vehicle" class="form-grid white">
      <div class="form-field">
        <label>Vehicle number</label>
        <input name="vehicleNumber" placeholder="e.g., MH12 AB 1234" required maxlength="20" />
      </div>
      <div class="form-field">
        <label>Make</label>
        <input name="make" placeholder="e.g., Tata, Ashok Leyland" maxlength="40" />
      </div>
      <div class="form-field">
        <label>Model</label>
        <input name="model" placeholder="e.g., 407, Prima" maxlength="40" />
      </div>
      <div class="form-field">
        <label>Year</label>
        <input name="year" type="number" min="1990" max="2100" step="1" placeholder="e.g., 2022" />
      </div>
      <div class="form-field">
        <label>Ownership</label>
        <select name="ownershipStatus">
          <option value="OWNED">Owned</option>
          <option value="ATTACHED">Attached</option>
          <option value="RENTED">Rented</option>
          <option value="LEASED">Leased</option>
          <option value="PARTNERSHIP">Partnership</option>
        </select>
      </div>
      <div class="form-field full-width">
        <label>Current driver</label>
        <select name="currentDriverId">
          <option value="">None (unassigned)</option>
          ${state.refs.drivers && state.refs.drivers.length
            ? state.refs.drivers
                .map(driver => `<option value="${driver.id}">${driver.name}</option>`)
                .join('')
            : ''}
        </select>
      </div>
      <div class="form-field full-width form-actions-row">
        <button type="submit">${isEditing ? 'Update' : 'Save'} vehicle</button>
        ${isEditing ? '<button type="button" class="btn btn-ghost" data-cancel-edit="vehicle">Cancel</button>' : ''}
      </div>
    </form>
  `;

  const listHtml = filteredItems.length
    ? filteredItems.map(item => createRecordCard({
        title: item.vehicleNumber,
        subtitle: [item.make, item.model].filter(Boolean).join(' ') || 'No make/model',
        chip: getChipTextForOwnershipStatus(item.ownershipStatus, item.vehicleSourceId, item.vehicleSource),
        chipClass: getChipClassForOwnershipStatus(item.ownershipStatus, item.vehicleSourceId, item.vehicleSource),
        actions: `${editButton('vehicle', item.id)}${deleteButton('vehicle', item.id)} <a href="#vehicle/${item.id}" class="text-link">Details</a>`
      })).join('')
    : createEmptyState('No vehicle records yet.');

  const content = `
    ${createBackButton(window.location.hash || '#dashboard')}
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Vehicles</p>
        <h2>Master records</h2>
        <p class="page-copy">Vehicle registry. Filter by vehicle number or type.</p>
      </div>
    </section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel${isEditing ? ' form-panel-editing' : ''}${!showForm ? ' form-panel-mobile-hidden' : ''}"><h3>${isEditing ? 'Edit vehicle' : 'Add vehicle'}</h3>${formHtml}</article>
      <article class="panel white"><h3>Vehicle list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
    <button type="button" class="fab-btn" data-fab-add="vehicle" aria-label="Add vehicle">+</button>
  `;

  // Helper functions to determine chip display based on ownership status
  function getChipTextForOwnershipStatus(ownershipStatus, vehicleSourceId, vehicleSource) {
    // Map ownership status to display labels
    const ownershipStatusLabels = {
      OWNED: 'Owned',
      ATTACHED: 'Attached',
      RENTED: 'Rented',
      LEASED: 'Leased',
      PARTNERSHIP: 'Partnership'
    };

    const ownershipStatusLabel = ownershipStatusLabels[ownershipStatus] || ownershipStatus;

    // Only show source name when ownershipStatus is NOT OWNED and vehicleSource exists
    if (ownershipStatus !== 'OWNED' && vehicleSourceId && vehicleSource) {
      return `${ownershipStatusLabel} (${vehicleSource.name})`;
    }
    return ownershipStatusLabel;
  }

  function getChipClassForOwnershipStatus(ownershipStatus, vehicleSourceId, vehicleSource) {
    // Default class for owned vehicles
    if (ownershipStatus === 'OWNED') {
      return 'success';
    }

    // For non-owned statuses, check if we have a source to display
    if (ownershipStatus !== 'OWNED' && vehicleSourceId && vehicleSource) {
      // Use different colors for different non-owned statuses
      switch (ownershipStatus) {
        case 'ATTACHED':
          return 'info';
        case 'RENTED':
          return 'warning';
        case 'LEASED':
          return 'info';
        case 'PARTNERSHIP':
          return 'success';
        default:
          return 'secondary';
      }
    }

    // For non-owned statuses without source (shouldn't happen in valid data, but handle gracefully)
    return 'muted';
  }

  return content;
}