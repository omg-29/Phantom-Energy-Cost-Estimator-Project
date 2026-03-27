/**
 * Auth Page Logic — Login & Signup
 * =================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tab switching and variables (Setup UI immediately so buttons work instantly)
  const tabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  // 2. Check auth transparently without blocking
  getCurrentUser().then(user => {
    if (user) {
      window.location.href = 'dashboard.html';
    }
  }).catch(err => {
    console.error("Auth check failed:", err);
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.dataset.tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
      } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
      }
    });
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Signing in...';

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('Login successful!', 'success');
      setTimeout(() => window.location.href = 'dashboard.html', 800);
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Sign In';
    }
  });

  // Signup handler
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type="submit"]');
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm').value;

    if (!email || !password || !confirmPassword) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Creating account...';

    try {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      
      // Check if email confirmation is required
      if (data.user && !data.session) {
        showToast('Account created! Check your email for verification.', 'success');
        btn.disabled = false;
        btn.innerHTML = 'Create Account';
        // Switch to login tab
        tabs[0].click();
      } else {
        showToast('Account created! Redirecting...', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 800);
      }
    } catch (err) {
      showToast(err.message || 'Signup failed', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Create Account';
    }
  });
});
