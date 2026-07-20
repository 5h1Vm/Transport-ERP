/**
 * Pages that live behind the "More" drawer — used to highlight
 * the More tab when a sub-page is active (MOB-006).
 */
const MORE_SUB_PAGES = new Set(['#transporters', '#vehicles', '#routes']);

/**
 * Mobile Header Component (MOB-005) — slim 44px bar, no tagline.
 */
export function createMobileHeader() {
  return `
    <header class="mobile-header" role="banner">
      <div class="mobile-header-brand">
        <div class="brand-mark">TL</div>
        <div class="mobile-header-text">
          <h1>Transit Ledger</h1>
        </div>
      </div>
    </header>
  `;
}

/**
 * Bottom Navigation Component (MOB-001, MOB-006, MOB-014)
 * @param {string} currentRoute - Current active route
 */
export function createBottomNav(currentRoute = '#dashboard') {
  const navItems = [
    { hash: '#dashboard', label: 'Dashboard', icon: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>` },
    { hash: '#trips', label: 'Trips', icon: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>` },
    { hash: '#ledgers', label: 'Ledgers', icon: `<path d="M3 3h18"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M3 21h18"/>` },
    { hash: '#drivers', label: 'Drivers', icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
    { hash: '#more', label: 'More', icon: `<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`, isMenu: true }
  ];

  // MOB-006: Highlight "More" tab when any sub-page behind it is active
  const effectiveRoute = MORE_SUB_PAGES.has(currentRoute) ? '#more' : currentRoute;

  return `
    <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
      <ul class="bottom-nav-list">
        ${navItems.map(item => {
          const isActive = item.hash === effectiveRoute;
          return `
          <li>
            <button class="bottom-nav-item ${isActive ? 'active' : ''} ${item.isMenu ? 'menu-item' : ''}"
               data-bottom-nav="${item.hash}"
               aria-current="${isActive ? 'page' : 'false'}"
               aria-label="${item.label}"
               type="button">
              <span class="bottom-nav-icon-wrap"><svg class="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg></span>
              <span>${item.label}</span>
            </button>
          </li>`;
        }).join('')}
      </ul>
    </nav>
  `;
}

/**
 * Back button for More-drawer sub-pages (MOB-014)
 * Shows "← Back" on pages accessed via the More drawer.
 * @param {string} currentRoute
 */
export function createBackButton(currentRoute) {
  if (!MORE_SUB_PAGES.has(currentRoute)) return '';
  return '<a href="#dashboard" class="btn btn-ghost btn-sm" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:8px;">← Back</a>';
}