const { getDb } = require('./db');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

function getToken() {
  try {
    const cfg = getDb().prepare('SELECT access_token FROM config WHERE id = 1').get();
    if (cfg?.access_token) return cfg.access_token;
  } catch {}
  return process.env.INSTAGRAM_ACCESS_TOKEN || '';
}

function getIgAccountId() {
  try {
    const cfg = getDb().prepare('SELECT instagram_account_id FROM config WHERE id = 1').get();
    if (cfg?.instagram_account_id) return cfg.instagram_account_id;
  } catch {}
  return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '';
}

async function apiRequest(method, urlPath, { params = {}, body } = {}) {
  const url = new URL(`${GRAPH_API_BASE}/${urlPath.replace(/^\//, '')}`);
  url.searchParams.set('access_token', getToken());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), opts);
    const data = await res.json();
    console.log(`Instagram API ${method} ${urlPath} -> ${res.status}`);

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 5000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const err = new Error(`Graph API ${res.status}: ${JSON.stringify(data)}`);
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    return data;
  }
}

async function replyToComment(commentId, message) {
  return apiRequest('POST', `${commentId}/replies`, { body: { message } });
}

async function sendDm(instagramUserId, message) {
  return apiRequest('POST', `${getIgAccountId()}/messages`, {
    body: { recipient: { id: instagramUserId }, message: { text: message } },
  });
}

async function getPostDetails(postId) {
  try {
    const data = await apiRequest('GET', postId, {
      params: { fields: 'id,caption,media_url,thumbnail_url,permalink,media_type' },
    });
    return {
      id: data.id || postId,
      caption: data.caption || '',
      preview_url: data.thumbnail_url || data.media_url || '',
      permalink: data.permalink || '',
      media_type: data.media_type || '',
    };
  } catch (err) {
    console.error('getPostDetails error:', err.message);
    return {};
  }
}

module.exports = { replyToComment, sendDm, getPostDetails };
