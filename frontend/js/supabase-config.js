/**
 * Supabase Configuration & Client Initialization
 * ================================================
 * IMPORTANT: Replace these with your actual Supabase credentials.
 */

const SUPABASE_URL = 'https://fuygwuzxicmhfdwjfuja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eWd3dXp4aWNtaGZkd2pmdWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTQ0MjQsImV4cCI6MjA5MDE3MDQyNH0.w8hg0H7p1MlDoFKoWtD4TqejD3XUfmd7FvFa0von8pc';
const API_BASE_URL = 'http://127.0.0.1:8000';  // FastAPI backend

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Get the current session's access token
 */
async function getAccessToken() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session?.access_token || null;
}

/**
 * Get the current user
 */
async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data) return null;
  return data.user;
}

/**
 * Check if user is authenticated, redirect to login if not
 */
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

/**
 * Make authenticated API call to backend
 */
async function apiCall(endpoint, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    window.location.href = 'index.html';
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Toast notification system
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
