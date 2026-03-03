// api.js — Simple wrapper around fetch() for talking to our Express API
// Usage:  api.get('/items')
//         api.post('/auth/login', { email, password })
//         api.post('/items', formDataObject)   ← for file uploads

const API = '/api';

async function apiFetch(method, path, body) {
  const options = {
    method,
    credentials: 'include',   // send the session cookie on every request
    headers: {}
  };

  if (body instanceof FormData) {
    // Let the browser set Content-Type automatically (includes boundary for multipart)
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(API + path, options);

  let data;
  try { data = await response.json(); }
  catch { data = {}; }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Error ${response.status}`);
  }

  return data;
}

const api = {
  get:    (path)       => apiFetch('GET',    path),
  post:   (path, body) => apiFetch('POST',   path, body),
  put:    (path, body) => apiFetch('PUT',    path, body),
  delete: (path)       => apiFetch('DELETE', path)
};
