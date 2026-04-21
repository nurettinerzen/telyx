import XLSX from 'xlsx';

const DEFAULT_BLANK_ROWS = 500;

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';
  return value;
}

export function dropEmptySpreadsheetRows(rows = []) {
  return rows.filter((row) =>
    Object.values(row || {}).some((value) => String(value ?? '').trim() !== '')
  );
}

export function buildXlsxTemplateSheet(sampleData = [], {
  columnWidths = [],
  textColumns = [],
  blankRows = DEFAULT_BLANK_ROWS,
} = {}) {
  const headers = sampleData.length > 0
    ? Object.keys(sampleData[0])
    : [];

  const matrix = [
    headers,
    ...sampleData.map((row) => headers.map((header) => normalizeCellValue(row[header]))),
    ...Array.from({ length: blankRows }, () => headers.map(() => ''))
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(matrix);

  if (columnWidths.length > 0) {
    worksheet['!cols'] = columnWidths;
  }

  textColumns.forEach((columnName) => {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) return;

    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
      const existingCell = worksheet[cellAddress] || { v: '' };

      worksheet[cellAddress] = {
        ...existingCell,
        t: 's',
        z: '@',
        v: existingCell.v ?? ''
      };
    }
  });

  return worksheet;
}
