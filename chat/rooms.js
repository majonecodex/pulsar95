import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { $, escapeHtml } from '../lib/dom.js';
import { win95Confirm } from '../lib/dialogs.js';
import { showInviteDialog } from '../auth/invite.js';
import { loadChannels, selectChannel } from './channels.js';
import { showRoomProperties } from '../os/properties.js';

export async function loadRooms() {
  const { data, error } = await supabase.from('rooms').select('*').order('created_at');
  if (error) return alert(error.message);

  state.rooms = data || [];
  const container = $('rooms-container');
  if (!container) return;
  container.innerHTML = '';

  state.rooms.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'room-icon';
    div.title = r.name + (r.owner_id === state.user.id ? ' (you own this)' : '');
    div.textContent = r.name.slice(0, 6);
    div.dataset.roomId = r.id;
    div.onclick = () => selectRoom(r);
    container.appendChild(div);
  });

  // re-import to avoid circular: context menus attached by app.js
  import('../os/context-menu.js').then((m) => m.attachRoomContextMenus());

  if (state.rooms.length) {
    const stillExists = state.currentRoom &&
      state.rooms.some((r) => r.id === state.currentRoom.id);
    if (!stillExists) await selectRoom(state.rooms[0]);
    else {
      document.querySelectorAll('.room-icon').forEach((el) => el.classList.remove('active'));
      document.querySelector('.room-icon[data-room-id="' + state.currentRoom.id + '"]')
        ?.classList.add('active');
    }
  } else {
    state.currentRoom = null;
    state.currentChannel = null;
    if ($('room-name')) $('room-name').textContent = 'No rooms yet';
    if ($('channels-container')) $('channels-container').innerHTML = '';
    if ($('messages')) $('messages').innerHTML =
      '<div class="empty-state">No rooms yet. Click + to create one.</div>';
  }
}

export async function selectRoom(room) {
  state.currentRoom = room;
  if ($('room-name')) $('room-name').textContent = room.name;
  document.querySelectorAll('.room-icon').forEach((el) => el.classList.remove('active'));
  document.querySelector('.room-icon[data-room-id="' + room.id + '"]')?.classList.add('active');

  if (state.user) {
    await supabase.from('room_members').upsert(
      { room_id: room.id, user_id: state.user.id },
      { onConflict: 'room_id,user_id', ignoreDuplicates: true }
    );
  }
  await loadChannels();
}

export function initRoomButtons() {
  $('add-room-btn').onclick = async () => {
    const name = prompt('New room name (e.g. "Observatory"):');
    if (!name || !name.trim()) return;
    const { data, error } = await supabase
      .from('rooms')
      .insert({ name: name.trim().slice(0, 40), owner_id: state.user.id })
      .select().single();
    if (error) return alert(error.message);
    await loadRooms();
    selectRoom(data);
  };
}

export async function renameRoom(room) {
  const newName = prompt('Rename room:', room.name);
  if (!newName || !newName.trim() || newName === room.name) return;
  const { error } = await supabase.from('rooms')
    .update({ name: newName.trim().slice(0, 40) }).eq('id', room.id);
  if (error) return alert(error.message);
  await loadRooms();
}

export async function deleteRoom(room) {
  const ok = await win95Confirm(
    'Delete Room',
    'Delete room "<b>' + escapeHtml(room.name) + '</b>"?<br><br>' +
    'All channels and messages inside will be <b>permanently</b> deleted.'
  );
  if (!ok) return;
  const { error } = await supabase.from('rooms').delete().eq('id', room.id);
  if (error) return alert(error.message);
  if (state.currentRoom?.id === room.id) {
    state.currentRoom = null;
    state.currentChannel = null;
    if ($('room-name')) $('room-name').textContent = '...';
    if ($('channels-container')) $('channels-container').innerHTML = '';
    if ($('messages')) $('messages').innerHTML = '';
    if ($('channel-name')) $('channel-name').textContent = '-';
  }
  await loadRooms();
}

export { showInviteDialog };