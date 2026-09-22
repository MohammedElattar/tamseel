import api from './client';

// The logged-in member's live voting context (active committee + current officer + my vote).
export async function getCurrent() {
  const { data } = await api.get('/evaluations/current');
  return data;
}

// Officer CV summary (ملخص بيانات الضابط) sections.
export async function getOfficerCv(officerId: number) {
  const { data } = await api.get(`/evaluations/officer-cv/${officerId}`);
  return data;
}

// نتيجة تقييم مسير الخدمة (breakdown + total + %) for the voting-card reference page.
export async function getOfficerServiceResult(officerId: number) {
  const { data } = await api.get(`/evaluations/officer-service/${officerId}`);
  return data;
}

// Commander reference: job-level ladder (المستويات الوظيفية).
export async function getOfficerJoblevel(officerId: number) {
  const { data } = await api.get(`/evaluations/officer-joblevel/${officerId}`);
  return data;
}

// Peer officers in the same bulletin slice (ضباط الشريحة).
export async function getOfficerShare7a(officerId: number) {
  const { data } = await api.get(`/evaluations/officer-share7a/${officerId}`);
  return data;
}

export async function getVotingStatus(committeeId: number) {
  const { data } = await api.get(`/evaluations/committee/${committeeId}/status`);
  return data;
}

// Admin read-only score matrix for one officer (موقف تقييم الأعضاء): every included member's
// بند scores + totals/%, the computed مسير الخدمة/لغة إنجليزية, and the averages.
export async function getOfficerMemberScores(committeeId: number, officerId: number) {
  const { data } = await api.get(`/evaluations/committee/${committeeId}/officer/${officerId}/scores`);
  return data;
}

// Admin review (مراجعة تقييم أعضاء اللجنة): override members' manual بند scores and set the
// officer's final evaluation (تصدق/لا يتصدق/يؤجل) + توصية القائد بالإحالة.
export async function saveOfficerReview(
  committeeId: number,
  officerId: number,
  payload: {
    scores: { user_id: number; item_id: number; score: number | null }[];
    final_eval?: number | null;
    kaed_tawsya?: number | null;
  },
) {
  const { data } = await api.put(`/evaluations/committee/${committeeId}/officer/${officerId}/review`, payload);
  return data;
}

export async function castVote(officerId: number, userOpinion: number, ta3nType?: number) {
  const { data } = await api.post('/evaluations/vote', {
    officer_id: officerId,
    user_opinion: userOpinion,
    ...(ta3nType != null ? { ta3n_type: ta3nType } : {}),
  });
  return data;
}

// A member saves their بند scores for the active officer (التمثيل العسكري). Every member scores
// the manual بنود; the commander additionally decides via castVote (تصدق/لا يتصدق).
export async function saveScores(
  officerId: number,
  scores: { item_id: number; score: number | null }[],
) {
  const { data } = await api.post('/evaluations/scores', { officer_id: officerId, scores });
  return data;
}

// Commander/deputy only: advance the active officer next/prev.
export async function advanceOfficer(direction: 'next' | 'prev') {
  const { data } = await api.post('/evaluations/advance', { direction });
  return data;
}

export async function calculateDecisions(committeeId: number) {
  const { data } = await api.post(`/evaluations/committee/${committeeId}/calculate`);
  return data;
}

export async function getDisputes(committeeId: number) {
  const { data } = await api.get(`/evaluations/committee/${committeeId}/disputes`);
  return data;
}
