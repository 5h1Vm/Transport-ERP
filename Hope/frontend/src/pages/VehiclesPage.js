/**
 * Vehicles Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, editButton, deleteButton } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderVehiclesPage() {
  const items = state.data.vehicles || [];
  // Dropdown options come from the always-loaded reference payload; the vehicle
  // list itself already embeds { transporter: { firmName } } per row.
  const transporters = state.refs.transporters || [];
  const filter = state.filters.vehicles?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.vehicleNumber?.toLowerCase().includes(filter)) ||
        (item.transporter?.firmName?.toLowerCase().includes(filter)) ||
        (item.make?.toLowerCase().includes(filter))
      )
    : items;

  const transporterOptions = transporters.map(t => `<option value="${t.id}">${t.firmName}</option>`).join('');

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="vehicle-search" placeholder="Search by vehicle #, transporter, type"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search vehicles" />
    </div>
  `;

  const formHtml = `
    <form data-form="vehicle" class="form-grid white">
      <input name="vehicleNumber" placeholder="Vehicle number (e.g., MH12 AB 1234)" required maxlength="20" />
      <select name="transporterId" required>
        <option value="">Select transporter</option>
        ${transporterOptions}
      </select>
      <input name="make" placeholder="Make (e.g., Tata, Ashok Leyland)" maxlength="40" />
      <input name="model" placeholder="Model" maxlength="40" />
      <input name="year" type="number" min="1990" max="2100" step="1" placeholder="Year" />
      <select name="ownershipStatus">
        <option value="OWNED">Owned</option>
        <option value="ATTACHED">Attached</option>
        <option value="LEASED">Leased</option>
      </select>
      <button type="submit">Save vehicle</button>
    </form>
  `;

  const listHtml = filteredItems.length
    ? filteredItems.map(item => createRecordCard({
        title: item.vehicleNumber,
        subtitle: `${item.transporter?.firmName || 'No transporter'} • ${[item.make, item.model].filter(Boolean).join(' ') || 'No make/model'}`,
        chip: item.transporterId ? 'Assigned' : 'Unassigned',
        chipClass: item.transporterId ? 'success' : 'muted',
        actions: `${editButton('vehicle', item.id)}${deleteButton('vehicle', item.id)} <a href="#vehicle/${item.id}" class="text-link">Details</a>`
      })).join('')
    : createEmptyState('No vehicle records yet.');

  const content = `
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Vehicles</p>
        <h2>Master records</h2>
        <p class="page-copy">Vehicle registry with transporter assignment. Filter by vehicle number or transporter.</p>
      </div>
    </section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add vehicle</h3>${formHtml}</article>
      <article class="panel white"><h3>Vehicle list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
  `;

  return content;
}