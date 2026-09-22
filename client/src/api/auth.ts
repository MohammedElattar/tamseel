import api from './client';

export async function login(username: string, password: string) {
  const { data } = await api.post('/auth/login', { username, password });
  return data;
}

export async function getMe() {
  const { data } = await api.get('/auth/me');
  return data;
}

// Passwordless member login: list seats, then log in by selecting one.
export async function getQuickMembers() {
  const { data } = await api.get('/auth/members');
  return data;
}

export async function quickLogin(userId: number) {
  const { data } = await api.post('/auth/quick-login', { user_id: userId });
  return data;
}
