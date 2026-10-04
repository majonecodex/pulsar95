import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { escapeHtml } from '../lib/dom.js';
import { win95Confirm } from '../lib/dialogs.js';
import { copyToClipboard } from '../lib/clipboard.js';
import Sound from '../sounds.js';
import { loadRooms, selectRoom } from '../chat/rooms.js';

export function showInviteDialog(room) {
  const inviteCode = room.invite_code;
  if (!inviteCode) return alert('This room has no invite code yet. Refresh and try again.');
  const inviteUrl = window.location.origin + '/?invite=' + inviteCode;

  const overlay = document.createElement('div');
  overlay.id = 'invite-dialog';
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
    '<span>🎫 Invite to ' + escapeHtml(room.name) + '</span>' +
    '<span style="font-size: 10px;">X</span></div>' +
    '<div style="padding: 16px;">' +
    '<div style="font-size: 12px; color: var(--text); margin-bottom: 10px;">Share this code or link with anyone you want to invite:</div>' +
    '<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Invite Code</div>' +
    '<div style="display:flex; gap:6px; margin-bottom: 12px;">' +
    '<input id="invite-code-input" readonly value="' + escapeHtml(inviteCode) + '" ' +
    'style="flex:1; font-family: \'Courier New\', monospace; font-size: 16px; font-weight: bold;' +
    'letter-spacing: 2px; padding: 6px 10px; background: var(--chat-bg); color: var(--chat-text);' +
    'border: 2px solid; border-color: var(--win-border-dark) var(--win-border-light) var(--win-border-light) var(--win-border-dark);' +
    'text-align: center;">' +
    '<button id="invite-copy-code" style="min-width:70px;padding:4px 8px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:11px;cursor:pointer;color: var(--text);">Copy</button></div>' +
    '<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Share Link</div>' +
    '<div style="display:flex; gap:6px;">' +
    '<input id="invite-url-input" readonly value="' + escapeHtml(inviteUrl) + '" ' +
    'style="flex:1; font-family: inherit; font-size: 11px; padding: 6px 8px;' +
    'background: var(--chat-bg); color: var(--chat-text);' +
    'border: 2px solid; border-color: var(--win-border-dark) var(--win-border-light) var(--win-border-light) var(--win-border-dark);">' +
    '<button id="invite-copy-url" style="min-width:70px;padding:4px 8px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:11px;cursor:pointer;color: var(--text);">Copy</button></div>' +
    '<div style="margin-top: 12px; padding: 8px; background: var(--win-bg-alt);' +
    'border: 2px inset var(--win-border-mid); font-size: 11px; color: var(--text-muted);">' +
    'ℹ️ Anyone with this link can join the room. They still need their own account.</div>' +
    '</div>' +
    '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: flex-end;">' +
    '<button id="invite-ok" style="min-width:80px;padding:5px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;color: var(--text);">OK</button>' +
    '</div></div>';
  document.body.appendChild(overlay);

  overlay.querySelector('#invite-copy-code').onclick = () => {
    copyToClipboard(inviteCode); Sound.click();
    flashButton(overlay.querySelector('#invite-copy-code'), 'Copied!');
  };
  overlay.querySelector('#invite-copy-url').onclick = () => {
    copyToClipboard(inviteUrl); Sound.click();
    flashButton(overlay.querySelector('#invite-copy-url'), 'Copied!');
  };
  overlay.querySelector('#invite-ok').onclick = () => { Sound.click(); overlay.remove(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function flashButton(btn, text) {
  const original = btn.textContent;
  btn.textContent = text; btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
}

async function checkInviteOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');
  if (!code) return;
  let tries = 0;
  while (!state.user && tries < 20) {
    await new Promise((r) => setTimeout(r, 500));
    tries++;
  }
  if (!state.user) {
    sessionStorage.setItem('pulsar95_pending_invite', code);
    history.replaceState({}, '', window.location.pathname);
    return;
  }
  await processInviteCode(code);
  history.replaceState({}, '', window.location.pathname);
}

export async function processInviteCode(code) {
  if (!state.user) return;
  const { data: room, error } = await supabase
    .from('rooms').select('*').eq('invite_code', code).single();
  if (error || !room) return alert('That invite link is invalid or has expired.');
  const { data: existing } = await supabase
    .from('room_members').select('*').eq('room_id', room.id)
    .eq('user_id', state.user.id).maybeSingle();
  if (existing) { await selectRoom(room); return; }
  const ok = await win95Confirm(
    'Join Room?',
    'You\'ve been invited to join room <b>"' + escapeHtml(room.name) + '"</b>.<br><br>Join this room?'
  );
  if (!ok) return;
  const { error: joinErr } = await supabase
    .from('room_members').insert({ room_id: room.id, user_id: state.user.id });
  if (joinErr && !joinErr.message.includes('duplicate'))
    return alert('Failed to join room: ' + joinErr.message);
  Sound.success();
  await loadRooms();
  await selectRoom(room);
}

export function initInviteCheck() {
  setTimeout(checkInviteOnLoad, 500);
}