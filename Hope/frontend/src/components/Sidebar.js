/**
 * Sidebar Navigation Component
 * @param {string} currentRoute - Current active route
 * @param {boolean} loading - Loading state
 */
export function createSidebar(currentRoute = '#dashboard', loading = false) {
  // bottomNavDup: also reachable from the mobile bottom nav — hidden here
  // below 640px (see .nav-item-bottom-dup in navigation.css) so the sidebar
  // drawer only lists the sections bottom nav doesn't already cover.
  const navItems = [
    { hash: '#dashboard', label: 'Dashboard', bottomNavDup: true, icon: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>` },
    { hash: '#transporters', label: 'Transporters', icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
    { hash: '#vehicles', label: 'Vehicles', icon: `<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>` },
    { hash: '#drivers', label: 'Drivers', bottomNavDup: true, icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
    { hash: '#routes', label: 'Routes', icon: `<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>` },
    { hash: '#trips', label: 'Trips', bottomNavDup: true, icon: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>` },
    { hash: '#ledgers', label: 'Ledgers', bottomNavDup: true, icon: `<path d="M3 3h18"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M3 21h18"/>` }
  ];

  return `
    <aside class="sidebar white" id="sidebar" role="navigation" aria-label="Main navigation">
      <div class="sidebar-brand-row">
        <div class="brand-mark">TL</div>
        <div class="sidebar-brand-text">
          <div class="eyebrow dark">Transit Ledger</div>
          <h1 class="sidebar-title">Indian transport ERP</h1>
        </div>
        <button type="button" class="sidebar-close-btn" id="sidebar-close-btn" aria-label="Close menu" style="display:none;">&times;</button>
      </div>
      <nav class="nav white-nav">
        ${navItems.map(item => `
          <a class="nav-item ${item.hash === currentRoute ? 'active' : ''}${item.bottomNavDup ? ' nav-item-bottom-dup' : ''}"
             href="${item.hash}"
             aria-current="${item.hash === currentRoute ? 'page' : 'false'}">
            <svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${item.icon}</svg>
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>
      ${loading ? `<div class="sidebar-card white"><span class="eyebrow dark">Loading</span><strong>Fetching latest data…</strong></div>` : ''}
    </aside>
  `;
}

/**
 * Sidebar Overlay Component
 */
export function createSidebarOverlay() {
  return `<div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>`;
}