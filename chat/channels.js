import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { $, escapeHtml } from '../lib/dom.js';
import { win95Confirm } from '../lib/dialogs.js';
import { loadMessages } from './messages.js';
import { subscribeTyping } from './typing.js';
import { showChannelProperties } from '../os/properties.js';

export async function loadChannels() {
  if (!state.currentRoom) return;
  const { data } = await supabase
    .from('channels').select('*').eq('room_id', state.currentRoom.id).order('created_at');

  state.channels = data || [];
  const container = $('channels-container');
  if (!container) return;
  container.innerHTML = '';

  state.channels.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'channel-item';
    div.textContent = c.name;
    div.dataset.channelId = c.id;
    div.onclick = () => selectChannel(c);
    container.appendChild(div);
  });

  import('../os/context-menu.js').then((m) => m.attachChannelContextMenus());

  const stillExists = state.currentChannel &&
    state.channels.some((c) => c.id === state.currentChannel.id);

  if (stillExists) {
    document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
    document.querySelector('.channel-item[data-channel-id="' + state.currentChannel.id + '"]')
      ?.classList.add('active');
    await loadMessages();
    await subscribeTyping(state.currentChannel.id);
  } else if (state.channels.length) {
    await selectChannel(state.channels[0]);
  } else {
    state.currentChannel = null;
    if ($('channel-name')) $('channel-name').textContent = 'no channels';
    if ($('messages')) $('messages').innerHTML =
      '<div class="empty-state">No channels yet. Click + New Channel.</div>';
  }
}

export async function selectChannel(channel) {
  state.currentChannel = channel;
  if ($('channel-name')) $('channel-name').textContent = channel.name;
  if ($('message-input')) $('message-input').placeholder = 'Message #' + channel.name;
  document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
  document.querySelector('.channel-item[data-channel-id="' + channel.id + '"]')
    ?.classList.add('active');
  await loadMessages();
  await subscribeTyping(channel.id);
}

export function initChannelButtons() {
  $('add-channel-btn').onclick = async () => {
    if (!state.currentRoom) return alert('Create a room first.');
    const name = prompt('New channel name (e.g. "general"):');
    if (!name || !name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
    const { error } = await supabase.from('channels')
      .insert({ name: slug, room_id: state.currentRoom.id });
    if (error) return alert(error.message);
    await loadChannels();
  };
}

export async function renameChannel(channel) {
  const newName = prompt('Rename channel:', channel.name);
  if (!newName || !newName.trim() || newName === channel.name) return;
  const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  const { error } = await supabase.from('channels').update({ name: slug }).eq('id', channel.id);
  if (error) return alert(error.message);
  await loadChannels();
}

export async function deleteChannel(channel) {
  const ok = await win95Confirm(
    'Delete Channel',
    'Delete channel "<b>#' + escapeHtml(channel.name) + '</b>"?<br><br>' +
    'All messages in this channel will be <b>permanently</b> deleted.'
  );
  if (!ok) return;
  const { error } = await supabase.from('channels').delete().eq('id', channel.id);
  if (error) return alert(error.message);
  if (state.currentChannel?.id === channel.id) {
    state.currentChannel = null;
    if ($('channel-name')) $('channel-name').textContent = '-';
    if ($('messages')) $('messages').innerHTML = '';
  }
  await loadChannels();
}

export { showChannelProperties };