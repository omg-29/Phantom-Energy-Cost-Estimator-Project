/**
 * Room Page Logic — Appliance Form, Calculation, Results & Charts
 * ================================================================
 */

let currentUser = null;
let roomId = null;
let roomData = null;
let stateData = null;
let appliances = [];
let applianceCount = 0;
let costChart = null;
let co2Chart = null;
let breakdownChart = null;

// ── Age options ──────────────────────────────────────────────
const AGE_OPTIONS = [
  { value: 'less than 1 year', label: 'Less than 1 year' },
  { value: 'less than 3 years', label: 'Less than 3 years' },
  { value: 'less than 5 years', label: 'Less than 5 years' },
  { value: 'less than 10 years', label: 'Less than 10 years' },
  { value: '10+ years', label: '10+ years' },
];

// ── BEE Star options ────────────────────────────────────────
const BEE_OPTIONS = [
  { value: '', label: 'Not Applicable' },
  { value: '1-Star', label: '1 Star ⭐' },
  { value: '2-Star', label: '2 Star ⭐⭐' },
  { value: '3-Star', label: '3 Star ⭐⭐⭐' },
  { value: '4-Star', label: '4 Star ⭐⭐⭐⭐' },
  { value: '5-Star', label: '5 Star ⭐⭐⭐⭐⭐' },
];

document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  currentUser = await requireAuth();
  if (!currentUser) return;

  // Get room ID from URL
  const params = new URLSearchParams(window.location.search);
  roomId = params.get('id');
  if (!roomId) {
    window.location.href = 'dashboard.html';
    return;
  }

  setupNav();
  await loadRoomData();
  await loadAppliances();
  addApplianceEntry();
  setupEventListeners();
  await loadHistory();
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

async function loadRoomData() {
  const { data, error } = await supabaseClient
    .from('rooms')
    .select('*, seed_states(*)')
    .eq('id', roomId)
    .eq('user_id', currentUser.id)
    .single();

  if (error || !data) {
    showToast('Room not found or access denied', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
    return;
  }

  roomData = data;
  stateData = data.seed_states;

  document.getElementById('room-title').textContent = roomData.name;
  document.getElementById('room-state-info').textContent =
    `${stateData.state_name} • Avg ₹${stateData.rate_avg}/kWh`;

  // Set default energy rate
  document.getElementById('energy-rate').value = stateData.rate_avg;
}

async function loadAppliances() {
  const { data, error } = await supabaseClient
    .from('seed_appliances')
    .select('*')
    .order('category, name');

  if (error) {
    showToast('Failed to load appliance data', 'error');
    return;
  }
  appliances = data;
}

// ── Dynamic Appliance Form ──────────────────────────────────

function addApplianceEntry() {
  applianceCount++;
  const container = document.getElementById('appliances-container');

  const entry = document.createElement('div');
  entry.className = 'appliance-entry';
  entry.dataset.index = applianceCount;
  entry.id = `appliance-${applianceCount}`;

  // Group appliances by category for the dropdown
  let optionsHtml = '<option value="">Select an appliance...</option>';
  const categories = {};
  appliances.forEach(a => {
    if (!categories[a.category]) categories[a.category] = [];
    categories[a.category].push(a);
  });

  for (const [cat, items] of Object.entries(categories)) {
    optionsHtml += `<optgroup label="${cat}">`;
    items.forEach(item => {
      optionsHtml += `<option value="${item.id}" data-watts="${item.standby_watts}">${item.name} (${item.standby_watts}W)</option>`;
    });
    optionsHtml += `</optgroup>`;
  }

  // Age dropdown
  let ageHtml = '<option value="">Select age...</option>';
  AGE_OPTIONS.forEach(o => {
    ageHtml += `<option value="${o.value}">${o.label}</option>`;
  });

  // BEE dropdown
  let beeHtml = '';
  BEE_OPTIONS.forEach(o => {
    beeHtml += `<option value="${o.value}">${o.label}</option>`;
  });

  entry.innerHTML = `
    <div class="entry-header">
      <div class="entry-number">
        <span class="badge">${applianceCount}</span>
        Appliance ${applianceCount}
      </div>
      ${applianceCount > 1 ? `<button type="button" class="remove-btn" onclick="removeAppliance(${applianceCount})" title="Remove">✕</button>` : ''}
    </div>
    <div class="appliance-fields">
      <div class="form-group full-width">
        <label for="appl-name-${applianceCount}">Appliance Name</label>
        <select class="form-input appl-select" id="appl-name-${applianceCount}" required>
          ${optionsHtml}
        </select>
      </div>
      <div class="form-group">
        <label for="appl-bee-${applianceCount}">BEE Star Rating</label>
        <select class="form-input" id="appl-bee-${applianceCount}">
          ${beeHtml}
        </select>
      </div>
      <div class="form-group">
        <label for="appl-age-${applianceCount}">Appliance Age</label>
        <select class="form-input" id="appl-age-${applianceCount}" required>
          ${ageHtml}
        </select>
      </div>
      <div class="form-group">
        <label for="appl-consumption-${applianceCount}">Avg. Yearly Consumption (W)</label>
        <input type="number" class="form-input" id="appl-consumption-${applianceCount}"
               placeholder="Auto-filled from appliance" step="0.1" min="0">
      </div>
      <div class="form-group">
        <label for="appl-idle-${applianceCount}">Avg. Time Sitting Idle (hrs/day)</label>
        <input type="number" class="form-input" id="appl-idle-${applianceCount}"
               placeholder="e.g. 18" step="0.5" min="0.5" max="24" required>
      </div>
    </div>
  `;

  container.appendChild(entry);

  // Auto-fill standby watts when appliance selected
  const select = entry.querySelector('.appl-select');
  select.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    const watts = opt?.dataset?.watts;
    const consumptionInput = document.getElementById(`appl-consumption-${entry.dataset.index}`);
    if (watts) {
      consumptionInput.value = watts;
      consumptionInput.placeholder = `${watts}W (standby)`;
    }
  });
}

function removeAppliance(index) {
  const el = document.getElementById(`appliance-${index}`);
  if (el) {
    el.style.animation = 'fadeOutSlide 0.3s ease-in forwards';
    setTimeout(() => el.remove(), 300);
  }
}

// ── Event Listeners ─────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('add-appliance-btn').addEventListener('click', addApplianceEntry);
  document.getElementById('calculate-btn').addEventListener('click', handleCalculate);
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
}

// ── Calculate Handler ───────────────────────────────────────

async function handleCalculate() {
  const btn = document.getElementById('calculate-btn');
  const energyRate = parseFloat(document.getElementById('energy-rate').value);

  if (!energyRate || energyRate <= 0) {
    showToast('Please enter a valid energy rate', 'error');
    return;
  }

  // Collect all appliance entries
  const entries = document.querySelectorAll('.appliance-entry');
  const applianceData = [];

  for (const entry of entries) {
    const idx = entry.dataset.index;
    const applId = document.getElementById(`appl-name-${idx}`)?.value;
    const bee = document.getElementById(`appl-bee-${idx}`)?.value || null;
    const age = document.getElementById(`appl-age-${idx}`)?.value;
    const consumption = parseFloat(document.getElementById(`appl-consumption-${idx}`)?.value) || null;
    const idle = parseFloat(document.getElementById(`appl-idle-${idx}`)?.value);

    if (!applId) {
      showToast(`Appliance ${idx}: Please select an appliance`, 'error');
      return;
    }
    if (!age) {
      showToast(`Appliance ${idx}: Please select an age`, 'error');
      return;
    }
    if (!idle || idle <= 0) {
      showToast(`Appliance ${idx}: Please enter idle hours`, 'error');
      return;
    }

    // Get standby watts from the selected option
    const selectEl = document.getElementById(`appl-name-${idx}`);
    const standbyWatts = parseFloat(selectEl.selectedOptions[0].dataset.watts);

    applianceData.push({
      appliance_id: parseInt(applId),
      bee_star_rating: bee || null,
      appliance_age: age,
      avg_yearly_consumption_w: consumption,
      idle_hours_per_day: idle,
      standby_watts: standbyWatts,
    });
  }

  if (applianceData.length === 0) {
    showToast('Please add at least one appliance', 'error');
    return;
  }

  // Send to backend
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Calculating...';

  try {
    const result = await apiCall('/calculate', {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        energy_rate: energyRate,
        appliances: applianceData,
      }),
    });

    showToast('Calculation complete!', 'success');
    renderResults(result);
    await loadHistory();
  } catch (err) {
    showToast(err.message || 'Calculation failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Calculate Phantom Cost';
  }
}

// ── Render Results ──────────────────────────────────────────

function renderResults(data) {
  const section = document.getElementById('results-section');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Leakage Score
  const badge = document.getElementById('leakage-badge');
  badge.className = `leakage-badge ${data.leakage_score.toLowerCase()}`;
  const scoreIcons = { Low: '🟢', Medium: '🟡', High: '🔴' };
  badge.innerHTML = `${scoreIcons[data.leakage_score]} ${data.leakage_score} Leakage`;

  // Metrics
  document.getElementById('metric-standby-watts').textContent = data.total_standby_watts.toFixed(1);
  document.getElementById('metric-kwh-day').textContent = data.total_idle_kwh_day.toFixed(4);

  document.getElementById('metric-cost-day').textContent = `₹${data.cost_day.toFixed(2)}`;
  document.getElementById('metric-cost-month').textContent = `₹${data.cost_month.toFixed(2)}`;
  document.getElementById('metric-cost-year').textContent = `₹${data.cost_year.toFixed(2)}`;

  document.getElementById('metric-co2-day').textContent = data.co2_day_kg.toFixed(4);
  document.getElementById('metric-co2-month').textContent = data.co2_month_kg.toFixed(2);
  document.getElementById('metric-co2-year').textContent = data.co2_year_kg.toFixed(2);

  // Render charts
  renderCharts(data);

  // Render breakdown table
  renderBreakdown(data.appliance_results);
}

// ── Chart.js Rendering ──────────────────────────────────────

function renderCharts(data) {
  // Destroy old charts
  if (costChart) costChart.destroy();
  if (co2Chart) co2Chart.destroy();
  if (breakdownChart) breakdownChart.destroy();

  const chartFont = { family: "'Inter', sans-serif" };
  const gridColor = 'rgba(255, 255, 255, 0.06)';

  // Financial Cost — Bar Chart
  const costCtx = document.getElementById('cost-chart').getContext('2d');
  costChart = new Chart(costCtx, {
    type: 'bar',
    data: {
      labels: ['Day', 'Month', 'Year'],
      datasets: [{
        label: 'Cost (₹)',
        data: [data.cost_day, data.cost_month, data.cost_year],
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(139, 92, 246, 0.7)',
          'rgba(236, 72, 153, 0.7)',
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(139, 92, 246, 1)',
          'rgba(236, 72, 153, 1)',
        ],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `₹${ctx.parsed.y.toFixed(2)}`,
          },
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleFont: chartFont,
          bodyFont: chartFont,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: '#94a3b8',
            font: chartFont,
            callback: (v) => `₹${v}`,
          },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: chartFont },
        },
      },
    },
  });

  // CO2 Emissions — Bar Chart
  const co2Ctx = document.getElementById('co2-chart').getContext('2d');
  co2Chart = new Chart(co2Ctx, {
    type: 'bar',
    data: {
      labels: ['Day', 'Month', 'Year'],
      datasets: [{
        label: 'CO₂ (kg)',
        data: [data.co2_day_kg, data.co2_month_kg, data.co2_year_kg],
        backgroundColor: [
          'rgba(16, 185, 129, 0.7)',
          'rgba(6, 182, 212, 0.7)',
          'rgba(245, 158, 11, 0.7)',
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(6, 182, 212, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(4)} kg CO₂`,
          },
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleFont: chartFont,
          bodyFont: chartFont,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: '#94a3b8',
            font: chartFont,
            callback: (v) => `${v} kg`,
          },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: chartFont },
        },
      },
    },
  });

  // Appliance Breakdown — Pie Chart
  if (data.appliance_results.length > 1) {
    document.getElementById('breakdown-chart-container').classList.remove('hidden');
    const pieCtx = document.getElementById('breakdown-pie-chart').getContext('2d');

    const pieColors = [
      'rgba(59, 130, 246, 0.8)',
      'rgba(139, 92, 246, 0.8)',
      'rgba(16, 185, 129, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(236, 72, 153, 0.8)',
      'rgba(6, 182, 212, 0.8)',
      'rgba(239, 68, 68, 0.8)',
      'rgba(34, 197, 94, 0.8)',
      'rgba(168, 85, 247, 0.8)',
      'rgba(251, 146, 60, 0.8)',
    ];

    breakdownChart = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: data.appliance_results.map(a => a.appliance_name),
        datasets: [{
          data: data.appliance_results.map(a => a.cost_year),
          backgroundColor: pieColors.slice(0, data.appliance_results.length),
          borderColor: 'rgba(17, 24, 39, 1)',
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: chartFont,
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ₹${ctx.parsed.toFixed(2)}/year`,
            },
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleFont: chartFont,
            bodyFont: chartFont,
            padding: 12,
            cornerRadius: 8,
          },
        },
      },
    });
  }
}

// ── Breakdown Table ─────────────────────────────────────────

function renderBreakdown(results) {
  const tbody = document.getElementById('breakdown-tbody');
  tbody.innerHTML = '';

  results.forEach(a => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${a.appliance_name}</strong>
        <span class="category-tag">${a.category}</span>
      </td>
      <td>${a.standby_watts_used}W</td>
      <td>${a.idle_hours_per_day}h</td>
      <td>${a.idle_kwh_day.toFixed(4)}</td>
      <td>₹${a.cost_day.toFixed(2)}</td>
      <td>₹${a.cost_month.toFixed(2)}</td>
      <td>₹${a.cost_year.toFixed(2)}</td>
      <td>${a.co2_year_kg.toFixed(2)} kg</td>
    `;
    tbody.appendChild(row);
  });
}

// ── History ─────────────────────────────────────────────────

async function loadHistory() {
  const container = document.getElementById('history-container');
  
  const { data, error } = await supabaseClient
    .from('calculations')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm" style="padding: 1rem;">No calculations yet. Add appliances above and hit Calculate!</p>';
    return;
  }

  container.innerHTML = '';
  data.forEach(calc => {
    const date = new Date(calc.created_at).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const item = document.createElement('div');
    item.className = 'glass-card history-item';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <span class="text-sm text-muted">📅 ${date}</span>
        <span class="leakage-badge ${calc.leakage_score.toLowerCase()}" style="font-size:0.75rem; padding:4px 12px;">
          ${calc.leakage_score}
        </span>
      </div>
      <div class="history-meta">
        <div class="history-stat">
          ₹${calc.cost_year.toFixed(2)}
          <small>Cost/Year</small>
        </div>
        <div class="history-stat">
          ${calc.co2_year_kg.toFixed(2)} kg
          <small>CO₂/Year</small>
        </div>
        <div class="history-stat">
          ${calc.total_standby_watts.toFixed(1)}W
          <small>Standby</small>
        </div>
        <div class="history-stat">
          ₹${calc.energy_rate_used}
          <small>Rate Used</small>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

// CSS for fade out animation (injected)
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOutSlide {
    from { opacity: 1; transform: translateY(0); max-height: 500px; }
    to { opacity: 0; transform: translateY(-10px); max-height: 0; padding: 0; margin: 0; overflow: hidden; }
  }
`;
document.head.appendChild(style);
