import { describe, expect, it } from '@jest/globals';

import { buildXlsxTemplateSheet, dropEmptySpreadsheetRows } from '../../src/utils/xlsxTemplate.js';

describe('xlsx template helpers', () => {
  it('filters out spreadsheet rows that are completely empty', () => {
    const rows = [
      { Telefon: '+905321234567', 'Müşteri Adı': 'Ahmet' },
      { Telefon: '', 'Müşteri Adı': '' },
      { Telefon: '   ', 'Müşteri Adı': '' },
      { Telefon: '', 'Müşteri Adı': 'Ayşe' },
    ];

    expect(dropEmptySpreadsheetRows(rows)).toEqual([
      { Telefon: '+905321234567', 'Müşteri Adı': 'Ahmet' },
      { Telefon: '', 'Müşteri Adı': 'Ayşe' },
    ]);
  });

  it('marks phone column cells as text for sample and blank rows', () => {
    const worksheet = buildXlsxTemplateSheet(
      [
        { Telefon: '+905321234567', 'Müşteri Adı': 'Ahmet' },
        { Telefon: '+905331234568', 'Müşteri Adı': 'Ayşe' },
      ],
      {
        columnWidths: [{ wch: 18 }, { wch: 20 }],
        textColumns: ['Telefon'],
        blankRows: 2,
      }
    );

    expect(worksheet.A2).toMatchObject({
      t: 's',
      v: '+905321234567',
      z: '@',
    });

    expect(worksheet.A4).toMatchObject({
      t: 's',
      v: '',
      z: '@',
    });

    expect(worksheet.B4).toMatchObject({
      t: 's',
      v: '',
    });
    expect(worksheet['!cols']).toEqual([{ wch: 18 }, { wch: 20 }]);
  });

  it('uses 500 preformatted blank rows by default', () => {
    const worksheet = buildXlsxTemplateSheet([
      { Telefon: '+905321234567', 'Müşteri Adı': 'Ahmet' },
    ], {
      textColumns: ['Telefon'],
    });

    // 1 header + 1 sample row + 500 preformatted blanks = row 502
    expect(worksheet['!ref']).toBe('A1:B502');
    expect(worksheet.A502).toMatchObject({
      t: 's',
      v: '',
      z: '@',
    });
  });
});
