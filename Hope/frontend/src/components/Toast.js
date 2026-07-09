/**
 * Toast Notifications - Reusable toast system
 */
import { state, actions } from '../store/index.js';

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 80px;
      right: 16px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message - Message to show
 * @param {string} type - 'success' | 'error' | 'info'
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    pointer-events: auto;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 500;
    min-width: 280px;
    max-width: 400px;
    box-shadow: 0 8px 24px rgba(15,23,42,0.15);
    animation: slideIn 0.2s ease-out;
    opacity: 1;
    transition: opacity 0.2s, transform 0.2s;
  `;

  const colors = {
    success: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    error: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
    info: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' }
  };

  const { bg, color, border } = colors[type] || colors.info;
  toast.style.background = bg;
  toast.style.color = color;
  toast.style.border = `1px solid ${border}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);

  return toast;
}

// Show message from state
export function showStateMessages() {
  if (state.message) {
    showToast(state.message, 'success');
    actions.setMessage('');
  }
  if (state.error) {
    showToast(state.error, 'error');
    actions.setError('');
  }
}