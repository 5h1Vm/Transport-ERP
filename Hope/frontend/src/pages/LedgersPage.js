/**
 * Ledgers Page — khata-style outstanding balances
 *
 * Layout borrowed from the big Indian ledger apps every SME user already
 * knows: two headline tiles ("To collect" green / "To pay" red) followed by
 * contact-style rows — avatar initials, name, and a colored amount on the
 * right that says which way the money flows.
 *
 * Both lists come pre-aggregated from the server (GET /transporters, GET
 * /drivers already compute outstanding/tripCount/freightTotal in 2 bulk
 * queries) — this page does zero client-side scanning of trips/payments.
 */
import { createEmptyState } from '../components/CardComponents.js';
import { createPageHeader } from '../components/Layout.js';
import { currency, escapeHtml } from '../utils/helpers.js';
import { state } from '../store/index.js';

/** First letters of up to two words — "Kamdhenu Logistics" → "KL". */
function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * One contact-style ledger row.
 * `direction`: 'get' (they owe us, green), 'give' (we owe them, red),
 * 'settled' (zero, muted).
 */
function khataRow({ href, name, sub, amount, direction }) {
  const label = direction === 'get' ? "You'll get" : direction === 'give' ? "You'll give" : 'Settled';
  return `
    <a class="khata-row" href="${escapeHtml(href)}">
      <span class="khata-avatar">${escapeHtml(initials(name))}</span>
      <span class="khata-who">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(sub)}</small>
      </span>
      <span class="khata-amt khata-amt--${direction}">
        <strong>${currency(Math.abs(amount))}</strong>
        <small>${label}</small>
      </span>
    </a>
  `;
}

function renderLedgersPage() {
  const transporters = state.data.transporters || [];
  const drivers = state.data.drivers || [];

  // "To collect": transporters who still owe freight + drivers holding our
  // money (negative driver balance = driver owes us).
  // "To pay": transporters we over-collected from + drivers we owe.
  let toCollect = 0;
  let toPay = 0;
  for (const t of transporters) {
    const o = t.outstanding || 0;
    if (o > 0) toCollect += o;
    else toPay += -o;
  }
  for (const d of drivers) {
    const o = d.outstandingBalance || 0;
    if (o > 0) toPay += o;
    else toCollect += -o;
  }

  const transporterHtml = transporters.length
    ? `<div class="khata-list">${transporters
        .map((t) =>
          khataRow({
            href: `#transporter/${t.id}`,
            name: t.firmName,
            sub: `${t.tripCount ?? 0} trips • Paid ${currency(t.paidTotal || 0)}`,
            amount: t.outstanding || 0,
            direction: (t.outstanding || 0) > 0 ? 'get' : (t.outstanding || 0) < 0 ? 'give' : 'settled'
          })
        )
        .join('')}</div>`
    : createEmptyState('No transporter records yet.', '<a href="#transporters" class="cta-button">Open Transporter page →</a>');

  const driverHtml = drivers.length
    ? `<div class="khata-list">${drivers
        .map((d) =>
          khataRow({
            href: `#driver/${d.id}`,
            name: d.name,
            sub: `${d.tripCount ?? 0} trips • ${d.phone || 'No phone'}`,
            amount: d.outstandingBalance || 0,
            // Positive driver balance = we owe the driver.
            direction: (d.outstandingBalance || 0) > 0 ? 'give' : (d.outstandingBalance || 0) < 0 ? 'get' : 'settled'
          })
        )
        .join('')}</div>`
    : createEmptyState('No driver records yet.', '<a href="#drivers" class="cta-button">Open Driver page →</a>');

  return `
    ${createPageHeader({
      eyebrow: 'Ledgers',
      title: 'Khata',
      copy: 'Who owes you, and who you owe — across transporters and drivers.'
    })}
    <div class="khata-summary">
      <div class="khata-summary-tile khata-summary-tile--get">
        <span>To collect</span>
        <strong>${currency(toCollect)}</strong>
      </div>
      <div class="khata-summary-tile khata-summary-tile--give">
        <span>To pay</span>
        <strong>${currency(toPay)}</strong>
      </div>
    </div>
    <section class="panel-grid white two-col">
      <article class="panel white">
        <h3>Transporters (${transporters.length})</h3>
        ${transporterHtml}
      </article>
      <article class="panel white">
        <h3>Drivers (${drivers.length})</h3>
        ${driverHtml}
      </article>
    </section>
  `;
}

export { renderLedgersPage };
