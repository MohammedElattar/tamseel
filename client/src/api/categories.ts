import api from './client';

// ترتيب اللجنة values. in_use = officers holding it in committees that have not finished.
export interface OfficerCategory {
  id: number;
  name: string;
  in_use: number;
}

export async function getCategories(): Promise<OfficerCategory[]> {
  const { data } = await api.get('/categories');
  return data;
}

export async function createCategory(name: string) {
  const { data } = await api.post('/categories', { name });
  return data;
}

export async function updateCategory(id: number, name: string) {
  const { data } = await api.put(`/categories/${id}`, { name });
  return data;
}

export async function deleteCategory(id: number) {
  const { data } = await api.delete(`/categories/${id}`);
  return data;
}

// Saves the presentation order: every category id, first to last. Returns the reordered list.
export async function reorderCategories(categoryIds: number[]): Promise<OfficerCategory[]> {
  const { data } = await api.put('/categories/order', { category_ids: categoryIds });
  return data;
}
