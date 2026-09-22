import api from './client';

// أسس التقييم: component maxes + their sum.
export async function getScoreBasis() {
  const { data } = await api.get('/scoring/basis');
  return data;
}

export async function updateScoreBasis(rows: { component: string; max_degree: number; label?: string }[]) {
  const { data } = await api.put('/scoring/basis', { rows });
  return data;
}

// Per-officer مسير الخدمة entry payload (basis + saved/prefilled degrees + raw component data).
export async function getOfficerScoring(officerId: number) {
  const { data } = await api.get(`/scoring/officer/${officerId}`);
  return data;
}

export async function saveOfficerScoring(officerId: number, scores: Record<string, number | null>) {
  const { data } = await api.put(`/scoring/officer/${officerId}`, scores);
  return data;
}

// روستر مسير الخدمة للجنة: ضباط اللجنة + النسبة + حالة الإدخال.
export async function getCommitteeScoring(committeeId: number) {
  const { data } = await api.get(`/scoring/committee/${committeeId}`);
  return data;
}
