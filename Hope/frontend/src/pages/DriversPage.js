/**
 * Drivers Page
 */
import { createPageHeader, createFilterRow } from '../components/Layout.js';
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, editButton, deleteButton, formField, formSubmit } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderDriversPage() {
  const drivers = state.data.drivers || [];
  const filter = state.filters.drivers?.toLowerCase() || '';
  const filteredDrivers = filter
    ? drivers.filter(d =>
        (d.name?.toLowerCase().includes(filter)) ||
        (d.phone?.toLowerCase().includes(filter)) ||
        (d.licenseNumber?.toLowerCase().includes(filter))
      )
    : drivers;

  const formHtml = `
    <form data-form="driver" class="form-grid two-col">
      ${formField({ label: 'Name', type: 'text', id: 'name', name: 'name', placeholder: 'Driver name', required: true, maxlength: 60 })}
      ${formField({ label: 'Phone', type: 'tel', id: 'phone', name: 'phone', placeholder: '+91 98765 43210', maxlength: 20 })}
      ${formField({ label: 'License Number', type: 'text', id: 'licenseNumber', name: 'licenseNumber', placeholder: 'DL-XXXXXXXXX', maxlength: 30 })}
      ${formField({ label: 'License Expiry', type: 'date', id: 'licenseExpiry', name: 'licenseExpiry' })}
      ${formField({ label: 'Monthly Salary (₹)', type: 'number', id: 'monthlySalary', name: 'monthlySalary', placeholder: '0', min: 0, step: 1 })}
      ${formField({ label: 'Daily Expense Rate (₹)', type: 'number', id: 'dailyExpenseRate', name: 'dailyExpenseRate', placeholder: 'e.g., 500 (bhatta per day on trip)', min: 0, step: 1 })}
      <div class="form-field full-width">${formSubmit('driver')}</div>
    </form>
  `;

  const filterHtml = createFilterRow([
    { id: 'driver-search', label: 'Search', placeholder: 'Name, phone, license...', value: filter }
  ]);

  const listHtml = filteredDrivers.length ? filteredDrivers.map(driver => createRecordCard({
    title: driver.name,
    subtitle: driver.phone || 'No phone',
    meta: [
      driver.licenseNumber ? `DL: ${driver.licenseNumber}` : '',
      `Trips: ${driver.tripCount ?? 0}`,
      driver.dailyExpenseRate ? `${currency(driver.dailyExpenseRate)}/day` : ''
    ].filter(Boolean),
    chip: currency(driver.outstandingBalance || 0),
    chipClass: (driver.outstandingBalance || 0) > 0 ? 'warning' : 'success',
    actions: `${editButton('driver', driver.id)}${deleteButton('driver', driver.id)} <a href="#driver/${driver.id}" class="text-link">Details</a>`
  })).join('') : createEmptyState('No driver records yet.');

  const content = `
    ${createPageHeader({
      eyebrow: 'Drivers',
      title: 'Driver master & salary config',
      copy: 'Drivers with daily bhatta rate, salary, and outstanding balance.'
    })}
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add driver</h3>${formHtml}</article>
      <article class="panel white"><h3>Driver list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
  `;

  return content;
}