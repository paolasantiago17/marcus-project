// Emails a student once the curators have reviewed all of their photos.
// Called from the admin console with the admin's own login, so only admins
// can trigger it. Sends through Resend (https://resend.com); set these in
// Vercel → Project → Settings → Environment Variables:
//   RESEND_API_KEY  the Resend API key (secret)
//   EMAIL_FROM      e.g. "ArtUP Campus Canvas <hello@artup.life>" on a domain verified in Resend

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cvklnixvwgfvnvgabtgm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bzHxdmTKHbnFkdqhF8eUJA_McLURa7H';
const APP_URL = process.env.APP_URL || 'https://app.artup.life';

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Reads the database as the admin who made the call, so row-level security
// decides what they can see.
async function asAdmin(token, path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Database request failed (${res.status})`);
  return res.json();
}

function emailFor(name, images) {
  const accepted = images.filter((i) => i.status === 'accepted');
  const rejected = images.filter((i) => i.status === 'rejected');
  const first = escape(String(name).trim().split(/\s+/)[0]);
  const subject = rejected.length
    ? 'Your Campus Canvas photos have been reviewed'
    : 'Your Campus Canvas photos are in voting!';
  const rows = images.map((i) => `
    <tr>
      <td style="padding:8px 12px 8px 0;"><img src="${escape(i.photo_url)}" width="56" height="56" alt="" style="border-radius:8px; object-fit:cover; display:block;"></td>
      <td style="padding:8px 12px 8px 0; font-size:15px; color:#1B1916;">${escape(i.title)}</td>
      <td style="padding:8px 0; font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:${i.status === 'accepted' ? '#2E6B5C' : '#C4543A'};">${i.status === 'accepted' ? 'In voting' : 'Not accepted'}</td>
    </tr>`).join('');
  const next = rejected.length
    ? `<p>Every photo is checked against the contest guidelines, and ${rejected.length === 1 ? 'one' : 'some'} of yours didn’t make it into voting this time. You can replace ${rejected.length === 1 ? 'it' : 'them'} with a new photo from your profile.</p>`
    : '<p>All of your photos are now in the voting catalogue, where other students can vote on them.</p>';
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif; max-width:520px; margin:0 auto; color:#4A443A; font-size:15px; line-height:1.6;">
      <p style="font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#A6842C;">ArtUP Campus Canvas</p>
      <p>Hi ${first},</p>
      <p>The ArtUP curators have reviewed your photos${accepted.length ? `, and ${accepted.length} of ${images.length} ${accepted.length === 1 ? 'is' : 'are'} now in voting` : ''}.</p>
      <table style="border-collapse:collapse; margin:8px 0 16px;">${rows}</table>
      ${next}
      <p><a href="${APP_URL}/#/account" style="display:inline-block; padding:12px 22px; border-radius:24px; background:#A6842C; color:#FFFFFF; text-decoration:none; letter-spacing:.12em; text-transform:uppercase; font-size:12px;">${rejected.length ? 'Replace a photo' : 'Open Campus Canvas'}</a></p>
      <p style="font-size:13px; color:#8C8375;">You’re getting this because you entered Campus Canvas with this email address.</p>
    </div>`;
  return { subject, html };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return res.status(503).json({ error: 'Email isn’t set up yet (RESEND_API_KEY / EMAIL_FROM missing in Vercel)' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const participantId = req.body && req.body.participantId;
  if (!token || !/^[0-9a-f-]{36}$/i.test(participantId || '')) return res.status(400).json({ error: 'Bad request' });

  try {
    const admins = await asAdmin(token, 'admins?select=user_id');
    if (!admins.length) return res.status(403).json({ error: 'Admin access required' });
    const [participant] = await asAdmin(token, `participants?id=eq.${participantId}&select=name,email`);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });
    const images = await asAdmin(token, `images?participant_id=eq.${participantId}&select=title,status,photo_url&order=submitted_at`);
    if (!images.length || images.some((i) => i.status === 'pending')) {
      return res.status(409).json({ error: 'Some photos are still waiting for review' });
    }

    const { subject, html } = emailFor(participant.name, images);
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: participant.email, subject, html }),
    });
    if (!sent.ok) {
      const detail = await sent.json().catch(() => ({}));
      return res.status(502).json({ error: detail.message || `Email service error (${sent.status})` });
    }
    return res.status(200).json({ sent: true, to: participant.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
