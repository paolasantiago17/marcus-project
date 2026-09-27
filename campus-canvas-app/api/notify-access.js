// Tells a non-@queensu.ca student their email was approved. Called from the
// admin console with the admin's own login, right after they approve someone.
const { APP_URL, escape, firstName, asAdmin, requireAdmin, isId, layout, button, resend } = require('./_email');

module.exports = async (req, res) => {
  try {
    const token = await requireAdmin(req, res);
    if (!token) return;
    const participantId = req.body && req.body.participantId;
    if (!isId(participantId)) return res.status(400).json({ error: 'Bad request' });
    const [p] = await asAdmin(token, `participants?id=eq.${participantId}&select=name,email,access`);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    if (p.access !== 'approved') return res.status(409).json({ error: 'This participant isn’t approved' });
    const html = layout(`
      <h2 style="font-family:Georgia,serif; font-weight:400; font-size:26px; line-height:1.2; color:#1B1916; margin:0 0 16px;">You’re in</h2>
      <p>Hi ${firstName(p.name)},</p>
      <p>Good news, we’ve approved your email for Campus Canvas. You can now submit your photos of campus and vote for your favourites.</p>
      <p>To get back in, open the app and log in with <strong>${escape(p.email)}</strong>. We’ll email you a link, no password needed.</p>
      ${button(`${APP_URL}/`, 'Open Campus Canvas')}`,
      'You’re getting this because you signed up for Campus Canvas with this email address.');
    await resend('/emails', { from: process.env.EMAIL_FROM, to: p.email, subject: 'You’re approved for Campus Canvas', html });
    return res.status(200).json({ sent: 1 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
