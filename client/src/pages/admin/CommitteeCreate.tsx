import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createCommittee, getCommittee, updateCommittee } from '../../api/committees';
import ArabicDate from '../../components/ArabicDate';

export default function CommitteeCreate() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id;
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // A started (active) or finished (completed) committee cannot be edited server-side, so the
    // form is locked to read-only rather than letting a save silently fail with a scrolled-past error.
    const [locked, setLocked] = useState(false);
    const [lockReason, setLockReason] = useState('');

    const [form, setForm] = useState({
        lagna_date: new Date().toISOString().split('T')[0],
        hide_decision: 0,
    });

    useEffect(() => {
        if (!id) return;
        getCommittee(Number(id))
            .then((d: any) => {
                const c = d.committee;
                setForm({
                    lagna_date: c.lagna_date || '',
                    hide_decision: c.hide_decision ?? 0,
                });
                if (c.is_active === 1 || c.status === 'active') {
                    setLocked(true);
                    setLockReason('لا يمكن تعديل لجنة نشطة - أوقف الجلسة أولاً');
                } else if (c.status === 'completed') {
                    setLocked(true);
                    setLockReason('لا يمكن تعديل لجنة منتهية');
                }
            })
            .catch(() => setError('تعذر تحميل بيانات اللجنة'));
    }, [id]);

    const handleChange = (field: string, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (locked) return;
        setLoading(true);
        setError('');
        try {
            const body: Record<string, any> = {
                // Single committee type (لجنة التمثيل العسكري); kept internally as the 'tagdded' tag.
                committee_type: 'tagdded',
                lagna_cat_c: 1,
                lagna_date: form.lagna_date,
                hide_decision: form.hide_decision,
            };

            if (isEdit) {
                delete body.committee_type;
                await updateCommittee(Number(id), body);
                navigate(`/admin/committees/${id}`);
            } else {
                await createCommittee(body);
                navigate('/admin/committees');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || (isEdit ? 'فشل تحديث اللجنة' : 'فشل إنشاء اللجنة'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2 className="page-title">{isEdit ? 'تعديل اللجنة' : 'إنشاء لجنة جديدة'}</h2>

            <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
                )}

                {locked && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                        {lockReason} — البيانات معروضة للاطلاع فقط.
                    </div>
                )}

                <div>
                    <label className="label">بداية اللجنة</label>
                    <ArabicDate
                        value={form.lagna_date}
                        onChange={v => handleChange('lagna_date', v)}
                        className="max-w-xs"
                        disabled={locked}
                    />
                </div>

                <div className="flex gap-3 pt-4">
                    {!locked && (
                        <button type="submit" disabled={loading} className="btn-primary">
                            {loading ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء اللجنة'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => navigate(isEdit ? `/admin/committees/${id}` : '/admin/committees')}
                        className="btn-secondary"
                    >
                        إلغاء
                    </button>
                </div>
            </form>
        </div>
    );
}
