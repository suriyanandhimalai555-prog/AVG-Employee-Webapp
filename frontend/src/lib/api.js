// frontend/src/lib/api.js

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Enhanced fetch wrapper with automatic JWT injection and error handling.
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  const result = contentType && contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `API Error: ${response.status}`);
  }

  return result.data || result;
}

export const api = {
  // --- Auth ---
  login: (email, password) => 
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request('/auth/me'),

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return request('/auth/logout', { method: 'POST' }).catch(() => {});
  },

  // --- Attendance ---
  submitAttendance: (data) => 
    request('/attendance', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAttendanceSummary: (date) => 
    request(`/attendance/summary${date ? `?date=${date}` : ''}`),

  getHistory: (userId, query = {}) => {
    const params = new URLSearchParams(query).toString();
    return request(`/attendance/${userId}/history${params ? `?${params}` : ''}`);
  },

  getUploadUrl: () => request('/attendance/upload-url'),

  // --- Admin ---
  adminList: (query = {}) => {
    const params = new URLSearchParams(query).toString();
    return request(`/attendance${params ? `?${params}` : ''}`);
  },

  adminMark: (data) => 
    request('/attendance/admin-mark', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminCorrect: (id, data) => 
    request(`/attendance/${id}/correct`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
