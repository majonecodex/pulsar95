import { state } from '../lib/state.js';

export async function summonPulsar(aiMessage) {
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