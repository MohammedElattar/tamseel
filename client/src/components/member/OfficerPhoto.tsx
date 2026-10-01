import { useState, useEffect } from 'react';
import ImageLightbox from '../ImageLightbox';
import type { LightboxImage } from '../ImageLightbox';
import { officerPhotoAlt, officerPhotoSrc } from '../../utils/officerPhoto';
import type { OfficerPhotoKind } from '../../utils/officerPhoto';

// The officer's portrait (legacy PICT), family photo (legacy FAMILY_PICT) or husband-and-wife
// photo. Officers with no stored photo answer 404 — a normal state here — and keep the frame
// with a placeholder, so the card never changes shape between one officer and the next. When
// the frame has to crop, `object-top` keeps the face rather than the chest. A loaded photo
// opens full-screen on click (ImageLightbox).
export default function OfficerPhoto({
  officerId, kind = 'personal', label, className = '', fit = 'cover', gallery, onStatus,
}: {
  officerId: number;
  kind?: OfficerPhotoKind;
  label?: string;
  className?: string;
  // 'cover' fills the frame and crops (right for a portrait headshot); 'contain' shows the
  // whole image with matting (right for a family photo whose aspect ratio varies).
  fit?: 'cover' | 'contain';
  // Photos the preview can step through, this one included; defaults to just this photo.
  gallery?: LightboxImage[];
  // Whether the image loaded, so a parent can build `gallery` from the photos that exist.
  onStatus?: (loaded: boolean) => void;
}) {
  const [missing, setMissing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    setMissing(false);
    setPreviewing(false);
  }, [officerId, kind]);

  const src = officerPhotoSrc(officerId, kind);
  const alt = officerPhotoAlt(kind);
  const placeholder = label ?? (kind === 'family' ? 'لا توجد صورة عائلية' : (kind === 'couple' ? 'لا توجد صورة للزوجين' : 'لا توجد صورة'));
  const images = gallery?.some(g => g.src === src) ? gallery : [{ src, alt }];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-gray-300 bg-gray-100 ${className}`}
    >
      {missing ? (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-gray-500">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-10 w-10">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
          </svg>
          <span className="text-sm font-bold">{placeholder}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          aria-label={`معاينة ${alt}`}
          className="group block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-600"
        >
          <img
            src={src}
            alt={alt}
            onLoad={() => onStatus?.(true)}
            onError={() => { setMissing(true); onStatus?.(false); }}
            className={`h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none ${
              fit === 'contain' ? 'object-contain' : 'object-cover object-top'
            }`}
          />
          {/* Hover cue: a soft dim with a zoom-in badge, so it reads as "click to enlarge". */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/20"
          >
            <span className="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/90 text-gray-800 opacity-0 shadow-lg transition duration-200 group-hover:scale-100 group-hover:opacity-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
              </svg>
            </span>
          </span>
        </button>
      )}
      {previewing && (
        <ImageLightbox
          images={images}
          index={Math.max(0, images.findIndex(i => i.src === src))}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}
