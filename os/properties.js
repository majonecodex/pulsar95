import { state } from '../lib/state.js';
import { escapeHtml } from '../lib/dom.js';
import { formatLocalFull } from '../lib/time.js';
import { showPropertiesDialog } from '../lib/dialogs.js';
import { THEMES, applyTheme, getCurrentTheme } from '../themes.js';
import Sound from '../sounds.js';
import { showInviteDialog } from '../auth/invite.js';

export function showRoomProperties(room) {
  const codeDisplay = room.invite_code
    ? '<code style="font-family:\'Courier New\',monospace;font-weight:bold;letter-spacing:1px;">' +
      escapeHtml(room.invite_code) +
      '</code> <button id="props-invite-btn" style="margin-left:8px;padding:2px 6px;font-size:11px;' +
      'background: var(--win-bg);border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'cursor:pointer;font-family:inherit;color: var(--text);">Show Invite</button>'
    : '—';
  showPropertiesDialog('Room Properties', [
    { label: 'Name:', value: escapeHtml(room.name) },
    { label: 'Invite Code:', value: codeDisplay },
    { label: 'Room ID:', value: '<code style="font-size:11px;">' + escapeHtml(room.id) + '</code>' },
    { label: 'Owner:', value: room.owner_id === state.user.id
        ? 'You' : escapeHtml(room.owner_id.slice(0, 8) + '...') },
    { label: 'Created:', value: formatLocalFull(room.created_at) },
    { label: 'Channels:', value: String(state.channels.length || 0) },
  ]);
  setTimeout(() => {
    const btn = document.getElementById('props-invite-btn');
    if (btn) {
      btn.onclick = () => {
        Sound.click();
        document.querySelector('.lightbox-overlay')?.remove();
        showInviteDialog(room);
      };
    }
  }, 0);
}

export function showChannelProperties(channel) {
  showPropertiesDialog('Channel Properties', [
    { label: 'Name:', value: '#' + escapeHtml(channel.name) },
    { label: 'Channel ID:', value: '<code style="font-size:11px;">' + escapeHtml(channel.id) + '</code>' },
    { label: 'Room:', value: escapeHtml(state.currentRoom?.name || '-') },
    { label: 'Created:', value: formatLocalFull(channel.created_at) },
  ]);
}

export function showMessageProperties(msg) {
  showPropertiesDialog('Message Properties', [
    { label: 'Author:', value: escapeHtml(msg.author?.username || 'Unknown') },
    { label: 'Time:', value: formatLocalFull(msg.created_at) },
    { label: 'Message ID:', value: '<code style="font-size:11px;">' + escapeHtml(msg.id) + '</code>' },
    { label: 'Length:', value: String((msg.content || '').length) + ' chars' },
    ...(msg.attachment_url
      ? [{ label: 'Attachment:',
           value: '<a href="' + escapeHtml(msg.attachment_url) + '" target="_blank" style="color: var(--accent);">View image</a>' }]
      : []),
  ]);
}

export function showDisplayProperties() {
  document.getElementById('display-props')?.remove();
  const currentTheme = getCurrentTheme();
  let selectedTheme = currentTheme;
  const themeOptions = Object.entries(THEMES).map(([key, t]) =>
    '<option value="' + key + '"' + (key === currentTheme ? ' selected' : '') + '>' +
    t.icon + ' ' + escapeHtml(t.name) + '</option>'
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'display-props';
  overlay.style.cssText =
    'position: fixed; inset: 0; background: rgba(0,0,0,0.35);' +
    'display: flex; align-items: center; justify-content: center;' +
    'z-index: 999998; font-family: "MS Sans Serif", Arial, sans-serif;';
  overlay.innerHTML =
    '<div style="background: var(--win-bg); padding: 2px; border: 2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'min-width: 420px; max-width: 90vw; box-shadow: 1px 1px 0 #000;">' +
    '<div style="background: linear-gradient(to right, var(--title-bg), var(--title-bg-end));' +
    'color: var(--title-text); padding: 3px 6px; font-weight: bold; font-size: 12px;' +
    'display: flex; justify-content: space-between; align-items: center;">' +
    '<span>🎨 Display Properties</span><span style="font-size: 10px;">X</span></div>' +
    '<div style="padding: 16px;">' +
    '<div style="display:flex; gap:16px; align-items:flex-start;">' +
    '<div style="font-size: 48px;">🖥️</div>' +
    '<div style="flex:1;">' +
    '<div style="font-size: 12px; margin-bottom: 8px; color: var(--text);">Color scheme:</div>' +
    '<select id="theme-select" style="width: 100%; padding: 4px; font-family: inherit; font-size: 12px;' +
    'background: var(--chat-bg); color: var(--chat-text);' +
    'border: 2px solid; border-color: var(--win-border-dark) var(--win-border-light) var(--win-border-light) var(--win-border-dark);">' +
    themeOptions + '</select>' +
    '<div style="margin-top: 12px; padding: 8px; background: var(--win-bg-alt);' +
    'border: 2px inset var(--win-border-mid); font-size: 11px; color: var(--text-muted);">🖼 Preview</div>' +
    '</div></div></div>' +
    '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: flex-end;">' +
    '<button id="dp-ok" style="min-width:80px;padding:5px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;color: var(--text);">OK</button>' +
    '<button id="dp-cancel" style="min-width:80px;padding:5px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;color: var(--text);">Cancel</button>' +
    '<button id="dp-apply" style="min-width:80px;padding:5px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;color: var(--text);">Apply</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
  const select = overlay.querySelector('#theme-select');
  select.onchange = () => { selectedTheme = select.value; applyTheme(selectedTheme); };
  overlay.querySelector('#dp-ok').onclick = () => { applyTheme(selectedTheme); overlay.remove(); };
  overlay.querySelector('#dp-cancel').onclick = () => { applyTheme(currentTheme); overlay.remove(); };
  overlay.querySelector('#dp-apply').onclick = () => { applyTheme(selectedTheme); };
  overlay.onclick = (e) => {
    if (e.target === overlay) { applyTheme(currentTheme); overlay.remove(); }
  };
}