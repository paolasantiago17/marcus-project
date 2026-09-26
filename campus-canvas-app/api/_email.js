// Shared by the email functions in this folder. Files starting with "_" are
// helpers, not endpoints. Sends through Resend (https://resend.com); set these
// in Vercel → campus-canvas-app → Settings → Environment Variables:
//   RESEND_API_KEY  the Resend API key (secret)
//   EMAIL_FROM      e.g. "ArtUP Campus Canvas <hello@artup.life>" on a domain verified in Resend

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cvklnixvwgfvnvgabtgm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bzHxdmTKHbnFkdqhF8eUJA_McLURa7H';
const APP_URL = process.env.APP_URL || 'https://app.artup.life';

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstName = (name) => escape(String(name).trim().split(/\s+/)[0]);

// Reads the database as the admin who made the call, so row-level security
// decides what they can see.
async function asAdmin(token, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Database request failed (${res.status})`);
  return res.json();
}

// Checks the request and that it comes from an admin. Returns the admin's
// token, or null after sending an error response.
async function requireAdmin(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return null; }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    res.status(503).json({ error: 'Email isn’t set up yet (RESEND_API_KEY / EMAIL_FROM missing in Vercel)' });
    return null;
  }
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) { res.status(401).json({ error: 'Sign in again' }); return null; }
  const admins = await asAdmin(token, 'admins?select=user_id');
  if (!admins.length) { res.status(403).json({ error: 'Admin access required' }); return null; }
  return token;
}

const isId = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

// The ArtUP frame around every email.
function layout(inner, footer) {
  return `
    <div style="font-family:Helvetica,Arial,sans-serif; max-width:520px; margin:0 auto; color:#4A443A; font-size:15px; line-height:1.6;">
      <p style="font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#A6842C;">ArtUP Campus Canvas</p>
      ${inner}
      <p style="font-size:13px; color:#8C8375;">${footer}</p>
    </div>`;
}

function button(href, label) {
  return `<p><a href="${escape(href)}" style="display:inline-block; padding:12px 22px; border-radius:24px; background:#A6842C; color:#FFFFFF; text-decoration:none; letter-spacing:.12em; text-transform:uppercase; font-size:12px;">${escape(label)}</a></p>`;
}

async function resend(path, body) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.message || `Email service error (${res.status})`);
  }
  return res.json();
}

// One email per message, so recipients never see each other's addresses.
// Resend takes up to 100 per batch call.
async function sendEach(messages) {
  for (let i = 0; i < messages.length; i += 100) {
    await resend('/emails/batch', messages.slice(i, i + 100).map((m) => ({ from: process.env.EMAIL_FROM, ...m })));
  }
}

module.exports = { APP_URL, escape, firstName, asAdmin, requireAdmin, isId, layout, button, resend, sendEach };
