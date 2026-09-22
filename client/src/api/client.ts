import axios from 'axios';

// No hardcoded Content-Type: axios sets `application/json` for object bodies on its own, and
// must be left free to set `multipart/form-data; boundary=…` for FormData uploads (officer
// photos). Forcing application/json here strips the multipart boundary and the server then
// parses zero files ("لم يتم اختيار أي صور").
const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('edara_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('edara_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
