import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toArabicDigits } from '../../utils/format';

const navItems = [
  { to: '/admin', label: 'لوحة التحكم', end: true },
  { to: '/admin/committees', label: 'اللجان' },
  { to: '/admin/officers', label: 'الضباط' },
  { to: '/admin/members', label: 'الأعضاء' },
  { to: '/admin/scoring', label: 'قاعدة التقييم' },
  { to: '/admin/import', label: 'استيراد البيانات' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-blue-900 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-lg sm:text-xl font-bold">قيادة القوات البحرية - فرع شئون ضباط</h1>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-sm text-blue-200">{toArabicDigits(user?.display_name)}</span>
              <button onClick={handleLogout} className="text-sm text-blue-300 hover:text-white whitespace-nowrap">
                تسجيل الخروج
              </button>
            </div>
          </div>
          {/* Nav gets its own full-width row that wraps, so every tab stays visible instead of
              being clipped when the title + tabs + user info competed for one row. */}
          <nav className="mt-3 flex flex-wrap gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    isActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="w-full max-w-7xl mx-auto px-4 py-6 flex-1">
        <Outlet />
      </main>
      <footer className="no-print border-t border-gray-200 bg-white py-3 text-center text-xs text-gray-500">
        تم التطوير بواسطة فرع النظم — الإصدار ١.٠
      </footer>
    </div>
  );
}
