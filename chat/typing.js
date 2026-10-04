import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';

const TYPING_TIMEOUT_MS = 3000;
const TYPING_COOLDOWN_MS = 1500;
let myTypingTimeout = null;
let myTypingLastSent = 0;
let myTypingActive = false;

export async function subscribeTyping(channelId) {
  if (state.presenceChannel) {
    try {
      await state.presenceChannel.untrack();
      await supabase.removeChannel(state.presenceChannel);
    } catch (e) {}
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
        state.typingUsers.set(p.user_id, {
          username: p.username || 'someone', timeoutId,
        });
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

export async function notifyTyping() {
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
    } catch (e) {}
  }
  myTypingTimeout = setTimeout(() => stopTyping(), TYPING_TIMEOUT_MS);
}

export async function stopTyping() {
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
  } catch (e) {}
}

export function renderTypingIndicator() {
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
  if (state.presenceChannel) state.presenceChannel.untrack().catch(() => {});
});