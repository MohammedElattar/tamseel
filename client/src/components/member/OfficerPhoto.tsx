import { useState, useEffect } from 'react';

// The officer's portrait (legacy PICT) or family photo (legacy FAMILY_PICT). The <img>
// cannot send an auth header, so the endpoint takes the token as a query parameter.
// Officers with no stored photo answer 404 — a normal state here — and keep the frame with
// a placeholder, so the card never changes shape between one officer and the next. When the
// frame has to crop, `object-top` keeps the face rather than the chest.
export default function OfficerPhoto({ officerId, kind = 'personal', label, className = '', fit = 'cover' }: {
  officerId: number;
  kind?: 'personal' | 'family';
  label?: string;
  className?: string;
  // 'cover' fills the frame and crops (right for a portrait headshot); 'contain' shows the
  // whole image with matting (right for a family photo whose aspect ratio varies).
  fit?: 'cover' | 'contain';
}) {
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [officerId, kind]);

  const token = localStorage.getItem('edara_token') || '';
  const endpoint = kind === 'family' ? 'family-photo' : 'photo';
  const placeholder = label ?? (kind === 'family' ? 'لا توجد صورة عائلية' : 'لا توجد صورة');
  const alt = kind === 'family' ? 'الصورة العائلية' : 'صورة الضابط';

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border-2 border-gray-300 bg-gray-100 ${className}`}
    >
      {missing ? (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-gray-500">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-10 w-10">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
          </svg>
          <span className="text-sm font-bold">{placeholder}</span>
        </span>
      ) : (
        <img
          src={`/api/officers/${officerId}/${endpoint}?token=${encodeURIComponent(token)}`}
          alt={alt}
          onError={() => setMissing(true)}
          className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover object-top'}`}
        />
      )}
    </div>
  );
}
