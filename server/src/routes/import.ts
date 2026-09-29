import { Router, Response } from 'express';
import multer from 'multer';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { getDB, saveDB } from '../db/connection.js';
import { parseAndImport } from '../services/importService.js';
import { tiffToJpeg } from '../services/imageConvert.js';
import { matchPanelMembers, syncStandingPanelMembers } from '../services/panelMembers.js';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

// Officer photos arrive as a batch of image files (multipart), buffered in memory. The size
// cap is generous because TIFF sources can be large before we transcode them to JPEG.
const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 200 },
}).array('files');

const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;
// A file is the family photo when its filename carries a family marker (Latin or Arabic).
// The personal photo is simply the other image (any name), so only the family one needs a marker.
const FAMILY_RE = /family|عائلي|عائلة|اسر[ةه]|أسر[ةه]/i;
const COUPLE_RE = /couple|زوجة|زوج|زوجين/i;

// Guard against non-image files that live alongside photos (Thumbs.db, .DS_Store, …).
// Accepts only formats a browser can render inside <img>; that is what the voting/report
// screens use, so storing anything else would just show a broken image.
function isImageBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  return (
    (buf[0] === 0xff && buf[1] === 0xd8) ||                       // jpeg
    (buf[0] === 0x89 && buf[1] === 0x50) ||                       // png
    (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) ||    // gif
    (buf[0] === 0x42 && buf[1] === 0x4d) ||                       // bmp
    (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) // riff/webp
  );
}

// Identify a non-web image container so the skip warning can name the real format. Very
// common gotcha: a file is saved as .jpg/.png but is really a TIFF or HEIC — browsers cannot
// display those, so they must be converted to JPEG/PNG before import.
function foreignImageFormat(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  // TIFF: 'II*\0' (little-endian) or 'MM\0*' (big-endian).
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return 'TIFF';
  // ISO-BMFF 'ftyp' brand (HEIC/HEIF/AVIF) at bytes 4..8.
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (brand.startsWith('hei') || brand.startsWith('hev') || brand === 'mif1' || brand === 'msf1') return 'HEIC';
    if (brand.startsWith('avi')) return 'AVIF';
  }
  return null;
}

// The officer id is the longest digit run in a name (tolerates prefixes like a year).
function parseOfficerId(s: string): number | null {
  const runs = s.match(/\d+/g);
  if (!runs || !runs.length) return null;
  runs.sort((a, b) => b.length - a.length);
  return Number(runs[0]);
}

// POST / - parse an Oracle SQL dump and load the mapped reference tables. mode='replace'
// (default) wipes and reloads each matched table (the quarterly refresh); mode='append' adds
// the file's rows without deleting or truncating anything, and any SQL error is returned as-is.
router.post('/', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const sqlContent: string = req.body?.sql_content || '';
  const fileName: string | null = req.body?.file_name || null;
  const mode: 'replace' | 'append' = req.body?.mode === 'append' ? 'append' : 'replace';

  if (!sqlContent.trim()) {
    res.status(400).json({ error: 'محتوى ملف الاستيراد مطلوب' });
    return;
  }

  db.run("INSERT INTO import_logs (file_name, status) VALUES (?, 'running')", [fileName]);
  const logId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;

  try {
    const { results, warnings } = parseAndImport(sqlContent, mode);

    if (!results.length) {
      db.run(
        "UPDATE import_logs SET status='error', error_message=? WHERE id=?",
        ['لم يتم العثور على أي جداول معروفة في الملف', logId]
      );
      saveDB();
      res.status(400).json({ status: 'error', error: 'لم يتم العثور على أي جداول معروفة في الملف', warnings });
      return;
    }

    // A MEMBERS import defines the committee panel roster. Refresh the standing member accounts
    // (name + rank) from it right away and report how the rows matched the fixed seats, so the
    // admin can spot a title that didn't line up. "تحميل الأعضاء" applies them to a committee.
    if (results.some(r => r.table === 'members')) {
      const match = matchPanelMembers(db);
      const synced = syncStandingPanelMembers(db);
      warnings.push(`أعضاء اللجنة: طوبقت ${match.identities.size} من ${match.total} صفوف بمقاعد اللجنة وحُدِّث ${synced} عضو (الاسم والرتبة). اضغط «تحميل الأعضاء» داخل اللجنة لتطبيقها عليها.`);
      if (match.unmatchedRows.length) {
        warnings.push(`صفوف أعضاء لم تُطابَق بأي مقعد: ${match.unmatchedRows.join(' | ')}`);
      }
      if (match.unmatchedSeats.length) {
        warnings.push(`مقاعد لم يصلها عضو من الملف (احتفظت بقيمها الحالية): ${match.unmatchedSeats.join(' | ')}`);
      }
    }

    // Record the run mode so the import history distinguishes an add-without-delete run from a
    // full reload; also front the returned notes with an explicit "nothing was deleted" line.
    if (mode === 'append') {
      warnings.unshift('تمت الإضافة بدون حذف أو مسح أي بيانات قائمة');
    }

    const tables = results.map(r => r.table).join(', ');
    const countsObj = results.reduce((acc, r) => { acc[r.table] = r.count; return acc; }, {} as Record<string, number>);

    db.run(
      "UPDATE import_logs SET status='success', tables_imported=?, record_counts_json=?, error_message=? WHERE id=?",
      [tables, JSON.stringify(countsObj), warnings.length ? warnings.join(' | ') : null, logId]
    );
    saveDB();
    res.json({ status: 'success', mode, results, warnings });
  } catch (err: any) {
    const message = err?.message || String(err);
    db.run("UPDATE import_logs SET status='error', error_message=? WHERE id=?", [message, logId]);
    saveDB();
    res.status(400).json({ status: 'error', error: message });
  }
});

// POST /photos - import officer portraits + family photos as a batch of image files.
// Layout: pick one top folder (e.g. `photos`) that holds a subfolder per officer named by
// the officer id; each subfolder has up to two images — the family one has a family marker in
// its filename (family.jpg / عائلية…), the other (any name, any image extension) is personal.
// The id is read from the image's immediate parent folder (so any wrapper folder above it is
// ignored), falling back to the filename for a flat `123456.jpg` layout. TIFF images (often
// exported with a .jpg name) are transcoded to JPEG so browsers can display them. Stored in
// officer_photos keyed by officer_id, stable across the quarterly officers reload. The client
// uploads the whole selection in small batches.
router.post('/photos', (req: AuthRequest, res: Response) => {
  uploadPhotos(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: 'تعذر رفع الصور — تأكد من حجم الملفات ونوعها' });
      return;
    }

    const db = getDB();
    const files = (req.files as Express.Multer.File[]) || [];
    let paths: string[] = [];
    try { paths = JSON.parse(req.body?.paths || '[]'); } catch { paths = []; }
    if (!files.length) {
      res.status(400).json({ error: 'لم يتم اختيار أي صور' });
      return;
    }

    const warnings: string[] = [];
    let personal = 0, family = 0, skipped = 0, converted = 0;
    const seen = new Set<number>();

    // Collect a few example filenames per skip reason so the admin can see exactly what to fix
    // (capped to keep the response small on large uploads).
    const foreignSamples: string[] = [];
    const invalidSamples: string[] = [];
    const extSamples: string[] = [];
    const noIdSamples: string[] = [];
    const cap = (arr: string[], s: string) => { if (arr.length < 8) arr.push(s); };

    db.run('BEGIN');
    try {
      files.forEach((f, i) => {
        const rel = String(paths[i] || f.originalname || '');
        const parts = rel.split('/').filter(Boolean);
        const base = (parts.pop() || rel).trim();               // filename
        const parentDir = parts.length ? parts[parts.length - 1] : ''; // per-officer folder
        if (!IMG_EXT.test(base)) { skipped++; cap(extSamples, rel || base); return; }

        // Normalize to a browser-displayable buffer: web formats pass through; TIFF (often
        // saved with a .jpg name) is transcoded to JPEG; anything else (HEIC/corrupt) is skipped.
        let imgBuf: Buffer = f.buffer;
        if (!isImageBuffer(imgBuf)) {
          const foreign = foreignImageFormat(imgBuf);
          if (foreign === 'TIFF') {
            const jpg = tiffToJpeg(imgBuf);
            if (!jpg) { skipped++; cap(foreignSamples, `${rel || base} (TIFF تعذّر تحويله)`); return; }
            imgBuf = jpg;
            converted++;
          } else if (foreign) {
            skipped++; cap(foreignSamples, `${rel || base} (${foreign})`); return;
          } else {
            skipped++; cap(invalidSamples, rel || base); return;
          }
        }

        // Officer id from the officer's folder, else from the filename (flat layout).
        const officerId = parseOfficerId(parentDir) ?? parseOfficerId(base.replace(/\.[^.]+$/, ''));
        if (officerId == null) { skipped++; cap(noIdSamples, rel || base); return; }

        // The family image is flagged by its own filename; the other image (any name) is personal.
        const col = COUPLE_RE.test(base) ? 'couple' : (FAMILY_RE.test(base) ? 'family' : 'personal');
        db.run(
          `INSERT INTO officer_photos (officer_id, ${col}, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(officer_id) DO UPDATE SET ${col} = excluded.${col}, updated_at = excluded.updated_at`,
          [officerId, new Uint8Array(imgBuf)]
        );
        if (col === 'family') family++; else personal++;
        seen.add(officerId);
      });
      db.run('COMMIT');
    } catch (e: any) {
      db.run('ROLLBACK');
      res.status(400).json({ error: e?.message || 'فشل حفظ الصور' });
      return;
    }

    // Explain the skips so the admin knows what to fix. TIFF is auto-converted; what remains
    // here is HEIC (needs converting to JPEG/PNG) or a TIFF/file we couldn't decode.
    if (foreignSamples.length) {
      warnings.push(`ملفات بصيغة غير مدعومة للعرض (مثل HEIC) أو تعذّر تحويلها — حوّلها إلى JPEG أو PNG: ${foreignSamples.join(' | ')}`);
    }
    if (invalidSamples.length) warnings.push(`ملفات ليست صوراً صالحة: ${invalidSamples.join(' | ')}`);
    if (extSamples.length) warnings.push(`امتدادات غير مدعومة (المسموح: jpg, jpeg, png, gif, webp, bmp): ${extSamples.join(' | ')}`);
    if (noIdSamples.length) warnings.push(`تعذر استخراج المعرّف (id) من: ${noIdSamples.join(' | ')}`);

    // How many of the uploaded ids have no matching officer yet (photo kept anyway — it
    // will match once that officer is imported).
    let unmatched = 0;
    for (const oid of seen) {
      const hit = db.exec('SELECT 1 FROM officers WHERE id = ? LIMIT 1', [oid]);
      if (!(hit.length && hit[0].values.length)) unmatched++;
    }

    saveDB();
    res.json({ status: 'success', personal, family, converted, officers: seen.size, unmatched, skipped, warnings });
  });
});

// GET /logs - import history (most recent first).
router.get('/logs', (_req: AuthRequest, res: Response) => {
  const db = getDB();
  const r = db.exec(
    `SELECT id, import_date, file_name, tables_imported, record_counts_json, status, error_message
     FROM import_logs ORDER BY id DESC LIMIT 50`
  );
  const rows = r.length
    ? r[0].values.map((v: any[]) => ({
        id: v[0],
        import_date: v[1],
        file_name: v[2],
        tables_imported: v[3],
        record_counts_json: v[4],
        status: v[5],
        error_message: v[6],
      }))
    : [];
  res.json(rows);
});

export default router;
