'use strict';

// Two-step login for admins and teachers, using an authenticator app (Google
// Authenticator, Microsoft Authenticator, 1Password...). These are standard
// time-based codes (RFC 6238): six digits that change every 30 seconds,
// worked out from a secret shared once through a QR code. Backup codes let
// someone in if they lose their phone; an admin can also reset it.

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const ISSUER = 'London Academy of Bhangra';

function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const newSecret = () => base32(crypto.randomBytes(20));

// The code for a given 30-second window.
function codeAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

const counterNow = (now = Date.now()) => Math.floor(now / 1000 / STEP);

// Checks a code, allowing one window either side for a slow phone clock. Returns
// the window it matched (so it can't be used twice), or null.
function check(secret, code, lastUsed = -1, now = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const at = counterNow(now);
  for (const counter of [at - 1, at, at + 1]) {
    if (counter <= lastUsed) continue;
    const expected = codeAt(secret, counter);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return counter;
  }
  return null;
}

function setupUrl(secret, account) {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

// Eight one-time backup codes such as "7f3a-91c2"; only their hashes are stored.
const hashCode = (code) => crypto.createHash('sha256').update(String(code).toLowerCase().replace(/[^a-f0-9]/g, '')).digest('hex');
function newBackupCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const hex = crypto.randomBytes(4).toString('hex');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  });
  return { codes, stored: JSON.stringify(codes.map(hashCode)) };
}

// Uses up a backup code: returns the remaining stored list, or null if it didn't match.
function useBackupCode(stored, code) {
  let list;
  try {
    list = JSON.parse(stored || '[]');
  } catch {
    return null;
  }
  const h = hashCode(code);
  if (!/^[a-f0-9]{8}$/i.test(String(code).replace(/[^a-f0-9]/gi, '')) || !list.includes(h)) return null;
  return JSON.stringify(list.filter((x) => x !== h));
}

module.exports = { newSecret, codeAt, counterNow, check, setupUrl, newBackupCodes, useBackupCode };
