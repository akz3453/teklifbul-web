// Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan

/**
 * Clears tbody and inserts a single empty-state row.
 * @param {HTMLTableSectionElement|null|undefined} tbody
 * @param {number} colSpan
 * @param {string} message
 * @param {string} [className='empty-state']
 */
export function setTableEmpty(tbody, colSpan, message, className = 'empty-state') {
  if (!tbody) return;
  tbody.textContent = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  td.className = className || 'empty-state';
  td.textContent = message == null ? '' : String(message);
  tr.appendChild(td);
  tbody.appendChild(tr);
}

/**
 * Appends a text cell to a table row.
 * @param {HTMLTableRowElement} tr
 * @param {unknown} text
 * @returns {HTMLTableCellElement}
 */
export function appendTextCell(tr, text) {
  const td = document.createElement('td');
  td.textContent = text == null ? '' : String(text);
  tr.appendChild(td);
  return td;
}

/**
 * Fills tbody with text rows, or an empty-state row when rows is empty.
 * @param {HTMLTableSectionElement|null|undefined} tbody
 * @param {Array<Array<unknown>>} rows
 * @param {number} colSpan
 * @param {string} emptyMessage
 */
export function fillTableRows(tbody, rows, colSpan, emptyMessage) {
  if (!tbody) return;
  tbody.textContent = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    setTableEmpty(tbody, colSpan, emptyMessage);
    return;
  }
  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const text of cells || []) {
      appendTextCell(tr, text);
    }
    tbody.appendChild(tr);
  }
}
