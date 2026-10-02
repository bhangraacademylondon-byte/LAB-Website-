'use strict';

// Live Instagram feed for the gallery. Two ways to connect (Admin → Instagram):
//
// 1. Behold feed link (easiest): connect the Instagram account at behold.so and
//    paste the JSON feed URL (https://feeds.behold.so/...). Behold handles the
//    Instagram login and token renewal.
// 2. Instagram API with Instagram Login (graph.instagram.com): paste a long-lived
//    access token for the academy's professional account, or set
//    INSTAGRAM_ACCESS_TOKEN. The token is refreshed automatically.
//
// Posts are cached for a few minutes, so new posts appear on the site by themselves.

const { getSetting, setSetting } = require('./db');

const GRAPH = 'https://graph.instagram.com';
const FEED_TTL_MS = 10 * 60_000;
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';
const BEHOLD_RE = /^https:\/\/feeds\.behold\.so\/[A-Za-z0-9_-]+\/?$/;

let memoryCache = null; // { fetchedAt, posts }
let inflight = null;

function getConfig() {
  const stored = getSetting('instagram', {}) || {};
  if (!stored.accessToken && process.env.INSTAGRAM_ACCESS_TOKEN) {
    return { ...stored, accessToken: process.env.INSTAGRAM_ACCESS_TOKEN, fromEnv: true };
  }
  return stored;
}

function saveConfig(patch) {
  const current = getSetting('instagram', {}) || {};
  setSetting('instagram', { ...current, ...patch });
}

async function graphGet(pathname, params) {
  const url = new URL(GRAPH + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error?.message || `Instagram returned HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function mediaItem(type, mediaUrl, thumbnailUrl) {
  const isVideo = type === 'VIDEO';
  return { type, image: isVideo ? thumbnailUrl || '' : mediaUrl || '', video: isVideo ? mediaUrl || '' : '' };
}

function normaliseGraph(item) {
  return {
    id: item.id,
    caption: item.caption || '',
    ...mediaItem(item.media_type, item.media_url, item.thumbnail_url),
    type: item.media_type,
    permalink: item.permalink,
    timestamp: item.timestamp,
    children: (item.children?.data || []).map((c) => mediaItem(c.media_type, c.media_url, c.thumbnail_url)),
  };
}

function normaliseBehold(item) {
  const sized = item.sizes?.large?.mediaUrl || item.sizes?.medium?.mediaUrl || item.sizes?.full?.mediaUrl;
  const type = item.mediaType || 'IMAGE';
  const base = mediaItem(type, item.mediaUrl, item.thumbnailUrl);
  return {
    id: String(item.id),
    caption: item.caption || item.prunedCaption || '',
    ...base,
    image: sized || base.image,
    type,
    permalink: item.permalink,
    timestamp: item.timestamp,
    children: (item.children || []).map((c) => {
      const m = mediaItem(c.mediaType, c.mediaUrl, c.thumbnailUrl);
      return { ...m, image: c.sizes?.large?.mediaUrl || c.sizes?.medium?.mediaUrl || m.image };
    }),
  };
}

function provider(cfg) {
  if (cfg.accessToken) return 'instagram';
  if (cfg.beholdUrl) return 'behold';
  return null;
}

async function fetchBehold(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Behold returned HTTP ${res.status}`);
  const body = await res.json();
  const posts = Array.isArray(body) ? body : body.posts || [];
  return { username: body.username || '', posts: posts.map(normaliseBehold).filter((p) => p.image && p.permalink) };
}

async function fetchPosts(limit = 50) {
  const cfg = getConfig();
  if (provider(cfg) === 'behold') return (await fetchBehold(cfg.beholdUrl)).posts;
  if (!cfg.accessToken) return null;
  const body = await graphGet('/me/media', {
    fields: FIELDS,
    limit: String(Math.min(Math.max(limit, 1), 50)),
    access_token: cfg.accessToken,
  });
  return (body.data || []).filter((p) => p.media_url || p.thumbnail_url).map(normaliseGraph);
}

async function getFeed({ force = false } = {}) {
  const cfg = getConfig();
  if (!provider(cfg)) return { configured: false, posts: [] };

  if (!force && memoryCache && Date.now() - memoryCache.fetchedAt < FEED_TTL_MS) {
    return { configured: true, posts: memoryCache.posts, fetchedAt: memoryCache.fetchedAt };
  }
  if (!inflight) {
    inflight = fetchPosts()
      .then((posts) => {
        memoryCache = { fetchedAt: Date.now(), posts };
        saveConfig({ lastError: '', lastFetchedAt: new Date().toISOString() });
        return memoryCache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    const result = await inflight;
    return { configured: true, posts: result.posts, fetchedAt: result.fetchedAt };
  } catch (err) {
    saveConfig({ lastError: err.message });
    // Serve stale posts rather than an empty gallery if Instagram is briefly down.
    if (memoryCache) return { configured: true, posts: memoryCache.posts, stale: true };
    return { configured: true, posts: [], error: 'Instagram posts are unavailable right now.' };
  }
}

async function testToken(token) {
  const me = await graphGet('/me', { fields: 'user_id,username,account_type', access_token: token });
  return me;
}

async function setBeholdUrl(url) {
  const clean = String(url || '').trim();
  if (!BEHOLD_RE.test(clean)) throw new Error('That does not look like a Behold JSON feed link (https://feeds.behold.so/…).');
  const feed = await fetchBehold(clean);
  setSetting('instagram', {
    beholdUrl: clean,
    username: feed.username,
    accountType: '',
    tokenSetAt: new Date().toISOString(),
    lastError: '',
  });
  memoryCache = null;
  return feed;
}

async function setToken(token) {
  const me = await testToken(token);
  // A fresh long-lived token lasts 60 days. Record that and refresh it well before expiry.
  setSetting('instagram', {
    accessToken: token,
    username: me.username || '',
    accountType: me.account_type || '',
    tokenSetAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
    lastError: '',
  });
  memoryCache = null;
  return me;
}

function clearToken() {
  setSetting('instagram', {});
  memoryCache = null;
}

async function refreshTokenIfNeeded() {
  const cfg = getConfig();
  if (provider(cfg) !== 'instagram' || cfg.fromEnv) return;
  const setAt = cfg.tokenSetAt ? Date.parse(cfg.tokenSetAt) : 0;
  // Tokens can only be refreshed once they are at least 24 hours old.
  if (Date.now() - setAt < 7 * 86400_000) return;
  try {
    const body = await graphGet('/refresh_access_token', {
      grant_type: 'ig_refresh_token',
      access_token: cfg.accessToken,
    });
    saveConfig({
      accessToken: body.access_token,
      tokenSetAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (body.expires_in || 60 * 86400) * 1000).toISOString(),
      lastError: '',
    });
  } catch (err) {
    saveConfig({ lastError: `Token refresh failed: ${err.message}` });
  }
}

function status() {
  const cfg = getConfig();
  return {
    configured: Boolean(provider(cfg)),
    provider: provider(cfg),
    beholdUrl: cfg.beholdUrl || '',
    fromEnv: Boolean(cfg.fromEnv),
    username: cfg.username || '',
    accountType: cfg.accountType || '',
    tokenSetAt: cfg.tokenSetAt || '',
    expiresAt: cfg.expiresAt || '',
    lastFetchedAt: cfg.lastFetchedAt || '',
    lastError: cfg.lastError || '',
  };
}

function startBackgroundRefresh() {
  const tick = () => refreshTokenIfNeeded().catch(() => {});
  tick();
  setInterval(tick, 12 * 3600_000).unref();
}

module.exports = { getFeed, setToken, setBeholdUrl, clearToken, status, startBackgroundRefresh, normaliseBehold, normaliseGraph };
