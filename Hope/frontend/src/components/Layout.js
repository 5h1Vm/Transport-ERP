/**
 * Main Layout - Shared layout wrapper for all pages
 */
import { createMobileHeader, createBottomNav } from '../components/MobileHeader.js';
import { createSidebar, createSidebarOverlay } from '../components/Sidebar.js';
import { state, currentPage } from '../store/index.js';

/**
 * Create the main application layout
 * @param {string} activeRoute - Current active route
 * @param {string} contentHtml - Page content HTML
 * @returns {string} - Complete layout HTML
 */
export function createMainLayout(activeRoute, contentHtml) {
  return `
    ${createMobileHeader()}
    ${createBottomNav(window.location.hash || '#dashboard')}
    ${createSidebarOverlay()}
    <div class="shell white-shell">
      ${createSidebar(window.location.hash || '#dashboard', state.loading)}
      <main class="content white-content">
        ${state.error ? `<div class="toast error">${state.error}</div>` : ''}
        ${state.message ? `<div class="toast success">${state.message}</div>` : ''}
        ${contentHtml}
      </main>
    </div>
  `;
}

/**
 * Create page header HTML
 * @param {Object} options
 * @returns {string}
 */
export function createPageHeader({ eyebrow, title, copy, actions = '' }) {
  return `
    <section class="page-header">
      <div>
        ${eyebrow ? `<p class="eyebrow dark">${eyebrow}</p>` : ''}
        <h2>${title}</h2>
        ${copy ? `<p class="page-copy">${copy}</p>` : ''}
      </div>
      ${actions ? `<div>${actions}</div>` : ''}
    </section>
  `;
}

/**
 * Create filter row for list pages
 * @param {Object} filters - Filter configuration
 * @returns {string}
 */
export function createFilterRow(filters) {
  const filterHtml = filters.map(f => `
    <div style="display: flex; flex-direction: column; gap: 4px; min-width: ${f.minWidth || '180px'};">
      ${f.label ? `<label style="font-size: 12px; color: var(--muted);">${f.label}</label>` : ''}
      ${f.type === 'select' ? `
        <select id="${f.id}" style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;">
          <option value="">${f.placeholder || 'All'}</option>
          ${f.options?.map(opt => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>`).join('') || ''}
        </select>
      ` : `
        <input type="${f.inputType || 'text'}" id="${f.id}" placeholder="${f.placeholder || ''}"
               value="${f.value || ''}"
               style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: white; font: inherit;" />
      `}
    </div>
  `).join('');

  return `
    <div class="filter-row" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
      ${filterHtml}
    </div>
  `;
}

/**
 * Create a panel grid section
 * @param {Object} options
 * @returns {string}
 */
export function createPanelGrid({ panels, columns = 'two-col' }) {
  return `
    <section class="panel-grid white ${columns}">
      ${panels.map(panel => `
        <article class="panel white ${panel.fullWidth ? 'full-width' : ''} ${panel.className || ''}">
          ${panel.title ? `<h3>${panel.title}</h3>` : ''}
          ${panel.content}
        </article>
      `).join('')}
    </section>
  `;
}