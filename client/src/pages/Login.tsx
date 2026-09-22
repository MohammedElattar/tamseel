import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getQuickMembers } from '../api/auth';
import { toArabicDigits } from '../utils/format';
import { useLiveUpdates } from '../hooks/useLiveUpdates';

interface Seat {
  id: number;
  display_name: string;
  job_title: string | null;
  username: string;
  is_guest?: boolean;
}

export default function Login() {
  const [members, setMembers] = useState<Seat[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, quickLogin } = useAuth();
  const navigate = useNavigate();

  // The seat list must reflect the active committee the moment the admin starts a
  // session. The shared WebSocket now accepts pre-login (token-less) connections and
  // pushes a signal on every DB change, so refetch on push for near-instant updates.
  // A slow poll stays as a safety net for any missed push.
  const loadSeats = useCallback(() => {
    getQuickMembers()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, []);

  useLiveUpdates(loadSeats);

  useEffect(() => {
    loadSeats();
    const t = setInterval(loadSeats, 15000);
    return () => clearInterval(t);
  }, [loadSeats]);

  const seats = members.filter(m => !m.is_guest);
  const guests = members.filter(m => m.is_guest);

  const handleSeat = async (id: number) => {
    setError('');
    setBusyId(id);
    try {
      await quickLogin(id);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'فشل تسجيل الدخول');
      setBusyId(null);
    }
  };

  // شاشة التصويت: a spectator display (officer data + who hasn't voted). Entered straight from
  // the login through the زائر seat (no vote, no decisions), so no member seat is taken.
  const [openingDisplay, setOpeningDisplay] = useState(false);
  const handleVotingScreen = async () => {
    const guest = members.find(m => m.is_guest);
    if (!guest) { setError('حساب العرض (زائر) غير متاح حالياً'); return; }
    setError('');
    setOpeningDisplay(true);
    try {
      await quickLogin(guest.id);
      navigate('/member/voting-screen');
    } catch (err: any) {
      setError(err.response?.data?.error || 'تعذر فتح شاشة التصويت');
      setOpeningDisplay(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900 mb-1">قيادة القوات البحرية</h1>
          <p className="text-gray-600 font-medium">فرع شئون ضباط</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {!showAdmin ? (
          <div>
            {/* شاشة التصويت: a spectator display of the officer under vote + who hasn't voted yet,
                opened without taking a member seat (via the زائر account). */}
            <button
              onClick={handleVotingScreen}
              disabled={openingDisplay || busyId !== null}
              className="mb-5 w-full rounded-xl bg-blue-900 px-4 py-3 text-lg font-bold text-white shadow transition-colors hover:bg-blue-800 disabled:opacity-50"
            >
              {openingDisplay ? 'جاري الفتح...' : 'شاشة التصويت'}
            </button>
            <h2 className="text-sm font-medium text-gray-600 mb-3">اختر العضو للدخول</h2>
            {membersLoading ? (
              <div className="text-center text-gray-400 py-8">جاري التحميل...</div>
            ) : seats.length === 0 ? (
              <div className="text-center text-gray-400 py-8">لا يوجد أعضاء متاحون حالياً</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {seats.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSeat(m.id)}
                    disabled={busyId !== null}
                    className="text-right border border-gray-200 rounded-xl p-3 hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <div className="font-bold text-gray-800 truncate">{toArabicDigits(m.display_name)}</div>
                    <div className="text-xs text-gray-500 truncate">{toArabicDigits(m.job_title)}</div>
                    {busyId === m.id && <div className="text-xs text-blue-600 mt-1">جاري الدخول...</div>}
                  </button>
                ))}
              </div>
            )}

            {/* A guest holds no seat in the committee and has no role, so it sits apart from
                the member grid and shows no job title. */}
            {guests.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {guests.map(g => (
                    <button
                      key={g.id}
                      onClick={() => handleSeat(g.id)}
                      disabled={busyId !== null}
                      className="text-right border border-dashed border-gray-300 rounded-xl p-3 hover:border-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <div className="font-bold text-gray-700 truncate">{toArabicDigits(g.display_name)}</div>
                      <div className="text-xs text-gray-400 truncate">دخول للاطلاع فقط بدون تصويت</div>
                      {busyId === g.id && <div className="text-xs text-blue-600 mt-1">جاري الدخول...</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="text-center mt-6">
              <button
                onClick={() => { setShowAdmin(true); setError(''); }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                دخول المسؤول
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                placeholder="أدخل اسم المستخدم"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="أدخل كلمة المرور"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-lg">
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setShowAdmin(false); setError(''); }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                العودة لدخول الأعضاء
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="absolute inset-x-0 bottom-4 text-center text-xs text-blue-200">
        تم التطوير بواسطة فرع نظم المعلومات البحري — الإصدار ١.٠
      </p>
    </div>
  );
}
