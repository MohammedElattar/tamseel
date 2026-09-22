import api from './client';

export async function getRanks() {
  const { data } = await api.get('/lookup/ranks');
  return data;
}

export async function getUnits() {
  const { data } = await api.get('/lookup/units');
  return data;
}

export async function getKindoff() {
  const { data } = await api.get('/lookup/kindoff');
  return data;
}

export async function getTa3nTypes() {
  const { data } = await api.get('/lookup/ta3n-types');
  return data;
}

export async function getLagnaCategories() {
  const { data } = await api.get('/lookup/lagna-categories');
  return data;
}

export async function getJudicialCategories() {
  const { data } = await api.get('/lookup/judicial-categories');
  return data;
}

export async function getArdTypes() {
  const { data } = await api.get('/lookup/ard-types');
  return data;
}

export async function getArdDecisions() {
  const { data } = await api.get('/lookup/ard-decisions');
  return data;
}

export async function getLagnaTypes() {
  const { data } = await api.get('/lookup/lagna-types');
  return data;
}

export async function getGrades() {
  const { data } = await api.get('/lookup/grades');
  return data;
}
