import api from './client';

export async function getDecisionsCard(committeeId: number) {
  const { data } = await api.get(`/reports/committee/${committeeId}/decisions-card`);
  return data;
}

export async function getCredentials(committeeId: number) {
  const { data } = await api.get(`/reports/committee/${committeeId}/credentials`);
  return data;
}

export async function getStatistics(committeeId: number) {
  const { data } = await api.get(`/reports/committee/${committeeId}/statistics`);
  return data;
}
