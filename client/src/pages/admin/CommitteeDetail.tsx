import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import type { FormEvent } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCommittee, loadMembers, setMemberIncluded,
  loadOfficers, getCommitteeOfficers, setOfficerLagnaType,
  getSessionOfficers, showOfficers, updateOfficerFlags, setOfficerActive, bulkOfficerAction,
  removeCommitteeOfficer,
  registerOfficer, getRegisteredOfficers, removeRegisteredOfficer,
  getJudicialOfficers, updateJudicialCase, reorderMembers, reorderOfficers,
  activateCommittee, deactivateCommittee, completeCommittee, deleteCommittee,
  createCommitteeMember, removeCommitteeMember,
  getEvalItems, loadEvalItems, updateEvalItems, addEvalItem, deleteEvalItem, reorderEvalItems,
} from '../../api/committees';
import { getCategories } from '../../api/categories';
import type { OfficerCategory } from '../../api/categories';
import { searchOfficers } from '../../api/officers';
import { getVotingStatus, calculateDecisions } from '../../api/evaluations';
import VoteBreakdown from '../../components/VoteBreakdown';
import { getLagnaTypes, getTa3nTypes, getRanks } from '../../api/lookup';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import ArabicDate from '../../components/ArabicDate';
import DragHandle from '../../components/DragHandle';
import { toArabicDigits, toWesternDigits, formatDate } from '../../utils/format';
import CommitteeServiceScores from './CommitteeServiceScores';

const NOTES_RETIREMENT_REASONS = [
  'قوة القانون',
  'عدم اللياقة الصحية للخدمة العسكرية',
  'المادة 109',
  'المادة 138',
];

const TAGDDED_TABS = [
  { id: 'members', label: 'الأعضاء' },
  { id: 'officers', label: 'بيانات الضباط' },
  { id: 'items', label: 'تحديد بنود العرض' },
  { id: 'service-scores', label: 'درجات مسير الخدمة' },
  { id: 'session', label: 'ترتيب العرض' },
  { id: 'reports', label: 'تقارير ما بعد اللجنة' },
];

const EDARYA_TABS = [
  { id: 'registration', label: 'تسجيل الضباط' },
  { id: 'members', label: 'الأعضاء' },
  { id: 'officers', label: 'بيانات الضباط' },
  { id: 'session', label: 'ترتيب العرض' },
  { id: 'reports', label: 'تقارير ما بعد اللجنة' },
];

const KIND_OPTIONS = [
  { value: 5, label: 'الكل' },
  { value: 1, label: 'بحري' },
  { value: 2, label: 'مهندس' },
  { value: 3, label: 'فني' },
  { value: 4, label: 'مد/سا' },
];

// لشغل وظيفة filter sentinels; real jobs are free text and never take these values.
const ALL_JOBS = '__all__';
const NO_JOB = '__none__';

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشطة',
  completed: 'مكتملة',
  archived: 'مؤرشفة',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

export default function CommitteeDetail() {
  const { id } = useParams<{ id: string }>();
  const committeeId = Number(id);

  const [committee, setCommittee] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'members');

  const [officers, setOfficers] = useState<any[]>([]);
  const [lagnaTypes, setLagnaTypes] = useState<any[]>([]);
  const [officerKind, setOfficerKind] = useState(5);
  const [officerLagnaType, setOfficerLagnaTypeFilter] = useState(1000);
  const [jobFilter, setJobFilter] = useState(ALL_JOBS);
  // Typed لشغل وظيفة values not yet saved (saved on blur).
  const [jobDrafts, setJobDrafts] = useState<Record<number, string>>({});

  // Manual member creation (custom members beyond the fixed commander panel).
  const emptyMemberForm = { username: '', display_name: '', rank_name: '', job_title: '' };
  const [ranks, setRanks] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState(emptyMemberForm);
  const [memberError, setMemberError] = useState('');
  const [savingMember, setSavingMember] = useState(false);

  const fetchData = useCallback(async () => {
    const data = await getCommittee(committeeId);
    setCommittee(data.committee);
    setMembers(data.members);
  }, [committeeId]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Auto-load once per committee (replaces the manual load buttons). Only loads
  // when data is empty, so it never clobbers reorders/edits.
  const autoInitRef = useRef<number | null>(null);
  useEffect(() => {
    if (!committee || autoInitRef.current === committeeId) return;
    autoInitRef.current = committeeId;
    (async () => {
      if (members.length === 0) await loadMembers(committeeId).catch(() => {});
      // التمثيل العسكري: every imported officer is a candidate — load them if none loaded yet.
      const offs = await getCommitteeOfficers(committeeId, {}).catch(() => []);
      if (!offs.length) await loadOfficers(committeeId).catch(() => {});
      await showOfficers(committeeId).catch(() => {});
      await fetchData();
      fetchOfficers();
      fetchSessionOfficers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committee, committeeId]);

  useEffect(() => {
    getLagnaTypes().then(setLagnaTypes);
    getRanks().then(setRanks).catch(() => {});
  }, []);

  // Opening the tab lists the officers by المسلسل. Refreshes while it is open (keepOrder) leave the
  // rows where they are: assigning a ترتيب اللجنة category renumbers المسلسل, and the row being
  // edited must not jump away. The new numbers show in place; the next visit sorts by them.
  const fetchOfficers = useCallback(async (keepOrder = false) => {
    const data = await getCommitteeOfficers(committeeId, {
      kind: officerKind,
      lagna_type_code: officerLagnaType,
    });
    setOfficers(prev => {
      if (!keepOrder || !prev.length) return data;
      const place = new Map<number, number>(prev.map((o, i) => [o.officer_id, i]));
      return [...data].sort((a, b) => (place.get(a.officer_id) ?? Infinity) - (place.get(b.officer_id) ?? Infinity));
    });
  }, [committeeId, officerKind, officerLagnaType]);

  useEffect(() => {
    if (activeTab === 'officers') fetchOfficers();
  }, [activeTab, fetchOfficers]);

  // بنود التقييم لهذه اللجنة (تحديد بنود العرض). Every action saves right away and the server answers
  // with the updated list. مسير الخدمة / لغة إنجليزية (computed) can only be reordered.
  const [evalItems, setEvalItems] = useState<any[]>([]);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [itemsMsg, setItemsMsg] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [newItem, setNewItem] = useState({ name: '', max: '' });
  const [itemEdit, setItemEdit] = useState<{ id: number; name: string; max: string } | null>(null);
  const [itemDragIndex, setItemDragIndex] = useState<number | null>(null);
  const fetchEvalItems = useCallback(async () => {
    setEvalItems(await getEvalItems(committeeId));
  }, [committeeId]);
  useEffect(() => { if (activeTab === 'items') fetchEvalItems(); }, [activeTab, fetchEvalItems]);

  const runItems = async (action: () => Promise<any[]>, done: string) => {
    setItemsBusy(true); setItemsError(''); setItemsMsg('');
    try {
      setEvalItems(await action());
      setItemsMsg(done);
      return true;
    } catch (e: any) {
      setItemsError(e.response?.data?.error || 'تعذر تنفيذ العملية');
      return false;
    } finally {
      setItemsBusy(false);
    }
  };
  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    const name = newItem.name.trim();
    if (!name || !(Number(newItem.max) > 0)) return;
    if (await runItems(() => addEvalItem(committeeId, { name, max_degree: Number(newItem.max) }), 'تمت إضافة البند')) {
      setNewItem({ name: '', max: '' });
    }
  };
  const saveItemEdit = async () => {
    if (!itemEdit) return;
    const name = itemEdit.name.trim();
    if (!name || !(Number(itemEdit.max) > 0)) return;
    const saved = await runItems(
      () => updateEvalItems(committeeId, [{ id: itemEdit.id, name, max_degree: Number(itemEdit.max) }]),
      'تم حفظ التعديل',
    );
    if (saved) setItemEdit(null);
  };
  const removeItem = async (it: any) => {
    if (!window.confirm(`هل تريد حذف البند «${it.name}»؟`)) return;
    await runItems(() => deleteEvalItem(committeeId, it.id), 'تم حذف البند');
  };
  // Moves a بند and saves the whole order right away; a failed save reloads the stored order.
  const moveItem = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= evalItems.length) return;
    const next = [...evalItems];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setEvalItems(next);
    if (!(await runItems(() => reorderEvalItems(committeeId, next.map(it => it.id)), 'تم حفظ ترتيب البنود'))) {
      fetchEvalItems();
    }
  };
  const reloadItemsTemplate = async () => {
    if (!window.confirm('سيتم استبدال بنود هذه اللجنة بالقالب الافتراضي. متابعة؟')) return;
    await loadEvalItems(committeeId); await fetchEvalItems();
  };

  // بيانات الضباط: inline edit of لشغل وظيفة / تاريخ المقابلة per candidate.
  const handleOfficerField = async (officerId: number, field: string, value: any) => {
    setOfficers(prev => prev.map(o => (o.officer_id === officerId ? { ...o, [field]: value } : o)));
    try {
      await updateOfficerFlags(committeeId, officerId, { [field]: value });
      // A category renumbers المسلسل, so bring the new numbers in (rows stay put).
      if (field === 'category_id') fetchOfficers(true);
    } catch {
      fetchOfficers(true);
    }
  };

  // ترتيب اللجنة values for the بيانات الضباط dropdown, in their presentation order.
  const [categories, setCategories] = useState<OfficerCategory[]>([]);
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // بيانات الضباط filter by لشغل وظيفة. It reads saved values only (drafts stay out until blur),
  // so a row never disappears while its job is being typed.
  const jobOf = (o: any) => String(o.target_job ?? '').trim();
  const jobCounts = new Map<string, number>();
  for (const o of officers) jobCounts.set(jobOf(o), (jobCounts.get(jobOf(o)) ?? 0) + 1);
  const jobOptions = Array.from(jobCounts.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ar'));
  const hasNoJob = jobCounts.has('');
  // A choice that no longer matches any officer (after an edit) falls back to الكل.
  const activeJobFilter =
    jobFilter === NO_JOB ? (hasNoJob ? NO_JOB : ALL_JOBS)
      : jobFilter === ALL_JOBS || jobCounts.has(jobFilter) ? jobFilter : ALL_JOBS;
  const shownOfficers = activeJobFilter === ALL_JOBS
    ? officers
    : officers.filter(o => (activeJobFilter === NO_JOB ? !jobOf(o) : jobOf(o) === activeJobFilter));
  const officersCountLabel = `مجموع الضباط: ${toArabicDigits(shownOfficers.length)}${
    activeJobFilter === ALL_JOBS ? '' : ` من ${toArabicDigits(officers.length)}`
  }`;

  const handleOfficerLagnaChange = async (officerId: number, lagnaTypeC: number) => {
    setOfficers(prev =>
      prev.map(o => (o.officer_id === officerId ? { ...o, l_lagna_type_c: lagnaTypeC } : o))
    );
    try {
      await setOfficerLagnaType(committeeId, officerId, lagnaTypeC);
    } catch {
      fetchOfficers(true);
    }
  };

  // Legacy REC_LAGNA_TYPE_1 range: taraky_c 2..8 shown for every officer.
  const lagnaTypeOptions = lagnaTypes.filter((t: any) => t.taraky_c >= 2 && t.taraky_c <= 8);

  // Remove a wrongly-loaded officer before the session starts. The server also drops the officer
  // from ترتيب العرض, so refresh both lists.
  const handleRemoveOfficer = async (officerId: number, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الضابط "${name}" من اللجنة؟`)) return;
    try {
      await removeCommitteeOfficer(committeeId, officerId);
      await fetchOfficers(true);
      await fetchSessionOfficers();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف الضابط');
    }
  };

  const [sessionOfficers, setSessionOfficers] = useState<any[]>([]);
  const [sessionNotice, setSessionNotice] = useState('');
  const [goSeniority, setGoSeniority] = useState('');
  const [highlightedOfficer, setHighlightedOfficer] = useState<number | null>(null);

  const [sessionStatus, setSessionStatus] = useState<Record<string, any>>({});

  const fetchSessionOfficers = useCallback(async () => {
    const data = await getSessionOfficers(committeeId);
    setSessionOfficers(data);
  }, [committeeId]);

  const fetchSessionStatus = useCallback(async () => {
    try {
      const rows = await getVotingStatus(committeeId);
      const map: Record<string, any> = {};
      // Key per (officer, ta3n_type) so edarya cases don't collide.
      for (const r of rows) map[`${r.officer_id}-${r.ta3n_type ?? 0}`] = r;
      setSessionStatus(map);
    } catch {
      // ignore transient errors
    }
  }, [committeeId]);

  useEffect(() => {
    if (activeTab === 'session') { fetchSessionOfficers(); fetchSessionStatus(); }
  }, [activeTab, fetchSessionOfficers, fetchSessionStatus]);

  const rowMatch = (o: any, officerId: number, ta3nType?: number) =>
    o.officer_id === officerId && (ta3nType == null || o.ta3n_type === ta3nType);

  // Live members' vote tally for a session-officer row (updates via SSE); the breakdown is
  // per the officer's ta3n_type for edarya (mirrors the member tally box).
  const renderTally = (officerId: number, ta3nType?: number) => {
    const s = sessionStatus[`${officerId}-${ta3nType ?? 0}`];
    if (!s) return <span className="text-gray-300">-</span>;
    return (
      <span className="text-xs">
        <span className="text-gray-600">{toArabicDigits(s.voted)}/{toArabicDigits(s.total)}</span>
        {s.voted > 0 && (
          <span className="ms-2">
            <VoteBreakdown committeeType={committee?.committee_type || ''} ta3nType={ta3nType} counts={s.counts} />
          </span>
        )}
      </span>
    );
  };

  const handleFlagToggle = async (officerId: number, field: string, value: boolean, ta3nType?: number) => {
    setSessionOfficers(prev =>
      prev.map(o => (rowMatch(o, officerId, ta3nType) ? { ...o, [field]: value ? 1 : 0 } : o))
    );
    try {
      const body: Record<string, any> = { [field]: value ? 1 : 0 };
      if (ta3nType != null) body.ta3n_type = ta3nType;
      await updateOfficerFlags(committeeId, officerId, body);
    } catch {
      fetchSessionOfficers();
    }
  };

  const handleSetActive = async (officerId: number, ta3nType?: number) => {
    try {
      await setOfficerActive(committeeId, officerId, ta3nType);
      await fetchSessionOfficers();
    } catch (err: any) {
      setSessionNotice(err.response?.data?.error || 'تعذر التحديث');
    }
  };

  // Edarya session sub-forms (apology / notes)
  const [apologyRow, setApologyRow] = useState<any>(null);
  const [apologyReason, setApologyReason] = useState('');
  const [notesRow, setNotesRow] = useState<any>(null);
  const [notesForm, setNotesForm] = useState({ notes_text: '', notes_retirement_date: '', notes_retirement_reason: '' });

  const handleApologyToggle = async (o: any, checked: boolean) => {
    await handleFlagToggle(o.officer_id, 'apology', checked, o.ta3n_type);
    if (checked) {
      setApologyRow(o);
      setApologyReason(o.apology_reason || '');
    }
  };

  const handleSaveApology = async () => {
    await updateJudicialCase(committeeId, apologyRow.officer_id, {
      ta3n_type: apologyRow.ta3n_type,
      apology_reason: apologyReason,
    });
    await fetchSessionOfficers();
    setApologyRow(null);
  };

  const handleNotesToggle = async (o: any, checked: boolean) => {
    await handleFlagToggle(o.officer_id, 'notes', checked, o.ta3n_type);
    if (checked) {
      setNotesRow(o);
      setNotesForm({
        notes_text: o.notes_text || '',
        notes_retirement_date: o.notes_retirement_date || '',
        notes_retirement_reason: o.notes_retirement_reason || '',
      });
    }
  };

  const handleSaveNotes = async () => {
    await updateJudicialCase(committeeId, notesRow.officer_id, {
      ta3n_type: notesRow.ta3n_type,
      ...notesForm,
    });
    await fetchSessionOfficers();
    setNotesRow(null);
  };

  const handleBulk = async (action: string) => {
    setSessionNotice('');
    try {
      await bulkOfficerAction(committeeId, action);
      await fetchSessionOfficers();
    } catch {
      setSessionNotice('فشل تنفيذ الإجراء');
    }
  };

  // بدء من جديد: clear every vote + officer state so the session starts over. Destructive, so it
  // confirms first (a backup is taken server-side), then refreshes the list and the vote counters.
  const handleResetSession = async () => {
    if (!window.confirm('سيتم حذف جميع أصوات وقرارات اللجنة وإعادة الحالة كأن التصويت لم يبدأ.\nلا يمكن التراجع — هل أنت متأكد؟')) return;
    setSessionNotice('');
    try {
      await bulkOfficerAction(committeeId, 'reset-session');
      await fetchData();          // refresh committee status (a completed committee is unlocked to draft)
      await fetchSessionOfficers();
      await fetchSessionStatus();
    } catch {
      setSessionNotice('فشل حذف قرارات اللجنة');
    }
  };

  // حذف تقييمات الأعضاء: clear members' بند scores + votes so the evaluation can be redone (re-open).
  const handleResetEvaluations = async () => {
    if (!window.confirm('سيتم حذف جميع درجات وتقييمات الأعضاء لإعادة التقييم من جديد.\nلا يمكن التراجع — هل أنت متأكد؟')) return;
    setSessionNotice('');
    try {
      await bulkOfficerAction(committeeId, 'reset-evaluations');
      await fetchData();
      await fetchSessionOfficers();
      await fetchSessionStatus();
    } catch {
      setSessionNotice('فشل حذف تقييمات الأعضاء');
    }
  };

  const handleGoSeniority = (direction: 'next' | 'prev' = 'next') => {
    // Seniority is akdam_no + optional akdam_rep letter (e.g. "5 أ"). Either part matches on
    // a partial entry, so "5" finds 5, 15 and 502 and "أ" finds every أ rep — the whole value
    // is never required. Typing both narrows to officers matching each. An exact akdam_no is
    // offered first (the rest keep display order), and next/prev cycles through, wrapping.
    const q = goSeniority.trim();
    const digits = q.replace(/[^\d]/g, '');
    const rep = q.replace(/[\d\s]/g, '').trim();
    if (!digits && !rep) return;
    // A rep can carry a digit of its own (م3), which splitting would tear apart, so the
    // entry is also tried verbatim against the seniority as it reads on screen.
    const seniority = (o: any) =>
      [String(o.akdam_no ?? ''), String(o.akdam_rep ?? '').trim()].filter(Boolean).join(' ');
    const hits = sessionOfficers.filter(o => {
      if (seniority(o).includes(q)) return true;
      if (digits && !String(o.akdam_no ?? '').includes(digits)) return false;
      if (rep && !String(o.akdam_rep ?? '').trim().includes(rep)) return false;
      return true;
    });
    const notExact = (o: any) => (String(o.akdam_no ?? '') === digits ? 0 : 1);
    const matches = digits ? [...hits].sort((a, b) => notExact(a) - notExact(b)) : hits;
    if (matches.length === 0) {
      setHighlightedOfficer(null);
      setSessionNotice('لا يوجد ضابط بهذه الأقدمية');
      return;
    }
    const curIdx = matches.findIndex(o => o.officer_id === highlightedOfficer);
    let nextIdx: number;
    if (curIdx === -1) {
      nextIdx = direction === 'next' ? 0 : matches.length - 1;
    } else {
      nextIdx = direction === 'next'
        ? (curIdx + 1) % matches.length
        : (curIdx - 1 + matches.length) % matches.length;
    }
    const target = matches[nextIdx];
    setSessionNotice(
      matches.length > 1 ? `تطابق ${toArabicDigits(nextIdx + 1)} من ${toArabicDigits(matches.length)}` : ''
    );
    setHighlightedOfficer(target.officer_id);
    document.getElementById(`session-officer-${target.officer_id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  const handleAddMember = async () => {
    setMemberError('');
    if (!memberForm.username.trim() || !memberForm.display_name.trim()) {
      setMemberError('اسم المستخدم واسم العضو مطلوبان');
      return;
    }
    setSavingMember(true);
    try {
      await createCommitteeMember(committeeId, memberForm);
      setShowAddMember(false);
      setMemberForm(emptyMemberForm);
      await fetchData();
    } catch (err: any) {
      setMemberError(err?.response?.data?.error || 'تعذر إضافة العضو');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (userId: number, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف العضو "${name}"؟`)) return;
    try {
      await removeCommitteeMember(committeeId, userId);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف العضو');
    }
  };

  const handleToggleIncluded = async (userId: number, included: boolean) => {
    setMembers(prev => prev.map(m => (m.user_id === userId ? { ...m, included: included ? 1 : 0 } : m)));
    try {
      await setMemberIncluded(committeeId, userId, included);
    } catch {
      setMembers(prev => prev.map(m => (m.user_id === userId ? { ...m, included: included ? 0 : 1 } : m)));
    }
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleMemberDrop = async (dropIndex: number) => {
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === dropIndex) return;
    const reordered = [...members];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    const withSerials = reordered.map((m, i) => ({ ...m, serial: i + 1 }));
    setMembers(withSerials);
    try {
      await reorderMembers(committeeId, withSerials.map(m => m.user_id));
    } catch {
      fetchData();
    }
  };

  // Officers reorder the same way members do, on their own drag index so the two tables
  // never interfere. serial drives every officer query, so the new order also becomes the
  // voting order members see and the order the reports print in.
  const [officerDragIndex, setOfficerDragIndex] = useState<number | null>(null);

  // ترتيب العرض lists the officers in session order: grouped by ترتيب اللجنة category (in the order
  // set on the categories page), المسلسل inside each group.
  const categoryKey = (o: any): number | null => o.category_id ?? null;
  const showCategoryGroups = sessionOfficers.some(o => o.category_id != null);
  const categoryCounts = new Map<number | null, number>();
  sessionOfficers.forEach(o => categoryCounts.set(categoryKey(o), (categoryCounts.get(categoryKey(o)) ?? 0) + 1));

  // A drag reorders officers inside their category only: they trade that category's المسلسل numbers,
  // so no other officer's number changes. The category itself is set in بيانات الضباط.
  const handleOfficerDrop = async (dropIndex: number) => {
    const from = officerDragIndex;
    setOfficerDragIndex(null);
    if (from === null || from === dropIndex) return;
    const moved = sessionOfficers[from];
    const group = categoryKey(moved);
    if (categoryKey(sessionOfficers[dropIndex]) !== group) {
      setSessionNotice('السحب داخل نفس الترتيب فقط — يتغير ترتيب الضابط من تبويب «بيانات الضباط»');
      return;
    }
    const reordered = [...sessionOfficers];
    reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    const slots = reordered.filter(o => categoryKey(o) === group).map(o => o.serial).sort((a, b) => a - b);
    let next = 0;
    const renumbered = reordered.map(o => (categoryKey(o) === group ? { ...o, serial: slots[next++] } : o));
    setSessionOfficers(renumbered);
    setSessionNotice('');
    try {
      await reorderOfficers(
        committeeId,
        [...renumbered]
          .sort((a, b) => a.serial - b.serial)
          .map(o => ({ officer_id: o.officer_id, ta3n_type: o.ta3n_type ?? null }))
      );
    } catch {
      setSessionNotice('فشل تحديث الترتيب');
      fetchSessionOfficers();
    }
  };

  // --- Edarya officer registration ---
  // Single committee type now — the admin only ever sees the tagdded tab set.
  const isEdarya = committee?.committee_type === 'edarya';
  const tabs = TAGDDED_TABS;

  const [ta3nTypes, setTa3nTypes] = useState<any[]>([]);
  const [registered, setRegistered] = useState<any[]>([]);
  const [searchAkdam, setSearchAkdam] = useState('');
  const [searchMilitary, setSearchMilitary] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [regTa3nType, setRegTa3nType] = useState('');
  const [regNotice, setRegNotice] = useState('');

  useEffect(() => {
    if (isEdarya) getTa3nTypes().then(setTa3nTypes);
  }, [isEdarya]);

  const fetchRegistered = useCallback(async () => {
    const data = await getRegisteredOfficers(committeeId);
    setRegistered(data);
  }, [committeeId]);

  useEffect(() => {
    if (activeTab === 'registration') fetchRegistered();
  }, [activeTab, fetchRegistered]);

  const handleSearchOfficers = async () => {
    setRegNotice('');
    try {
      const data = await searchOfficers({ akdam_no: searchAkdam, person_id: searchMilitary });
      setSearchResults(data);
      if (!data.length) setRegNotice('لا يوجد ضباط بهذا البحث');
    } catch (err: any) {
      setRegNotice(err.response?.data?.error || 'فشل البحث');
    }
  };

  const handleRegister = async (officerId: number) => {
    if (!regTa3nType) {
      setRegNotice('اختر سبب العرض أولاً');
      return;
    }
    try {
      await registerOfficer(committeeId, { officer_id: officerId, ta3n_type: Number(regTa3nType) });
      await fetchRegistered();
      setRegNotice('تم تسجيل الضابط');
    } catch (err: any) {
      setRegNotice(err.response?.data?.error || 'فشل التسجيل');
    }
  };

  const handleRemoveRegistered = async (officerId: number, ta3nType: number) => {
    try {
      await removeRegisteredOfficer(committeeId, officerId, ta3nType);
      await fetchRegistered();
    } catch {
      setRegNotice('فشل الحذف');
    }
  };

  // --- Edarya judicial officer data ---
  const [judicialOfficers, setJudicialOfficers] = useState<any[]>([]);
  const [caseOfficer, setCaseOfficer] = useState<any>(null);
  const [nafsyOfficer, setNafsyOfficer] = useState<any>(null);
  const [nafsyText, setNafsyText] = useState('');
  const [savingNafsy, setSavingNafsy] = useState(false);

  const fetchJudicialOfficers = useCallback(async () => {
    const data = await getJudicialOfficers(committeeId);
    setJudicialOfficers(data);
  }, [committeeId]);

  useEffect(() => {
    if (isEdarya && activeTab === 'officers') fetchJudicialOfficers();
  }, [isEdarya, activeTab, fetchJudicialOfficers]);

  // Realtime: refetch the data behind the active tab whenever the DB changes.
  useLiveUpdates(() => {
    fetchData();
    if (activeTab === 'officers') {
      if (isEdarya) fetchJudicialOfficers(); else fetchOfficers(true);
    } else if (activeTab === 'session') {
      fetchSessionOfficers();
      fetchSessionStatus();
    } else if (activeTab === 'registration') {
      fetchRegistered();
    }
  });

  const openNafsy = (o: any) => {
    setNafsyOfficer(o);
    setNafsyText(o.nafsy || '');
  };

  const handleSaveNafsy = async () => {
    setSavingNafsy(true);
    try {
      await updateJudicialCase(committeeId, nafsyOfficer.officer_id, {
        ta3n_type: nafsyOfficer.ta3n_type,
        nafsy: nafsyText,
      });
      await fetchJudicialOfficers();
      setNafsyOfficer(null);
    } finally {
      setSavingNafsy(false);
    }
  };

  const [calculating, setCalculating] = useState(false);
  const handleCalculate = async () => {
    setCalculating(true);
    try {
      await calculateDecisions(committeeId);
      await fetchData();
    } finally {
      setCalculating(false);
    }
  };

  const [togglingSession, setTogglingSession] = useState(false);
  const handleToggleSession = async () => {
    setTogglingSession(true);
    try {
      if (committee.is_active) await deactivateCommittee(committeeId);
      else await activateCommittee(committeeId);
      await fetchData();
    } finally {
      setTogglingSession(false);
    }
  };

  // إنهاء اللجنة: finalize decisions, take a backup, and lock the committee (status → completed,
  // session stopped). Irreversible, so it is confirmed first.
  const [completing, setCompleting] = useState(false);
  const handleComplete = async () => {
    if (!window.confirm('هل أنت متأكد من إنهاء اللجنة؟\nسيتم احتساب القرارات النهائية وقفل اللجنة نهائياً، ولا يمكن التراجع.')) return;
    setCompleting(true);
    try {
      await completeCommittee(committeeId);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر إنهاء اللجنة');
    } finally {
      setCompleting(false);
    }
  };

  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!window.confirm('هل أنت متأكد من حذف هذه اللجنة؟\nسيتم حذف جميع بياناتها ولا يمكن التراجع.')) return;
    setDeleting(true);
    try {
      await deleteCommittee(committeeId);
      navigate('/admin/committees');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف اللجنة');
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;
  if (!committee) return <div className="card text-center py-10 text-gray-400">اللجنة غير موجودة</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title mb-0">تفاصيل اللجنة</h2>
        <div className="flex items-center gap-2">
          {committee.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-blue-100 text-blue-800 font-bold border border-blue-300">
              ✓ اللجنة منتهية
            </span>
          ) : (
            <button
              onClick={handleToggleSession}
              disabled={togglingSession}
              className={`text-sm px-4 py-2 rounded-lg text-white disabled:opacity-50 ${
                committee.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {togglingSession ? '...' : committee.is_active ? 'إيقاف اللجنة' : 'بدء الجلسة'}
            </button>
          )}
          {committee.status !== 'completed' && (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="text-sm px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {completing ? 'جارٍ الإنهاء...' : 'إنهاء اللجنة'}
            </button>
          )}
          {!committee.is_active && committee.status !== 'completed' && (
            <Link to={`/admin/committees/${committeeId}/edit`} className="btn-secondary text-sm">تعديل</Link>
          )}
          {!committee.is_active && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'جارٍ الحذف...' : 'حذف اللجنة'}
            </button>
          )}
          <Link to={`/admin/committees/${committeeId}/monitor`} className="btn-secondary text-sm">مراقبة التصويت</Link>
          <Link to={`/admin/committees/${committeeId}/member-scores`} className="btn-secondary text-sm">موقف تقييم الأعضاء</Link>
          <Link to={`/admin/committees/${committeeId}/decisions`} className="btn-secondary text-sm">مراجعة القرارات</Link>
          <Link to="/admin/committees" className="btn-secondary text-sm">العودة للقائمة</Link>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-lg font-bold">لجنة التمثيل العسكري</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusColors[committee.status]}`}>
            {committee.status === 'completed' ? '✓ ' : ''}{statusLabels[committee.status]}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500">مسلسل: </span>{toArabicDigits(committee.id)}</div>
          <div><span className="text-gray-500">العام التدريبي: </span>{committee.training_year != null ? toArabicDigits(committee.training_year) : 'غير محدد'}</div>
          <div>
            <span className="text-gray-500">بداية اللجنة: </span>
            {formatDate(committee.lagna_date) || 'غير محدد'}
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6 flex gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'members' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              عدد الأعضاء: {toArabicDigits(members.length)}
            </p>
            {!committee.is_active && (
              <button
                onClick={() => { setMemberForm(emptyMemberForm); setMemberError(''); setShowAddMember(true); }}
                className="btn-primary text-sm"
              >
                إضافة عضو
              </button>
            )}
          </div>

          {members.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              لا يوجد أعضاء
            </div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="w-8 px-2 py-3"></th>
                    <th className="px-4 py-3 font-medium">إسم المستخدم</th>
                    <th className="px-4 py-3 font-medium">الرتبة</th>
                    <th className="px-4 py-3 font-medium">إسم الضابط</th>
                    <th className="px-4 py-3 font-medium">الوظيفة</th>
                    <th className="px-4 py-3 font-medium text-center">داخل اللجنة</th>
                    <th className="px-4 py-3 font-medium text-center">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr
                      key={m.user_id}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleMemberDrop(i)}
                      className={`border-b border-gray-100 last:border-0 cursor-move ${
                        dragIndex === i ? 'opacity-40' : ''
                      }`}
                    >
                      <td className="px-2 py-3 text-gray-300" title="اسحب لإعادة الترتيب">
                        <DragHandle />
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{m.username}</td>
                      <td className="px-4 py-3">{toArabicDigits(m.rank_name) || '-'}</td>
                      <td className="px-4 py-3">{toArabicDigits(m.officer_name) || '-'}</td>
                      <td className="px-4 py-3">{toArabicDigits(m.job_title) || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={m.included === 1}
                          onChange={e => handleToggleIncluded(m.user_id, e.target.checked)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!committee.is_active ? (
                          <button
                            onClick={() => handleRemoveMember(m.user_id, m.officer_name || m.username)}
                            className="text-red-600 hover:text-red-700 text-xs"
                          >
                            حذف
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showAddMember && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddMember(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                  <h3 className="font-bold">إضافة عضو جديد</h3>
                  <button onClick={() => setShowAddMember(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div className="p-5 space-y-3">
                  {memberError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{memberError}</div>
                  )}
                  <div>
                    <label className="label">اسم المستخدم <span className="text-red-500">*</span></label>
                    <input
                      value={memberForm.username}
                      onChange={e => setMemberForm(p => ({ ...p, username: e.target.value }))}
                      className="input-field" dir="ltr" placeholder="مثال: EVAL11"
                    />
                  </div>
                  <div>
                    <label className="label">اسم العضو <span className="text-red-500">*</span></label>
                    <input
                      value={memberForm.display_name}
                      onChange={e => setMemberForm(p => ({ ...p, display_name: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="label">الرتبة</label>
                    <select
                      value={memberForm.rank_name}
                      onChange={e => setMemberForm(p => ({ ...p, rank_name: e.target.value }))}
                      className="input-field"
                    >
                      <option value="">اختر...</option>
                      {ranks.map((r: any) => (
                        <option key={r.ran_c} value={r.ran_n}>{r.ran_n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">الوظيفة</label>
                    <input
                      value={memberForm.job_title}
                      onChange={e => setMemberForm(p => ({ ...p, job_title: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                  <button onClick={handleAddMember} disabled={savingMember} className="btn-primary text-sm">
                    {savingMember ? 'جاري الحفظ...' : 'إضافة'}
                  </button>
                  <button onClick={() => setShowAddMember(false)} className="btn-secondary text-sm">إلغاء</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'officers' && !isEdarya && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            {officers.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span className="font-medium">لشغل وظيفة</span>
                <select
                  value={activeJobFilter}
                  onChange={e => setJobFilter(e.target.value)}
                  className="input-field w-auto min-w-[16rem] py-1.5 text-sm"
                >
                  <option value={ALL_JOBS}>الكل ({toArabicDigits(officers.length)})</option>
                  {jobOptions.map(job => (
                    <option key={job} value={job}>
                      {toArabicDigits(job)} ({toArabicDigits(jobCounts.get(job) ?? 0)})
                    </option>
                  ))}
                  {hasNoJob && (
                    <option value={NO_JOB}>غير محدد ({toArabicDigits(jobCounts.get('') ?? 0)})</option>
                  )}
                </select>
              </label>
            )}
            <p className="text-sm text-gray-500">{officersCountLabel}</p>
            {categories.length === 0 && (
              <p className="w-full text-sm text-gray-500">
                لا توجد قيم في ترتيب اللجنة بعد — أضفها من صفحة{' '}
                <Link to="/admin/categories" className="font-medium text-blue-700 hover:underline">ترتيب اللجنة</Link>.
              </p>
            )}
          </div>

          {officers.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">لا يوجد ضباط</div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="px-4 py-3 font-medium">م</th>
                    <th className="px-4 py-3 font-medium">الأقدمية</th>
                    <th className="px-4 py-3 font-medium">إسم الضابط</th>
                    <th className="px-4 py-3 font-medium">ترتيب اللجنة</th>
                    <th className="px-4 py-3 font-medium">لشغل وظيفة</th>
                    <th className="px-4 py-3 font-medium">تاريخ المقابلة</th>
                    <th className="px-4 py-3 font-medium text-center">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {shownOfficers.map(o => (
                    <tr key={o.officer_id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3">{toArabicDigits(o.serial)}</td>
                      <td className="px-4 py-3">
                        {[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={o.category_id ?? ''}
                          onChange={e => handleOfficerField(o.officer_id, 'category_id', e.target.value === '' ? null : Number(e.target.value))}
                          className="input-field py-1 text-sm min-w-[10rem]"
                        >
                          <option value="">— بدون —</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{toArabicDigits(c.name)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={jobDrafts[o.officer_id] ?? o.target_job ?? ''}
                          onChange={e => setJobDrafts(d => ({ ...d, [o.officer_id]: e.target.value }))}
                          onBlur={e => {
                            const value = e.target.value;
                            setJobDrafts(d => {
                              const next = { ...d };
                              delete next[o.officer_id];
                              return next;
                            });
                            handleOfficerField(o.officer_id, 'target_job', value);
                          }}
                          className="input-field py-1 text-sm min-w-[12rem]"
                          placeholder="مثال: ملحق دفاع سول"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <ArabicDate
                          value={o.interview_date || ''}
                          onChange={v => handleOfficerField(o.officer_id, 'interview_date', v)}
                          className="min-w-[10rem]"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!committee.is_active && committee.status !== 'completed' ? (
                          <button
                            onClick={() => handleRemoveOfficer(
                              o.officer_id,
                              [o.rank_name, o.officer_name].filter(Boolean).join(' / ')
                            )}
                            className="text-red-600 hover:text-red-700 text-xs"
                          >
                            حذف
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 text-gray-600">
                    <td className="px-4 py-3 font-medium" colSpan={7}>
                      {officersCountLabel}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'items' && (
        <div className="max-w-4xl">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm text-gray-500">
              البنود التي يقيّم عليها الأعضاء، بترتيب ظهورها لهم. غيّر الترتيب بسحب الصف أو بالأسهم.
              بندا «مسير الخدمة» و«لغة إنجليزية» محسوبان فلا يُعدَّلان ولا يُحذفان، ولا يُحذف بند سجّل عليه الأعضاء درجات.
            </p>
            <button onClick={reloadItemsTemplate} disabled={itemsBusy} className="btn-secondary text-sm">تحميل البنود (من القالب)</button>
          </div>
          {itemsMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{itemsMsg}</div>}
          {itemsError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{itemsError}</div>}

          <form onSubmit={addItem} className="card mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <label htmlFor="new-eval-item" className="label">إضافة بند جديد</label>
              <input
                id="new-eval-item"
                className="input-field"
                value={newItem.name}
                onChange={e => setNewItem(v => ({ ...v, name: e.target.value }))}
                placeholder="مثال: الثقة بالنفس"
              />
            </div>
            <div className="w-32">
              <label htmlFor="new-eval-item-max" className="label">الحد الأقصى</label>
              <input
                id="new-eval-item-max"
                className="input-field text-center"
                inputMode="numeric"
                value={toArabicDigits(newItem.max)}
                onChange={e => setNewItem(v => ({ ...v, max: toWesternDigits(e.target.value).replace(/[^0-9.]/g, '') }))}
              />
            </div>
            <button
              type="submit"
              disabled={itemsBusy || !newItem.name.trim() || !(Number(newItem.max) > 0)}
              className="btn-primary disabled:opacity-50"
            >
              إضافة
            </button>
          </form>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600 text-right">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-4 py-3 font-medium">م</th>
                  <th className="px-4 py-3 font-medium">بند التقييم</th>
                  <th className="px-4 py-3 font-medium">الحد الأقصى</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">ترتيب العرض</th>
                  <th className="px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {evalItems.map((it, i) => {
                  const computed = it.kind === 'computed';
                  const edit = itemEdit?.id === it.id ? itemEdit : null;
                  const orderButton = 'rounded border border-gray-300 px-2 py-0.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30';
                  return (
                    <tr
                      key={it.id}
                      draggable={!itemEdit && !itemsBusy}
                      onDragStart={() => setItemDragIndex(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => { if (itemDragIndex !== null) moveItem(itemDragIndex, i); setItemDragIndex(null); }}
                      onDragEnd={() => setItemDragIndex(null)}
                      className={`border-b border-gray-100 last:border-0 ${!itemEdit ? 'cursor-move' : ''} ${itemDragIndex === i ? 'opacity-40' : ''}`}
                    >
                      <td className="px-2 py-2 text-gray-300" title="اسحب لتغيير الترتيب"><DragHandle /></td>
                      <td className="px-4 py-2 font-bold text-gray-500">{toArabicDigits(i + 1)}</td>
                      <td className="px-4 py-2">
                        {edit ? (
                          <input
                            autoFocus
                            className="input-field py-1 text-sm min-w-[14rem]"
                            value={edit.name}
                            onChange={e => setItemEdit(v => (v ? { ...v, name: e.target.value } : v))}
                            onKeyDown={e => { if (e.key === 'Enter') saveItemEdit(); if (e.key === 'Escape') setItemEdit(null); }}
                          />
                        ) : (
                          <span className="font-medium text-gray-900">{toArabicDigits(it.name)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {edit ? (
                          <input
                            className="input-field py-1 text-sm w-24 text-center"
                            inputMode="numeric"
                            value={toArabicDigits(edit.max)}
                            onChange={e => setItemEdit(v => (v ? { ...v, max: toWesternDigits(e.target.value).replace(/[^0-9.]/g, '') } : v))}
                            onKeyDown={e => { if (e.key === 'Enter') saveItemEdit(); if (e.key === 'Escape') setItemEdit(null); }}
                          />
                        ) : (
                          toArabicDigits(it.max_degree)
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {computed
                          ? <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">محسوب</span>
                          : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">يدوي</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => moveItem(i, i - 1)} disabled={itemsBusy || !!itemEdit || i === 0} title="تقديم" aria-label="تقديم" className={orderButton}>▲</button>
                          <button onClick={() => moveItem(i, i + 1)} disabled={itemsBusy || !!itemEdit || i === evalItems.length - 1} title="تأخير" aria-label="تأخير" className={orderButton}>▼</button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {computed ? (
                          <span className="text-xs text-gray-400">ثابت</span>
                        ) : edit ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveItemEdit}
                              disabled={itemsBusy || !edit.name.trim() || !(Number(edit.max) > 0)}
                              className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
                            >
                              حفظ
                            </button>
                            <button onClick={() => setItemEdit(null)} disabled={itemsBusy} className="btn-secondary px-3 py-1 text-xs">إلغاء</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setItemEdit({ id: it.id, name: it.name || '', max: String(it.max_degree ?? '') }); setItemsMsg(''); setItemsError(''); }}
                              disabled={itemsBusy || !!itemEdit}
                              className="text-blue-700 hover:underline disabled:text-gray-300 disabled:no-underline"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => removeItem(it)}
                              disabled={itemsBusy || !!itemEdit || it.scored > 0}
                              title={it.scored > 0 ? 'سجّل الأعضاء درجات على هذا البند — لا يمكن حذفه' : undefined}
                              className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                            >
                              حذف
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
                  <td className="px-4 py-2" colSpan={3}>المجموع الأقصى</td>
                  <td className="px-4 py-2">{toArabicDigits(evalItems.reduce((s, it) => s + (Number(it.max_degree) || 0), 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'session' && !isEdarya && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => handleBulk('done-all')} className="btn-secondary text-sm">تم الكل</button>
              <button onClick={() => handleBulk('reset-done')} className="btn-secondary text-sm">حذف تم</button>
              <button onClick={() => handleBulk('hide-all')} className="btn-secondary text-sm">اخفاء الكل</button>
              <button onClick={handleResetEvaluations} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">حذف تقييمات الأعضاء</button>
              <button onClick={handleResetSession} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">حذف قرارات اللجنة</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={toArabicDigits(goSeniority)}
                onChange={e => setGoSeniority(toWesternDigits(e.target.value))}
                placeholder="الأقدمية مثل ٥ أ"
                className="input-field py-1 text-sm w-28"
              />
              <button onClick={() => handleGoSeniority('next')} className="btn-secondary text-sm">ذهاب</button>
              <button onClick={() => handleGoSeniority('prev')} className="btn-secondary text-sm">السابق</button>
            </div>
          </div>

          {sessionNotice && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm mb-4">
              {sessionNotice}
            </div>
          )}

          {sessionOfficers.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              لا يوجد ضباط
            </div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="w-8 px-2 py-3"></th>
                    <th className="px-3 py-3 font-medium">المسلسل</th>
                    <th className="px-3 py-3 font-medium">الأقدمية</th>
                    <th className="px-3 py-3 font-medium">إسم الضابط</th>
                    <th className="px-3 py-3 font-medium text-center">الحالي</th>
                    <th className="px-3 py-3 font-medium text-center">منتظر حضور</th>
                    <th className="px-3 py-3 font-medium text-center">اعتذار</th>
                    <th className="px-3 py-3 font-medium text-center">تم</th>
                    <th className="px-3 py-3 font-medium text-center">إخفاء</th>
                    <th className="px-3 py-3 font-medium text-center">التصويت</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionOfficers.map((o, i) => (
                    <Fragment key={o.officer_id}>
                      {showCategoryGroups && (i === 0 || categoryKey(sessionOfficers[i - 1]) !== categoryKey(o)) && (
                        <tr className="border-b border-indigo-100 bg-indigo-50">
                          <td colSpan={10} className="px-3 py-2">
                            <span className="font-bold text-indigo-900">
                              {o.category_name ? toArabicDigits(o.category_name) : 'بدون ترتيب'}
                            </span>
                            <span className="ms-2 text-xs text-indigo-700">
                              ({toArabicDigits(categoryCounts.get(categoryKey(o)) ?? 0)} ضابط)
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr
                        id={`session-officer-${o.officer_id}`}
                        draggable
                        onDragStart={() => setOfficerDragIndex(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleOfficerDrop(i)}
                        className={`border-b border-gray-100 last:border-0 cursor-move ${
                          officerDragIndex === i ? 'opacity-40' : ''
                        } ${highlightedOfficer === o.officer_id ? 'bg-yellow-50' : ''}`}
                      >
                        <td className="px-2 py-2 text-gray-300" title="اسحب لإعادة الترتيب">
                          <DragHandle />
                        </td>
                        <td className="px-3 py-2">{toArabicDigits(o.serial)}</td>
                        <td className="px-3 py-2">
                          {[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="radio"
                            name="active-officer"
                            checked={o.is_active === 1}
                            onChange={() => handleSetActive(o.officer_id)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={o.attendance === 0}
                            onChange={e => handleFlagToggle(o.officer_id, 'attendance', !e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={o.apology === 1}
                            onChange={e => handleFlagToggle(o.officer_id, 'apology', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={o.done === 1}
                            onChange={e => handleFlagToggle(o.officer_id, 'done', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={o.hidden === 1}
                            onChange={e => handleFlagToggle(o.officer_id, 'hidden', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">{renderTally(o.officer_id)}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="card">
          {/* احتساب النتائج hidden (results are computed live):
          {committee.committee_type === 'tagdded' && (
            <div className="mb-4 flex items-center gap-3">
              <button onClick={handleCalculate} disabled={calculating} className="btn-primary text-sm">
                {calculating ? 'جاري الاحتساب...' : 'احتساب النتائج'}
              </button>
              <span className="text-xs text-gray-500">يحتسب قرار اللجنة لكل ضابط من أصوات الأعضاء</span>
            </div>
          )}
          */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/member-scores-card`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              بطاقة تقييم أعضاء اللجنة
            </button>
            {/* Reports temporarily hidden (restore when needed):
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/voting-summary`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              ملخص تصويت الأعضاء لكل ضابط
            </button>
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/members`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              أعضاء اللجنة
            </button>
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/eval-details`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              تفاصيل تقييم الضباط بالمشروع
            </button>
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/not-mstawfy`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              الضباط الغير مستوفين وتم استمرارهم
            </button>
            <button
              onClick={() => window.open(`/print/committee/${committeeId}/statistics`, '_blank')}
              className="btn-primary text-sm text-right"
            >
              إحصائيات اللجنة
            </button>
            */}
          </div>
          {/* Note hidden with the "الغير مستوفين" report:
          <p className="text-xs text-gray-400 mt-4">
            يعتمد تقرير "الغير مستوفين" على حالة الاستيفاء المحسوبة تلقائياً وقرار اللجنة بعد الاحتساب
          </p>
          */}
        </div>
      )}

      {activeTab === 'registration' && (
        <div>
          <div className="card mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">سبب العرض</label>
                <select
                  value={regTa3nType}
                  onChange={e => setRegTa3nType(e.target.value)}
                  className="input-field text-sm min-w-[12rem]"
                >
                  <option value="">اختر...</option>
                  {ta3nTypes.map((t: any) => (
                    <option key={t.ta3n_type_c} value={t.ta3n_type_c}>{t.ta3n_type_n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">الأقدمية</label>
                <input
                  value={toArabicDigits(searchAkdam)}
                  onChange={e => setSearchAkdam(toWesternDigits(e.target.value))}
                  className="input-field text-sm w-28"
                  placeholder="رقم الأقدمية"
                />
              </div>
              <div>
                <label className="label">الرقم العسكري</label>
                <input
                  value={toArabicDigits(searchMilitary)}
                  onChange={e => setSearchMilitary(toWesternDigits(e.target.value))}
                  className="input-field text-sm w-32"
                  placeholder="الرقم العسكري"
                />
              </div>
              <button onClick={handleSearchOfficers} className="btn-primary text-sm">بحث</button>
            </div>

            {regNotice && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm mt-3">
                {regNotice}
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="overflow-x-auto mt-4 border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600 text-right">
                      <th className="px-4 py-2 font-medium">إسم الضابط</th>
                      <th className="px-4 py-2 font-medium">الأقدمية</th>
                      <th className="px-4 py-2 font-medium">الوحدة</th>
                      <th className="px-4 py-2 font-medium">الوظيفة</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(o => (
                      <tr key={o.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2">{toArabicDigits([o.rank_name, o.per_name].filter(Boolean).join(' / '))}</td>
                        <td className="px-4 py-2">{[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</td>
                        <td className="px-4 py-2">{toArabicDigits(o.unit_name) || '-'}</td>
                        <td className="px-4 py-2">{toArabicDigits(o.job_name) || '-'}</td>
                        <td className="px-4 py-2 text-left">
                          <button onClick={() => handleRegister(o.id)} className="btn-primary text-xs">
                            إضافة
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">الضباط المسجلون</h3>
            <span className="text-sm text-gray-500">العدد: {toArabicDigits(registered.length)}</span>
          </div>
          {registered.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">لا يوجد ضباط مسجلون</div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="px-4 py-3 font-medium">م</th>
                    <th className="px-4 py-3 font-medium">إسم الضابط</th>
                    <th className="px-4 py-3 font-medium">الأقدمية</th>
                    <th className="px-4 py-3 font-medium">سبب العرض</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {registered.map(o => (
                    <tr key={`${o.officer_id}-${o.ta3n_type}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3">{toArabicDigits(o.serial)}</td>
                      <td className="px-4 py-3">{toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}</td>
                      <td className="px-4 py-3">{[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</td>
                      <td className="px-4 py-3">{o.ta3n_type_n || '-'}</td>
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => handleRemoveRegistered(o.officer_id, o.ta3n_type)}
                          className="text-red-600 hover:text-red-700 text-xs"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'officers' && isEdarya && (
        <div>
          {judicialOfficers.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              لا يوجد ضباط - سجّل الضباط من تبويب "تسجيل الضباط"
            </div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="px-4 py-3 font-medium">م</th>
                    <th className="px-4 py-3 font-medium">إسم الضابط</th>
                    <th className="px-4 py-3 font-medium">الأقدمية</th>
                    <th className="px-4 py-3 font-medium">سبب العرض</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {judicialOfficers.map(o => (
                    <tr key={`${o.officer_id}-${o.ta3n_type}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3">{toArabicDigits(o.serial)}</td>
                      <td className="px-4 py-3">{toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}</td>
                      <td className="px-4 py-3">{[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</td>
                      <td className="px-4 py-3">{o.ta3n_type_n || '-'}</td>
                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <button onClick={() => setCaseOfficer(o)} className="btn-secondary text-xs">
                          تفاصيل
                        </button>
                        <button onClick={() => openNafsy(o)} className="btn-secondary text-xs mr-2">
                        رأي جهاز العامل النفسي
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nafsyOfficer && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setNafsyOfficer(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                  <div>
                    <h3 className="font-bold">رأى مركز الشئون النفسية</h3>
                    <p className="text-xs text-gray-500">
                      {toArabicDigits([nafsyOfficer.rank_name, nafsyOfficer.officer_name].filter(Boolean).join(' / '))}
                    </p>
                  </div>
                  <button onClick={() => setNafsyOfficer(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div className="p-5">
                  <textarea
                    value={nafsyText}
                    onChange={e => setNafsyText(e.target.value)}
                    className="input-field"
                    rows={6}
                    maxLength={2500}
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                  <button onClick={handleSaveNafsy} disabled={savingNafsy} className="btn-primary text-sm">
                    {savingNafsy ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                  <button onClick={() => setNafsyOfficer(null)} className="btn-secondary text-sm">إغلاق</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'session' && isEdarya && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => handleBulk('reset-done')} className="btn-secondary text-sm">حذف تم</button>
              <button onClick={handleResetSession} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">حذف قرارات اللجنة</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={toArabicDigits(goSeniority)}
                onChange={e => setGoSeniority(toWesternDigits(e.target.value))}
                placeholder="الأقدمية مثل ٥ أ"
                className="input-field py-1 text-sm w-28"
              />
              <button onClick={() => handleGoSeniority('next')} className="btn-secondary text-sm">ذهاب</button>
              <button onClick={() => handleGoSeniority('prev')} className="btn-secondary text-sm">السابق</button>
            </div>
          </div>

          {sessionNotice && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm mb-4">
              {sessionNotice}
            </div>
          )}

          {sessionOfficers.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">
              لا يوجد ضباط - سجّل الضباط من تبويب "تسجيل الضباط"
            </div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600 text-right">
                    <th className="w-8 px-2 py-3"></th>
                    <th className="px-3 py-3 font-medium">المسلسل</th>
                    <th className="px-3 py-3 font-medium">الأقدمية</th>
                    <th className="px-3 py-3 font-medium">إسم الضابط</th>
                    <th className="px-3 py-3 font-medium text-center">منتظر</th>
                    <th className="px-3 py-3 font-medium text-center">تم</th>
                    <th className="px-3 py-3 font-medium text-center">الإعتذار</th>
                    <th className="px-3 py-3 font-medium text-center">الملحوظة</th>
                    <th className="px-3 py-3 font-medium text-center">التصويت</th>
                    <th className="px-3 py-3 font-medium text-center">النتيجة</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionOfficers.map((o, i) => (
                    <tr
                      key={`${o.officer_id}-${o.ta3n_type}`}
                      id={`session-officer-${o.officer_id}`}
                      draggable
                      onDragStart={() => setOfficerDragIndex(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleOfficerDrop(i)}
                      className={`border-b border-gray-100 last:border-0 cursor-move ${
                        officerDragIndex === i ? 'opacity-40' : ''
                      } ${highlightedOfficer === o.officer_id ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-2 py-2 text-gray-300" title="اسحب لإعادة الترتيب">
                        <DragHandle />
                      </td>
                      <td className="px-3 py-2">{toArabicDigits(o.serial)}</td>
                      <td className="px-3 py-2">{[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</td>
                      <td className="px-3 py-2">{toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name="edarya-active-officer"
                          checked={o.is_active === 1}
                          onChange={() => handleSetActive(o.officer_id, o.ta3n_type)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={o.done === 1}
                          onChange={e => handleFlagToggle(o.officer_id, 'done', e.target.checked, o.ta3n_type)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={o.apology === 1}
                          onChange={e => handleApologyToggle(o, e.target.checked)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={o.notes === 1}
                          onChange={e => handleNotesToggle(o, e.target.checked)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">{renderTally(o.officer_id, o.ta3n_type)}</td>
                      <td className={`px-3 py-2 text-center text-xs whitespace-nowrap ${
                        o.result_code == null ? 'text-gray-500' : 'text-gray-900'
                      }`}>
                        {toArabicDigits(o.result) || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {apologyRow && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setApologyRow(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="border-b border-gray-200 px-5 py-3 font-bold">سبب الإعتذار</div>
                <div className="p-5">
                  <textarea value={apologyReason} onChange={e => setApologyReason(e.target.value)} className="input-field" rows={4} maxLength={100} />
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                  <button onClick={handleSaveApology} className="btn-primary text-sm">حفظ</button>
                  <button onClick={() => setApologyRow(null)} className="btn-secondary text-sm">إغلاق</button>
                </div>
              </div>
            </div>
          )}

          {notesRow && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setNotesRow(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="border-b border-gray-200 px-5 py-3 font-bold">ملاحظات</div>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="label">تاريخ الإحالة</label>
                    <ArabicDate value={notesForm.notes_retirement_date}
                      onChange={v => setNotesForm(p => ({ ...p, notes_retirement_date: v }))}
                      className="max-w-xs" />
                  </div>
                  <div>
                    <label className="label">سبب الإحالة</label>
                    <select value={notesForm.notes_retirement_reason}
                      onChange={e => setNotesForm(p => ({ ...p, notes_retirement_reason: e.target.value }))}
                      className="input-field">
                      <option value="">اختر...</option>
                      {/* The value is persisted as written (المادة 109); only the label converts. */}
                      {NOTES_RETIREMENT_REASONS.map(r => <option key={r} value={r}>{toArabicDigits(r)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">ملاحظات</label>
                    <textarea value={notesForm.notes_text}
                      onChange={e => setNotesForm(p => ({ ...p, notes_text: e.target.value }))}
                      className="input-field" rows={4} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
                  <button onClick={handleSaveNotes} className="btn-primary text-sm">حفظ</button>
                  <button onClick={() => setNotesRow(null)} className="btn-secondary text-sm">إغلاق</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'service-scores' && !isEdarya && (
        <CommitteeServiceScores committeeId={committeeId} />
      )}

    </div>
  );
}
