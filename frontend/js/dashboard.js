/**
 * Dashboard Logic — Rooms Management
 * ====================================
 */

let currentUser = null;
let states = [];
let rooms = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  currentUser = await requireAuth();
  if (!currentUser) return;

  // Populate user info in nav
  setupNav();

  // Load states for room creation
  await loadStates();

  // Load rooms
  await loadRooms();

  // Modal handlers
  setupModal();
});

function setupNav() {
  const emailEl = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  if (emailEl) emailEl.textContent = currentUser.email;
  if (avatarEl) avatarEl.textContent = currentUser.email.charAt(0).toUpperCase();

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
  });
}

async function loadStates() {
  const { data, error } = await supabaseClient
    .from('seed_states')
    .select('*')
    .order('state_name');

  if (error) {
    showToast('Failed to load states', 'error');
    return;
  }
  states = data;

  const select = document.getElementById('room-state');
  select.innerHTML = '<option value="">Select your state...</option>';
  states.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.state_name} (₹${s.rate_min} – ₹${s.rate_max}/kWh)`;
    select.appendChild(opt);
  });
}

async function loadRooms() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><p>Loading rooms...</p></div>';

  const { data, error } = await supabaseClient
    .from('rooms')
    .select('*, seed_states(state_name, rate_avg)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Failed to load rooms', 'error');
    container.innerHTML = '';
    return;
  }

  rooms = data;
  renderRooms();
}

function renderRooms() {
  const container = document.getElementById('rooms-container');
  container.innerHTML = '';

  // Room icons by index
  const icons = ['🏠', '🛋️', '🍳', '💼', '🛏️', '🎮', '📚', '🏢'];

  rooms.forEach((room, i) => {
    const card = document.createElement('div');
    card.className = 'glass-card room-card';
    card.id = `room-${room.id}`;
    
    const date = new Date(room.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    card.innerHTML = `
      <button class="delete-room" data-id="${room.id}" title="Delete room">🗑️</button>
      <div class="room-icon">${icons[i % icons.length]}</div>
      <h3>${escapeHtml(room.name)}</h3>
      <p class="text-sm text-muted">${room.seed_states?.state_name || 'Unknown state'}</p>
      <div class="room-meta">
        <span>📅 ${date}</span>
        <span>⚡ ₹${room.seed_states?.rate_avg || '—'}/kWh avg</span>
      </div>
    `;

    // Click to open room
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-room')) return;
      window.location.href = `room.html?id=${room.id}`;
    });

    // Delete button
    card.querySelector('.delete-room').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete room "${room.name}"? This will remove all calculations.`)) return;
      
      const { error } = await supabaseClient.from('rooms').delete().eq('id', room.id);
      if (error) {
        showToast('Failed to delete room', 'error');
        return;
      }
      showToast('Room deleted', 'success');
      await loadRooms();
    });

    container.appendChild(card);
  });

  // Add "New Room" card
  const newCard = document.createElement('div');
  newCard.className = 'glass-card new-room-card';
  newCard.id = 'new-room-trigger';
  newCard.innerHTML = `
    <div class="plus-icon">+</div>
    <p>Create New Room</p>
  `;
  newCard.addEventListener('click', openModal);
  container.appendChild(newCard);
}

function setupModal() {
  const overlay = document.getElementById('modal-overlay');
  const cancelBtn = document.getElementById('modal-cancel');
  const form = document.getElementById('new-room-form');

  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('room-name').value.trim();
    const stateId = document.getElementById('room-state').value;

    if (!name) {
      showToast('Please enter a room name', 'error');
      return;
    }
    if (!stateId) {
      showToast('Please select your state', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Creating...';

    try {
      const { data, error } = await supabaseClient.from('rooms').insert({
        user_id: currentUser.id,
        name: name,
        state_id: parseInt(stateId),
      }).select().single();

      if (error) throw error;

      showToast('Room created!', 'success');
      closeModal();
      form.reset();
      await loadRooms();
    } catch (err) {
      showToast(err.message || 'Failed to create room', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Create Room';
    }
  });
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
