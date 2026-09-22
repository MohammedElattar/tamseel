import api from './client';

export async function getOfficers(params?: Record<string, any>) {
  const { data } = await api.get('/officers', { params });
  return data;
}

export async function getOfficersRequirements() {
  const { data } = await api.get('/officers/requirements');
  return data;
}

export async function searchOfficers(params: { akdam_no?: string; person_id?: string }) {
  const { data } = await api.get('/officers/search', { params });
  return data;
}

// Raw editable payload for the officer edit page (officer record + nested tables).
export async function getOfficerForEdit(id: number) {
  const { data } = await api.get(`/officers/${id}/edit`);
  return data;
}

// Save officer edits: { officer, jobs, kafaa, paasat, punishments, health, children }.
export async function saveOfficer(id: number, payload: any) {
  const { data } = await api.put(`/officers/${id}`, payload);
  return data;
}

// Delete an officer (and their imported nested rows).
export async function deleteOfficer(id: number) {
  const { data } = await api.delete(`/officers/${id}`);
  return data;
}
