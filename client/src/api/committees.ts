import api from './client';

export async function getCommittees() {
  const { data } = await api.get('/committees');
  return data;
}

export async function getCommittee(id: number) {
  const { data } = await api.get(`/committees/${id}`);
  return data;
}

export async function createCommittee(body: Record<string, any>) {
  const { data } = await api.post('/committees', body);
  return data;
}

export async function updateCommittee(id: number, body: Record<string, any>) {
  const { data } = await api.put(`/committees/${id}`, body);
  return data;
}

export async function loadMembers(id: number) {
  const { data } = await api.post(`/committees/${id}/load-members`);
  return data;
}

export async function setMemberIncluded(committeeId: number, userId: number, included: boolean) {
  const { data } = await api.patch(`/committees/${committeeId}/members/${userId}`, { included });
  return data;
}

export async function createCommitteeMember(committeeId: number, body: Record<string, any>) {
  const { data } = await api.post(`/committees/${committeeId}/members`, body);
  return data;
}

export async function removeCommitteeMember(committeeId: number, userId: number) {
  const { data } = await api.delete(`/committees/${committeeId}/members/${userId}`);
  return data;
}

export async function reorderMembers(committeeId: number, order: number[]) {
  const { data } = await api.patch(`/committees/${committeeId}/members/reorder`, { order });
  return data;
}

export async function loadOfficers(id: number) {
  const { data } = await api.post(`/committees/${id}/load-officers`);
  return data;
}

// بنود التقييم لهذه اللجنة (قالب مُنسَخ قابل للتعديل).
export async function getEvalItems(id: number) {
  const { data } = await api.get(`/committees/${id}/eval-items`);
  return data;
}

export async function loadEvalItems(id: number) {
  const { data } = await api.post(`/committees/${id}/load-items`);
  return data;
}

export async function updateEvalItems(id: number, items: { id: number; name?: string; max_degree: number }[]) {
  const { data } = await api.put(`/committees/${id}/eval-items`, { items });
  return data;
}

export async function getCommitteeOfficers(
  id: number,
  filters: { kind?: number; lagna_type_code?: number } = {}
) {
  const { data } = await api.get(`/committees/${id}/officers`, { params: filters });
  return data;
}

export async function setOfficerLagnaType(committeeId: number, officerId: number, lagnaTypeC: number) {
  const { data } = await api.patch(`/committees/${committeeId}/officers/${officerId}`, {
    l_lagna_type_c: lagnaTypeC,
  });
  return data;
}

export async function getSessionOfficers(id: number) {
  const { data } = await api.get(`/committees/${id}/session-officers`);
  return data;
}

// `order` is the officers in their new display order. ta3n_type is carried because an edarya
// officer can be registered under several case types, each its own row with its own serial.
export async function reorderOfficers(
  committeeId: number,
  order: { officer_id: number; ta3n_type?: number | null }[]
) {
  const { data } = await api.patch(`/committees/${committeeId}/officers/reorder`, { order });
  return data;
}

export async function showOfficers(id: number) {
  const { data } = await api.post(`/committees/${id}/show-officers`);
  return data;
}

export async function updateOfficerFlags(
  committeeId: number,
  officerId: number,
  flags: Record<string, any>
) {
  const { data } = await api.patch(`/committees/${committeeId}/officers/${officerId}`, flags);
  return data;
}

export async function setOfficerActive(committeeId: number, officerId: number, ta3nType?: number) {
  const { data } = await api.post(`/committees/${committeeId}/officers/${officerId}/active`,
    ta3nType != null ? { ta3n_type: ta3nType } : {});
  return data;
}

export async function bulkOfficerAction(committeeId: number, action: string) {
  const { data } = await api.post(`/committees/${committeeId}/officers/bulk`, { action });
  return data;
}

export async function getVotingSummary(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/voting-summary`);
  return data;
}

export async function getNotMstawfy(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/not-mstawfy`);
  return data;
}

export async function getStatistics(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/statistics`);
  return data;
}

// بطاقة تقييم أعضاء اللجنة (printable): every officer's members×بنود matrix + totals/averages.
export async function getMemberScoresReport(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/member-scores`);
  return data;
}

export async function getFinalDecisions(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/final-decisions`);
  return data;
}

export async function getJudicalMedical(id: number) {
  const { data } = await api.get(`/committees/${id}/reports/judical-medical`);
  return data;
}

export async function computeEstifa(id: number) {
  const { data } = await api.post(`/committees/${id}/compute-estifa`);
  return data;
}

export async function registerOfficer(id: number, body: Record<string, any>) {
  const { data } = await api.post(`/committees/${id}/register-officer`, body);
  return data;
}

export async function getRegisteredOfficers(id: number) {
  const { data } = await api.get(`/committees/${id}/registered-officers`);
  return data;
}

export async function removeRegisteredOfficer(id: number, officerId: number, ta3nType: number) {
  const { data } = await api.delete(`/committees/${id}/officers/${officerId}`, {
    params: { ta3n_type: ta3nType },
  });
  return data;
}

// Remove a single loaded officer from a tagdded committee (no ta3n_type scoping).
export async function removeCommitteeOfficer(id: number, officerId: number) {
  const { data } = await api.delete(`/committees/${id}/officers/${officerId}`);
  return data;
}

export async function getJudicialOfficers(id: number) {
  const { data } = await api.get(`/committees/${id}/judicial-officers`);
  return data;
}

export async function updateJudicialCase(id: number, officerId: number, body: Record<string, any>) {
  const { data } = await api.patch(`/committees/${id}/officers/${officerId}/case`, body);
  return data;
}

export async function getOfficerArd(id: number, officerId: number, ta3nType: number) {
  const { data } = await api.get(`/committees/${id}/officers/${officerId}/ard`, {
    params: { ta3n_type: ta3nType },
  });
  return data;
}

export async function addOfficerArd(id: number, officerId: number, body: Record<string, any>) {
  const { data } = await api.post(`/committees/${id}/officers/${officerId}/ard`, body);
  return data;
}

export async function removeOfficerArd(id: number, officerId: number, ardId: number) {
  const { data } = await api.delete(`/committees/${id}/officers/${officerId}/ard/${ardId}`);
  return data;
}

export async function activateCommittee(id: number) {
  const { data } = await api.post(`/committees/${id}/activate`);
  return data;
}

export async function deactivateCommittee(id: number) {
  const { data } = await api.post(`/committees/${id}/deactivate`);
  return data;
}

export async function completeCommittee(id: number) {
  const { data } = await api.post(`/committees/${id}/complete`);
  return data;
}

export async function getDecisions(id: number) {
  const { data } = await api.get(`/committees/${id}/decisions`);
  return data;
}

export async function reverseDecision(committeeId: number, officerId: number) {
  const { data } = await api.post(`/committees/${committeeId}/officers/${officerId}/reverse-decision`);
  return data;
}

export async function backupCommittee(id: number) {
  const { data } = await api.post(`/committees/${id}/backup`);
  return data;
}

export async function getBackups(id: number) {
  const { data } = await api.get(`/committees/${id}/backups`);
  return data;
}

export async function restoreCommittee(id: number, backupId: number) {
  const { data } = await api.post(`/committees/${id}/restore`, { backup_id: backupId });
  return data;
}

export async function deleteCommittee(id: number) {
  const { data } = await api.delete(`/committees/${id}`);
  return data;
}
