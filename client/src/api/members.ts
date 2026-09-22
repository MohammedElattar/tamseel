import api from './client';

export interface Member {
  id: number;
  username: string;
  display_name: string;
  job_title: string | null;
  rank_name: string | null;
  is_active: number;
  is_guest: number;
  committee_count: number;
}

export interface MemberInput {
  username?: string;
  display_name?: string;
  rank_name?: string;
  job_title?: string;
  password?: string;
  is_active?: number;
}

// All committee members (role='member'), listed separately from officers.
export async function getMembers(): Promise<Member[]> {
  const { data } = await api.get('/members');
  return data;
}

export async function createMember(payload: MemberInput) {
  const { data } = await api.post('/members', payload);
  return data;
}

export async function updateMember(id: number, payload: MemberInput) {
  const { data } = await api.put(`/members/${id}`, payload);
  return data;
}

export async function deleteMember(id: number) {
  const { data } = await api.delete(`/members/${id}`);
  return data;
}
