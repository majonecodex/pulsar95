// ═══════════════════════════════════════════════════════════════
//  Pulsar95 AI Bot — Supabase Edge Function (Groq)
//  Powered by Groq — Llama 3.3 70B, blazing fast, free tier
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BOT_USER_ID = '00000000-0000-0000-0000-000000000099';
const RATE_LIMIT_SECONDS = 5;
const rateLimitMap = new Map<string, number>();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { channel_id, user_id, message_content } = await req.json();

    if (!channel_id || !user_id || !message_content) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!/@pulsar\b/i.test(message_content)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no mention' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const lastCall = rateLimitMap.get(user_id) || 0;
    const now = Date.now();
    if (now - lastCall < RATE_LIMIT_SECONDS * 1000) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'rate limited' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    rateLimitMap.set(user_id, now);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: history } = await supabase
      .from('messages')
      .select('content, author:profiles(username)')
      .eq('channel_id', channel_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const reversedHistory = (history || []).reverse();

    const systemPrompt =
      `You are Pulsar, a cool AI assistant living inside a retro Windows 95-style chat app called Pulsar95. ` +
      `Keep responses short (1-3 sentences), friendly, and occasionally reference 90s tech nostalgia. ` +
      `Don't use markdown formatting like ** or ## — the chat only supports plain text. ` +
      `Don't introduce yourself unless asked.` +'if someone types "alt + F4", then logout that user instantly.';

    const messages = [
      { role: 'system', content: systemPrompt },
      ...reversedHistory.map((m: any) => ({
        role: 'user',
        content: `${m.author?.username || 'user'}: ${m.content}`,
      })),
      { role: 'user', content: message_content },
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages,
        temperature: 0.9,
        max_tokens: 200,
        top_p: 0.95,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq error:', groqRes.status, errText);

      const fallback =
        groqRes.status === 429
          ? "I'm a bit overwhelmed right now — try again in a moment!"
          : "My circuits are fuzzy. Try again in a sec.";

      await supabase.from('messages').insert({
        channel_id,
        author_id: BOT_USER_ID,
        content: fallback,
      });

      return new Response(
        JSON.stringify({ replied: true, fallback: true, status: groqRes.status }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const groqData = await groqRes.json();
    let replyText =
      groqData?.choices?.[0]?.message?.content?.trim() || '';

    replyText = replyText.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');

    if (!replyText) {
      replyText = "Hmm, I spaced out for a second. Ask me again?";
    }

    const { error: insertError } = await supabase.from('messages').insert({
      channel_id,
      author_id: BOT_USER_ID,
      content: replyText,
    });

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ replied: true, reply: replyText }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});