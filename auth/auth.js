import { supabase } from '../lib/supabase.js';
import { state, setBooted } from '../lib/state.js';
import { $, escapeHtml } from '../lib/dom.js';
import { colorFor } from '../lib/palette.js';
import { bootApp } from '../chat/boot.js';

const showAuthError = (msg) => {
  $('auth-error').textContent = msg || '';
  $('auth-info').textContent = '';
};
const showAuthInfo = (msg) => {
  $('auth-info').textContent = msg || '';
  $('auth-error').textContent = '';
};

export function initAuth() {
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
      } catch (e) {}
    }
    if (window.pulsarOS?.closeAllWindows) window.pulsarOS.closeAllWindows();
    await supabase.auth.signOut();
    setBooted(false);
    location.reload();
  };

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      state.user = session.user;
      await bootApp();
    } else {
      $('auth-screen').classList.remove('hidden');
      $('app-screen').classList.add('hidden');
      if (window.pulsarOS?.hideDesktop) window.pulsarOS.hideDesktop();
    }
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) $('auth-screen').classList.remove('hidden');
  });
}