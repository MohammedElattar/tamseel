export interface LagnaType {
  tarakyC: number;
  tarakyN: string;
  tarakyFullN: string;
  nashraRank: number;
  nashraType: number;
  nashraTagdeed: number;
}

// Real OFF.L_LAGNA_TYPE rows (pulled from the live DB; the file-dump names were corrupted).
// Keyed by (nashra_rank, nashra_type, nashra_tagdeed) -> taraky_c.
export const LAGNA_TYPE_MAP: LagnaType[] = [
  { tarakyC: 1, tarakyN: 'تجديد لواء', tarakyFullN: 'تجديد لواء', nashraRank: 3, nashraType: 2, nashraTagdeed: 1 },
  { tarakyC: 2, tarakyN: 'ترقي لواء', tarakyFullN: 'ترقي لواء', nashraRank: 3, nashraType: 1, nashraTagdeed: 0 },
  { tarakyC: 3, tarakyN: 'تجديد عميد بعد (4) سنة', tarakyFullN: 'تجديد عميد أربع سنوات', nashraRank: 4, nashraType: 2, nashraTagdeed: 4 },
  { tarakyC: 4, tarakyN: 'تجديد عميد بعد (3) سنة', tarakyFullN: 'تجديد عميد ثلاث سنوات', nashraRank: 4, nashraType: 2, nashraTagdeed: 3 },
  { tarakyC: 5, tarakyN: 'تجديد عميد بعد (2) سنة', tarakyFullN: 'تجديد عميد سنتان', nashraRank: 4, nashraType: 2, nashraTagdeed: 2 },
  { tarakyC: 5.5, tarakyN: 'تجديد عميد بعد (1) سنة', tarakyFullN: 'تجديد عميد سنة', nashraRank: 4, nashraType: 2, nashraTagdeed: 1 },
  { tarakyC: 6, tarakyN: 'ترقي عميد', tarakyFullN: 'ترقي عميد', nashraRank: 4, nashraType: 1, nashraTagdeed: 0 },
  { tarakyC: 6.1, tarakyN: 'تجديد عقيد بعد (4) سنة', tarakyFullN: 'تجديد عقيد أربع سنوات', nashraRank: 5, nashraType: 2, nashraTagdeed: 4 },
  { tarakyC: 6.2, tarakyN: 'تجديد عقيد بعد (3) سنة', tarakyFullN: 'تجديد عقيد ثلاث سنوات', nashraRank: 5, nashraType: 2, nashraTagdeed: 3 },
  { tarakyC: 7, tarakyN: 'تجديد عقيد بعد (2) سنة', tarakyFullN: 'تجديد عقيد سنتان', nashraRank: 5, nashraType: 2, nashraTagdeed: 2 },
  { tarakyC: 8, tarakyN: 'ترقي عقيد', tarakyFullN: 'ترقي عقيد', nashraRank: 5, nashraType: 1, nashraTagdeed: 0 },
  { tarakyC: 9, tarakyN: 'تجديد لواء', tarakyFullN: 'تجديد لواء', nashraRank: 3, nashraType: 2, nashraTagdeed: 2 },
  { tarakyC: 20, tarakyN: 'اكاديمية ناصر', tarakyFullN: 'الترشيح آكاديمية ناصر', nashraRank: 10, nashraType: 10, nashraTagdeed: 10 },
];

// Faithful port of OFF.getTaraky_C(n_rank, n_type, n_tagdeed).
// Special-cases ranks 3, 6-9, and (10,type 1); otherwise looks up the mapping table.
export function getTarakyC(nRank: number, nType: number, nTagdeed: number): number | null {
  if (nRank === 3) return 3 - nType;
  if (nRank > 5 && nRank < 10) return nRank + 3;
  if (nRank === 10 && nType === 1) return 13;
  const row = LAGNA_TYPE_MAP.find(
    r => r.nashraRank === nRank && r.nashraType === nType && r.nashraTagdeed === nTagdeed
  );
  return row ? row.tarakyC : null;
}
