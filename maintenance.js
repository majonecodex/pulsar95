/* ============================================================
   PULSAR95 MAINTENANCE BANNER
   Toggle on/off with localStorage or URL param
   ============================================================ */

const MAINTENANCE_CONFIG = {
  enabled: false,           // ← Set to true to force-enable everywhere
  title: 'Pulsar95 — Scheduled Maintenance',
  message:
    'Pulsar95 is currently undergoing scheduled maintenance.<br><br>' +
    'We\'re upgrading the system to bring you a faster, ' +
    'more nostalgic experience.<br><br>' +
    '<b>Please check back soon.</b>',
  eta: 'Estimated completion: TBA',
  showEta: true,
  // Click the icon 5 times fast to reveal a bypass button
  bypassClicks: 5,
  bypassWindow: 2000,
};

/* ── Public API ── */

export function enableMaintenance() {
  localStorage.setItem('pulsar95_maintenance', '1');
  location.reload();
}

export function disableMaintenance() {
  localStorage.removeItem('pulsar95_maintenance');
  location.reload();
}

export function isMaintenanceActive() {
  // Priority: URL param > localStorage > config default
  const params = new URLSearchParams(window.location.search);
  if (params.get('maintenance') === 'off') return false;
  if (params.get('maintenance') === 'on') return true;
  if (localStorage.getItem('pulsar95_maintenance') === '1') return true;
  return MAINTENANCE_CONFIG.enabled;
}

/* ── Render the banner ── */

export function initMaintenance() {
  if (!isMaintenanceActive()) return;

  // Prevent the app from initializing
  document.documentElement.classList.add('maintenance-active');

  const overlay = document.createElement('div');
  overlay.id = 'maintenance-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: var(--desktop-bg, #008080);
    background-image:
      radial-gradient(1px 1px at 20% 30%, #fff, transparent),
      radial-gradient(1px 1px at 60% 70%, #fff, transparent),
      radial-gradient(1px 1px at 80% 20%, #fff, transparent),
      radial-gradient(1px 1px at 33% 80%, #fff, transparent),
      radial-gradient(1px 1px at 90% 60%, #fff, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: 'MS Sans Serif', 'Pixelated MS Sans Serif', Arial, sans-serif;
    font-size: 12px;
    padding: 20px;
    overflow: hidden;
  `;

  overlay.innerHTML = `
    <div style="
      background: #c0c0c0;
      padding: 2px;
      border: 2px solid;
      border-color: #ffffff #404040 #404040 #ffffff;
      min-width: 380px;
      max-width: 480px;
      box-shadow: 3px 3px 0 rgba(0,0,0,0.35);
    ">
      <div style="
        background: linear-gradient(to right, #000080, #1084d0);
        color: #fff;
        padding: 3px 6px;
        font-weight: bold;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
      ">
        <span>🚧 ${escapeHtml(MAINTENANCE_CONFIG.title)}</span>
        <span style="font-size: 10px;">X</span>
      </div>

      <div style="padding: 16px; display: flex; gap: 14px; align-items: flex-start;">
        <div
          id="maintenance-icon"
          style="
            font-size: 42px;
            line-height: 1;
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
          "
        >🚧</div>
        <div style="flex: 1;">
          <div style="font-size: 13px; line-height: 1.5; color: #000;">
            ${MAINTENANCE_CONFIG.message}
          </div>
          ${MAINTENANCE_CONFIG.showEta && MAINTENANCE_CONFIG.eta
            ? `<div style="
                margin-top: 12px;
                padding: 8px;
                background: #dfdfdf;
                border: 2px inset #808080;
                font-size: 11px;
                color: #404040;
              ">⏱️ ${escapeHtml(MAINTENANCE_CONFIG.eta)}</div>`
            : ''}
        </div>
      </div>

      <div style="
        padding: 10px 16px 12px;
        background: #c0c0c0;
        border-top: 1px solid #808080;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #606060;
      ">
        <span>Status: Maintenance Mode</span>
        <span id="maintenance-clock">--:--:--</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Live clock
  const clockEl = overlay.querySelector('#maintenance-clock');
  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString();
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Secret bypass — click the icon N times within the window
  const iconEl = overlay.querySelector('#maintenance-icon');
  let clickTimestamps = [];
  iconEl.addEventListener('click', () => {
    const now = Date.now();
    clickTimestamps = clickTimestamps.filter((t) => now - t < MAINTENANCE_CONFIG.bypassWindow);
    clickTimestamps.push(now);

    if (clickTimestamps.length >= MAINTENANCE_CONFIG.bypassClicks) {
      clickTimestamps = [];
      promptBypass(overlay);
    }
  });

  // Prevent scrolling / keyboard shortcuts below
  document.addEventListener('keydown', (e) => {
    // Block Escape, F5, Ctrl+R on the overlay
    if (['Escape', 'F5'].includes(e.key) && !e.target.closest('#maintenance-overlay input')) {
      e.preventDefault();
    }
  }, true);

  console.log(
    '%c🚧 MAINTENANCE MODE ACTIVE',
    'color:#ffb000;background:#000;padding:6px 12px;font-weight:bold;font-size:14px'
  );
  console.log('To disable: open the console and type one of:');
  console.log('  window.pulsarMaintenance.disable()');
  console.log('  localStorage.removeItem("pulsar95_maintenance")');
  console.log('Or visit with ?maintenance=off');
}

/* ── Bypass flow ── */

function promptBypass(overlay) {
  const password = prompt('Enter maintenance password:');
  if (password === null) return;

  // Simple password — change this to your own
  if (password === 'pulsar95admin') {
    disableMaintenance();
    return;
  }

  if (password === '') return;

  alert('Incorrect password.');
}

/* ── Helpers ── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ── Auto-init if imported directly ── */

if (typeof window !== 'undefined') {
  window.pulsarMaintenance = {
    enable: enableMaintenance,
    disable: disableMaintenance,
    isActive: isMaintenanceActive,
    config: MAINTENANCE_CONFIG,
  };
}