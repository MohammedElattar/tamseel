import { useState, useEffect, useCallback, useMemo, useRef, ChangeEvent } from 'react';
import { importSQL, getImportLogs, importPhotos, PhotoImportResult, ImportMode } from '../../api/import';
import { toArabicDigits, formatDate } from '../../utils/format';
import { IMPORT_GUIDE } from '../../constants/importGuide';

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;
const PHOTO_BATCH = 12;

// Decode an uploaded .sql file, auto-detecting Windows-1256 (common for legacy Oracle exports).
// Strict UTF-8 first (also handles a UTF-8 BOM); on invalid UTF-8 bytes, decode as Windows-1256.
function decodeSqlBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1256').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes); // last resort: lenient UTF-8
    }
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الانتظار',
  running: 'جاري التنفيذ',
  success: 'ناجح',
  error: 'خطأ',
};

const STATUS_CLS: Record<string, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  running: 'text-amber-600',
  pending: 'text-gray-500',
};

export default function DataImport() {
  const [sql, setSql] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  // Which action is running (or was last run), so the buttons/heading read "استيراد" vs "إضافة".
  const [runningMode, setRunningMode] = useState<ImportMode | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ mode: ImportMode; results: { table: string; count: number }[]; warnings: string[] } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Officer photos import (folder of image files, matched to officers by officer id).
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoDir, setPhotoDir] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoResult, setPhotoResult] = useState<PhotoImportResult | null>(null);
  const [photoError, setPhotoError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  // Copy-to-clipboard feedback for the example queries in the help panel.
  const [copiedKey, setCopiedKey] = useState('');
  const copyExample = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? '' : k)), 1500);
    } catch {
      setCopiedKey('');
    }
  };

  // Import guide: a searchable table picker (aside) + the selected table's columns and its
  // Oracle SELECT / INSERT example (main pane, one code view switched by a tab).
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSearch, setGuideSearch] = useState('');
  const [guideKey, setGuideKey] = useState(`${IMPORT_GUIDE[0].title}:${IMPORT_GUIDE[0].tables[0].oracle}`);
  const [sqlTab, setSqlTab] = useState<'select' | 'insert'>('select');
  const guideTables = useMemo(
    () => IMPORT_GUIDE.flatMap(g => g.tables.map(t => ({ ...t, group: g.title, key: `${g.title}:${t.oracle}` }))),
    []
  );

  const fetchLogs = useCallback(() => getImportLogs().then(setLogs).catch(() => {}), []);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // `webkitdirectory` isn't a typed React prop, so enable folder selection via the DOM.
  useEffect(() => {
    const el = photoRef.current;
    if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); }
  }, []);

  const handlePhotoPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []).filter(f => IMG_RE.test(f.name));
    setPhotoFiles(picked);
    setPhotoResult(null);
    setPhotoError('');
    setPhotoProgress(null);
    const first = e.target.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
    setPhotoDir(first?.webkitRelativePath?.split('/')[0] || '');
  };

  const handlePhotoClear = () => {
    setPhotoFiles([]);
    setPhotoDir('');
    setPhotoResult(null);
    setPhotoError('');
    setPhotoProgress(null);
    if (photoRef.current) photoRef.current.value = '';
  };

  const handlePhotoUpload = async () => {
    if (!photoFiles.length) {
      setPhotoError('اختر مجلد الصور أولاً');
      return;
    }
    if (!window.confirm(`سيتم رفع ${toArabicDigits(photoFiles.length)} صورة ومطابقتها بالضباط عبر المعرّف (id). هل تريد المتابعة؟`)) return;
    setPhotoBusy(true);
    setPhotoError('');
    setPhotoResult(null);
    const agg: PhotoImportResult = { personal: 0, family: 0, converted: 0, officers: 0, unmatched: 0, skipped: 0, warnings: [] };
    try {
      for (let i = 0; i < photoFiles.length; i += PHOTO_BATCH) {
        const r = await importPhotos(photoFiles.slice(i, i + PHOTO_BATCH));
        agg.personal += r.personal || 0;
        agg.family += r.family || 0;
        agg.converted += r.converted || 0;
        agg.unmatched += r.unmatched || 0;
        agg.skipped += r.skipped || 0;
        if (r.warnings?.length) agg.warnings.push(...r.warnings);
        setPhotoProgress({ done: Math.min(i + PHOTO_BATCH, photoFiles.length), total: photoFiles.length });
      }
      setPhotoResult(agg);
      await fetchLogs();
    } catch (err: any) {
      setPhotoError(err.response?.data?.error || 'فشل رفع الصور');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    // Read raw bytes and pick the encoding: legacy Oracle dumps are often Windows-1256, which
    // shows up as garbled Arabic if read as UTF-8. Try strict UTF-8 first; if the bytes aren't
    // valid UTF-8, fall back to Windows-1256 so the raw file imports without manual conversion.
    reader.onload = () => setSql(decodeSqlBytes(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(f);
  };

  const handleClear = () => {
    setSql('');
    setFileName('');
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleImport = async (mode: ImportMode) => {
    if (!sql.trim()) {
      setError('الصق محتوى الملف أو اختر ملف SQL أولاً');
      return;
    }
    const confirmMsg = mode === 'append'
      ? 'سيتم إضافة البيانات إلى الجداول المطابقة دون حذف أو مسح أي بيانات قائمة. هل تريد المتابعة؟'
      : 'سيتم مسح الجداول المرجعية المطابقة وإعادة تحميلها من الملف. هل تريد المتابعة؟';
    if (!window.confirm(confirmMsg)) return;
    setLoading(true);
    setRunningMode(mode);
    setError('');
    setResult(null);
    try {
      const r = await importSQL(sql, fileName || undefined, mode);
      setResult({ mode, results: r.results || [], warnings: r.warnings || [] });
      await fetchLogs();
    } catch (err: any) {
      setError(err.response?.data?.error || (mode === 'append' ? 'فشلت الإضافة' : 'فشل الاستيراد'));
    } finally {
      setLoading(false);
      setRunningMode(null);
    }
  };

  const guideQ = guideSearch.trim().toLowerCase();
  const matchGuide = (t: { label: string; oracle: string; target: string; desc: string; columns: string }) =>
    !guideQ || [t.label, t.oracle, t.target, t.desc, t.columns].some(s => String(s || '').toLowerCase().includes(guideQ));
  const selectedTable = guideTables.find(t => t.key === guideKey) ?? guideTables[0];
  const guideHasSelect = Boolean(selectedTable.selectQuery);
  const guideTab: 'select' | 'insert' = guideHasSelect ? sqlTab : 'insert';
  const guideSql = guideTab === 'select' ? (selectedTable.selectQuery || '') : selectedTable.example;
  const guideCopyKey = `${selectedTable.key}:${guideTab}`;

  return (
    <div>
      <h2 className="page-title">استيراد البيانات</h2>

      <div className="card space-y-4 mb-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          الصق عبارات <code dir="ltr">INSERT</code> من ملف Oracle SQL أو اختر ملف <code>.sql</code>.
          «استيراد» يمسح الجدول ويعيد تحميله بالكامل، و«اضافة بدون حذف» يضيف دون مسح.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".sql,.txt"
            onChange={handleFile}
            className="text-sm"
          />
          {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
        </div>

        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          rows={12}
          dir="ltr"
          spellCheck={false}
          placeholder="Insert into ELASASY (ID, PER_NAME, ...) Values (9891, 'عصام', ...);"
          className="input-field font-mono text-xs"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => handleImport('replace')} disabled={loading} className="btn-primary">
            {runningMode === 'replace' ? 'جاري الاستيراد...' : 'استيراد'}
          </button>
          <button onClick={() => handleImport('append')} disabled={loading} className="btn-success">
            {runningMode === 'append' ? 'جاري الإضافة...' : 'اضافة بدون حذف'}
          </button>
          {(sql || result) && (
            <button onClick={handleClear} disabled={loading} className="btn-secondary">مسح</button>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setGuideOpen(o => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-gray-50"
        >
          <span className="flex items-center gap-2 font-bold text-gray-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5 text-blue-600" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" strokeLinecap="round" />
              <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" strokeLinecap="round" />
            </svg>
            دليل الجداول والاستعلامات
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
              {toArabicDigits(guideTables.length)} جدول
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-blue-600">
            {guideOpen ? 'إخفاء' : 'عرض الدليل'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`h-4 w-4 transition-transform ${guideOpen ? 'rotate-180' : ''}`} aria-hidden="true">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {guideOpen && (
          <div className="border-t border-gray-200">
            <p className="border-b border-gray-200 bg-blue-50/40 px-4 py-3 text-sm leading-relaxed text-gray-600">
              لكل جدول: شغّل «استعلام Oracle» وصدّر ناتجه كعبارات <code dir="ltr">INSERT</code>، ثم الصقه بالأعلى أو ارفعه كملف <code>.sql</code>.
            </p>

            <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)]">
              {/* Table picker — sits on the right in RTL */}
              <aside className="border-b border-gray-200 lg:border-b-0 lg:border-e">
                <div className="p-3">
                  <div className="relative">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
                    </svg>
                    <input
                      value={guideSearch}
                      onChange={e => setGuideSearch(e.target.value)}
                      placeholder="ابحث عن جدول..."
                      className="input-field w-full pr-9 text-sm"
                    />
                    {guideSearch && (
                      <button
                        type="button"
                        onClick={() => setGuideSearch('')}
                        aria-label="مسح البحث"
                        className="absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >✕</button>
                    )}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto px-2 pb-3 lg:max-h-[34rem]">
                  {IMPORT_GUIDE.map(group => {
                    const tables = group.tables.filter(matchGuide);
                    if (!tables.length) return null;
                    return (
                      <div key={group.title} className="mb-2">
                        <div className="px-2 py-1 text-xs font-bold text-gray-400">{group.title}</div>
                        <div className="space-y-0.5">
                          {tables.map(t => {
                            const key = `${group.title}:${t.oracle}`;
                            const active = key === selectedTable.key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setGuideKey(key)}
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-sm transition-colors ${active ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'}`}
                              >
                                <span className="min-w-0 truncate">{t.label}</span>
                                <code dir="ltr" className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-blue-500/80 text-white' : 'bg-gray-100 text-gray-500'}`}>{t.oracle}</code>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!guideTables.some(matchGuide) && (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">لا توجد نتائج مطابقة</div>
                  )}
                </div>
              </aside>

              {/* Selected table detail */}
              <section className="min-w-0 space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900">{selectedTable.label}</h4>
                  <code dir="ltr" className="rounded bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{selectedTable.oracle}</code>
                  <span dir="ltr" className="text-xs text-gray-400">→ {selectedTable.target}</span>
                </div>

                <p className="text-sm leading-relaxed text-gray-600">{selectedTable.desc}</p>

                <div>
                  <div className="mb-1.5 text-xs font-bold text-gray-500">
                    الأعمدة المقبولة
                    <span className="mr-1 font-normal text-gray-400">
                      ({toArabicDigits(selectedTable.columns.split(',').filter(c => c.trim()).length)})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTable.columns.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <code key={c} dir="ltr" className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700">{c}</code>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
                    <div className="flex gap-1">
                      {guideHasSelect && (
                        <button
                          type="button"
                          onClick={() => setSqlTab('select')}
                          className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${guideTab === 'select' ? 'border border-gray-200 bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                          ① استعلام Oracle
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSqlTab('insert')}
                        className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${guideTab === 'insert' ? 'border border-gray-200 bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        {guideHasSelect ? '② مثال INSERT' : 'مثال INSERT'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyExample(guideCopyKey, guideSql)}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
                    >
                      {copiedKey === guideCopyKey ? 'تم النسخ ✓' : 'نسخ'}
                    </button>
                  </div>
                  <pre dir="ltr" className={`max-h-[30rem] overflow-auto bg-slate-900 p-3 font-mono text-xs leading-relaxed whitespace-pre ${guideTab === 'select' ? 'text-emerald-100' : 'text-gray-100'}`}>{guideSql}</pre>
                </div>

                {guideTab === 'select' && (
                  <p className="text-xs text-gray-400">
                    عدّل تاريخ النشرة <code dir="ltr">NASHRA_DATE</code> في الاستعلام حسب لجنتك، ثم صدّر الناتج كعبارات <code dir="ltr">INSERT</code>.
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      <div className="card space-y-4 mb-4">
        <div>
          <h3 className="font-bold text-gray-800 mb-1">استيراد صور الضباط</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            اختر مجلد الصور: مجلد فرعي لكل ضابط باسم المعرّف (id)، بداخله الصورة الشخصية وصورة عائلية يحتوي اسمها كلمة <code dir="ltr">family</code>.
            صور <code dir="ltr">TIFF</code> تُحوَّل تلقائياً، و<code dir="ltr">HEIC</code> يلزم تحويلها يدوياً.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input ref={photoRef} type="file" multiple accept="image/*" onChange={handlePhotoPick} className="text-sm" />
          {photoFiles.length > 0 && (
            <span className="text-sm text-gray-500">
              {photoDir && <span className="font-bold">{photoDir} — </span>}
              {toArabicDigits(photoFiles.length)} صورة
            </span>
          )}
        </div>

        {photoError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{photoError}</div>
        )}

        {photoBusy && photoProgress && (
          <div className="text-sm text-blue-700">
            جاري الرفع... {toArabicDigits(photoProgress.done)} من {toArabicDigits(photoProgress.total)}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handlePhotoUpload} disabled={photoBusy || !photoFiles.length} className="btn-primary">
            {photoBusy ? 'جاري الرفع...' : 'رفع الصور'}
          </button>
          {(photoFiles.length > 0 || photoResult) && (
            <button onClick={handlePhotoClear} disabled={photoBusy} className="btn-secondary">مسح</button>
          )}
        </div>

        {photoResult && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm space-y-1">
            <div className="font-bold text-green-700">تم رفع الصور</div>
            <div>الصور الشخصية: {toArabicDigits(photoResult.personal)}</div>
            <div>الصور العائلية: {toArabicDigits(photoResult.family)}</div>
            {photoResult.converted > 0 && (
              <div className="text-blue-700">صور تم تحويلها من TIFF إلى JPEG: {toArabicDigits(photoResult.converted)}</div>
            )}
            {photoResult.unmatched > 0 && (
              <div className="text-amber-700">معرّفات بلا ضابط مطابق حالياً: {toArabicDigits(photoResult.unmatched)}</div>
            )}
            {photoResult.skipped > 0 && (
              <div className="text-gray-600">ملفات تم تخطيها: {toArabicDigits(photoResult.skipped)}</div>
            )}
            {photoResult.warnings.length > 0 && (
              <div className="mt-2 text-amber-800 text-xs space-y-0.5">
                {photoResult.warnings.slice(0, 10).map((w, i) => <div key={i}>{w}</div>)}
                {photoResult.warnings.length > 10 && <div>… {toArabicDigits(photoResult.warnings.length - 10)} أخرى</div>}
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="card mb-4">
          <h3 className="font-bold mb-3 text-green-700">
            {result.mode === 'append' ? 'تمت الإضافة بنجاح' : 'تم الاستيراد بنجاح'}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="px-3 py-2">الجدول</th>
                  <th className="px-3 py-2">عدد السجلات</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map(r => (
                  <tr key={r.table} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-mono" dir="ltr">{r.table}</td>
                    <td className="px-3 py-2">{toArabicDigits(r.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.warnings.length > 0 && (
            <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs space-y-1">
              <div className="font-bold">تنبيهات:</div>
              {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-200 font-bold text-gray-700">سجل الاستيراد</div>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">لا توجد عمليات استيراد سابقة</div>
        ) : (
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-3 py-3">التاريخ</th>
                <th className="px-3 py-3">الملف</th>
                <th className="px-3 py-3">الجداول</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">الملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  {/* Stored as a full timestamp: the date goes through formatDate so it reads
                      like every other date, the clock part converts on its own. */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(l.import_date)} {toArabicDigits(String(l.import_date || '').slice(11, 16))}
                  </td>
                  <td className="px-3 py-2">{toArabicDigits(l.file_name) || '-'}</td>
                  <td className="px-3 py-2 text-xs" dir="ltr">{l.tables_imported || '-'}</td>
                  <td className={`px-3 py-2 font-bold ${STATUS_CLS[l.status] || ''}`}>{STATUS_LABEL[l.status] || l.status}</td>
                  <td className="px-3 py-2 text-xs text-red-700 max-w-md truncate" title={l.error_message || ''}>
                    {l.error_message || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
