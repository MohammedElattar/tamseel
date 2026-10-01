export type OfficerPhotoKind = 'personal' | 'family' | 'couple';

// <img> cannot send an auth header, so the photo endpoints take the token as a query parameter.
export function officerPhotoSrc(officerId: number, kind: OfficerPhotoKind = 'personal'): string {
  const token = localStorage.getItem('edara_token') || '';
  const endpoint = kind === 'family' ? 'family-photo' : kind === 'couple' ? 'couple-photo' : 'photo';
  return `/api/officers/${officerId}/${endpoint}?token=${encodeURIComponent(token)}`;
}

export function officerPhotoAlt(kind: OfficerPhotoKind = 'personal'): string {
  return kind === 'family' ? 'الصورة العائلية' : kind === 'couple' ? 'صورة الضابط والزوجة' : 'صورة الضابط';
}
