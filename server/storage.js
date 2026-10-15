'use strict';

// Where uploaded images (logo, photos) are kept.
// - With SUPABASE_URL and SUPABASE_SERVICE_KEY set: a public Supabase Storage
//   bucket, so images survive on hosts without a permanent disk (Render free).
// - Otherwise: a local folder (DATA_DIR/uploads), served at /uploads.

const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./db');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const remote = Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers(extra = {}) {
  // Legacy service_role keys are JWTs (eyJ...) and go in Authorization too;
  // newer secret keys (sb_secret_...) only go in the apikey header.
  const h = { apikey: SUPABASE_KEY, ...extra };
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

async function call(method, urlPath, { body, json, contentType } = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1${urlPath}`, {
    method,
    headers: headers(json !== undefined ? { 'Content-Type': 'application/json' } : contentType ? { 'Content-Type': contentType } : {}),
    body: json !== undefined ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function publicUrl(name) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(name)}`;
}

async function init() {
  if (!remote) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    return;
  }
  // Create the public bucket the first time; "already exists" is fine.
  const r = await call('POST', '/bucket', { json: { id: BUCKET, name: BUCKET, public: true } });
  const exists = r.status === 409 || /exist|duplicate/i.test(JSON.stringify(r.data || ''));
  if (!r.ok && !exists) {
    throw new Error(`Supabase Storage: could not create the "${BUCKET}" bucket (${r.status} ${JSON.stringify(r.data)}). Check SUPABASE_URL and SUPABASE_SERVICE_KEY.`);
  }
}

async function save(name, buffer, contentType) {
  if (!remote) {
    await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
    return `/uploads/${name}`;
  }
  const r = await call('POST', `/object/${BUCKET}/${encodeURIComponent(name)}`, { body: buffer, contentType });
  if (!r.ok) throw new Error(`Upload to Supabase Storage failed (${r.status}).`);
  return publicUrl(name);
}

async function list() {
  if (!remote) {
    return fs
      .readdirSync(UPLOAD_DIR)
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map((f) => ({ name: f, url: `/uploads/${f}`, mtime: fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  }
  const r = await call('POST', `/object/list/${BUCKET}`, {
    json: { prefix: '', limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'desc' } },
  });
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data
    .filter((f) => f.id && /\.(jpe?g|png|webp|gif)$/i.test(f.name))
    .map((f) => ({ name: f.name, url: publicUrl(f.name), mtime: Date.parse(f.created_at) || 0 }));
}

async function remove(name) {
  const safe = path.basename(name);
  if (!remote) {
    const file = path.join(UPLOAD_DIR, safe);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  await call('DELETE', `/object/${BUCKET}`, { json: { prefixes: [safe] } });
}

function describe() {
  return remote ? `Supabase Storage bucket "${BUCKET}"` : `local folder ${UPLOAD_DIR}`;
}

module.exports = { init, save, list, remove, describe, remote, UPLOAD_DIR };
