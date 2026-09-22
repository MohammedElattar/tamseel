// Convert Western digits in a value to Arabic-Indic numerals for DISPLAY only.
// Keep raw Western numbers for logic, keys, form/select values, and API payloads.
export const toArabicDigits = (val: string | number | null | undefined): string =>
  String(val ?? '').replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

// Convert Arabic-Indic digits back to Western (for parsing typed input into values/APIs).
export const toWesternDigits = (val: string): string =>
  String(val ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

// Format an ISO date (YYYY-MM-DD) for display as day-month-year in Arabic-Indic
// digits. In an RTL context the day renders on the right (Egyptian convention).
export const formatDate = (iso: string | null | undefined): string => {
  const s = String(iso ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? toArabicDigits(`${m[3]}-${m[2]}-${m[1]}`) : toArabicDigits(s);
};
