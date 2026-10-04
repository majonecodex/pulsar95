import { supabase } from '../lib/supabase.js';
import { state, setPendingAttachmentUrl, getPendingAttachmentUrl } from '../lib/state.js';
import { $ } from '../lib/dom.js';
import Sound from '../sounds.js';
import { appendMessage } from './messages.js';
import { stopTyping } from './typing.js';
import { summonPulsar } from '../ai/pulsar-bot.js';

export function initComposer() {
  $('composer').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('message-input');
    const content = input.value.trim();
    const attachment_url = getPendingAttachmentUrl();
    if ((!content && !attachment_url) || !state.currentChannel) return;

    try { Sound.send(); } catch (err) {}
    try { stopTyping(); } catch (err) {}

    input.value = '';
    setPendingAttachmentUrl(null);

    if ($('attach-btn')) {
      $('attach-btn').textContent = '📎';
      $('attach-btn').disabled = false;
    }
    $('message-input').placeholder = 'Message #' + state.currentChannel.name;

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        channel_id: state.currentChannel.id,
        author_id: state.user.id,
        content: content || '(image)',
        attachment_url,
      })
      .select('*, author:profiles(username, avatar_color)')
      .single();

    if (error) {
      alert('Failed to send: ' + error.message);
      input.value = content;
      return;
    }
    if (inserted) appendMessage(inserted, true);

    try { Sound.success(); } catch (err) {}
    summonPulsar(content).catch((err) => console.warn('[Pulsar AI]', err));
  };

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
      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments').getPublicUrl(path);
      setPendingAttachmentUrl(publicUrl);
      $('attach-btn').textContent = '✅';
      $('message-input').placeholder = 'Image attached — press Send';
      $('file-input').value = '';
    };
  }
}