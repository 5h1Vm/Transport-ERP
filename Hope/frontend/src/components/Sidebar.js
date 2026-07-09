/**
 * Sidebar Navigation Component
 * @param {string} currentRoute - Current active route
 * @param {boolean} loading - Loading state
 */
export function createSidebar(currentRoute = '#dashboard', loading = false) {
  const navItems = [
    { hash: '#dashboard', label: 'Dashboard' },
    { hash: '#transporters', label: 'Transporters' },
    { hash: '#vehicles', label: 'Vehicles' },
    { hash: '#drivers', label: 'Drivers' },
    { hash: '#routes', label: 'Routes' },
    { hash: '#trips', label: 'Trips' },
    { hash: '#ledgers', label: 'Ledgers' }
  ];

  return `
    <aside class="sidebar white" id="sidebar" role="navigation" aria-label="Main navigation">
      <div class="sidebar-brand-row">
        <div class="brand-mark">TL</div>
        <div class="sidebar-brand-text">
          <div class="eyebrow dark">Transit Ledger</div>
          <h1 class="sidebar-title">Indian transport ERP</h1>
        </div>
      </div>
      <nav class="nav white-nav">
        ${navItems.map(item => `
          <a class="nav-item ${item.hash === currentRoute ? 'active' : ''}"
             href="${item.hash}"
             aria-current="${item.hash === currentRoute ? 'page' : 'false'}">${item.label}</a>
        `).join('')}
      </nav>
      <div class="sidebar-card white">
        <span class="eyebrow dark">Status</span>
        <strong>${loading ? 'Preparing...' : 'Connected'}</strong>
        <p>Workspace records are managed directly through the application.</p>
      </div>
    </aside>
  `;
}

/**
 * Sidebar Overlay Component
 */
export function createSidebarOverlay() {
  return `<div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>`;
}