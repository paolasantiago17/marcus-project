// Emails a student once the curators have reviewed all of their photos.
// Called from the admin console with the admin's own login.
const { APP_URL, escape, firstName, asAdmin, requireAdmin, isId, layout, button, resend } = require('./_email');

function emailFor(name, images) {
  const accepted = images.filter((i) => i.status === 'accepted');
  const rejected = images.filter((i) => i.status === 'rejected');
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
  const html = layout(`
      <p>Hi ${firstName(name)},</p>
      <p>The ArtUP curators have reviewed your photos${accepted.length ? `, and ${accepted.length} of ${images.length} ${accepted.length === 1 ? 'is' : 'are'} now in voting` : ''}.</p>
      <table style="border-collapse:collapse; margin:8px 0 16px;">${rows}</table>
      ${next}
      ${button(`${APP_URL}/#/account`, rejected.length ? 'Replace a photo' : 'Open Campus Canvas')}`,
    'You’re getting this because you entered Campus Canvas with this email address.');
  return { subject, html };
}

module.exports = async (req, res) => {
  try {
    const token = await requireAdmin(req, res);
    if (!token) return;
    const participantId = req.body && req.body.participantId;
    if (!isId(participantId)) return res.status(400).json({ error: 'Bad request' });
    const [participant] = await asAdmin(token, `participants?id=eq.${participantId}&select=name,email`);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });
    const images = await asAdmin(token, `images?participant_id=eq.${participantId}&select=title,status,photo_url&order=submitted_at`);
    if (!images.length || images.some((i) => i.status === 'pending')) {
      return res.status(409).json({ error: 'Some photos are still waiting for review' });
    }
    const { subject, html } = emailFor(participant.name, images);
    await resend('/emails', { from: process.env.EMAIL_FROM, to: participant.email, subject, html });
    return res.status(200).json({ sent: true, to: participant.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
