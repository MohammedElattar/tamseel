import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, quickLogin as apiQuickLogin, getMe } from '../api/auth';

interface User {
  id: number;
  username: string;
  role: 'admin' | 'member';
  display_name: string;
  officer_id?: number;
  is_guest?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isCommander: boolean;
  isGuest: boolean;
  login: (username: string, password: string) => Promise<void>;
  quickLogin: (userId: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isCommander: false,
  isGuest: false,
  login: async () => {},
  quickLogin: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('edara_token');
    if (token) {
      getMe()
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('edara_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    localStorage.setItem('edara_token', data.token);
    setUser(data.user);
  };

  const quickLogin = async (userId: number) => {
    const data = await apiQuickLogin(userId);
    localStorage.setItem('edara_token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('edara_token');
    setUser(null);
  };

  const isCommander = user?.username === 'EVAL1' || user?.username === 'EVAL9';
  const isGuest = user?.is_guest === true;

  return (
    <AuthContext.Provider value={{ user, loading, isCommander, isGuest, login, quickLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
