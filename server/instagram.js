'use strict';

// Instagram feed via the Instagram API with Instagram Login (graph.instagram.com).
// Requires a long-lived access token for the academy's Instagram professional
// (Business or Creator) account. Admins paste it in Admin → Instagram, or set
// INSTAGRAM_ACCESS_TOKEN. The token is refreshed automatically before it expires
// and the latest posts are cached, so new posts appear on the site by themselves.

const { getSetting, setSetting } = require('./db');

const GRAPH = 'https://graph.instagram.com';
const FEED_TTL_MS = 15 * 60_000;
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

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

function normalise(item) {
  return {
    id: item.id,
    caption: item.caption || '',
    type: item.media_type,
    image: item.media_type === 'VIDEO' ? item.thumbnail_url || '' : item.media_url,
    video: item.media_type === 'VIDEO' ? item.media_url : '',
    permalink: item.permalink,
    timestamp: item.timestamp,
  };
}

async function fetchPosts(limit = 24) {
  const cfg = getConfig();
  if (!cfg.accessToken) return null;
  const body = await graphGet('/me/media', {
    fields: FIELDS,
    limit: String(Math.min(Math.max(limit, 1), 50)),
    access_token: cfg.accessToken,
  });
  return (body.data || []).filter((p) => p.media_url || p.thumbnail_url).map(normalise);
}

async function getFeed({ force = false } = {}) {
  const cfg = getConfig();
  if (!cfg.accessToken) return { configured: false, posts: [] };

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

async function setToken(token) {
  const me = await testToken(token);
  // A fresh long-lived token lasts 60 days. Record that and refresh it well before expiry.
  saveConfig({
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
  if (!cfg.accessToken || cfg.fromEnv) return;
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
    configured: Boolean(cfg.accessToken),
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

module.exports = { getFeed, setToken, clearToken, status, startBackgroundRefresh };
