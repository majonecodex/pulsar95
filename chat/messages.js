import { supabase } from '../lib/supabase.js';
import { state } from '../lib/state.js';
import { $, escapeHtml } from '../lib/dom.js';
import { colorFor } from '../lib/palette.js';
import { formatLocal } from '../lib/time.js';
import { win95Confirm } from '../lib/dialogs.js';

export async function loadMessages() {
  if (!state.currentChannel) return;
  const { data } = await supabase
    .from('messages')
    .select('*, author:profiles(username, avatar_color)')
    .eq('channel_id', state.currentChannel.id)
    .order('created_at'); // .limit(200) has removed to allow full history loading

  const container = $('messages');
  if (!container) return;
  container.innerHTML = '';

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Say something.</div>';
  } else {
    data.forEach((m) => appendMessage(m));
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  }
  import('../os/context-menu.js').then((m) => m.attachMessageContextMenus());
}

export function appendMessage(msg, scroll = false) {
  const container = $('messages');
  if (!container) return;

  if (msg.id && container.querySelector('.message[data-message-id="' + msg.id + '"]')) return;

  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const author = msg.author?.username || 'Unknown';
  const color = msg.author?.avatar_color || colorFor(author);
  const initial = author.charAt(0).toUpperCase();
  const time = formatLocal(msg.created_at);
  const isMine = msg.author_id === state.user.id;

  const div = document.createElement('div');
  div.className = 'message';
  div.dataset.messageId = msg.id;
  div.innerHTML =
    '<div class="message-avatar" style="background:' + escapeHtml(color) + '">' +
      escapeHtml(initial) + '</div>' +
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

export function highlightMentions(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
}

export const scrollToBottom = () => {
  const el = $('messages');
  if (el) el.scrollTop = el.scrollHeight;
};

export async function deleteMessage(msg, el) {
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