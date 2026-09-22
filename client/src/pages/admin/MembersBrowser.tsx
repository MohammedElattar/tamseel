import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMembers, createMember, updateMember, deleteMember, Member } from '../../api/members';
import { toArabicDigits } from '../../utils/format';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

interface MemberForm {
  display_name: string;
  rank_name: string;
  job_title: string;
  is_active: boolean;
}

const emptyForm: MemberForm = {
  display_name: '', rank_name: '', job_title: '', is_active: true,
};

export default function MembersBrowser() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  // null = closed; { id: null } = adding; { id: number } = editing that member.
  const [editing, setEditing] = useState<Member | null | undefined>(undefined);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(() => {
    return getMembers()
      .then(setMembers)
      .catch((e) => setError(e.response?.data?.error || 'تعذر تحميل الأعضاء'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useLiveUpdates(fetchMembers);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter(m =>
      [m.display_name, m.username, m.job_title, m.rank_name]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    );
  }, [members, q]);

  const openAdd = () => { setForm(emptyForm); setFormError(''); setEditing(null); };
  const openEdit = (m: Member) => {
    setForm({
      display_name: m.display_name || '',
      rank_name: m.rank_name || '',
      job_title: m.job_title || '',
      is_active: m.is_active === 1,
    });
    setFormError('');
    setEditing(m);
  };
  const closeModal = () => { setEditing(undefined); };

  const handleSave = async () => {
    setFormError('');
    if (!form.display_name.trim()) {
      setFormError('اسم العضو مطلوب');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        display_name: form.display_name.trim(),
        rank_name: form.rank_name.trim(),
        job_title: form.job_title.trim(),
        is_active: form.is_active ? 1 : 0,
      };
      if (editing) await updateMember(editing.id, payload);
      else await createMember(payload);
      closeModal();
      await fetchMembers();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'تعذر حفظ العضو');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: Member) => {
    if (m.committee_count > 0) {
      alert('العضو مُسجَّل في لجنة — أزِله من اللجنة أولاً ثم احذفه');
      return;
    }
    if (!window.confirm(`سيتم حذف العضو: ${m.display_name || m.username}\nهل أنت متأكد؟`)) return;
    try {
      await deleteMember(m.id);
      await fetchMembers();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف العضو');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="page-title mb-0">الأعضاء</h2>
        <button onClick={openAdd} className="btn-primary text-sm">إضافة عضو</button>
      </div>

      <div className="card mb-4">
        <label className="label">بحث</label>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          className="input-field max-w-md"
          placeholder="بحث بالاسم أو اسم المستخدم أو الوظيفة..."
        />
      </div>

      <div className="card overflow-x-auto">
        <div className="text-sm text-gray-500 mb-2">العدد: {toArabicDigits(filtered.length)}</div>
        {error && <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="p-2 whitespace-nowrap">اسم المستخدم</th>
              <th className="p-2 min-w-[12rem]">اسم العضو</th>
              <th className="p-2">الرتبة</th>
              <th className="p-2">الوظيفة</th>
              <th className="p-2 whitespace-nowrap">الحالة</th>
              <th className="p-2 whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b hover:bg-gray-50">
                <td className="p-2 font-mono text-gray-700">{m.username}</td>
                <td className="p-2 font-medium">
                  {toArabicDigits(m.display_name)}
                  {m.is_guest === 1 && (
                    <span className="mr-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500 border border-dashed border-gray-300">
                      زائر
                    </span>
                  )}
                </td>
                <td className="p-2">{toArabicDigits(m.rank_name) || '-'}</td>
                <td className="p-2">{toArabicDigits(m.job_title) || '-'}</td>
                <td className="p-2 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-xs ${m.is_active === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {m.is_active === 1 ? 'مفعل' : 'غير مفعل'}
                  </span>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {m.is_guest === 1 ? (
                    <span className="text-gray-300">-</span>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(m)} className="text-blue-600 hover:text-blue-800">تعديل</button>
                      <button
                        onClick={() => handleDelete(m)}
                        disabled={m.committee_count > 0}
                        title={m.committee_count > 0 ? 'العضو مسجل في لجنة' : ''}
                        className="text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center text-gray-400 py-6">جاري التحميل...</div>}
        {!loading && filtered.length === 0 && <div className="text-center text-gray-400 py-6">لا يوجد أعضاء</div>}
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-bold">{editing ? 'تعديل عضو' : 'إضافة عضو جديد'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-3">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <div>
                <label className="label">اسم العضو <span className="text-red-500">*</span></label>
                <input
                  value={form.display_name}
                  onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">الرتبة</label>
                <input
                  type="text"
                  value={form.rank_name}
                  onChange={e => setForm(p => ({ ...p, rank_name: e.target.value }))}
                  className="input-field"
                  placeholder="الرتبة"
                />
              </div>
              <div>
                <label className="label">الوظيفة</label>
                <input
                  value={form.job_title}
                  onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))}
                  className="input-field"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                  className="w-4 h-4"
                />
                مفعل
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button onClick={closeModal} className="btn-secondary text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
