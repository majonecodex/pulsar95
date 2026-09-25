import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import Sound from './sounds.js';
import { THEMES, applyTheme, getCurrentTheme, loadSavedTheme } from './themes.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   GLOBALS
   ============================================================ */

const PALETTE = ['#000080', '#008000', '#800000', '#800080', '#008080', '#808000', '#c00000', '#004080'];
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
  presenceChannel: null,
  typingUsers: new Map(),
};

let isBooted = false;
let pendingAttachmentUrl = null;

const TYPING_TIMEOUT_MS = 3000;
const TYPING_COOLDOWN_MS = 1500;
let myTypingTimeout = null;
let myTypingLastSent = 0;
let myTypingActive = false;

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    email, password,
    options: { data: { username, avatar_color } },
  });
  if (error) return showAuthError(error.message);
  showAuthInfo('Account created. Check your email if confirmation is enabled.');
};

$('logout-btn').onclick = async () => {
  if (state.messagesSub) await supabase.removeChannel(state.messagesSub);
  if (state.presenceChannel) {
    try {
      await state.presenceChannel.untrack();
      await supabase.removeChannel(state.presenceChannel);
    } catch (e) { }
  }
  if (window.pulsarOS && window.pulsarOS.closeAllWindows) window.pulsarOS.closeAllWindows();
  await supabase.auth.signOut();
  isBooted = false;
  location.reload();
};

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    state.user = session.user;
    await bootApp();
  } else {
    $('auth-screen').classList.remove('hidden');
    $('app-screen').classList.add('hidden');
    if (window.pulsarOS && window.pulsarOS.hideDesktop) window.pulsarOS.hideDesktop();
  }
});

/* ============================================================
   BOOT
   ============================================================ */

async function bootApp() {
  if (isBooted) return;
  isBooted = true;

  $('auth-screen').classList.add('hidden');

  // Show the OS desktop layer
  if (window.pulsarOS && window.pulsarOS.showDesktop) window.pulsarOS.showDesktop();

  // Hide the legacy chat screen — it opens as a window later
  $('app-screen').classList.add('hidden');
  if ($('status-text')) $('status-text').textContent = 'Connected';

  Sound.notify();

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', state.user.id).single();

  state.profile = profile || {
    username: state.user.email.split('@')[0],
    avatar_color: colorFor(state.user.email),
  };

  if ($('user-name')) $('user-name').textContent = state.profile.username;
  if ($('user-dot')) $('user-dot').style.background = state.profile.avatar_color;

  await loadRooms();

  if (state.messagesSub) {
    await supabase.removeChannel(state.messagesSub);
    state.messagesSub = null;
  }

  state.messagesSub = supabase
    .channel('messages-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        if (payload.new.channel_id !== state.currentChannel?.id) return;
        if (payload.new.author_id !== state.user.id) Sound.message();
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

  const composerInput = document.getElementById('message-input');
  if (composerInput && !composerInput.dataset.typingHooked) {
    composerInput.dataset.typingHooked = '1';
    composerInput.addEventListener('input', () => {
      if (composerInput.value.trim().length > 0) notifyTyping();
      else stopTyping();
    });
    composerInput.addEventListener('blur', stopTyping);
    composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') stopTyping();
    });
  }

  const pendingInvite = sessionStorage.getItem('pulsar95_pending_invite');
  if (pendingInvite) {
    sessionStorage.removeItem('pulsar95_pending_invite');
    setTimeout(() => processInviteCode(pendingInvite), 800);
  }

  // Auto-open chat window so desktop isn't empty
  setTimeout(() => {
    const appScreen = document.getElementById('app-screen');
    if (appScreen) appScreen.classList.remove('hidden');
  }, 400);
}

/* ============================================================
   ROOMS
   ============================================================ */

async function loadRooms() {
  const { data, error } = await supabase
    .from('rooms').select('*').order('created_at');
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
        if (state.currentRoom?.id === r.id) {
          state.currentRoom = null;
          state.currentChannel = null;
          if ($('room-name')) $('room-name').textContent = '...';
          if ($('channels-container')) $('channels-container').innerHTML = '';
          if ($('messages')) $('messages').innerHTML = '';
          if ($('channel-name')) $('channel-name').textContent = '-';
        }
        await loadRooms();
      };
    }
    container.appendChild(div);
  });

  attachRoomContextMenus();

  if (state.rooms.length) {
    const stillExists = state.currentRoom &&
      state.rooms.some((r) => r.id === state.currentRoom.id);
    if (!stillExists) {
      await selectRoom(state.rooms[0]);
    } else {
      document.querySelectorAll('.room-icon').forEach((el) => el.classList.remove('active'));
      document.querySelector('.room-icon[data-room-id="' + state.currentRoom.id + '"]')?.classList.add('active');
    }
  } else {
    state.currentRoom = null;
    state.currentChannel = null;
    if ($('room-name')) $('room-name').textContent = 'No rooms yet';
    if ($('channels-container')) $('channels-container').innerHTML = '';
    if ($('messages')) {
      $('messages').innerHTML =
        '<div class="empty-state">No rooms yet. Click + to create one.</div>';
    }
  }
}

async function selectRoom(room) {
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

/* ============================================================
   CHANNELS
   ============================================================ */

async function loadChannels() {
  if (!state.currentRoom) return;
  const { data } = await supabase
    .from('channels').select('*').eq('room_id', state.currentRoom.id).order('created_at');

  state.channels = data || [];
  const container = $('channels-container');
  if (!container) return;
  container.innerHTML = '';

  const isOwner = state.currentRoom.owner_id === state.user.id;

  state.channels.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'channel-item';
    div.textContent = c.name;
    div.dataset.channelId = c.id;
    div.onclick = () => selectChannel(c);

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
        if (state.currentChannel?.id === c.id) {
          state.currentChannel = null;
          if ($('channel-name')) $('channel-name').textContent = '-';
          if ($('messages')) $('messages').innerHTML = '';
        }
        await loadChannels();
      };
    }
    container.appendChild(div);
  });

  attachChannelContextMenus();

  const stillExists = state.currentChannel &&
    state.channels.some((c) => c.id === state.currentChannel.id);

  if (stillExists) {
    document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
    document.querySelector('.channel-item[data-channel-id="' + state.currentChannel.id + '"]')?.classList.add('active');
    await loadMessages();
    await subscribeTyping(state.currentChannel.id);
  } else if (state.channels.length) {
    await selectChannel(state.channels[0]);
  } else {
    state.currentChannel = null;
    if ($('channel-name')) $('channel-name').textContent = 'no channels';
    if ($('messages')) {
      $('messages').innerHTML =
        '<div class="empty-state">No channels yet. Click + New Channel.</div>';
    }
  }
}

async function selectChannel(channel) {
  state.currentChannel = channel;
  if ($('channel-name')) $('channel-name').textContent = channel.name;
  if ($('message-input')) $('message-input').placeholder = 'Message #' + channel.name;
  document.querySelectorAll('.channel-item').forEach((el) => el.classList.remove('active'));
  document.querySelector('.channel-item[data-channel-id="' + channel.id + '"]')?.classList.add('active');
  await loadMessages();
  await subscribeTyping(channel.id);
}

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

/* ============================================================
   MESSAGES
   ============================================================ */

async function loadMessages() {
  if (!state.currentChannel) return;
  const { data } = await supabase
    .from('messages')
    .select('*, author:profiles(username, avatar_color)')
    .eq('channel_id', state.currentChannel.id)
    .order('created_at').limit(200);

  const container = $('messages');
  if (!container) return;
  container.innerHTML = '';

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Say something.</div>';
  } else {
    data.forEach((m) => appendMessage(m));
    scrollToBottom();
  }
  attachMessageContextMenus();
}

function appendMessage(msg, scroll = false) {
  const container = $('messages');
  if (!container) return;
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const author = msg.author?.username || 'Unknown';
  const color = msg.author?.avatar_color || colorFor(author);
  const initial = author.charAt(0).toUpperCase();
  const time = new Date(msg.created_at).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
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
    '<div class="message-text">' + highlightMentions(msg.content) + '</div>' +
    (msg.attachment_url
      ? '<div class="message-image" data-full="' + escapeHtml(msg.attachment_url) + '">' +
      '<img src="' + escapeHtml(msg.attachment_url) + '" alt="attachment" loading="lazy">' +
      '</div>'
      : '') +
    '</div>';

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

function highlightMentions(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
}

/* ============================================================
   COMPOSER
   ============================================================ */

$('composer').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('message-input');
  const content = input.value.trim();
  const attachment_url = pendingAttachmentUrl;
  if ((!content && !attachment_url) || !state.currentChannel) return;

  Sound.send();
  stopTyping();
  input.value = '';
  pendingAttachmentUrl = null;
  if ($('attach-btn')) {
    $('attach-btn').textContent = '📎';
    $('attach-btn').disabled = false;
  }
  $('message-input').placeholder = 'Message #' + state.currentChannel.name;

  const { error } = await supabase.from('messages').insert({
    channel_id: state.currentChannel.id,
    author_id: state.user.id,
    content: content || '(image)',
    attachment_url,
  });
  if (error) {
    alert(error.message);
    input.value = content;
  } else {
    Sound.success();
    summonPulsar(content);
  }
};

const scrollToBottom = () => {
  const el = $('messages');
  if (el) el.scrollTop = el.scrollHeight;
};

/* ============================================================
   INIT
   ============================================================ */

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) $('auth-screen').classList.remove('hidden');
});

/* ============================================================
   IMAGE UPLOADS
   ============================================================ */

if ($('attach-btn')) {
  $('attach-btn').onclick = () => $('file-input').click();
}

if ($('file-input')) {
  $('file-input').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('File too large (max 5 MB).');
    $('attach-btn').textContent = '⏳';
    $('attach-btn').disabled = true;
    const ext = file.name.split('.').pop();
    const path = `${state.user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (error) {
      alert('Upload failed: ' + error.message);
      $('attach-btn').textContent = '📎';
      $('attach-btn').disabled = false;
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path);
    pendingAttachmentUrl = publicUrl;
    $('attach-btn').textContent = '✅';
    $('message-input').placeholder = 'Image attached — press Send';
    $('file-input').value = '';
  };
}

/* ============================================================
   WIN95 CONFIRM DIALOG
   ============================================================ */

function win95Confirm(title, message) {
  return new Promise((resolve) => {
    Sound.ding();
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position: fixed; inset: 0; background: rgba(0,0,0,0.3);' +
      'display: flex; align-items: center; justify-content: center;' +
      'z-index: 999999; font-family: "MS Sans Serif", Arial, sans-serif;';
    overlay.innerHTML =
      '<div style="background: var(--win-bg); padding: 2px; border: 2px solid;' +
      'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'min-width: 320px; max-width: 420px; box-shadow: 1px 1px 0 #000;">' +
      '<div style="background: var(--title-bg); color: var(--title-text); padding: 3px 6px;' +
      'font-weight: bold; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">' +
      '<span>' + escapeHtml(title) + '</span><span style="font-size: 10px;">X</span>' +
      '</div>' +
      '<div style="padding: 16px; display: flex; gap: 12px; align-items: flex-start;">' +
      '<div style="font-size: 28px;">❓</div>' +
      '<div style="font-size: 12px; line-height: 1.4;">' + message + '</div>' +
      '</div>' +
      '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: center;">' +
      '<button id="w95-yes" style="min-width: 70px; padding: 4px; background: var(--win-bg);' +
      'border: 2px solid; border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'font-family: inherit; font-size: 12px; cursor: pointer;">Yes</button>' +
      '<button id="w95-no" style="min-width: 70px; padding: 4px; background: var(--win-bg);' +
      'border: 2px solid; border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
      'font-family: inherit; font-size: 12px; cursor: pointer;">No</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#w95-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#w95-no').onclick = () => { overlay.remove(); resolve(false); };
  });
}

/* ============================================================
   BOOT SEQUENCE
   ============================================================ */

const BOOT_SEQUENCE = [
  { text: '', delay: 100 },
  { text: 'Pulsar95 Systems Inc. — BIOS v2.1', delay: 200, cls: 'boot-header' },
  { text: 'Copyright (C) 1996-2026, Pulsar95 Corp.', delay: 300, cls: 'boot-header' },
  { text: '', delay: 300 },
  { text: 'Main Processor    : Cosmic 486DX2 66MHz', delay: 150 },
  { text: '', delay: 150 },
  { text: 'Memory Test       : 0K', delay: 80, key: 'memory' },
  { text: '', delay: 200 },
  { text: 'Detecting IDE drives...', delay: 400 },
  { text: '  Primary Master  : PULSAR-95 HDD', delay: 250 },
  { text: '  Primary Slave   : None', delay: 200 },
  { text: '  Secondary Master: CD-ROM 4x', delay: 200 },
  { text: '', delay: 300 },
  { text: 'Keyboard.........OK', delay: 150 },
  { text: 'Mouse............OK', delay: 150 },
  { text: 'Network..........OK', delay: 150 },
  { text: '', delay: 300 },
  { text: 'Starting Pulsar95...', delay: 700, cls: 'boot-header' },
];

async function runBootSequence() {
  const bootScreen = document.getElementById('boot-screen');
  const bootContent = document.getElementById('boot-content');
  const authScreen = document.getElementById('auth-screen');
  if (!bootScreen || !bootContent) return;

  if (sessionStorage.getItem('pulsar95_boot_done') === '1') {
    bootScreen.classList.add('hidden-boot');
    return;
  }

  let skipped = false;
  const skipHandler = () => {
    skipped = true;
    bootScreen.classList.add('fade-out');
    sessionStorage.setItem('pulsar95_boot_done', '1');
    setTimeout(() => bootScreen.classList.add('hidden-boot'), 600);
  };
  bootScreen.addEventListener('click', skipHandler, { once: true });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const line of BOOT_SEQUENCE) {
    if (skipped) return;
    if (line.key === 'memory') {
      const memLine = document.createElement('div');
      memLine.className = 'boot-line';
      memLine.innerHTML = '<span class="label">Memory Test       : </span><span class="value" id="mem-count">0K</span>';
      bootContent.appendChild(memLine);
      for (let k = 0; k <= 640; k += 64) {
        if (skipped) return;
        const el = document.getElementById('mem-count');
        if (el) el.textContent = k + 'K';
        await sleep(30);
      }
      const el = document.getElementById('mem-count');
      if (el) el.innerHTML = '640K <span class="accent">OK</span>';
      await sleep(200);
    } else {
      const div = document.createElement('div');
      div.className = 'boot-line' + (line.cls ? ' ' + line.cls : '');
      div.textContent = line.text;
      bootContent.appendChild(div);
      await sleep(line.delay);
    }
  }

  if (skipped) return;
  const cursorDiv = document.createElement('div');
  cursorDiv.className = 'boot-line';
  cursorDiv.innerHTML = '<span class="boot-cursor"></span>';
  bootContent.appendChild(cursorDiv);
  await sleep(800);
  if (skipped) return;

  playBootChime();
  bootScreen.classList.add('fade-out');
  sessionStorage.setItem('pulsar95_boot_done', '1');
  if (authScreen) authScreen.classList.add('boot-appear');
  setTimeout(() => bootScreen.classList.add('hidden-boot'), 600);
}

function playBootChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 261.63, start: 0.00, dur: 0.60 },
      { freq: 329.63, start: 0.15, dur: 0.60 },
      { freq: 392.00, start: 0.30, dur: 0.60 },
      { freq: 523.25, start: 0.45, dur: 1.20 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch (e) { }
}

runBootSequence();

/* ============================================================
   TASKBAR
   ============================================================ */

function initTaskbar() {
  const startBtn = document.getElementById('win95-start-btn');
  const startMenu = document.getElementById('win95-start-menu');
  const taskButtons = document.getElementById('win95-task-buttons');
  const clockEl = document.getElementById('win95-clock');
  if (!startBtn || !startMenu) return;

  startBtn.onclick = (e) => {
    e.stopPropagation();
    Sound.click();
    startMenu.classList.toggle('open');
    startBtn.classList.toggle('active', startMenu.classList.contains('open'));
  };

  document.addEventListener('click', (e) => {
    if (!startMenu.contains(e.target) && e.target !== startBtn) {
      startMenu.classList.remove('open');
      startBtn.classList.remove('active');
    }
  });

  startMenu.querySelectorAll('.start-menu-item').forEach((item) => {
    item.onclick = () => {
      Sound.click();
      const action = item.dataset.action;
      startMenu.classList.remove('open');
      startBtn.classList.remove('active');
      handleStartMenuAction(action);
    };
  });

  let showSeconds = false;
  let showDate = false;
  let clicks = 0;

  function updateClock() {
    const now = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: true };
    if (showSeconds) opts.second = '2-digit';
    if (showDate) {
      clockEl.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' + now.toLocaleTimeString([], opts);
    } else {
      clockEl.textContent = now.toLocaleTimeString([], opts);
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  clockEl.onclick = () => {
    clicks++;
    if (clicks === 1) { showSeconds = true; }
    else if (clicks === 2) { showDate = true; }
    else { showSeconds = false; showDate = false; clicks = 0; }
    updateClock();
  };

  const volumeIcon = document.querySelector('#win95-tray .tray-icon[title="Volume"]');
  if (volumeIcon) {
    volumeIcon.textContent = Sound.isMuted() ? '🔇' : '🔊';
    volumeIcon.onclick = () => {
      const nowMuted = Sound.toggleMute();
      volumeIcon.textContent = nowMuted ? '🔇' : '🔊';
      volumeIcon.title = nowMuted ? 'Muted' : 'Volume';
    };
  }

  window.updateTaskButtons();
}

function updateTaskButtons() {
  const taskButtons = document.getElementById('win95-task-buttons');
  if (!taskButtons) return;

  taskButtons.innerHTML = '';

  // 1. Real OS windows (from the window manager)
  if (window.pulsarOS && window.pulsarOS.getOpenWindows) {
    window.pulsarOS.getOpenWindows().forEach((w) => {
      const btn = document.createElement('button');
      btn.className = 'win95-task-btn' +
        (w.focused && !w.minimized ? ' active' : '') +
        (w.minimized ? ' minimized' : '');
      btn.dataset.windowId = w.id;
      btn.innerHTML =
        '<span class="task-icon">' + escapeHtml(w.icon) + '</span>' +
        '<span>' + escapeHtml(w.title) + '</span>';
      btn.onclick = (e) => {
        e.stopPropagation();
        Sound.click();
        const entry = window.pulsarOS.getOpenWindows().find((x) => x.id === w.id);
        if (entry?.minimized) {
          window.pulsarOS.restoreWindow(w.id);
        } else if (entry?.focused) {
          window.pulsarOS.minimizeWindow(w.id);
        } else {
          window.pulsarOS.focusWindow(w.id);
        }
      };
      taskButtons.appendChild(btn);
    });
  }

  // 2. Legacy chat app (only if visible AND not managed by window system)
  if (!$('app-screen').classList.contains('hidden') &&
    !document.querySelector('.os-window[data-window-id="chat"]')) {
    const btn = document.createElement('button');
    btn.className = 'win95-task-btn active';
    btn.id = 'task-app';
    btn.innerHTML = '<span class="task-icon">💬</span><span>Pulsar95</span>';
    btn.onclick = (e) => {
      e.stopPropagation();
      Sound.click();
      const win = document.querySelector('#app-screen .window');
      if (win) win.style.zIndex = 1000;
    };
    taskButtons.appendChild(btn);
  }

  // 3. Image lightbox
  if (document.getElementById('lightbox-overlay')) {
    const btn = document.createElement('button');
    btn.className = 'win95-task-btn active';
    btn.id = 'task-lightbox';
    btn.innerHTML = '<span class="task-icon">🖼</span><span>Image Viewer</span>';
    btn.onclick = (e) => {
      e.stopPropagation();
      Sound.click();
      const lb = document.getElementById('lightbox-overlay');
      if (lb) lb.style.zIndex = 100001;
    };
    taskButtons.appendChild(btn);
  }
}

window.updateTaskButtons = updateTaskButtons;

initTaskbar();

/* ============================================================
   START MENU ACTIONS
   ============================================================ */

function handleStartMenuAction(action) {
  switch (action) {
    case 'programs':
      openWindow({
        id: 'notepad',
        title: 'Untitled - Notepad',
        icon: '📝',
        width: 560,
        height: 400,
        content:
          '<textarea style="width:100%;height:100%;border:2px inset #808080;' +
          'font-family:\'Courier New\',monospace;font-size:13px;padding:6px;' +
          'resize:none;background:#fff;color:#000;outline:none;"></textarea>',
      });
      break;
    case 'documents':
      if (state.rooms?.length) {
        alert('Your rooms:\n\n' + state.rooms.map((r) => '• ' + r.name).join('\n'));
      } else {
        alert('No rooms yet.');
      }
      break;
    case 'settings':
      showDisplayProperties();
      break;
    case 'find':
      if (state.currentChannel) {
        const q = prompt('Find in #' + state.currentChannel.name + ':');
        if (q) {
          document.querySelectorAll('.message').forEach((m) => {
            const text = m.querySelector('.message-text')?.textContent || '';
            m.style.background = text.toLowerCase().includes(q.toLowerCase()) ? '#ffff99' : '';
          });
        }
      } else {
        alert('Open a channel first.');
      }
      break;
    case 'help':
      alert(
        'Pulsar95 Help\n\n' +
        '• Right-click a message you sent to delete it\n' +
        '• Drag the blue title bar to move the window\n' +
        '• Click 📎 to attach an image\n' +
        '• Click the clock to show seconds\n' +
        '• Mention @pulsar to talk to the AI bot'
      );
      break;
    case 'run': {
      const cmd = prompt(
        'Type a command:\n\n' +
        '  about    — About Pulsar95\n' +
        '  whoami   — Your username\n' +
        '  logout   — Sign out\n' +
        '  clear    — Reload the app\n'
      );
      if (cmd) {
        const c = cmd.trim().toLowerCase();
        if (c === 'about') alert('Pulsar95 — Cosmic chat for the retro web.');
        else if (c === 'whoami') alert(state.profile?.username || 'Not logged in');
        else if (c === 'logout') $('logout-btn').click();
        else if (c === 'clear') location.reload();
        else alert('Unknown command: ' + cmd);
      }
      break;
    }
    case 'shutdown':
      showShutdownScreen();
      break;
  }
}

function showShutdownScreen() {
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
    } catch (e) { }
    location.reload();
  };
  document.body.appendChild(overlay);
}

/* ============================================================
   CONTEXT MENUS
   ============================================================ */

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
      { label: 'Copy Timestamp', action: () => copyToClipboard(new Date(msg.created_at).toLocaleString()) },
      { divider: true },
      { label: 'Reply', disabled: true, action: () => { } },
      { label: 'React', disabled: true, action: () => { } },
      { divider: true },
      { label: 'Delete', disabled: !isMine, action: () => deleteMessage(msg, el) },
      { label: 'Properties', action: () => showMessageProperties(msg) },
    ];
  },
  desktop: () => [
    { label: 'Refresh', action: () => location.reload() },
    { divider: true },
    { label: 'Arrange Icons', disabled: true, action: () => { } },
    { label: 'Line up Icons', disabled: true, action: () => { } },
    { divider: true },
    { label: 'New Room...', action: () => $('add-room-btn').click() },
    { label: 'New Channel...', disabled: !state.currentRoom, action: () => $('add-channel-btn').click() },
    { divider: true },
    { label: 'Properties', action: () => showDisplayProperties() },
  ],
  taskbar: () => [
    { label: 'Cascade Windows', disabled: true, action: () => { } },
    { label: 'Tile Windows', disabled: true, action: () => { } },
    {
      label: 'Minimize All', action: () => {
        if (window.pulsarOS && window.pulsarOS.getOpenWindows) {
          window.pulsarOS.getOpenWindows().forEach((w) => {
            if (!w.minimized) window.pulsarOS.minimizeWindow(w.id);
          });
        }
      }
    },
    { divider: true },
    { label: 'Task Manager', disabled: true, action: () => { } },
    { label: 'Properties', disabled: true, action: () => { } },
  ],
};

function showContextMenu(x, y, items) {
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
    if (item.arrow) {
      const arrow = document.createElement('span');
      arrow.className = 'menu-arrow';
      arrow.textContent = '▶';
      el.appendChild(arrow);
    }
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

function closeAllMenus() {
  document.querySelectorAll('.win95-menu').forEach((m) => m.remove());
}

document.addEventListener('click', closeAllMenus);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllMenus(); });
window.addEventListener('blur', closeAllMenus);
window.addEventListener('resize', closeAllMenus);

function attachRoomContextMenus() {
  document.querySelectorAll('.room-icon').forEach((el) => {
    const roomId = el.dataset.roomId;
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return;
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.room(room));
    };
  });
}

function attachChannelContextMenus() {
  document.querySelectorAll('.channel-item').forEach((el) => {
    const channelId = el.dataset.channelId;
    const channel = state.channels.find((c) => c.id === channelId);
    if (!channel) return;
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.channel(channel));
    };
  });
}

function attachMessageContextMenus() {
  document.querySelectorAll('.message').forEach((el) => {
    const messageId = el.dataset.messageId;
    if (!messageId) return;
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      supabase.from('messages')
        .select('*, author:profiles(username, avatar_color)')
        .eq('id', messageId).single()
        .then(({ data }) => {
          if (data) showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.message(data, el));
        });
    };
  });
}

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

/* ============================================================
   ACTION HELPERS
   ============================================================ */

function copyToClipboard(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { });
  else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
  }
}

async function renameRoom(room) {
  const newName = prompt('Rename room:', room.name);
  if (!newName || !newName.trim() || newName === room.name) return;
  const { error } = await supabase.from('rooms')
    .update({ name: newName.trim().slice(0, 40) }).eq('id', room.id);
  if (error) return alert(error.message);
  await loadRooms();
}

async function deleteRoom(room) {
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

async function renameChannel(channel) {
  const newName = prompt('Rename channel:', channel.name);
  if (!newName || !newName.trim() || newName === channel.name) return;
  const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  const { error } = await supabase.from('channels').update({ name: slug }).eq('id', channel.id);
  if (error) return alert(error.message);
  await loadChannels();
}

async function deleteChannel(channel) {
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

async function deleteMessage(msg, el) {
  const preview = (msg.content || '').slice(0, 80);
  const ok = await win95Confirm(
    'Delete Message',
    'Delete this message?<br><br>' +
    '<i>"' + escapeHtml(preview) + ((msg.content || '').length > 80 ? '…' : '') + '"</i>'
  );
  if (!ok) return;
  const { error } = await supabase.from('messages').delete().eq('id', msg.id);
  if (error) return alert(error.message);
  el?.remove();
}

/* ============================================================
   PROPERTIES DIALOGS
   ============================================================ */

function showPropertiesDialog(title, rows) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.style.background = 'rgba(0,0,0,0.35)';
  const rowsHtml = rows.map((r) =>
    '<div style="display:flex;padding:4px 0;">' +
    '<div style="width:120px;color: var(--text-muted);font-weight:bold;">' + escapeHtml(r.label) + '</div>' +
    '<div style="flex:1;">' + r.value + '</div>' +
    '</div>'
  ).join('');
  overlay.innerHTML =
    '<div style="background: var(--win-bg);padding:2px;border:2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'min-width:380px;max-width:90vw;box-shadow:1px 1px 0 #000;font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    '<div style="background: var(--title-bg);color: var(--title-text);padding:3px 6px;font-weight:bold;font-size:12px;' +
    'display:flex;justify-content:space-between;align-items:center;">' +
    '<span>' + escapeHtml(title) + '</span>' +
    '</div>' +
    '<div style="padding:14px;">' + rowsHtml + '</div>' +
    '<div style="padding:8px 16px 12px;text-align:right;">' +
    '<button id="props-ok" style="min-width:70px;padding:4px;background: var(--win-bg);border:2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;">OK</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#props-ok').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function showRoomProperties(room) {
  const code = room.invite_code || '—';
  const codeDisplay = room.invite_code
    ? '<code style="font-family:\'Courier New\',monospace;font-weight:bold;letter-spacing:1px;">' +
    escapeHtml(code) +
    '</code> <button id="props-invite-btn" style="margin-left:8px;padding:2px 6px;font-size:11px;' +
    'background: var(--win-bg);border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'cursor:pointer;font-family:inherit;color: var(--text);">Show Invite</button>'
    : '—';
  showPropertiesDialog('Room Properties', [
    { label: 'Name:', value: escapeHtml(room.name) },
    { label: 'Invite Code:', value: codeDisplay },
    { label: 'Room ID:', value: '<code style="font-size:11px;">' + escapeHtml(room.id) + '</code>' },
    { label: 'Owner:', value: room.owner_id === state.user.id ? 'You' : escapeHtml(room.owner_id.slice(0, 8) + '...') },
    { label: 'Created:', value: new Date(room.created_at).toLocaleString() },
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

function showChannelProperties(channel) {
  showPropertiesDialog('Channel Properties', [
    { label: 'Name:', value: '#' + escapeHtml(channel.name) },
    { label: 'Channel ID:', value: '<code style="font-size:11px;">' + escapeHtml(channel.id) + '</code>' },
    { label: 'Room:', value: escapeHtml(state.currentRoom?.name || '-') },
    { label: 'Created:', value: new Date(channel.created_at).toLocaleString() },
  ]);
}

function showMessageProperties(msg) {
  showPropertiesDialog('Message Properties', [
    { label: 'Author:', value: escapeHtml(msg.author?.username || 'Unknown') },
    { label: 'Time:', value: new Date(msg.created_at).toLocaleString() },
    { label: 'Message ID:', value: '<code style="font-size:11px;">' + escapeHtml(msg.id) + '</code>' },
    { label: 'Length:', value: String((msg.content || '').length) + ' chars' },
    ...(msg.attachment_url
      ? [{ label: 'Attachment:', value: '<a href="' + escapeHtml(msg.attachment_url) + '" target="_blank" style="color: var(--accent);">View image</a>' }]
      : []),
  ]);
}

/* ============================================================
   DISPLAY PROPERTIES DIALOG
   ============================================================ */

function showDisplayProperties() {
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
    '<span>🎨 Display Properties</span><span style="font-size: 10px;">X</span>' +
    '</div>' +
    '<div style="padding: 16px;">' +
    '<div style="display:flex; gap:16px; align-items:flex-start;">' +
    '<div style="font-size: 48px;">🖥️</div>' +
    '<div style="flex:1;">' +
    '<div style="font-size: 12px; margin-bottom: 8px; color: var(--text);">Color scheme:</div>' +
    '<select id="theme-select" style="width: 100%; padding: 4px; font-family: inherit; font-size: 12px;' +
    'background: var(--chat-bg); color: var(--chat-text);' +
    'border: 2px solid; border-color: var(--win-border-dark) var(--win-border-light) var(--win-border-light) var(--win-border-dark);">' +
    themeOptions +
    '</select>' +
    '<div style="margin-top: 12px; padding: 8px; background: var(--win-bg-alt);' +
    'border: 2px inset var(--win-border-mid); font-size: 11px; color: var(--text-muted);">🖼 Preview</div>' +
    '<div id="theme-preview" style="margin-top: 6px; height: 60px; border: 2px solid var(--win-border-dark);' +
    'display: flex; align-items: flex-end; padding: 6px; background: var(--desktop-bg);">' +
    '<div style="background: var(--win-bg); padding: 4px; border: 2px solid;' +
    'border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-size: 10px; color: var(--text);">Window</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
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
    '</div>' +
    '</div>';
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

/* ============================================================
   INVITE CODES
   ============================================================ */

function showInviteDialog(room) {
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
    '<span>🎫 Invite to ' + escapeHtml(room.name) + '</span><span style="font-size: 10px;">X</span>' +
    '</div>' +
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
    'font-family:inherit;font-size:11px;cursor:pointer;color: var(--text);">Copy</button>' +
    '</div>' +
    '<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Share Link</div>' +
    '<div style="display:flex; gap:6px;">' +
    '<input id="invite-url-input" readonly value="' + escapeHtml(inviteUrl) + '" ' +
    'style="flex:1; font-family: inherit; font-size: 11px; padding: 6px 8px;' +
    'background: var(--chat-bg); color: var(--chat-text);' +
    'border: 2px solid; border-color: var(--win-border-dark) var(--win-border-light) var(--win-border-light) var(--win-border-dark);">' +
    '<button id="invite-copy-url" style="min-width:70px;padding:4px 8px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:11px;cursor:pointer;color: var(--text);">Copy</button>' +
    '</div>' +
    '<div style="margin-top: 12px; padding: 8px; background: var(--win-bg-alt);' +
    'border: 2px inset var(--win-border-mid); font-size: 11px; color: var(--text-muted);">' +
    'ℹ️ Anyone with this link can join the room. They still need their own account.</div>' +
    '</div>' +
    '<div style="padding: 8px 16px 12px; display: flex; gap: 6px; justify-content: flex-end;">' +
    '<button id="invite-ok" style="min-width:80px;padding:5px;background: var(--win-bg);' +
    'border:2px solid;border-color: var(--win-border-light) var(--win-border-dark) var(--win-border-dark) var(--win-border-light);' +
    'font-family:inherit;font-size:12px;cursor:pointer;color: var(--text);">OK</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#invite-copy-code').onclick = () => {
    copyToClipboard(inviteCode);
    Sound.click();
    flashButton(overlay.querySelector('#invite-copy-code'), 'Copied!');
  };
  overlay.querySelector('#invite-copy-url').onclick = () => {
    copyToClipboard(inviteUrl);
    Sound.click();
    flashButton(overlay.querySelector('#invite-copy-url'), 'Copied!');
  };
  overlay.querySelector('#invite-ok').onclick = () => { Sound.click(); overlay.remove(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function flashButton(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
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

async function processInviteCode(code) {
  if (!state.user) return;
  const { data: room, error } = await supabase
    .from('rooms').select('*').eq('invite_code', code).single();
  if (error || !room) return alert('That invite link is invalid or has expired.');
  const { data: existing } = await supabase
    .from('room_members').select('*').eq('room_id', room.id).eq('user_id', state.user.id).maybeSingle();
  if (existing) { await selectRoom(room); return; }
  const ok = await win95Confirm(
    'Join Room?',
    'You\'ve been invited to join room <b>"' + escapeHtml(room.name) + '"</b>.<br><br>Join this room?'
  );
  if (!ok) return;
  const { error: joinErr } = await supabase
    .from('room_members').insert({ room_id: room.id, user_id: state.user.id });
  if (joinErr && !joinErr.message.includes('duplicate')) return alert('Failed to join room: ' + joinErr.message);
  Sound.success();
  await loadRooms();
  await selectRoom(room);
}

setTimeout(checkInviteOnLoad, 500);

/* ============================================================
   TYPING INDICATORS
   ============================================================ */

async function subscribeTyping(channelId) {
  if (state.presenceChannel) {
    try {
      await state.presenceChannel.untrack();
      await supabase.removeChannel(state.presenceChannel);
    } catch (e) { }
    state.presenceChannel = null;
  }
  state.typingUsers.clear();
  renderTypingIndicator();
  if (!channelId || !state.user) return;

  const ch = supabase.channel('typing:' + channelId, {
    config: { presence: { key: state.user.id } },
  });

  ch.on('presence', { event: 'sync' }, () => {
    const newState = ch.presenceState();
    const now = Date.now();
    const seen = new Set();
    Object.values(newState).forEach((presences) => {
      presences.forEach((p) => {
        if (p.user_id === state.user.id) return;
        if (!p.typing) return;
        if (now - (p.ts || 0) > TYPING_TIMEOUT_MS) return;
        seen.add(p.user_id);
        const existing = state.typingUsers.get(p.user_id);
        if (existing?.timeoutId) clearTimeout(existing.timeoutId);
        const timeoutId = setTimeout(() => {
          state.typingUsers.delete(p.user_id);
          renderTypingIndicator();
        }, TYPING_TIMEOUT_MS);
        state.typingUsers.set(p.user_id, { username: p.username || 'someone', timeoutId });
      });
    });
    for (const [userId, info] of state.typingUsers) {
      if (!seen.has(userId)) {
        if (info.timeoutId) clearTimeout(info.timeoutId);
        state.typingUsers.delete(userId);
      }
    }
    renderTypingIndicator();
  });

  ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    leftPresences.forEach((p) => {
      const info = state.typingUsers.get(p.user_id);
      if (info?.timeoutId) clearTimeout(info.timeoutId);
      state.typingUsers.delete(p.user_id);
    });
    renderTypingIndicator();
  });

  await ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.track({
        user_id: state.user.id,
        username: state.profile?.username || 'someone',
        typing: false,
        ts: Date.now(),
      });
    }
  });

  state.presenceChannel = ch;
}

async function notifyTyping() {
  if (!state.presenceChannel) return;
  const now = Date.now();
  const isFirst = !myTypingActive;
  myTypingActive = true;
  if (myTypingTimeout) clearTimeout(myTypingTimeout);
  if (isFirst || now - myTypingLastSent > TYPING_COOLDOWN_MS) {
    myTypingLastSent = now;
    try {
      await state.presenceChannel.track({
        user_id: state.user.id,
        username: state.profile?.username || 'someone',
        typing: true,
        ts: now,
      });
    } catch (e) { }
  }
  myTypingTimeout = setTimeout(() => stopTyping(), TYPING_TIMEOUT_MS);
}

async function stopTyping() {
  myTypingActive = false;
  if (myTypingTimeout) { clearTimeout(myTypingTimeout); myTypingTimeout = null; }
  if (!state.presenceChannel) return;
  try {
    await state.presenceChannel.track({
      user_id: state.user.id,
      username: state.profile?.username || 'someone',
      typing: false,
      ts: Date.now(),
    });
  } catch (e) { }
}

function renderTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (!el) return;
  const usernames = [...state.typingUsers.values()].map((u) => u.username);
  const textEl = el.querySelector('.typing-text');
  if (usernames.length === 0) {
    el.classList.remove('visible');
    if (textEl) textEl.textContent = '';
    return;
  }
  let text;
  if (usernames.length === 1) text = usernames[0] + ' is typing';
  else if (usernames.length === 2) text = usernames[0] + ' and ' + usernames[1] + ' are typing';
  else if (usernames.length === 3) text = usernames[0] + ', ' + usernames[1] + ' and 1 other are typing';
  else text = usernames.length + ' people are typing';
  if (textEl) textEl.textContent = text;
  el.classList.add('visible');
}

window.addEventListener('blur', stopTyping);
window.addEventListener('beforeunload', () => {
  if (state.presenceChannel) state.presenceChannel.untrack().catch(() => { });
});

/* ============================================================
   IMAGE LIGHTBOX
   ============================================================ */

function openLightbox(src, title) {
  if (document.getElementById('lightbox-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox-overlay';
  overlay.innerHTML =
    '<div class="lightbox-inner">' +
    '<div class="lightbox-titlebar">' +
    '<span>🖼 ' + escapeHtml(title || 'Image Preview') + '</span>' +
    '<button class="lightbox-close" id="lightbox-close">✕</button>' +
    '</div>' +
    '<div class="lightbox-img-wrap">' +
    '<img id="lightbox-img" src="' + escapeHtml(src) + '" alt="preview">' +
    '</div>' +
    '<div class="lightbox-statusbar">' +
    '<span id="lightbox-size">Loading…</span>' +
    '<span>Click image to zoom · Click outside to close · Esc to close</span>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  const img = overlay.querySelector('#lightbox-img');
  const sizeEl = overlay.querySelector('#lightbox-size');
  img.onload = () => { sizeEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px'; };
  img.onclick = (e) => { e.stopPropagation(); img.classList.toggle('zoomed'); };
  overlay.onclick = (e) => { if (e.target === overlay) closeLightbox(); };
  overlay.querySelector('#lightbox-close').onclick = closeLightbox;
  const escHandler = (e) => { if (e.key === 'Escape') closeLightbox(); };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
  if (window.updateTaskButtons) window.updateTaskButtons();
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  if (overlay._escHandler) document.removeEventListener('keydown', overlay._escHandler);
  overlay.remove();
  if (window.updateTaskButtons) window.updateTaskButtons();
}

document.addEventListener('click', (e) => {
  const wrap = e.target.closest('.message-image');
  if (!wrap) return;
  const src = wrap.dataset.full || wrap.querySelector('img')?.src;
  if (!src) return;
  openLightbox(src, 'Pulsar95 Image Preview');
});

/* ============================================================
   MOBILE UI
   ============================================================ */

function setupMobileUI() {
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;
  const roomsBtn = document.getElementById('mobile-rooms-btn');
  const membersBtn = document.getElementById('mobile-members-btn');
  const scrim = document.getElementById('mobile-scrim');
  const roomRail = document.getElementById('room-rail');
  const channelPane = document.getElementById('channel-pane');
  const channelName = document.getElementById('mobile-channel-name');

  if (!roomsBtn || !roomRail || !channelPane) return;

  function closeAllDrawers() {
    roomRail.classList.remove('open');
    channelPane.classList.remove('open');
    scrim.classList.remove('open');
  }

  function openRoomsDrawer() {
    closeAllDrawers();
    roomRail.classList.add('open');
    scrim.classList.add('open');
  }

  function openChannelsDrawer() {
    closeAllDrawers();
    channelPane.classList.add('open');
    scrim.classList.add('open');
  }

  roomsBtn.onclick = (e) => {
    e.stopPropagation();
    Sound.click();
    if (roomRail.classList.contains('open')) closeAllDrawers();
    else openRoomsDrawer();
  };

  membersBtn.onclick = (e) => {
    e.stopPropagation();
    Sound.click();
    if (channelPane.classList.contains('open')) closeAllDrawers();
    else openChannelsDrawer();
  };

  scrim.onclick = () => {
    closeAllDrawers();
  };

  document.getElementById('rooms-container')?.addEventListener('click', (e) => {
    if (e.target.closest('.room-icon')) {
      closeAllDrawers();
    }
  });

  document.getElementById('channels-container')?.addEventListener('click', (e) => {
    if (e.target.closest('.channel-item')) {
      closeAllDrawers();
    }
  });

  document.getElementById('add-room-btn')?.addEventListener('click', () => {
    setTimeout(closeAllDrawers, 100);
  });
  document.getElementById('add-channel-btn')?.addEventListener('click', () => {
    setTimeout(closeAllDrawers, 100);
  });

  const observer = new MutationObserver(() => {
    const desktopChannelName = document.getElementById('channel-name')?.textContent || 'general';
    if (channelName) channelName.textContent = desktopChannelName;
  });

  const desktopChannel = document.getElementById('channel-name');
  if (desktopChannel) {
    observer.observe(desktopChannel, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  window.addEventListener('resize', () => {
    if (!isMobile()) closeAllDrawers();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDrawers();
  });
}

setupMobileUI();

/* ============================================================
   AI BOT — @pulsar MENTIONS
   ============================================================ */

async function summonPulsar(aiMessage) {
  if (!/@pulsar\b/i.test(aiMessage)) return;
  if (!state.currentChannel || !state.user) return;

  try {
    const res = await fetch(
      'https://nnfmculmtkgiulvffypn.supabase.co/functions/v1/pulsar-ai',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: state.currentChannel.id,
          user_id: state.user.id,
          message_content: aiMessage,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.warn('[Pulsar AI] Error:', data);
  } catch (err) {
    console.warn('[Pulsar AI] Fetch failed:', err);
  }
}

/* ============================================================
   @MENTION AUTOCOMPLETE
   ============================================================ */

const mentionState = {
  active: false,
  startIndex: -1,
  query: '',
  users: [],
  matches: [],
  selectedIndex: 0,
};

function getCurrentChannelMembers() {
  const userMap = new Map();

  userMap.set('everyone', {
    id: 'everyone',
    username: 'everyone',
    avatar_color: '#c00000',
    isEveryone: true,
  });

  userMap.set('pulsar', {
    id: '00000000-0000-0000-0000-000000000099',
    username: 'Pulsar',
    avatar_color: '#800080',
    isBot: true,
  });

  if (state.profile?.username) {
    userMap.set(state.profile.username.toLowerCase(), {
      id: state.user?.id || 'me',
      username: state.profile.username,
      avatar_color: state.profile.avatar_color || '#000080',
      isMe: true,
    });
  }

  document.querySelectorAll('.message').forEach((msgEl) => {
    const authorEl = msgEl.querySelector('.message-author');
    const avatarEl = msgEl.querySelector('.message-avatar');
    if (authorEl && avatarEl) {
      const name = authorEl.textContent.trim();
      const color = avatarEl.style.background || '#000080';
      const key = name.toLowerCase();
      if (!userMap.has(key)) {
        userMap.set(key, { id: key, username: name, avatar_color: color });
      }
    }
  });

  return [...userMap.values()];
}

function openMentionDropdown(query) {
  const dropdown = document.getElementById('mention-autocomplete');
  if (!dropdown) return;

  mentionState.users = getCurrentChannelMembers();
  mentionState.query = (query || '').toLowerCase();
  mentionState.selectedIndex = 0;

  const matches = mentionState.query
    ? mentionState.users.filter((u) => u.username.toLowerCase().includes(mentionState.query))
    : mentionState.users;

  if (matches.length === 0) {
    closeMentionDropdown();
    return;
  }

  mentionState.matches = matches;

  dropdown.innerHTML = matches.map((u, i) =>
    '<div class="mention-item' +
    (u.isBot ? ' bot' : '') +
    (i === mentionState.selectedIndex ? ' active' : '') +
    '" data-username="' + escapeHtml(u.username) + '" data-index="' + i + '">' +
    '<div class="mention-avatar" style="background:' + escapeHtml(u.avatar_color) + '">' +
    escapeHtml(u.username.charAt(0).toUpperCase()) +
    '</div>' +
    '<span class="mention-name">@' + escapeHtml(u.username) + '</span>' +
    (u.isBot ? '<span class="mention-badge">bot</span>' :
      u.isEveryone ? '<span class="mention-badge">notify all</span>' :
        u.isMe ? '<span class="mention-badge">you</span>' : '') +
    '</div>'
  ).join('');

  const inputEl = document.getElementById('message-input');
  if (inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const dropdownHeight = Math.min(260, matches.length * 36 + 8);
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = Math.max(rect.width, 240) + 'px';
    dropdown.style.top = (rect.top - dropdownHeight - 6) + 'px';
    dropdown.style.bottom = 'auto';
    dropdown.style.position = 'fixed';
  }

  dropdown.classList.add('open');
  mentionState.active = true;

  dropdown.querySelectorAll('.mention-item').forEach((item) => {
    item.onclick = (e) => {
      e.preventDefault();
      insertMention(item.dataset.username);
    };
  });

  const activeEl = dropdown.querySelector('.mention-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function closeMentionDropdown() {
  const dropdown = document.getElementById('mention-autocomplete');
  if (dropdown) dropdown.classList.remove('open');
  mentionState.active = false;
  mentionState.startIndex = -1;
  mentionState.query = '';
  mentionState.matches = [];
}

function insertMention(username) {
  const input = document.getElementById('message-input');
  if (!input) return;

  const text = input.value;
  const cursorPos = input.selectionStart;
  const before = text.slice(0, mentionState.startIndex);
  const after = text.slice(cursorPos);

  const newText = before + '@' + username + ' ' + after;
  input.value = newText;

  const newPos = before.length + username.length + 2;
  input.setSelectionRange(newPos, newPos);
  input.focus();

  closeMentionDropdown();
}

const mentionInput = document.getElementById('message-input');
if (mentionInput) {
  mentionInput.addEventListener('input', () => {
    const cursorPos = mentionInput.selectionStart;
    const text = mentionInput.value;
    const beforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      closeMentionDropdown();
      return;
    }

    const charBefore = lastAtIndex > 0 ? beforeCursor[lastAtIndex - 1] : ' ';
    if (charBefore !== ' ' && charBefore !== '\n' && lastAtIndex !== 0) {
      closeMentionDropdown();
      return;
    }

    const query = beforeCursor.slice(lastAtIndex + 1);
    if (query.includes(' ') || query.length > 30) {
      closeMentionDropdown();
      return;
    }

    mentionState.startIndex = lastAtIndex;
    openMentionDropdown(query);
  });

  mentionInput.addEventListener('keydown', (e) => {
    if (!mentionState.active) return;
    const matches = mentionState.matches || [];
    if (matches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionState.selectedIndex = (mentionState.selectedIndex + 1) % matches.length;
      updateActiveMention();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionState.selectedIndex = (mentionState.selectedIndex - 1 + matches.length) % matches.length;
      updateActiveMention();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(matches[mentionState.selectedIndex].username);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionDropdown();
    }
  });

  mentionInput.addEventListener('blur', () => {
    setTimeout(closeMentionDropdown, 150);
  });
}

function updateActiveMention() {
  const dropdown = document.getElementById('mention-autocomplete');
  if (!dropdown) return;
  dropdown.querySelectorAll('.mention-item').forEach((item, i) => {
    item.classList.toggle('active', i === mentionState.selectedIndex);
    if (i === mentionState.selectedIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

window.addEventListener('resize', () => {
  if (mentionState.active) closeMentionDropdown();
});

/* ============================================================
   ALT + F4 — SHUTDOWN SEQUENCE
   ============================================================ */

function executeAltF4Shutdown() {
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
    '&#9888; Windows is shutting down...' +
    '</div>' +
    '<div style="color:#808080;font-size:14px;font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    'Closing Pulsar95 in 3 seconds...' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

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
    'It&#39;s now safe to turn off<br>your computer.' +
    '</div>' +
    '<div style="color:#606060;font-size:13px;margin-top:40px;' +
    'font-family:\'MS Sans Serif\',Arial,sans-serif;">' +
    'Click anywhere to restart Pulsar95' +
    '</div>';

  setTimeout(() => {
    try {
      window.open('', '_self').close();
      window.close();
    } catch (e) { }

    setTimeout(() => {
      const hintEl = overlay.querySelector('div:last-child');
      if (hintEl && document.body.contains(overlay)) {
        hintEl.innerHTML =
          'Your browser blocked auto-close for security.<br>' +
          '<span style="color:#ffb000;">Press Ctrl+W to close this tab</span>, ' +
          'or click here to restart Pulsar95.';
        hintEl.style.cursor = 'pointer';
        hintEl.onclick = () => {
          overlay.remove();
          location.reload();
        };
      }
    }, 500);
  }, 800);

  overlay.style.cursor = 'pointer';
  overlay.onclick = () => {
    overlay.remove();
    location.reload();
  };
}

const altF4Input = document.getElementById('message-input');
if (altF4Input) {
  altF4Input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const content = altF4Input.value.trim().toUpperCase();
      if (
        content === 'ALT + F4' ||
        content === 'ALT+F4' ||
        content === 'ALTF4' ||
        content === 'ALT F4'
      ) {
        e.preventDefault();
        e.stopPropagation();
        altF4Input.value = '';
        executeAltF4Shutdown();
      }
    }
  });
}

/* ============================================================
   PULSAR95 DESKTOP — Icons, Selection, Drag
   ============================================================ */

const DESKTOP_ICONS = [
  {
    id: 'my-computer',
    label: 'My Computer',
    icon: '🖥️',
    action: () => alert('My Computer\n\n💾  Local Disk (C:)\n📀  CD-ROM Drive (D:)\n\n(File explorer coming soon)'),
    defaultPos: { x: 16, y: 16 },
  },
  {
    id: 'my-documents',
    label: 'My Documents',
    icon: '📁',
    action: () => alert('My Documents\n\n📄  readme.txt\n📁  My Pictures\n📁  My Music\n\n(File explorer coming soon)'),
    defaultPos: { x: 16, y: 100 },
  },
  {
    id: 'network',
    label: 'Network Neighborhood',
    icon: '🌐',
    action: () => alert('Network Neighborhood\n\n🖥️  PULSAR95-PC\n🖥️  Guest (offline)\n\n(Network explorer coming soon)'),
    defaultPos: { x: 16, y: 184 },
  },
  {
    id: 'recycle-bin',
    label: 'Recycle Bin',
    icon: '🗑️',
    action: () => alert('Recycle Bin is empty'),
    defaultPos: { x: 16, y: 268 },
  },
  {
    id: 'pulsar-chat',
    label: 'Pulsar95 Chat',
    icon: '💬',
    action: () => {
      const appScreen = document.getElementById('app-screen');
      if (appScreen) {
        appScreen.classList.remove('hidden');
        const win = appScreen.querySelector('.window');
        if (win) win.style.zIndex = 1000;
      }
      if (window.updateTaskButtons) window.updateTaskButtons();
    },
    defaultPos: { x: 16, y: 352 },
  },
  {
    id: 'readme',
    label: 'Read Me',
    icon: '📄',
    action: () => alert(
      'Welcome to Pulsar95!\n\n' +
      '• Double-click icons to open\n' +
      '• Drag icons to rearrange\n' +
      '• Right-click desktop for menu\n' +
      '• Double-click "Pulsar95 Chat" to chat\n' +
      '• Start → Programs for apps'
    ),
    defaultPos: { x: 16, y: 436 },
  },
];

const DESKTOP_POS_KEY = 'pulsar95_desktop_icon_pos';
let desktopIconPositions = {};
let selectedDesktopIcons = new Set();

function loadDesktopIconPositions() {
  try {
    desktopIconPositions = JSON.parse(localStorage.getItem(DESKTOP_POS_KEY) || '{}');
  } catch (e) {
    desktopIconPositions = {};
  }
}

function saveDesktopIconPositions() {
  localStorage.setItem(DESKTOP_POS_KEY, JSON.stringify(desktopIconPositions));
}

function buildDesktop() {
  const container = document.getElementById('desktop-icons');
  if (!container) return;

  loadDesktopIconPositions();
  container.innerHTML = '';

  DESKTOP_ICONS.forEach((icon) => {
    const pos = desktopIconPositions[icon.id] || icon.defaultPos;

    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.iconId = icon.id;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.innerHTML =
      '<div class="icon-image">' + icon.icon + '</div>' +
      '<div class="icon-label">' + escapeHtml(icon.label) + '</div>';

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!selectedDesktopIcons.has(icon.id)) {
          clearDesktopSelection();
          selectedDesktopIcons.add(icon.id);
          el.classList.add('selected');
        }
        startIconDrag(e, icon.id, el);
      }
    });

    el.addEventListener('dblclick', () => {
      Sound.click();
      try {
        icon.action();
      } catch (err) {
        console.error('Icon action failed:', err);
      }
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, CONTEXT_MENUS.desktop());
    });

    container.appendChild(el);
  });
}

function clearDesktopSelection() {
  selectedDesktopIcons.clear();
  document.querySelectorAll('.desktop-icon.selected').forEach((el) => {
    el.classList.remove('selected');
  });
}

let iconDragState = {
  active: false,
  startX: 0,
  startY: 0,
  dragStartPositions: {},
};

function startIconDrag(e, iconId, el) {
  if (e.button !== 0) return;

  const dragging = selectedDesktopIcons.has(iconId)
    ? [...selectedDesktopIcons]
    : [iconId];

  iconDragState.active = true;
  iconDragState.startX = e.clientX;
  iconDragState.startY = e.clientY;
  iconDragState.dragStartPositions = {};

  dragging.forEach((id) => {
    const iconEl = document.querySelector('.desktop-icon[data-icon-id="' + id + '"]');
    if (!iconEl) return;
    iconDragState.dragStartPositions[id] = {
      x: parseFloat(iconEl.style.left) || 0,
      y: parseFloat(iconEl.style.top) || 0,
    };
  });

  document.body.classList.add('icon-dragging');
  document.addEventListener('mousemove', onIconDragMove);
  document.addEventListener('mouseup', onIconDragEnd);

  e.preventDefault();
}

function onIconDragMove(e) {
  if (!iconDragState.active) return;

  const dx = e.clientX - iconDragState.startX;
  const dy = e.clientY - iconDragState.startY;

  Object.entries(iconDragState.dragStartPositions).forEach(([id, start]) => {
    const iconEl = document.querySelector('.desktop-icon[data-icon-id="' + id + '"]');
    if (!iconEl) return;

    let newX = start.x + dx;
    let newY = start.y + dy;

    const desktop = document.getElementById('desktop');
    const maxX = desktop.clientWidth - iconEl.offsetWidth - 4;
    const maxY = desktop.clientHeight - iconEl.offsetHeight - 4;

    newX = Math.max(4, Math.min(maxX, newX));
    newY = Math.max(4, Math.min(maxY, newY));

    iconEl.style.left = newX + 'px';
    iconEl.style.top = newY + 'px';
  });
}

function onIconDragEnd() {
  if (!iconDragState.active) return;
  iconDragState.active = false;
  document.body.classList.remove('icon-dragging');
  document.removeEventListener('mousemove', onIconDragMove);
  document.removeEventListener('mouseup', onIconDragEnd);

  document.querySelectorAll('.desktop-icon').forEach((el) => {
    const id = el.dataset.iconId;
    if (id) {
      desktopIconPositions[id] = {
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
      };
    }
  });
  saveDesktopIconPositions();
}

let selectionBoxState = {
  active: false,
  startX: 0,
  startY: 0,
};

function setupDesktopSelectionBox() {
  const desktop = document.getElementById('desktop');
  const box = document.getElementById('selection-box');
  if (!desktop || !box) return;

  desktop.addEventListener('mousedown', (e) => {
    if (e.target !== desktop && !e.target.classList.contains('desktop-icons')) return;
    if (e.button !== 0) return;

    selectionBoxState.active = true;
    selectionBoxState.startX = e.clientX;
    selectionBoxState.startY = e.clientY;

    box.style.left = e.clientX + 'px';
    box.style.top = e.clientY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    box.classList.add('active');

    document.body.classList.add('selecting');
    document.addEventListener('mousemove', onSelectionMove);
    document.addEventListener('mouseup', onSelectionEnd);

    clearDesktopSelection();

    e.preventDefault();
  });
}

function onSelectionMove(e) {
  if (!selectionBoxState.active) return;
  const box = document.getElementById('selection-box');
  if (!box) return;

  const x1 = Math.min(selectionBoxState.startX, e.clientX);
  const y1 = Math.min(selectionBoxState.startY, e.clientY);
  const x2 = Math.max(selectionBoxState.startX, e.clientX);
  const y2 = Math.max(selectionBoxState.startY, e.clientY);

  box.style.left = x1 + 'px';
  box.style.top = y1 + 'px';
  box.style.width = (x2 - x1) + 'px';
  box.style.height = (y2 - y1) + 'px';

  document.querySelectorAll('.desktop-icon').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const intersects = !(
      rect.right < x1 || rect.left > x2 || rect.bottom < y1 || rect.top > y2
    );
    if (intersects) {
      el.classList.add('selected');
      selectedDesktopIcons.add(el.dataset.iconId);
    } else {
      el.classList.remove('selected');
      selectedDesktopIcons.delete(el.dataset.iconId);
    }
  });
}

function onSelectionEnd() {
  if (!selectionBoxState.active) return;
  selectionBoxState.active = false;
  const box = document.getElementById('selection-box');
  if (box) box.classList.remove('active');
  document.body.classList.remove('selecting');
  document.removeEventListener('mousemove', onSelectionMove);
  document.removeEventListener('mouseup', onSelectionEnd);
}

function showDesktop() {
  const desktop = document.getElementById('desktop');
  if (desktop) desktop.classList.remove('hidden');
}

function hideDesktop() {
  const desktop = document.getElementById('desktop');
  if (desktop) desktop.classList.add('hidden');
}

buildDesktop();
setupDesktopSelectionBox();

/* ============================================================
   PULSAR95 WINDOW MANAGER
   ============================================================ */

const WINDOW_POS_KEY = 'pulsar95_window_geometry';
let openWindows = {};
let topZIndex = 300;

function loadWindowGeometry() {
  try {
    return JSON.parse(localStorage.getItem(WINDOW_POS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveWindowGeometry(id, geometry) {
  const all = loadWindowGeometry();
  all[id] = geometry;
  localStorage.setItem(WINDOW_POS_KEY, JSON.stringify(all));
}

function openWindow(options) {
  const {
    id,
    title = 'Window',
    icon = '📄',
    width = 500,
    height = 400,
    x,
    y,
    content,
    onClose,
    onFocus,
    resizable = true,
    minimizable = true,
    maximizable = true,
  } = options;

  if (openWindows[id]) {
    focusWindow(id);
    if (openWindows[id].element.classList.contains('minimized')) {
      restoreWindow(id);
    }
    return openWindows[id].element;
  }

  const savedGeometry = loadWindowGeometry()[id];
  const desktop = document.getElementById('desktop');
  if (!desktop) return null;
  const desktopRect = desktop.getBoundingClientRect();
  const desktopWidth = desktopRect.width;
  const desktopHeight = desktopRect.height;

  const finalWidth = Math.min(width, desktopWidth - 40);
  const finalHeight = Math.min(height, desktopHeight - 40);

  const offset = (Object.keys(openWindows).length % 6) * 24;
  const defaultX = Math.max(20, (desktopWidth - finalWidth) / 2 + offset - 60);
  const defaultY = Math.max(20, (desktopHeight - finalHeight) / 2 + offset - 60);

  const posX = x !== undefined ? x : (savedGeometry?.x ?? defaultX);
  const posY = y !== undefined ? y : (savedGeometry?.y ?? defaultY);
  const posW = savedGeometry?.width ?? finalWidth;
  const posH = savedGeometry?.height ?? finalHeight;

  const win = document.createElement('div');
  win.className = 'os-window';
  win.dataset.windowId = id;
  win.style.left = posX + 'px';
  win.style.top = posY + 'px';
  win.style.width = posW + 'px';
  win.style.height = posH + 'px';
  win.style.zIndex = ++topZIndex;

  win.innerHTML =
    '<div class="win-titlebar">' +
    '<div class="win-icon">' + escapeHtml(icon) + '</div>' +
    '<div class="win-title">' + escapeHtml(title) + '</div>' +
    '<div class="win-controls">' +
    (minimizable ? '<button class="win-btn win-min" title="Minimize">_</button>' : '') +
    (maximizable ? '<button class="win-btn win-max" title="Maximize">□</button>' : '') +
    '<button class="win-btn win-close" title="Close">✕</button>' +
    '</div>' +
    '</div>' +
    '<div class="win-body"></div>' +
    (resizable ?
      '<div class="win-resize win-resize-n"></div>' +
      '<div class="win-resize win-resize-s"></div>' +
      '<div class="win-resize win-resize-e"></div>' +
      '<div class="win-resize win-resize-w"></div>' +
      '<div class="win-resize win-resize-ne"></div>' +
      '<div class="win-resize win-resize-nw"></div>' +
      '<div class="win-resize win-resize-se"></div>' +
      '<div class="win-resize win-resize-sw"></div>'
      : '');

  const body = win.querySelector('.win-body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }

  const layer = document.getElementById('window-layer');
  if (!layer) return null;
  layer.appendChild(win);

  openWindows[id] = {
    element: win,
    title,
    icon,
    onClose,
    onFocus,
    resizable,
    maximizable,
    minimizable,
    maximized: false,
    previousGeometry: null,
  };

  win.querySelector('.win-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWindow(id);
  });

  win.querySelector('.win-min')?.addEventListener('click', (e) => {
    e.stopPropagation();
    minimizeWindow(id);
  });

  win.querySelector('.win-max')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMaximizeWindow(id);
  });

  const titlebar = win.querySelector('.win-titlebar');
  titlebar.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.win-btn')) return;
    startWindowDrag(e, id);
  });

  win.addEventListener('mousedown', () => {
    focusWindow(id);
  });

  if (resizable) {
    win.querySelectorAll('.win-resize').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        const cls = handle.className;
        const dir = cls.replace('win-resize', '').replace('win-resize-', '').trim();
        startWindowResize(e, id, dir);
      });
    });
  }

  focusWindow(id);

  if (window.updateTaskButtons) window.updateTaskButtons();

  return win;
}

function focusWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;

  entry.element.style.zIndex = ++topZIndex;

  document.querySelectorAll('.os-window').forEach((el) => {
    el.classList.toggle('focused', el.dataset.windowId === id);
  });

  entry.onFocus?.();

  if (window.updateTaskButtons) window.updateTaskButtons();
}

function closeWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;

  const el = entry.element;
  saveWindowGeometry(id, {
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  });

  entry.onClose?.();
  el.remove();
  delete openWindows[id];

  const remaining = Object.keys(openWindows);
  if (remaining.length > 0) {
    let topId = remaining[0];
    let topZ = -1;
    remaining.forEach((wId) => {
      const z = parseInt(openWindows[wId].element.style.zIndex, 10) || 0;
      if (z > topZ) { topZ = z; topId = wId; }
    });
    focusWindow(topId);
  }

  if (window.updateTaskButtons) window.updateTaskButtons();
}

function minimizeWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;

  entry.element.classList.add('minimized');

  const remaining = Object.keys(openWindows).filter((wId) => {
    const other = openWindows[wId];
    return !other.element.classList.contains('minimized');
  });

  if (remaining.length > 0) {
    let topId = remaining[0];
    let topZ = -1;
    remaining.forEach((wId) => {
      const z = parseInt(openWindows[wId].element.style.zIndex, 10) || 0;
      if (z > topZ) { topZ = z; topId = wId; }
    });
    focusWindow(topId);
  } else {
    document.querySelectorAll('.os-window').forEach((el) => {
      el.classList.remove('focused');
    });
  }

  if (window.updateTaskButtons) window.updateTaskButtons();
}

function restoreWindow(id) {
  const entry = openWindows[id];
  if (!entry) return;
  entry.element.classList.remove('minimized');
  focusWindow(id);
  if (window.updateTaskButtons) window.updateTaskButtons();
}

function toggleMaximizeWindow(id) {
  const entry = openWindows[id];
  if (!entry || !entry.maximizable) return;

  const el = entry.element;

  if (entry.maximized) {
    if (entry.previousGeometry) {
      el.style.left = entry.previousGeometry.x + 'px';
      el.style.top = entry.previousGeometry.y + 'px';
      el.style.width = entry.previousGeometry.width + 'px';
      el.style.height = entry.previousGeometry.height + 'px';
    }
    el.classList.remove('maximized');
    entry.maximized = false;
  } else {
    entry.previousGeometry = {
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    };
    el.classList.add('maximized');
    entry.maximized = true;
  }
}

let windowDragState = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
};

function startWindowDrag(e, id) {
  const entry = openWindows[id];
  if (!entry) return;
  if (entry.maximized) return;

  const el = entry.element;
  windowDragState.active = true;
  windowDragState.id = id;
  windowDragState.startX = e.clientX;
  windowDragState.startY = e.clientY;
  windowDragState.startLeft = parseFloat(el.style.left) || 0;
  windowDragState.startTop = parseFloat(el.style.top) || 0;

  document.body.classList.add('window-dragging');
  document.addEventListener('mousemove', onWindowDragMove);
  document.addEventListener('mouseup', onWindowDragEnd);

  e.preventDefault();
}

function onWindowDragMove(e) {
  if (!windowDragState.active) return;
  const entry = openWindows[windowDragState.id];
  if (!entry) return;

  const el = entry.element;
  const desktop = document.getElementById('desktop');
  const maxX = desktop.clientWidth - el.offsetWidth;
  const maxY = desktop.clientHeight - el.offsetHeight;

  let newLeft = windowDragState.startLeft + (e.clientX - windowDragState.startX);
  let newTop = windowDragState.startTop + (e.clientY - windowDragState.startY);

  newLeft = Math.max(-el.offsetWidth + 100, Math.min(maxX, newLeft));
  newTop = Math.max(0, Math.min(maxY, newTop));

  el.style.left = newLeft + 'px';
  el.style.top = newTop + 'px';
}

function onWindowDragEnd() {
  if (!windowDragState.active) return;
  const id = windowDragState.id;
  windowDragState.active = false;
  document.body.classList.remove('window-dragging');
  document.removeEventListener('mousemove', onWindowDragMove);
  document.removeEventListener('mouseup', onWindowDragEnd);

  const entry = openWindows[id];
  if (entry) {
    saveWindowGeometry(id, {
      x: parseFloat(entry.element.style.left),
      y: parseFloat(entry.element.style.top),
      width: parseFloat(entry.element.style.width),
      height: parseFloat(entry.element.style.height),
    });
  }
}

let windowResizeState = {
  active: false,
  id: null,
  dir: '',
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startWidth: 0,
  startHeight: 0,
};

function startWindowResize(e, id, dir) {
  const entry = openWindows[id];
  if (!entry || !entry.resizable) return;
  if (entry.maximized) return;

  const el = entry.element;
  windowResizeState.active = true;
  windowResizeState.id = id;
  windowResizeState.dir = dir;
  windowResizeState.startX = e.clientX;
  windowResizeState.startY = e.clientY;
  windowResizeState.startLeft = parseFloat(el.style.left) || 0;
  windowResizeState.startTop = parseFloat(el.style.top) || 0;
  windowResizeState.startWidth = parseFloat(el.style.width) || el.offsetWidth;
  windowResizeState.startHeight = parseFloat(el.style.height) || el.offsetHeight;

  document.body.classList.add('window-resizing');
  document.addEventListener('mousemove', onWindowResizeMove);
  document.addEventListener('mouseup', onWindowResizeEnd);

  e.preventDefault();
  e.stopPropagation();
}

function onWindowResizeMove(e) {
  if (!windowResizeState.active) return;
  const entry = openWindows[windowResizeState.id];
  if (!entry) return;

  const el = entry.element;
  const dx = e.clientX - windowResizeState.startX;
  const dy = e.clientY - windowResizeState.startY;
  const dir = windowResizeState.dir;

  let newLeft = windowResizeState.startLeft;
  let newTop = windowResizeState.startTop;
  let newWidth = windowResizeState.startWidth;
  let newHeight = windowResizeState.startHeight;

  const MIN_W = 200;
  const MIN_H = 120;

  if (dir.includes('e')) newWidth = Math.max(MIN_W, windowResizeState.startWidth + dx);
  if (dir.includes('s')) newHeight = Math.max(MIN_H, windowResizeState.startHeight + dy);
  if (dir.includes('w')) {
    newWidth = Math.max(MIN_W, windowResizeState.startWidth - dx);
    newLeft = windowResizeState.startLeft + (windowResizeState.startWidth - newWidth);
  }
  if (dir.includes('n')) {
    newHeight = Math.max(MIN_H, windowResizeState.startHeight - dy);
    newTop = windowResizeState.startTop + (windowResizeState.startHeight - newHeight);
  }

  el.style.left = newLeft + 'px';
  el.style.top = newTop + 'px';
  el.style.width = newWidth + 'px';
  el.style.height = newHeight + 'px';
}

function onWindowResizeEnd() {
  if (!windowResizeState.active) return;
  const id = windowResizeState.id;
  windowResizeState.active = false;
  document.body.classList.remove('window-resizing');
  document.removeEventListener('mousemove', onWindowResizeMove);
  document.removeEventListener('mouseup', onWindowResizeEnd);

  const entry = openWindows[id];
  if (entry) {
    saveWindowGeometry(id, {
      x: parseFloat(entry.element.style.left),
      y: parseFloat(entry.element.style.top),
      width: parseFloat(entry.element.style.width),
      height: parseFloat(entry.element.style.height),
    });
  }
}

function getOpenWindows() {
  return Object.entries(openWindows).map(([id, entry]) => ({
    id,
    title: entry.title,
    icon: entry.icon,
    minimized: entry.element.classList.contains('minimized'),
    focused: entry.element.classList.contains('focused'),
  }));
}

function closeAllWindows() {
  Object.keys(openWindows).forEach((id) => {
    const entry = openWindows[id];
    if (entry) entry.element.remove();
  });
  openWindows = {};
  if (window.updateTaskButtons) window.updateTaskButtons();
}

/* ============================================================
   LOAD SAVED THEME
   ============================================================ */

loadSavedTheme();

/* ============================================================
   EXPOSE FOR DEBUG
   ============================================================ */

window.pulsar = {
  state,
  showInviteDialog,
  processInviteCode,
  win95Confirm,
  Sound,
  applyTheme,
  getCurrentTheme,
  summonPulsar,
  openMentionDropdown,
  insertMention,
};

window.pulsarOS = {
  openWindow,
  closeWindow,
  focusWindow,
  minimizeWindow,
  restoreWindow,
  toggleMaximizeWindow,
  getOpenWindows,
  closeAllWindows,
  buildDesktop,
  showDesktop,
  hideDesktop,
  clearDesktopSelection,
  DESKTOP_ICONS,
};