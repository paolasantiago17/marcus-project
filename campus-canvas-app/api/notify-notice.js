// Emails a newly published notice to every approved student. Called from
// the admin console with the admin's own login.
const { APP_URL, escape, firstName, asAdmin, requireAdmin, isId, layout, button, sendEach } = require('./_email');

function emailFor(name, notice) {
  const body = escape(notice.body).replace(/\n/g, '<br>');
  const cta = /^https?:\/\//i.test(notice.url) ? button(notice.url, notice.cta_label || 'Learn more') : '';
  const html = layout(`
      <p style="font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:#8C8375; margin-bottom:4px;">${escape(notice.category)}</p>
      <h2 style="font-family:Georgia,serif; font-weight:400; font-size:26px; line-height:1.2; color:#1B1916; margin:0 0 16px;">${escape(notice.title)}</h2>
      <p>Hi ${firstName(name)},</p>
      <p>${body}</p>
      ${cta}
      <p><a href="${APP_URL}/#/notices" style="color:#A6842C;">See all notices in Campus Canvas</a></p>`,
    'You’re getting this because you entered Campus Canvas with this email address. Reply to this email if you’d rather not get announcements.');
  return { subject: notice.title, html };
}

module.exports = async (req, res) => {
  try {
    const token = await requireAdmin(req, res);
    if (!token) return;
    const noticeId = req.body && req.body.noticeId;
    if (!isId(noticeId)) return res.status(400).json({ error: 'Bad request' });
    const [notice] = await asAdmin(token, `notices?id=eq.${noticeId}&select=title,body,category,cta_label,url,status`);
    if (!notice || notice.status !== 'live') return res.status(404).json({ error: 'Notice not found' });
    const students = await asAdmin(token, 'participants?access=eq.approved&is_seed=eq.false&select=name,email');
    await sendEach(students.map((s) => ({ to: s.email, ...emailFor(s.name, notice) })));
    return res.status(200).json({ sent: students.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
