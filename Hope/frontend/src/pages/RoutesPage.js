/**
 * Routes Page
 */
import { createRecordCard, createEmptyState } from '../components/CardComponents.js';
import { currency, formatDate, editButton, deleteButton } from '../utils/helpers.js';
import { state } from '../store/index.js';

export function renderRoutesPage() {
  const items = state.data.routes || [];
  const filter = state.filters.routes?.toLowerCase() || '';
  const filteredItems = filter
    ? items.filter(item =>
        (item.name?.toLowerCase().includes(filter)) ||
        (item.origin?.toLowerCase().includes(filter)) ||
        (item.destination?.toLowerCase().includes(filter))
      )
    : items;

  const filterHtml = `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      <input type="text" id="route-search" placeholder="Search by name, origin, destination"
             value="${filter}"
             style="flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;"
             aria-label="Search routes" />
    </div>
  `;

  const formHtml = `
    <form data-form="route" class="form-grid white">
      <input name="name" placeholder="Route name (e.g., Mumbai - Delhi)" required />
      <input name="origin" placeholder="Origin city" required />
      <input name="destination" placeholder="Destination city" required />
      <input name="distanceKm" type="number" step="1" placeholder="Distance (km)" />
      <input name="estDays" type="number" step="1" placeholder="Estimated days" value="1" />
      <input name="baseRate" type="number" step="1" placeholder="Base freight rate (₹)" value="0" />
      <button type="submit">Save route</button>
    </form>
  `;

  const listHtml = filteredItems.length
    ? filteredItems.map(item => createRecordCard({
        title: item.name,
        subtitle: `${item.origin} → ${item.destination} • ${item.distanceKm ? item.distanceKm + ' km' : 'No distance'} • ${item.estDays || 1} day(s)`,
        chip: currency(item.baseRate || 0),
        chipClass: 'primary',
        actions: `${editButton('route', item.id)}${deleteButton('route', item.id)}`
      })).join('')
    : createEmptyState('No route records yet.');

  const content = `
    <section class="page-header">
      <div>
        <p class="eyebrow dark">Routes</p>
        <h2>Master records</h2>
        <p class="page-copy">Route master with distance and estimated days. Used for trip planning and auto-calculation.</p>
      </div>
    </section>
    <section class="panel-grid white two-col">
      <article class="panel white form-panel"><h3>Add route</h3>${formHtml}</article>
      <article class="panel white"><h3>Route list</h3>${filterHtml}<div class="stack">${listHtml}</div></article>
    </section>
  `;

  return content;
}