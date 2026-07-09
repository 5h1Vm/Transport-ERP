/**
 * Drivers Page
 */
import { createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState, createLoadingCard } from '../components/CardComponents.js';
import { editButton, deleteButton, formField, formSubmit, createDriverMultiSelect } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderDriversPage() {
  const drivers = state.data.drivers || [];

  const formHtml = `
    <form data-form="driver" class="form-grid two-col">
      ${formField({ label: 'Name', type: 'text', id: 'name', name: 'name', placeholder: 'Driver name', required: true })}
      ${formField({ label: 'Phone', type: 'tel', id: 'phone', name: 'phone', placeholder: '+91 98765 43210', required: true })}
      ${formField({ label: 'License Number', type: 'text', id: 'licenseNumber', name: 'licenseNumber', placeholder: 'DL-XXXXXXXXX' })}
      ${formField({ label: 'License Expiry', type: 'date', id: 'licenseExpiry', name: 'licenseExpiry' })}
      ${formField({ label: 'Daily Rate (₹)', type: 'number', id: 'dailyRate', name: 'dailyRate', placeholder: 'e.g., 500', min: '0', step: '1', required: true })}
      ${formField({ label: 'Advance (₹)', type: 'number', id: 'advance', name: 'advance', placeholder: '0', min: '0', step: '1' })}
      ${formField({ label: 'Status', type: 'select', id: 'status', name: 'status', options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' }
        ] })}
      <div class="form-field full-width">${formSubmit('driver', 'active')}</div>
    </form>
  `;

  const filterHtml = createFilterRow([
    { id: 'driver-search', label: 'Search', placeholder: 'Name, phone, license...' },
    { id: 'driver-status', label: 'Status', type: 'select', options: [
        { value: '', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' }
      ]}
  ]);

  const listHtml = drivers.length ? drivers.map(driver => createRecordCard({
    title: driver.name,
    subtitle: driver.phone,
    meta: [
      driver.licenseNumber ? `DL: ${driver.licenseNumber}` : '',
      driver.dailyRate ? `₹${driver.dailyRate}/day` : '',
      driver.status ? `<span class="chip chip-status chip--${driver.status}">${driver.status}</span>` : ''
    ].filter(Boolean),
    actions: `${editButton('driver', driver.id)}${deleteButton('driver', driver.id)}`
  })).join('') : createEmptyState('No driver records yet.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Drivers',
      title: 'Driver master & salary config',
      copy: 'Drivers with daily rates, advance tracking, and salary settlement basis.'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add driver</h3>${formHtml}</article>
      <article class="panel white"><h3>Driver list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
  `;

  return content;
}