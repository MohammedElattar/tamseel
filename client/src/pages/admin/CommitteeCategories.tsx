import { useState, useEffect, useCallback } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../../api/categories';
import type { OfficerCategory } from '../../api/categories';
import DragHandle from '../../components/DragHandle';
import { toArabicDigits, toWesternDigits } from '../../utils/format';

// عدد الضباط المطلوب ترشيحه is typed in Arabic-Indic digits but kept as a Western-digit string; '' = not set.
const digitsOnly = (raw: string) => toWesternDigits(raw).replace(/[^0-9]/g, '');
const countValue = (digits: string) => (digits === '' ? null : Number(digits));

// ترتيب اللجنة: the global list of officer categories (e.g. ملحق عسكري). Each committee officer gets
// one in «بيانات الضباط». The list's order (drag or ▲▼) is the order every committee's session
// presents the categories in. A value held by an officer in a committee that has not finished
// cannot be deleted (the server enforces it too).
export default function CommitteeCategories() {
  const [rows, setRows] = useState<OfficerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCount, setEditCount] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(
    () => getCategories()
      .then(setRows)
      .catch(() => setError('تعذر تحميل البيانات'))
      .finally(() => setLoading(false)),
    []
  );
  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await action();
      setMsg(done);
      await load();
      return true;
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر تنفيذ العملية');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (await run(() => createCategory(newName, countValue(newCount)), 'تمت الإضافة')) {
      setNewName('');
      setNewCount('');
    }
  };

  const saveEdit = async () => {
    if (editId == null || !editName.trim()) return;
    if (await run(() => updateCategory(editId, editName, countValue(editCount)), 'تم حفظ التعديل')) setEditId(null);
  };

  const editKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditId(null);
  };

  const remove = async (c: OfficerCategory) => {
    if (!window.confirm(`هل تريد حذف «${c.name}»؟`)) return;
    await run(() => deleteCategory(c.id), 'تم الحذف');
  };

  // Moves a category and saves the whole order right away; a failed save reloads the stored one.
  const move = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
    setError('');
    setMsg('');
    try {
      await reorderCategories(next.map(c => c.id));
      setMsg('تم حفظ ترتيب العرض');
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر حفظ الترتيب');
      load();
    }
  };

  const dropOn = (index: number) => {
    if (dragIndex !== null) move(dragIndex, index);
    setDragIndex(null);
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;

  const orderButton = 'rounded border border-gray-300 px-2 py-0.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div>
      <h2 className="page-title">ترتيب اللجنة</h2>
      <p className="text-sm text-gray-500 -mt-4 mb-4 max-w-3xl">
        الفئات التي يُعرض بها الضباط داخل اللجنة (مثل ملحق عسكري)، وتُحدَّد لكل ضابط من تبويب «بيانات الضباط».
        ترتيب هذه القائمة هو ترتيب ظهور الفئات للأعضاء في كل اللجان، ويُرقَّم المسلسل تبعاً له في اللجان
        التي لم تنتهِ بعد، ثم الضباط بدون ترتيب في النهاية. غيّر الترتيب بسحب الصف أو بالأسهم.
      </p>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3 max-w-3xl">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3 max-w-3xl">{error}</div>}

      <form onSubmit={add} className="card mb-4 flex max-w-3xl flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="new-category" className="label">إضافة ترتيب جديد</label>
          <input
            id="new-category"
            className="input-field"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="مثال: ملحق عسكري"
          />
        </div>
        <div className="w-56">
          <label htmlFor="new-category-count" className="label">عدد الضباط المطلوب ترشيحه</label>
          <input
            id="new-category-count"
            className="input-field text-center"
            inputMode="numeric"
            value={toArabicDigits(newCount)}
            onChange={e => setNewCount(digitsOnly(e.target.value))}
          />
        </div>
        <button type="submit" disabled={busy || !newName.trim()} className="btn-primary disabled:opacity-50">إضافة</button>
      </form>

      <div className="card max-w-3xl overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-gray-600">
              <th className="w-8 px-2 py-3"></th>
              <th className="px-4 py-3 font-medium">م</th>
              <th className="px-4 py-3 font-medium">اسم الترتيب</th>
              <th className="px-4 py-3 font-medium">عدد الضباط المطلوب ترشيحه</th>
              <th className="px-4 py-3 font-medium">ضباط في لجان لم تنتهِ</th>
              <th className="px-4 py-3 font-medium">ترتيب العرض</th>
              <th className="px-4 py-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr
                key={c.id}
                draggable={editId === null}
                onDragStart={() => setDragIndex(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => dropOn(i)}
                onDragEnd={() => setDragIndex(null)}
                className={`border-b border-gray-100 last:border-0 ${editId === null ? 'cursor-move' : ''} ${
                  dragIndex === i ? 'opacity-40' : ''
                }`}
              >
                <td className="px-2 py-2 text-gray-300" title="اسحب لتغيير الترتيب">
                  <DragHandle />
                </td>
                <td className="px-4 py-2 font-bold text-gray-500">{toArabicDigits(i + 1)}</td>
                <td className="px-4 py-2">
                  {editId === c.id ? (
                    <input
                      autoFocus
                      className="input-field py-1"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={editKeys}
                    />
                  ) : (
                    <span className="font-medium text-gray-900">{toArabicDigits(c.name)}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editId === c.id ? (
                    <input
                      className="input-field w-24 py-1 text-center"
                      inputMode="numeric"
                      aria-label="عدد الضباط المطلوب ترشيحه"
                      value={toArabicDigits(editCount)}
                      onChange={e => setEditCount(digitsOnly(e.target.value))}
                      onKeyDown={editKeys}
                    />
                  ) : c.required_count != null ? (
                    toArabicDigits(c.required_count)
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2">{toArabicDigits(c.in_use)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, i - 1)} disabled={busy || i === 0} title="تقديم" aria-label="تقديم" className={orderButton}>
                      ▲
                    </button>
                    <button onClick={() => move(i, i + 1)} disabled={busy || i === rows.length - 1} title="تأخير" aria-label="تأخير" className={orderButton}>
                      ▼
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    {editId === c.id ? (
                      <>
                        <button onClick={saveEdit} disabled={busy || !editName.trim()} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">حفظ</button>
                        <button onClick={() => setEditId(null)} disabled={busy} className="btn-secondary px-3 py-1 text-xs">إلغاء</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditId(c.id);
                            setEditName(c.name);
                            setEditCount(c.required_count != null ? String(c.required_count) : '');
                            setMsg('');
                            setError('');
                          }}
                          disabled={busy}
                          className="text-blue-700 hover:underline"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => remove(c)}
                          disabled={busy || c.in_use > 0}
                          title={c.in_use > 0 ? 'مستخدم لضباط في لجنة لم تنتهِ بعد — لا يمكن حذفه' : undefined}
                          className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">لا توجد قيم بعد — أضف أول ترتيب بالأعلى</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.some(r => r.in_use > 0) && (
        <p className="mt-2 max-w-3xl text-xs text-gray-500">لا يمكن حذف ترتيب مستخدم لضباط في لجنة لم تنتهِ بعد.</p>
      )}
    </div>
  );
}
