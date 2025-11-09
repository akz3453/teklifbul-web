/**
 * Invoice comparison utilities
 */

export function compareInvoice(expectedLines, actualLines, tolerance = { qty: 0.05, price: 0.05 }) {
  const discrepancies = [];
  
  expectedLines.forEach((expected, idx) => {
    const actual = actualLines.find(a => 
      a.sku === expected.sku || 
      normalizeProductName(a.name) === normalizeProductName(expected.name)
    );
    
    if (!actual) {
      discrepancies.push({
        lineNo: idx + 1,
        kind: 'MISSING',
        expected: `${expected.qty} x ${expected.unitPrice}`,
        actual: 'BULUNAMADI',
        sku: expected.sku,
        name: expected.name
      });
      return;
    }
    
    // Check quantity discrepancy
    const qtyDiff = Math.abs(expected.qty - actual.qty);
    const qtyTol = expected.qty * tolerance.qty;
    
    if (qtyDiff > qtyTol) {
      discrepancies.push({
        lineNo: idx + 1,
        kind: 'QTY',
        expected: expected.qty,
        actual: actual.qty,
        sku: expected.sku,
        name: expected.name
      });
    }
    
    // Check price discrepancy
    const priceDiff = Math.abs(expected.unitPrice - actual.unitPrice);
    const priceTol = expected.unitPrice * tolerance.price;
    
    if (priceDiff > priceTol) {
      discrepancies.push({
        lineNo: idx + 1,
        kind: 'PRICE',
        expected: expected.unitPrice,
        actual: actual.unitPrice,
        sku: expected.sku,
        name: expected.name
      });
    }
  });
  
  // Check for unexpected lines in actual
  actualLines.forEach(actual => {
    const expected = expectedLines.find(e =>
      e.sku === actual.sku ||
      normalizeProductName(e.name) === normalizeProductName(actual.name)
    );
    
    if (!expected) {
      discrepancies.push({
        lineNo: actualLines.indexOf(actual) + 1,
        kind: 'UNEXPECTED',
        expected: 'YOK',
        actual: `${actual.qty} x ${actual.unitPrice}`,
        sku: actual.sku,
        name: actual.name
      });
    }
  });
  
  return discrepancies;
}

function normalizeProductName(name) {
  return String(name).toLowerCase().trim();
}

