// api.js — Fetch wrapper for talking to the Express API
//
// Every page includes this file before nav.js. It exposes a global `api` object
// with get / post / put / delete methods so the rest of the frontend never
// has to write raw fetch() calls or remember to set Content-Type headers.
//
// Usage examples:
//   api.get('/items')                            — GET /api/items
//   api.post('/auth/login', { email, password }) — POST /api/auth/login with JSON body
//   api.post('/items', formDataObject)           — POST /api/items with a file upload
//   api.put('/missing-items/abc/mark-found')     — PUT /api/missing-items/abc/mark-found
//   api.delete('/auth/account')                  — DELETE /api/auth/account

const API = '/api';  // base path — all requests go through the same origin

// apiFetch — internal helper that builds and sends the request
async function apiFetch(method, path, body) {
  const options = {
    method,
    credentials: 'include',  // always send the session cookie so the server knows who we are
    headers: {}
  };

  if (body instanceof FormData) {
    // File uploads use multipart/form-data. Don't set Content-Type manually —
    // the browser needs to set it itself so it can include the boundary string.
    options.body = body;
  } else if (body !== undefined) {
    // Regular JSON payloads
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  // If body is undefined (GET / DELETE), options.body stays unset — correct behavior.

  const response = await fetch(API + path, options);

  // Always try to parse the response as JSON.
  // If the body is empty or not valid JSON, fall back to an empty object.
  let data;
  try { data = await response.json(); }
  catch { data = {}; }

  // Treat any non-2xx status as an error.
  // Throw with the server's error message so the caller can show it to the user.
  if (!response.ok) {
    throw new Error(data.error || data.message || `Error ${response.status}`);
  }

  return data;
}

// Public API — these four methods cover every HTTP verb we use
const api = {
  get:    (path)       => apiFetch('GET',    path),
  post:   (path, body) => apiFetch('POST',   path, body),
  put:    (path, body) => apiFetch('PUT',    path, body),
  delete: (path)       => apiFetch('DELETE', path)
};
