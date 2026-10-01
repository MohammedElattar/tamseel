import api from './client';

// mode 'replace' (default) wipes and reloads each matched table; 'append' adds the file's rows
// without deleting or truncating any existing data (a query error is returned to the caller).
export type ImportMode = 'replace' | 'append';

export async function importSQL(sqlContent: string, fileName?: string, mode: ImportMode = 'replace') {
  const { data } = await api.post('/import', { sql_content: sqlContent, file_name: fileName, mode });
  return data;
}

export async function getImportLogs() {
  const { data } = await api.get('/import/logs');
  return data;
}

export interface PhotoImportResult {
  personal: number;
  family: number;
  couple: number;
  converted: number;
  officers: number;
  unmatched: number;
  skipped: number;
  warnings: string[];
}

// Upload a batch of officer image files. The folder-relative path is sent alongside so the
// server can read the officer id from the officer's folder name.
// Axios sends FormData as multipart with the correct boundary automatically.
export async function importPhotos(files: File[]): Promise<PhotoImportResult> {
  const fd = new FormData();
  const paths: string[] = [];
  for (const f of files) {
    fd.append('files', f);
    paths.push((f as any).webkitRelativePath || f.name);
  }
  fd.append('paths', JSON.stringify(paths));
  const { data } = await api.post('/import/photos', fd);
  return data;
}
