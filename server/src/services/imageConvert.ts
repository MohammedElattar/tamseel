// Convert non-web image formats into a browser-displayable JPEG. A common gotcha in the photo
// source is a file saved with a .jpg/.png name that is really a TIFF; browsers cannot render
// TIFF in <img>, so we transcode it on import. Kept pure-JS on purpose — this project avoids
// native builds (see sql.js WASM), so no sharp/libvips here.
import UTIF from 'utif';
import jpeg from 'jpeg-js';

// Decode a TIFF buffer to RGBA8 and re-encode as JPEG. Returns null when the TIFF can't be
// decoded (unusual compression, CMYK edge cases, corrupt file) so the caller can skip it with
// a clear warning instead of storing something unshowable.
export function tiffToJpeg(buf: Buffer, quality = 82): Buffer | null {
  try {
    const ifds = UTIF.decode(buf);
    if (!ifds || !ifds.length) return null;
    const page = ifds[0];
    UTIF.decodeImage(buf, page);
    const rgba: Uint8Array = UTIF.toRGBA8(page);
    const width = Number(page.width);
    const height = Number(page.height);
    if (!width || !height || !rgba || rgba.length < width * height * 4) return null;
    const out = jpeg.encode({ data: Buffer.from(rgba), width, height }, quality);
    return out.data;
  } catch {
    return null;
  }
}
