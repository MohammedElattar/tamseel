const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

// A Latin designation such as EG-P-2 or FMC-4 keeps its Western digits — an Arabic-Indic
// digit inside a foreign code reads wrong. Every other digit run converts, including a
// date written inline like 12-04-2022.
const TOKEN = /[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*/g;

export const arabizeProseDigits = (val: string): string =>
  val.replace(TOKEN, tok =>
    /[A-Za-z]/.test(tok) ? tok : tok.replace(/[0-9]/g, d => ARABIC_INDIC[Number(d)]));

// The UI shows Arabic-Indic digits, so a search box can hand us ٤١٢٥. Number() rejects
// those and yields NaN, which silently matches nothing — normalize before parsing.
export const toWesternDigits = (val: string): string =>
  val.replace(/[٠-٩]/g, d => String(ARABIC_INDIC.indexOf(d)));

// Parse a query parameter that may arrive in either digit set. Returns null when absent
// or not a number, so a caller can drop the filter instead of matching on NaN.
export function numericParam(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(toWesternDigits(String(raw).trim()));
  return Number.isFinite(n) ? n : null;
}

// Verbatim statement columns: free Arabic prose the user only ever reads, with the date and
// any counts written inline (e.g. 'بتاريخ 12-04-2022 - كشف طبي دوري - لائق طبياً للخدمة').
// A render-time toArabicDigits pass is the rule everywhere else, but these blobs carry no
// separate date column to run formatDate on, so their digits are converted before storing.
// Only prose belongs here — never an ISO date column or a numeric code, which stay Western
// so ordering, formatDate and the scoring logic keep working.
export const ARABIZED_TEXT_COLUMNS: Record<string, string[]> = {
  // مقترح الاستيفاء arrives pre-computed as a sentence with the term inline, e.g.
  // 'الضابط مستوفى تجديد عميد بعد (2) سنة'. The only logic reading it matches on غير مستوف,
  // so the digits are free to convert.
  officers: ['taraky_estifa'],
  officer_holder_health: ['se7a'],
  officer_holder_paasat: ['activ_name', 'activ_note', 'country_name'],
  officer_punishments_geza: ['gaza'],
  officer_tahil_3lmy: ['subject', 'type', 'mawkaf'],
  officer_tahil_3askary: ['job_n'],
};

export function arabizeTextColumn(table: string, column: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return ARABIZED_TEXT_COLUMNS[table]?.includes(column) ? arabizeProseDigits(value) : value;
}

// Rewrite rows stored before the columns above were arabized (and the Western-digit test
// seeds), so existing data matches without waiting for the next quarterly import.
export function arabizeStoredText(db: any): number {
  let changed = 0;
  for (const [table, columns] of Object.entries(ARABIZED_TEXT_COLUMNS)) {
    for (const column of columns) {
      let rows: any[][];
      try {
        rows = db.exec(`SELECT id, ${column} FROM ${table} WHERE ${column} GLOB '*[0-9]*'`)[0]?.values || [];
      } catch {
        continue; // table/column not present on this DB yet
      }
      for (const [id, text] of rows) {
        const arabized = arabizeProseDigits(String(text));
        if (arabized === text) continue; // digits belong to a Latin code
        db.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [arabized, id]);
        changed++;
      }
    }
  }
  return changed;
}
