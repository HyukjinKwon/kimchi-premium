/**
 * 실시간김프 Chat Worker
 *
 * Environment variables (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   BOT_TOKEN      — Telegram bot token from @BotFather
 *   CHAT_ID        — Telegram group ID (numeric, e.g. -1001234567890)
 *   WEBHOOK_SECRET — any random string; used when registering the webhook
 *
 * KV namespace binding (Cloudflare dashboard → KV → Create namespace "MESSAGES"):
 *   MESSAGES       — bind the KV namespace to this Worker with variable name "MESSAGES"
 *
 * After deploying, register the webhook once:
 *   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<worker>.workers.dev/webhook&secret_token=<WEBHOOK_SECRET>"
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_TS        = 9_999_999_999_999; // far future — makes newest keys sort first
const MAX_MESSAGES  = 50;
const MSG_TTL       = 7 * 24 * 3600;    // keep messages 7 days
const RATE_LIMIT_S  = 5;                 // seconds between messages per IP

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (pathname === '/messages' && request.method === 'GET') {
      return handleGetMessages(env);
    }
    if (pathname === '/send' && request.method === 'POST') {
      return handleSend(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

// ── Telegram webhook ──────────────────────────────────────────────────────────
async function handleWebhook(request, env) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });

  const body = await request.json();
  const msg = body.message || body.channel_post;

  // Store incoming Telegram messages (skip echoed web messages prefixed with [웹])
  if (msg?.text && !msg.text.startsWith('[웹]')) {
    await storeMessage(env, {
      id:     String(msg.message_id),
      from:   msg.from?.first_name || msg.sender_chat?.title || 'Unknown',
      text:   msg.text,
      ts:     msg.date * 1000,
      fromTg: true,
    });
  }
  return new Response('ok');
}

// ── GET /messages ─────────────────────────────────────────────────────────────
async function handleGetMessages(env) {
  const messages = await getMessages(env);
  return new Response(JSON.stringify(messages), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── POST /send ────────────────────────────────────────────────────────────────
async function handleSend(request, env) {
  // Per-IP rate limiting
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await env.MESSAGES.get(`rl:${ip}`)) {
    return new Response(JSON.stringify({ error: '잠시 후 다시 시도하세요' }), {
      status: 429, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const name = (body.name || '').trim().slice(0, 20);
  const text = (body.text || '').trim().slice(0, 300);
  if (!name || !text) return new Response('Bad request', { status: 400 });

  // Forward to Telegram group
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.CHAT_ID, text: `[웹] ${name}: ${text}` }),
  });

  // Store for web display
  const ts = Date.now();
  await storeMessage(env, { id: String(ts), from: name, text, ts, fromTg: false });

  // Apply rate limit
  await env.MESSAGES.put(`rl:${ip}`, '1', { expirationTtl: RATE_LIMIT_S });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── KV helpers ────────────────────────────────────────────────────────────────
async function storeMessage(env, msg) {
  // Descending timestamp key → newest messages appear first in KV list
  const key = `msg:${String(MAX_TS - msg.ts).padStart(15, '0')}:${msg.id}`;
  await env.MESSAGES.put(key, JSON.stringify(msg), { expirationTtl: MSG_TTL });
}

async function getMessages(env) {
  const list = await env.MESSAGES.list({ prefix: 'msg:', limit: MAX_MESSAGES });
  const values = await Promise.all(list.keys.map(k => env.MESSAGES.get(k.name, 'json')));
  // Reverse so oldest-first (newest at bottom, standard chat layout)
  return values.filter(Boolean).reverse();
}
