import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PALETTE = ['#000080','#008000','#800000','#800080','#008080','#808000','#c00000','#004080'];
const colorFor = (str) =>
  PALETTE[[...str].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const state = {
  user: null,
  profile: null,
  rooms: [],
  channels: [],
  currentRoom: null,
  currentChannel: null,
  messagesSub: null,
};

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const showAuthError = (msg) => {
  $('auth-error').textContent = msg || '';
  $('auth-info').textContent = '';
};

const showAuthInfo = (msg) => {
  $('auth-info').textContent = msg || '';
  $('auth-error').textContent = '';
};

/* ============================================================
   AUTH
   ============================================================ */

$('login-btn').onclick = async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) return showAuthError('Email and password required.');
  showAuthError('');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
};

$('signup-btn').onclick = async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  const username = $('username').value.trim() || email.split('@')[0];
  if (!email || !password) return showAuthError('Email and password required.');
  if (password.length < 6) return showAuthError('Password must be 6 or more characters.');
  showAuthError('');
  const avatar_color = colorFor(username);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, avatar_color } },
  });
  if (error) return showAuthError(error.message);
  showAuthInfo('Account created. Check your email if confirmation is enabled.');
};

$('logout-btn').onclick = async () => {
  if (state.messagesSub) await supabase.removeChannel(state.messagesSub);
  await supabase.auth.signOut();
  location.reload();
};

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    state.user = session.user;
    await bootApp();
  } else {
    $('auth-screen').classList.remove('hidden');
    $('app-screen').classList.add('hidden');
  }
});

/* ============================================================
   BOOT
   ============================================================ */

async function bootApp() {
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  $('status-text').textContent = 'Connected';

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .single();

  state.profile = profile || {
    username: state.user.email.split('@')[0],
    avatar_color: colorFor(state.user.email),
  };

  $('user-name').textContent = state.profile.username;
  $('user-dot').style.background = state.profile.avatar_color;

  await loadRooms();

  // Realtime stream — handles INSERT and DELETE
  state.messagesSub = supabase
    .channel('messages-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        if (payload.new.channel_id !== state.currentChannel?.id) return;
        const { data: author } = await supabase
          .from('profiles')
          .select('username, avatar_color')
          .eq('id', payload.new.author_id)
          .single();
        appendMessage({ ...payload.new, author }, true);
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        if (payload.old.channel_id !== state.currentChannel?.id) return;
        const el = document.querySelector(
          '.message[data-message-id="' + payload.old.id + '"]'
        );
        if (el) el.remove();
      }
    )
    .subscribe();
}

/* ============================================================
   ROOMS
   ============================================================ */

async function loadRooms() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('created_at');
  if (error) return alert(error.message);

  state.rooms = data || [];
  const container = $('rooms-container');
  container.innerHTML = '';

  state.rooms.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'room-icon';
    div.title = r.name + (r.owner_id === state.user.id ? ' (you own this)' : '');
    div.textContent = r.name.slice(0, 6);
    div.dataset.roomId = r.id;
    div.onclick = () => selectRoom(r);

    // Right-click → delete (only if you own it)
    if (r.owner_id === state.user.id) {
      div.oncontextmenu = async (e) => {
        e.preventDefault();
        const ok = await win95Confirm(
          'Delete Room',
          'Delete room "<b>' + escapeHtml(r.name) + '</b>"?<br><br>' +
          'All channels and messages inside will be <b>permanently</b> deleted.'
        );
        if (!ok) return;

        const { error } = await supabase.from('rooms').delete().eq('id', r.id);
        if (error) return alert(error.message);

        // Clear current selections if they belonged to this room
        if (state.currentRoom?.id === r.id) {
          state.currentRoom = null;
          state.currentChannel = null;
          $('room-name').textContent = '...';
          $('channels-container').innerHTML = '';
          $('messages').innerHTML = '';
          $('channel-name').textContent = '-';
        }
        await loadRooms();
      };
    }

    container.appendChild(div);
  });

  if (state.rooms.length) {
    // Only auto-select if we don't already have a valid current room
    const stillExists = state.currentRoom &&
      state.rooms.some((r) => r.id === state.currentRoom.id);
    if (!stillExists) {
      await selectRoom(state.rooms[0]);
    } else {
      // re-highlight current room
      document.querySelectorAll('.room-icon').forEach((el) => el.classList.remove('active'));
      document
        .querySelector('.room-icon[data-room-id="' + state.currentRoom.id + '"]')
        ?.classList.add('active');
    }
  } else {
    state.currentRoom = null;
    state.currentChannel = null;
    $('room-name').textContent = 'No rooms yet';
    $('channels-container').innerHTML = '';
    $('messages').innerHTML =
      '<div class="empty-state">No rooms yet. Click + to create one.</div>';
  }
}

async function selectRoom(room) {
  state.currentRoom = room;
  $('room-name').textContent = room.name;

  document.querySelectorAll('.room-icon').forEach((el) => el.classList.remove('active'));
  document
    .querySelector('.room-icon[data-room-id="' + room.id + '"]')
    ?.classList.add('active');

  if (state.user) {
    await supabase
      .from('room_members')
      .upsert(
        { room_id: room.id, user_id: state.user.id },
        { onConflict: 'room_id,user_id', ignoreDuplicates: true }
      );
  }

  await loadChannels();
}

$('add-room-btn').onclick = async () => {
  const name = prompt('New room name (e.g. "Observatory"):');
  if (!name || !name.trim()) return;

  const { data, error } = await supabase
    .from('rooms')
    .insert({ name: name.trim().slice(0, 40), owner_id: state.user.id })
    .select()
    .single();

  if (error) return alert(error.message);
  await loadRooms();
  selectRoom(data);
};

/* ============================================================
   CHANNELS
   ============================================================ */

async function loadChannels() {
  if (!state.currentRoom) return;

  const { data } = await supabase
    .from('channels')
    .select('*')
    .eq('room_id', state.currentRoom.id)
    .order('created_at');

  state.channels = data || [];
  const container = $('channels-container');
  container.innerHTML = '';

  const isOwner = state.currentRoom.owner_id === state.user.id;

  state.channels.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'channel-item';
    div.textContent = c.name;
    div.dataset.channelId = c.id;
    div.onclick = () => selectChannel(c);

    // Right-click → delete (room owner only)
    if (isOwner) {
      div.oncontextmenu = async (e) => {
        e.preventDefault();
        const ok = await win95Confirm(
          'Delete Channel',
          'Delete channel "<b>#' + escapeHtml(c.name) + '</b>"?<br><br>' +
          'All messages in this channel will be <b>permanently</b> deleted.'
        );
        if (!ok) return;

        const { error } = await supabase.from('channels').delete().eq('id', c.id);
        if (error) return alert(error.message);

        // Clear current channel if it was this one
        if (state.currentChannel?.id === c.id) {
          state.currentChannel = null;
          $('channel-name').textContent = '-';
          $('messages').innerHTML = '';
        }
        await loadChannels();
      };
    }

    container.appendChild(div);
  });

  // Keep current channel if it still exists, otherwise pick first
  const stillExists = state.currentChannel &&
    state.channels.some((c) => c.id === state.currentChannel.id);

  if (stillExists) {
    // re-highlight
    document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
    document
      .querySelector('.channel-item[data-channel-id="' + state.currentChannel.id + '"]')
      ?.classList.add('active');
    await loadMessages();
  } else if (state.channels.length) {
    await selectChannel(state.channels[0]);
  } else {
    state.currentChannel = null;
    $('channel-name').textContent = 'no channels';
    $('messages').innerHTML =
      '<div class="empty-state">No channels yet. Click + New Channel.</div>';
  }
}

async function selectChannel(channel) {
  state.currentChannel = channel;
  $('channel-name').textContent = channel.name;
  $('message-input').placeholder = 'Message #' + channel.name;

  document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
  document
    .querySelector('.channel-item[data-channel-id="' + channel.id + '"]')
    ?.classList.add('active');

  await loadMessages();
}

$('add-channel-btn').onclick = async () => {
  if (!state.currentRoom) return alert('Create a room first.');
  const name = prompt('New channel name (e.g. "general"):');
  if (!name || !name.trim()) return;

  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  const { error } = await supabase
    .from('channels')
    .insert({ name: slug, room_id: state.currentRoom.id });

  if (error) return alert(error.message);
  await loadChannels();
};

/* ============================================================
   MESSAGES
   ============================================================ */

async function loadMessages() {
  if (!state.currentChannel) return;

  const { data } = await supabase
    .from('messages')
    .select('*, author:profiles(username, avatar_color)')
    .eq('channel_id', state.currentChannel.id)
    .order('created_at')
    .limit(200);

  const container = $('messages');
  container.innerHTML = '';

  if (!data || data.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No messages yet. Say something.</div>';
  } else {
    data.forEach((m) => appendMessage(m));
    scrollToBottom();
  }
}

function appendMessage(msg, scroll = false) {
  const container = $('messages');
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const author = msg.author?.username || 'Unknown';
  const color = msg.author?.avatar_color || colorFor(author);
  const initial = author.charAt(0).toUpperCase();
  const time = new Date(msg.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isMine = msg.author_id === state.user.id;

  const div = document.createElement('div');
  div.className = 'message';
  div.dataset.messageId = msg.id;
  div.innerHTML =
    '<div class="message-avatar" style="background:' + escapeHtml(color) + '">' + escapeHtml(initial) + '</div>' +
    '<div class="message-content">' +
      '<div class="message-header">' +
        '<span class="message-author">' + escapeHtml(author) + '</span>' +
        '<span class="message-time">' + escapeHtml(time) + '</span>' +
      '</div>' +
      '<div class="message-text">' + escapeHtml(msg.content) + '</div>' +
    '</div>';

  // Right-click → delete (own messages only)
  if (isMine) {
    div.oncontextmenu = async (e) => {
      e.preventDefault();
      const ok = await win95Confirm(
        'Delete Message',
        'Delete this message?<br><br>' +
        '<i>"' + escapeHtml(msg.content.slice(0, 80)) +
        (msg.content.length > 80 ? '…' : '') + '"</i>'
      );
      if (!ok) return;
      const { error } = await supabase.from('messages').delete().eq('id', msg.id);
      if (error) return alert(error.message);
      div.remove();
    };
  }

  container.appendChild(div);
  if (scroll) scrollToBottom();
}

$('composer').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('message-input');
  const content = input.value.trim();
  if (!content || !state.currentChannel) return;

  input.value = '';
  const { error } = await supabase.from('messages').insert({
    channel_id: state.currentChannel.id,
    author_id: state.user.id,
    content,
  });
  if (error) {
    alert(error.message);
    input.value = content;
  }
};

const scrollToBottom = () => {
  const el = $('messages');
  el.scrollTop = el.scrollHeight;
};

/* ============================================================
   INIT
   ============================================================ */

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    $('auth-screen').classList.remove('hidden');
  }
});

/* ============================================================
   WIN95-STYLE CONFIRM DIALOG
   ============================================================ */

function win95Confirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position: fixed; inset: 0; background: rgba(0,0,0,0.3);' +
      'display: flex; align-items: center; justify-content: center;' +
      'z-index: 9999; font-family: "MS Sans Serif", Arial, sans-serif;';

    overlay.innerHTML =
      '<div style="' +
        'background: #c0c0c0; padding: 2px;' +
        'border: 2px solid;' +
        'border-color: #dfdfdf #404040 #404040 #dfdfdf;' +
        'min-width: 320px; max-width: 420px;' +
        'box-shadow: 1px 1px 0 #000;' +
      '">' +
        '<div style="' +
          'background: #000080; color: #fff; padding: 3px 6px;' +
          'font-weight: bold; font-size: 12px;' +
          'display: flex; justify-content: space-between; align-items: center;' +
        '">' +
          '<span>' + escapeHtml(title) + '</span>' +
          '<span style="font-size: 10px;">X</span>' +
        '</div>' +
        '<div style="padding: 16px; display: flex; gap: 12px; align-items: flex-start;">' +
          '<div style="font-size: 28px;">?</div>' +
          '<div style="font-size: 12px; line-height: 1.4;">' + message + '</div>' +
        '</div>' +
        '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: center;">' +
          '<button id="w95-yes" style="' +
            'min-width: 70px; padding: 4px;' +
            'background: #c0c0c0; border: 2px solid;' +
            'border-color: #dfdfdf #404040 #404040 #dfdfdf;' +
            'font-family: inherit; font-size: 12px; cursor: pointer;' +
          '">Yes</button>' +
          '<button id="w95-no" style="' +
            'min-width: 70px; padding: 4px;' +
            'background: #c0c0c0; border: 2px solid;' +
            'border-color: #dfdfdf #404040 #404040 #dfdfdf;' +
            'font-family: inherit; font-size: 12px; cursor: pointer;' +
          '">No</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#w95-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#w95-no').onclick  = () => { overlay.remove(); resolve(false); };
  });
}

