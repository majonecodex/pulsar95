import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import Sound from '../sounds.js';

export function showShutdownScreen() {
  Sound.shutdown();
  const overlay = document.createElement('div');
  overlay.id = 'win95-shutdown';
  overlay.innerHTML =
    '<div>It\'s now safe to turn off<br>your computer.</div>' +
    '<div class="shutdown-hint">Click anywhere to restart Pulsar95</div>';
  overlay.onclick = async () => {
    try {
      if (state.messagesSub) await supabase.removeChannel(state.messagesSub);
      await supabase.auth.signOut();
    } catch (e) {}
    location.reload();
  };
  document.body.appendChild(overlay);
}

export function executeAltF4Shutdown() {
  Sound.shutdown();
  const overlay = document.createElement('div');
  overlay.id = 'altf4-shutdown';
  overlay.style.cssText =
    'position: fixed; inset: 0; background: #000; color: #c0c0c0;' +
    'font-family: "Courier New", monospace; display: flex; flex-direction: column;' +
    'align-items: center; justify-content: center; z-index: 99999999;' +
    'font-size: 20px; text-align: center; padding: 40px;' +
    'opacity: 0; transition: opacity 0.4s ease-out;';
  overlay.innerHTML =
    '<div id="altf4-content">' +
    '<div style="color:#ffb000;margin-bottom:24px;font-size:24px;">' +
    '&#9888; Windows is shutting down...</div>' +
    '<div style="color:#808080;font-size:14px;font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    'Closing Pulsar95 in 3 seconds...</div></div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  let seconds = 3;
  const countdownEl = overlay.querySelector('#altf4-content');
  const interval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(interval);
      showSafeToCloseMessage(overlay);
    } else {
      countdownEl.querySelector('div:last-child').textContent =
        'Closing Pulsar95 in ' + seconds + ' second' + (seconds === 1 ? '' : 's') + '...';
    }
  }, 1000);
}

function showSafeToCloseMessage(overlay) {
  overlay.innerHTML =
    '<div style="color:#ffb000;font-size:22px;text-align:center;line-height:1.8;">' +
    'It&#39;s now safe to turn off<br>your computer.</div>' +
    '<div style="color:#606060;font-size:13px;margin-top:40px;' +
    'font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    'Click anywhere to restart Pulsar95</div>';

  setTimeout(() => {
    try { window.open('', '_self').close(); window.close(); } catch (e) {}
    setTimeout(() => {
      const hintEl = overlay.querySelector('div:last-child');
      if (hintEl && document.body.contains(overlay)) {
        hintEl.innerHTML =
          'Your browser blocked auto-close for security.<br>' +
          '<span style="color:#ffb000;">Press Ctrl+W to close this tab</span>, ' +
          'or click here to restart Pulsar95.';
        hintEl.style.cursor = 'pointer';
        hintEl.onclick = () => { overlay.remove(); location.reload(); };
      }
    }, 500);
  }, 800);

  overlay.style.cursor = 'pointer';
  overlay.onclick = () => { overlay.remove(); location.reload(); };
}

export function initAltF4() {
  const altF4Input = document.getElementById('message-input');
  if (!altF4Input) return;
  altF4Input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const content = altF4Input.value.trim().toUpperCase();
      if (['ALT + F4', 'ALT+F4', 'ALTF4', 'ALT F4'].includes(content)) {
        e.preventDefault();
        e.stopPropagation();
        altF4Input.value = '';
        executeAltF4Shutdown();
      }
    }
  });
}