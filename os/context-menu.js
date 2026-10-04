import { state } from '../lib/state.js';
import { escapeHtml } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { copyToClipboard } from '../lib/clipboard.js';
import { formatLocalFull } from '../lib/time.js';
import Sound from '../sounds.js';
import { selectRoom, renameRoom, deleteRoom } from '../chat/rooms.js';
import { selectChannel, renameChannel, deleteChannel } from '../chat/channels.js';
import { deleteMessage } from '../chat/messages.js';
import { showInviteDialog } from '../auth/invite.js';
import {
  showRoomProperties, showChannelProperties,
  showMessageProperties, showDisplayProperties,
} from './properties.js';

const CONTEXT_MENUS = {
  room: (room) => {
    const isOwner = room.owner_id === state.user?.id;
    return [
      { label: 'Open', action: () => selectRoom(room) },
      { divider: true },
      { label: 'Invite to Room...', action: () => showInviteDialog(room) },
      { divider: true },
      { label: 'Rename...', disabled: !isOwner, action: () => renameRoom(room) },
      { label: 'Delete', disabled: !isOwner, action: () => deleteRoom(room) },
      { divider: true },
      { label: 'Properties', action: () => showRoomProperties(room) },
    ];
  },
  channel: (channel) => {
    const isOwner = state.currentRoom?.owner_id === state.user?.id;
    return [
      { label: 'Open', action: () => selectChannel(channel) },
      { divider: true },
      { label: 'Rename...', disabled: !isOwner, action: () => renameChannel(channel) },
      { label: 'Delete', disabled: !isOwner, action: () => deleteChannel(channel) },
      { divider: true },
      { label: 'Copy Name', action: () => copyToClipboard('#' + channel.name) },
      { label: 'Properties', action: () => showChannelProperties(channel) },
    ];
  },
  message: (msg, el) => {
    const isMine = msg.author_id === state.user?.id;
    return [
      { label: 'Copy Text', action: () => copyToClipboard(msg.content || '') },
      { label: 'Copy Author', action: () => copyToClipboard(msg.author?.username || '') },
      { label: 'Copy Timestamp', action: () => copyToClipboard(formatLocalFull(msg.created_at)) },
      { divider: true },
      { label: 'Reply', disabled: true, action: () => {} },
      { label: 'React', disabled: true, action: () => {} },
      { divider: true },
      { label: 'Delete', disabled: !isMine, action: () => deleteMessage(msg, el) },
      { label: 'Properties', action: () => showMessageProperties(msg) },
    ];
  },
  desktop: () => [
    { label: 'Refresh', action: () => location.reload() },
    { divider: true },
    { label: 'Arrange Icons', disabled: true, action: () => {} },
    { label: 'Line up Icons', disabled: true, action: () => {} },
    { divider: true },
    { label: 'New Room...', action: () => document.getElementById('add-room-btn').click() },
    { label: 'New Channel...', disabled: !state.currentRoom,
      action: () => document.getElementById('add-channel-btn').click() },
    { divider: true },
    { label: 'Properties', action: () => showDisplayProperties() },
  ],
  taskbar: () => [
    { label: 'Cascade Windows', disabled: true, action: () => {} },
    { label: 'Tile Windows', disabled: true, action: () => {} },
    { label: 'Minimize All', action: () => {
        if (window.pulsarOS?.getOpenWindows) {
          window.pulsarOS.getOpenWindows().forEach((w) => {
            if (!w.minimized) window.pulsarOS.minimizeWindow(w.id);
          });
        }
      } },
    { divider: true },
    { label: 'Task Manager', disabled: true, action: () => {} },
    { label: 'Properties', disabled: true, action: () => {} },
  ],
};

export function showContextMenu(x, y, items) {
  document.querySelectorAll('.win95-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'win95-menu';
  items.forEach((item) => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'win95-menu-divider';
      menu.appendChild(d);
      return;
    }
    const el = document.createElement('div');
    el.className = 'win95-menu-item' + (item.disabled ? ' disabled' : '');
    el.textContent = item.label;
    if (!item.disabled && item.action) {
      el.onclick = (e) => {
        e.stopPropagation();
        Sound.click();
        closeAllMenus();
        item.action();
      };
    }
    menu.appendChild(el);
  });
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  let px = x, py = y;
  if (px + rect.width > window.innerWidth - 4) px = window.innerWidth - rect.width - 4;
  if (py + rect.height > window.innerHeight - 4) py = window.innerHeight - rect.height - 4;
  if (px < 0) px = 0;
  if (py < 0) py = 0;
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';
  menu.classList.add('open');
}

export function closeAllMenus() {
  document.querySelectorAll('.win95-menu').forEach((m) => m.remove());
}

export function attachRoomContextMenus() {
  document.querySelectorAll('.room-icon').forEach((el) => {
    const roomId = el.dataset.roomId;
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return;
    el.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.room(room));
    };
  });
}

export function attachChannelContextMenus() {
  document.querySelectorAll('.channel-item').forEach((el) => {
    const channelId = el.dataset.channelId;
    const channel = state.channels.find((c) => c.id === channelId);
    if (!channel) return;
    el.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.channel(channel));
    };
  });
}

export function attachMessageContextMenus() {
  document.querySelectorAll('.message').forEach((el) => {
    const messageId = el.dataset.messageId;
    if (!messageId) return;
    el.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      supabase.from('messages')
        .select('*, author:profiles(username, avatar_color)')
        .eq('id', messageId).single()
        .then(({ data }) => {
          if (data) showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.message(data, el));
        });
    };
  });
}

export function initGlobalContextMenus() {
  document.addEventListener('click', closeAllMenus);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllMenus(); });
  window.addEventListener('blur', closeAllMenus);
  window.addEventListener('resize', closeAllMenus);

  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.room-icon')) return;
    if (e.target.closest('.channel-item')) return;
    if (e.target.closest('.message')) return;
    if (e.target.closest('.win95-menu')) return;
    if (e.target.closest('#win95-start-menu')) return;
    if (e.target.closest('#win95-taskbar')) return;
    if (e.target.closest('.os-window')) return;
    if (e.target.closest('.desktop-icon')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.desktop());
  });

  const taskbarEl = document.getElementById('win95-taskbar');
  if (taskbarEl) {
    taskbarEl.oncontextmenu = (e) => {
      if (e.target.closest('.win95-task-btn')) return;
      if (e.target.closest('#win95-start-btn')) return;
      if (e.target.closest('#win95-tray')) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.taskbar());
    };
  }
}

export { CONTEXT_MENUS };