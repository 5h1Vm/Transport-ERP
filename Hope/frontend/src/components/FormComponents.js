/**
 * Form Components - Reusable form field components
 */

import { optionList } from '../utils/helpers.js';

/**
 * Generate a select field HTML
 * @param {Object} options
 * @returns {string}
 */
export function createSelectField({ name, label, required = false, options = [], placeholder = 'Select...', value = '', disabled = false, className = '' }) {
  const requiredAttr = required ? 'required' : '';
  const disabledAttr = disabled ? 'disabled' : '';
  const optionsHtml = optionList(options, o => o.label || o.name || o.firmName || o.vehicleNumber || o, placeholder, value);
  const labelHtml = label ? `<label>${label}${required ? ' *' : ''}</label>` : '';

  return `
    <div class="form-field ${className}">
      ${labelHtml}
      <select name="${name}" ${requiredAttr} ${disabledAttr}>
        ${optionsHtml}
      </select>
    </div>
  `;
}

/**
 * Generate an input field HTML
 * @param {Object} options
 * @returns {string}
 */
export function createInputField({ name, label, type = 'text', placeholder = '', value = '', required = false, disabled = false, className = '', step, min, max }) {
  const requiredAttr = required ? 'required' : '';
  const disabledAttr = disabled ? 'disabled' : '';
  const stepAttr = step ? `step="${step}"` : '';
  const minAttr = min !== undefined ? `min="${min}"` : '';
  const maxAttr = max !== undefined ? `max="${max}"` : '';
  const labelHtml = label ? `<label>${label}${required ? ' *' : ''}</label>` : '';

  return `
    <div class="form-field ${className}">
      ${labelHtml}
      <input type="${type}" name="${name}" placeholder="${placeholder}" value="${value}" ${requiredAttr} ${disabledAttr} ${stepAttr} ${minAttr} ${maxAttr} />
    </div>
  `;
}

/**
 * Generate a textarea field HTML
 * @param {Object} options
 * @returns {string}
 */
export function createTextareaField({ name, label, placeholder = '', value = '', required = false, rows = 3, className = '' }) {
  const requiredAttr = required ? 'required' : '';
  const labelHtml = label ? `<label>${label}${required ? ' *' : ''}</label>` : '';

  return `
    <div class="form-field ${className}">
      ${labelHtml}
      <textarea name="${name}" placeholder="${placeholder}" rows="${rows}" ${requiredAttr}>${value}</textarea>
    </div>
  `;
}

/**
 * Generate checkbox field HTML
 * @param {Object} options
 * @returns {string}
 */
export function createCheckboxField({ name, label, checked = false, className = '' }) {
  return `
    <div class="form-field checkbox-field ${className}">
      <label class="checkbox-label">
        <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} />
        <span>${label}</span>
      </label>
    </div>
  `;
}

/**
 * Generate hidden input
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
export function createHiddenInput(name, value) {
  return `<input type="hidden" name="${name}" value="${value}" />`;
}

/**
 * Generate submit button
 * @param {Object} options
 * @returns {string}
 */
export function createSubmitButton({ text = 'Save', className = '', disabled = false, type = 'submit' }) {
  const disabledAttr = disabled ? 'disabled' : '';
  return `<button type="${type}" class="${className}" ${disabledAttr}>${text}</button>`;
}