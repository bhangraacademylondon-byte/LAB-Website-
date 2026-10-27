'use strict';

// Sending email through Resend (resend.com), over HTTPS: Render's free plan
// blocks ordinary email ports. Switched on by setting RESEND_API_KEY in
// Render → Environment, once the domain is verified in Resend. Without it,
// nothing is sent and the site works as before.
//
// EMAIL_FROM sets the sender (default below); ACADEMY_EMAIL is where new
// contact form messages are sent.

const FROM = process.env.EMAIL_FROM || 'London Academy of Bhangra <no-reply@londonacademyofbhangra.org>';
const ACADEMY_EMAIL = process.env.ACADEMY_EMAIL || 'bhangraacademy.london@gmail.com';

// Tests replace this to see what would have been sent.
let transport = async (message) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Resend replied ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

const enabled = () => Boolean(process.env.RESEND_API_KEY) || transport.isTest === true;

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A plain, readable email: a few paragraphs and, optionally, one button.
function render({ paragraphs, button }) {
  const text = [...paragraphs, button ? `${button.label}: ${button.url}` : '', '', 'London Academy of Bhangra'].join('\n\n').trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#16162c;max-width:560px">
${paragraphs.map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('\n')}
${button ? `<p><a href="${escape(button.url)}" style="display:inline-block;background:#16162c;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${escape(button.label)}</a></p><p style="font-size:13px;color:#666">Or copy this link: ${escape(button.url)}</p>` : ''}
<p style="font-size:13px;color:#666">London Academy of Bhangra</p></div>`;
  return { text, html };
}

// Sends an email; never throws (a failed email must not break the page), returns whether it went.
async function send({ to, subject, paragraphs, button, replyTo }) {
  if (!enabled()) return false;
  try {
    await transport({ from: FROM, to: [to], subject, ...render({ paragraphs, button }), ...(replyTo ? { reply_to: replyTo } : {}) });
    return true;
  } catch (err) {
    console.error('Email not sent:', err.message);
    return false;
  }
}

function useTestTransport(fn) {
  transport = fn;
  transport.isTest = true;
}

module.exports = { send, enabled, ACADEMY_EMAIL, useTestTransport };
