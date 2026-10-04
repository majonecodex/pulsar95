import { supabase } from '../lib/supabase.js';
import { state, isBooted, setBooted } from '../lib/state.js';
import { $, isMobileDevice } from '../lib/dom.js';
import { colorFor } from '../lib/palette.js';
import Sound from '../sounds.js';
import { loadRooms } from './rooms.js';
import { appendMessage } from './messages.js';
import { notifyTyping, stopTyping } from './typing.js';

export async function bootApp() {
  if (isBooted) return;
  setBooted(true);

  $('auth-screen').classList.add('hidden');

  const mobile = isMobileDevice();
  if (mobile) {
    if (window.pulsarOS?.hideDesktop) window.pulsarOS.hideDesktop();
    $('app-screen').classList.remove('hidden');
  } else {
    if (window.pulsarOS?.showDesktop) window.pulsarOS.showDesktop();
    $('app-screen').classList.remove('hidden');
  }

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
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        if (payload.new.channel_id !== state.currentChannel?.id) return;
        if (payload.new.author_id === state.user.id) return;
        Sound.message();
        const { data: author } = await supabase
          .from('profiles')
          .select('username, avatar_color')
          .eq('id', payload.new.author_id)
          .single();
        appendMessage({ ...payload.new, author }, true);
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        if (payload.old.channel_id !== state.currentChannel?.id) return;
        const el = document.querySelector(
          '.message[data-message-id="' + payload.old.id + '"]'
        );
        if (el) el.remove();
      })
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
    setTimeout(async () => {
      const { processInviteCode } = await import('../auth/invite.js');
      processInviteCode(pendingInvite);
    }, 800);
  }
}