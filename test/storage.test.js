'use strict';

// Exercises the Supabase Storage client against a small stand-in for the
// Supabase Storage API (bucket create, upload, list, delete).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const files = new Map();
const seen = [];
let bucketCreated = false;
const fake = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, apikey: req.headers.apikey, auth: req.headers.authorization, type: req.headers['content-type'] });
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.method === 'POST' && req.url === '/storage/v1/bucket') {
      if (bucketCreated) return send(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      bucketCreated = JSON.parse(body).public === true;
      return send(200, { name: 'uploads' });
    }
    if (req.method === 'POST' && req.url === '/storage/v1/object/list/uploads') {
      return send(200, [...files.keys()].map((name) => ({ name, id: name, created_at: new Date().toISOString() })));
    }
    if (req.method === 'POST' && req.url.startsWith('/storage/v1/object/uploads/')) {
      files.set(decodeURIComponent(req.url.split('/').pop()), body);
      return send(200, { Key: req.url });
    }
    if (req.method === 'DELETE' && req.url === '/storage/v1/object/uploads') {
      for (const p of JSON.parse(body).prefixes) files.delete(p);
      return send(200, []);
    }
    send(404, { error: 'not found' });
  });
});

let storage;
before(async () => {
  await new Promise((r) => fake.listen(0, r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}/`;
  process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
  storage = require('../server/storage');
});
after(() => fake.close());

test('uploads go to a public Supabase Storage bucket', async () => {
  assert.equal(storage.remote, true);
  await storage.init();
  assert.equal(bucketCreated, true, 'bucket is created as public');
  await storage.init(); // second start: "already exists" is fine

  const url = await storage.save('123-logo.png', Buffer.from('png-bytes'), 'image/png');
  assert.equal(url, `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/uploads/123-logo.png`);
  assert.equal(files.get('123-logo.png').toString(), 'png-bytes');
  const upload = seen.find((s) => s.url.endsWith('/123-logo.png'));
  assert.equal(upload.apikey, 'sb_secret_test');
  assert.equal(upload.auth, undefined, 'new-style secret keys are not sent as a Bearer token');
  assert.equal(upload.type, 'image/png');

  const list = await storage.list();
  assert.deepEqual(list.map((f) => f.name), ['123-logo.png']);
  await storage.remove('../../123-logo.png');
  assert.equal(files.size, 0, 'delete uses only the file name');
});
