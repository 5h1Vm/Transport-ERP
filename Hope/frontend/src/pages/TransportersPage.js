/**
 * Transporters Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { createBackButton } from '../components/MobileHeader.js';
import { currency, formatDate, editButton, deleteButton } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderTransportersPage() {
  const items = state.data.transporters || [];
  const isEditing = state.editing && state.editing.entity === 'transporter';
  const filter = state.filters.transporters?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.firmName?.toLowerCase().includes(filter)) ||
        (item.contactPerson?.toLowerCase().includes(filter)) ||
        (item.phone?.toLowerCase().includes(filter)) ||
        (item.email?.toLowerCase().includes(filter))
      )
    : items;

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="transporter-search" placeholder="Search by firm name, contact, phone, email"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search transporters" />
    </div>
  `;

  const formHtml = `
    <form data-form="transporter" class="form-grid white">
      <input name="firmName" placeholder="Transporter firm name" required maxlength="100" />
      <input name="contactPerson" placeholder="Contact person" maxlength="60" />
      <input name="phone" type="tel" placeholder="Phone" maxlength="20" pattern="[+0-9 -]{10,20}" title="At least 10 digits" />
      <input name="email" type="email" placeholder="Email" maxlength="100" />
      <div class="form-actions-row">
        <button type="submit">${isEditing ? 'Update' : 'Save'} transporter</button>
        ${isEditing ? '<button type="button" class="btn btn-ghost" data-cancel-edit="transporter">Cancel</button>' : ''}
      </div>
    </form>
  `;

  const listHtml = filteredItems.length
    ? filteredItems.map(item => createRecordCard({
        title: item.firmName,
        subtitle: `${item.contactPerson || 'No contact'} • ${item.phone || 'No phone'}${item.email ? ' • ' + item.email : ''}`,
        // outstanding/tripCount are computed server-side (see GET /transporters)
        // so this page never needs the full trips/payments lists in memory.
        meta: [`Trips: ${item.tripCount ?? 0}`],
        chip: item.outstanding < 0 ? '⚠ ' + currency(item.outstanding) : currency(item.outstanding || 0),
        chipClass: item.outstanding < 0 ? 'danger' : item.outstanding > 0 ? 'warning' : 'success',
        actions: `${editButton('transporter', item.id)}${deleteButton('transporter', item.id)} <a href="#transporter/${item.id}" class="text-link">View Details</a>`
      })).join('')
    : createEmptyState('No transporter records yet.');

  const content = `
    ${createBackButton(window.location.hash || '#dashboard')}
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Transporters</p>
        <h2>Master records</h2>
        <p class="page-copy">Dedicated page for transporter creation and review. Clean, fast, and searchable.</p>
      </div>
    </section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel${isEditing ? ' form-panel-editing' : ''}"><h3>${isEditing ? 'Edit transporter' : 'Add transporter'}</h3>${formHtml}</article>
      <article class="panel white"><h3>Transporter list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
  `;

  return content;
}