/**
 * Modal/Confirmation Dialog Component
 */
let dialogContainer = null;

/**
 * Show a confirmation dialog
 * @param {Object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} options.confirmText - Confirm button text
 * @param {string} options.cancelText - Cancel button text
 * @param {boolean} options.danger - Whether it's a dangerous action
 * @returns {Promise<boolean>} - Resolves to true if confirmed
 */
export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    if (!dialogContainer) {
      dialogContainer = document.createElement('div');
      dialogContainer.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,0.5);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      `;
      document.body.appendChild(dialogContainer);
    }

    dialogContainer.innerHTML = `
      <div style="
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 24px 48px rgba(15,23,42,0.2);
        animation: fadeIn 0.15s ease-out;
      ">
        <h3 style="margin: 0 0 8px; font-size: 1.1rem;">${title}</h3>
        <p style="margin: 0 0 24px; color: var(--muted);">${message}</p>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="dialog-cancel ghost-btn" style="min-width: 80px;">${cancelText}</button>
          <button class="dialog-confirm ${danger ? 'danger-btn' : ''}" style="min-width: 100px;">${confirmText}</button>
        </div>
      </div>
    `;

    // Settle exactly once, and tear down every listener we attach so repeated
    // dialogs don't accumulate handlers on the shared container / document.
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      dialogContainer.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      dialogContainer.innerHTML = '';
      resolve(result);
    };

    const onOverlayClick = (e) => {
      if (e.target === dialogContainer) settle(false);
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };

    dialogContainer.querySelector('.dialog-cancel').addEventListener('click', () => settle(false));
    dialogContainer.querySelector('.dialog-confirm').addEventListener('click', () => settle(true));
    dialogContainer.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    // Focus the confirm button so Enter/Escape work immediately.
    dialogContainer.querySelector('.dialog-confirm').focus();
  });
}

/**
 * Show an alert dialog
 * @param {Object} options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Dialog message
 * @param {string} options.buttonText - Button text
 * @returns {Promise<void>}
 */
export function alertDialog({ title, message, buttonText = 'OK' }) {
  return new Promise((resolve) => {
    if (!dialogContainer) {
      dialogContainer = document.createElement('div');
      dialogContainer.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,0.5);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      `;
      document.body.appendChild(dialogContainer);
    }

    dialogContainer.innerHTML = `
      <div style="
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 24px 48px rgba(15,23,42,0.2);
      ">
        <h3 style="margin: 0 0 8px; font-size: 1.1rem;">${title}</h3>
        <p style="margin: 0 0 24px; color: var(--muted);">${message}</p>
        <div style="display: flex; justify-content: flex-end;">
          <button class="dialog-ok" style="min-width: 80px;">${buttonText}</button>
        </div>
      </div>
    `;

    dialogContainer.querySelector('.dialog-ok').addEventListener('click', () => {
      dialogContainer.innerHTML = '';
      resolve();
    });

    dialogContainer.addEventListener('click', (e) => {
      if (e.target === dialogContainer) {
        dialogContainer.innerHTML = '';
        resolve();
      }
    });
  });
}