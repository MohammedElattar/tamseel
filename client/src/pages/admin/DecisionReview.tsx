import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getDecisions, backupCommittee, completeCommittee,
  bulkOfficerAction, updateOfficerFlags, getBackups, restoreCommittee, reverseDecision,
} from '../../api/committees';
import { calculateDecisions } from '../../api/evaluations';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { toArabicDigits, formatDate } from '../../utils/format';

const statusLabels: Record<string, string> = {
  draft: 'مسودة', active: 'نشطة', completed: 'مكتملة', archived: 'مؤرشفة',
};

const bandColor = (b?: string) =>
  b === 'متميز' ? 'text-green-700' : b === 'غير مرضي' ? 'text-red-700' : b === 'عادي' ? 'text-gray-700' : 'text-gray-400';

export default function DecisionReview() {
  const { id } = useParams<{ id: string }>();
  const committeeId = Number(id);

  const [committee, setCommittee] = useState<any>(null);
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);

  const fetchData = useCallback(() => {
    return getDecisions(committeeId)
      .then((d) => { setCommittee(d.committee); setOfficers(d.officers); })
      .catch((e) => setError(e.response?.data?.error || 'تعذر تحميل القرارات'))
      .finally(() => setLoading(false));
  }, [committeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const run = async (key: string, fn: () => Promise<any>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setError(''); setMsg('');
    try {
      const r = await fn();
      if (r?.message) setMsg(r.message);
      await fetchData();
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر تنفيذ العملية');
    } finally {
      setBusy('');
    }
  };

  const openBackups = async () => {
    setError('');
    try {
      setBackups(await getBackups(committeeId));
      setBackupsOpen(true);
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر تحميل النسخ الاحتياطية');
    }
  };

  const doRestore = async (backupId: number) => {
    if (!window.confirm('سيتم استرجاع حالة اللجنة من هذه النسخة (مع أخذ نسخة من الحالة الحالية أولاً). متابعة؟')) return;
    setBusy('restore-' + backupId); setError(''); setMsg('');
    try {
      const r = await restoreCommittee(committeeId, backupId);
      if (r?.message) setMsg(r.message);
      setBackupsOpen(false);
      await fetchData();
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر الاسترجاع');
    } finally {
      setBusy('');
    }
  };

  const toggleDispute = async (officerId: number, checked: boolean) => {
    // Optimistic: flip the flag instantly, revert on failure.
    setOfficers((prev) => prev.map((o) => (o.officer_id === officerId ? { ...o, dispute: checked ? 1 : 0 } : o)));
    try {
      await updateOfficerFlags(committeeId, officerId, { dispute: checked ? 1 : 0 });
    } catch (e: any) {
      setOfficers((prev) => prev.map((o) => (o.officer_id === officerId ? { ...o, dispute: checked ? 0 : 1 } : o)));
      setError(e.response?.data?.error || 'تعذر تحديث الخلاف');
    }
  };

  const reverse = (officerId: number) =>
    run('reverse-' + officerId, () => reverseDecision(committeeId, officerId),
      'سيتم عكس القرار النهائي لهذا الضابط (يُعدّل صوت القائد ونائبه). متابعة؟');

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;
  if (!committee) return <div className="card text-center py-10 text-gray-400">اللجنة غير موجودة</div>;

  const isCompleted = committee.status === 'completed';
  const disputedCount = officers.filter((o) => o.dispute === 1).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="page-title mb-0">مراجعة القرارات</h2>
          <span className={`px-2 py-0.5 rounded text-xs ${isCompleted ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {statusLabels[committee.status] || committee.status}
          </span>
        </div>
        <Link to={`/admin/committees/${id}`} className="btn-secondary text-sm">العودة للتفاصيل</Link>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2">
        {/* Buttons temporarily hidden (restore when needed):
        {isTagdded && (
          <>
            <button
              onClick={() => run('calc', () => calculateDecisions(committeeId))}
              disabled={!!busy || isCompleted}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy === 'calc' ? '...' : 'احتساب النتائج'}
            </button>
            <button
              onClick={() => run('reopen', () => bulkOfficerAction(committeeId, 'reset-done-disputes'),
                'سيتم إعادة فتح التصويت على الضباط المتنازع عليهم. متابعة؟')}
              disabled={!!busy || isCompleted || disputedCount === 0}
              className="text-sm px-4 py-2 rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              إعادة فتح المتنازع عليهم ({toArabicDigits(disputedCount)})
            </button>
          </>
        )}
        <button
          onClick={() => run('backup', () => backupCommittee(committeeId))}
          disabled={!!busy}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          {busy === 'backup' ? '...' : 'أخذ نسخة احتياطية'}
        </button>
        <button onClick={openBackups} disabled={!!busy} className="btn-secondary text-sm disabled:opacity-50">
          النسخ الاحتياطية
        </button>
        */}
        {/* Legacy chain-level card, replaced by بطاقة تقييم الأعضاء (restore when needed):
        <Link to={`/print/committee/${id}/decisions-card`} target="_blank" className="btn-secondary text-sm">
          ملخص تصويت الأعضاء لكل ضابط
        </Link>
        */}
        <Link to={`/print/committee/${id}/member-scores-card`} target="_blank" className="btn-secondary text-sm">
          بطاقة تقييم الأعضاء
        </Link>
        {/* Buttons temporarily hidden (restore when needed):
        {!isTagdded && (
          <Link to={`/print/committee/${id}/final-decisions`} target="_blank" className="btn-secondary text-sm">
            بيان قرارات اللجنة النهائية
          </Link>
        )}
        */}
        <div className="flex-1" />
        <button
          onClick={() => run('complete', () => completeCommittee(committeeId),
            'سيتم أخذ نسخة احتياطية وإنهاء اللجنة وإغلاقها. متابعة؟')}
          disabled={!!busy || isCompleted}
          className="text-sm px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {busy === 'complete' ? '...' : isCompleted ? 'اللجنة منتهية' : 'إنهاء اللجنة'}
        </button>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{error}</div>}

      <TagddedTable officers={officers} isCompleted={isCompleted} busy={busy} onToggleDispute={toggleDispute} onReverse={reverse} />

      {backupsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBackupsOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-bold">النسخ الاحتياطية</h3>
              <button onClick={() => setBackupsOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-5">
              {committee.is_active === 1 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded text-sm mb-3">
                  أوقف الجلسة أولاً لتتمكن من الاسترجاع
                </div>
              )}
              {backups.length === 0 ? (
                <div className="text-center text-gray-400 py-6">لا توجد نسخ احتياطية</div>
              ) : (
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div key={b.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatDate(b.backup_date)} {toArabicDigits(String(b.backup_date || '').slice(11, 16))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {toArabicDigits(b.officers)} ضابط · {toArabicDigits(b.votes)} صوت
                        </div>
                      </div>
                      <button
                        onClick={() => doRestore(b.id)}
                        disabled={committee.is_active === 1 || busy === 'restore-' + b.id}
                        className="btn-secondary text-xs disabled:opacity-50"
                      >
                        {busy === 'restore-' + b.id ? '...' : 'استرجاع'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TagddedTable({ officers, isCompleted, busy, onToggleDispute, onReverse }: {
  officers: any[]; isCompleted: boolean; busy: string;
  onToggleDispute: (officerId: number, checked: boolean) => void;
  onReverse: (officerId: number) => void;
}) {
  if (!officers.length) return <div className="card text-center py-10 text-gray-400">لا يوجد ضباط</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm text-right whitespace-nowrap">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="p-2">م</th>
            <th className="p-2">الرتبة / الاسم</th>
            <th className="p-2">تصدق</th>
            <th className="p-2">لا يتصدق</th>
            <th className="p-2">القرار</th>
            <th className="p-2">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {officers.map((o) => (
            <tr key={o.officer_id} className={`border-b ${o.dispute === 1 ? 'bg-red-50' : ''}`}>
              <td className="p-2">{toArabicDigits(o.serial)}</td>
              <td className="p-2 font-medium">{toArabicDigits(o.rank_name)} / {toArabicDigits(o.officer_name)}</td>
              <td className="p-2 text-green-700">{toArabicDigits(o.accept ?? 0)}</td>
              <td className="p-2 text-red-700">{toArabicDigits(o.reject ?? 0)}</td>
              <td className="p-2 font-semibold">{toArabicDigits(o.decision) || '-'}</td>
              <td className="p-2">
                <span className={`px-2 py-0.5 rounded text-xs ${o.done === 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {o.done === 1 ? 'تم' : 'منتظر'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

