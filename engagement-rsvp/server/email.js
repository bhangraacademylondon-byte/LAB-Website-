'use strict';

// Sends the "someone has replied" emails through an email API over HTTPS.
// (Render's free plan blocks normal email-server connections, so SMTP is not used.)
//   RESEND_API_KEY  https://resend.com (free). Without your own domain, Resend
//                   only delivers to the address you signed up with.
//   BREVO_API_KEY   https://www.brevo.com (free). EMAIL_FROM must be a sender you verified there.

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const BREVO_KEY = process.env.BREVO_API_KEY || '';
const FROM = (process.env.EMAIL_FROM || '').trim();

const provider = RESEND_KEY ? 'resend' : BREVO_KEY ? 'brevo' : '';
let lastError = '';
let lastSentAt = '';

function parseFrom(value, fallbackName) {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || fallbackName, email: m[2] };
  return { name: fallbackName, email: value };
}

async function send({ to, subject, text, html, fromName = 'RSVP updates' }) {
  const recipients = to.filter(Boolean);
  if (!provider) throw new Error('Email is not set up yet: add RESEND_API_KEY or BREVO_API_KEY to the server settings.');
  if (!recipients.length) throw new Error('There are no email addresses to send updates to.');
  let res;
  if (provider === 'resend') {
    const from = parseFrom(FROM || 'onboarding@resend.dev', fromName);
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: recipients, subject, text, html }),
      signal: AbortSignal.timeout(15_000),
    });
  } else {
    if (!FROM) throw new Error('Set EMAIL_FROM to the sender address you verified in Brevo.');
    const from = parseFrom(FROM, fromName);
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: from, to: recipients.map((email) => ({ email })), subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(15_000),
    });
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`The email service refused the message (${res.status}): ${detail}`);
  }
}

// Like send(), but never throws: a failed email must not lose an RSVP.
async function sendQuietly(message) {
  try {
    await send(message);
    lastError = '';
    lastSentAt = new Date().toISOString();
    return true;
  } catch (err) {
    lastError = err.message;
    console.error(`Email not sent: ${err.message}`);
    return false;
  }
}

function status() {
  return {
    provider,
    from: provider === 'resend' ? FROM || 'onboarding@resend.dev' : FROM,
    lastError,
    lastSentAt,
  };
}

module.exports = { send, sendQuietly, status };
