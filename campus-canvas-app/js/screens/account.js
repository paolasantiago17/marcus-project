import { Store } from '../store.js';
import { Router } from '../router.js';
import { toast, busy, esc, entryGridHTML } from '../ui.js';

export function account(root) {
  const p = Store.currentParticipant();
  if (!p) { Router.go('#/'); return; }
  const mine = Store.myImages();
  const accepted = mine.filter((i) => i.status === 'accepted').length;
  const inReview = mine.filter((i) => i.status === 'pending').length;
  const tier = Store.tierFor(p.points);
  const initials = p.name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const unread = Store.unreadCount();

  root.innerHTML = `
    <div class="screen">
      <div class="topbar" style="padding-bottom:24px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Account</span>
        <button data-nav="#/vote" style="border:none; background:none; font-size:17px; color:#8C8375; cursor:pointer; padding:0;">&times;</button>
      </div>
      <div class="scroll" style="padding:0 24px;">
        <div style="display:flex; align-items:center; gap:16px; padding-bottom:24px; border-bottom:1px solid rgba(27,25,22,.10); margin-bottom:24px;">
          <span style="width:56px; height:56px; border-radius:28px; background:#15130F; color:#A6842C; display:flex; align-items:center; justify-content:center; font-family:'Bodoni Moda',serif; font-size:20px; flex:none;">${esc(initials)}</span>
          <div style="min-width:0;">
            <p class="h-serif" style="font-size:21px; line-height:1.2; margin-bottom:4px;">${esc(p.name)}</p>
            <p style="margin:0; font-size:14px; font-weight:300; color:#8C8375;">${esc(p.email)}</p>
          </div>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:28px;">
          <div style="flex:1; border-radius:16px; background:#15130F; padding:18px;">
            <p class="h-serif" style="font-size:26px; color:#A6842C; margin-bottom:6px;">${p.points}</p>
            <p style="margin:0; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#9A8F79;">Points</p>
          </div>
          <div style="flex:1; border-radius:16px; background:#F2ECE0; padding:18px;">
            <p class="h-serif" style="font-size:26px; margin-bottom:6px;">${tier.prevEarned ? Store.TIER_THRESHOLDS.indexOf(tier.prevEarned) + 1 : 0}</p>
            <p style="margin:0; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#8C8375;">Raffle entr${tier.prevEarned && Store.TIER_THRESHOLDS.indexOf(tier.prevEarned) + 1 === 1 ? 'y' : 'ies'}</p>
          </div>
          <div style="flex:1; border-radius:16px; background:#F2ECE0; padding:18px;">
            <p class="h-serif" style="font-size:26px; margin-bottom:6px;">${mine.length}/3</p>
            <p style="margin:0; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#8C8375;">Submitted</p>
          </div>
        </div>

        ${mine.length ? `
          <p class="eyebrow" style="letter-spacing:.20em;">Your entry</p>
          <div class="card" style="padding:16px; margin-bottom:28px;">
            <div style="margin-bottom:14px;">${entryGridHTML(mine)}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:14px; font-weight:300; color:#8C8375;">Submitted ${new Date(mine[0].submittedAt).toLocaleDateString()}</span>
              <span style="font-size:12.5px; letter-spacing:.12em; text-transform:uppercase; color:#2E6B5C;">${accepted} in voting${inReview ? ` · ${inReview} in review` : ''}</span>
            </div>
          </div>` : `
          <div class="card" style="padding:18px 20px; margin-bottom:28px;">
            <p style="margin:0; font-size:15px; font-weight:300; color:#4A443A;">You haven't submitted your three photos yet.</p>
          </div>`}

        <div style="border-top:1px solid rgba(27,25,22,.10);">
          <div data-nav="#/vote" class="acct-row"><span>Rewards &amp; progress</span><span style="color:#8C8375;">&rarr;</span></div>
          <div data-nav="#/notices" class="acct-row"><span>Notices</span>${unread ? `<span style="height:22px; min-width:22px; padding:0 7px; border-radius:11px; background:#C4543A; color:#FFFDF8; font-size:12.5px; display:flex; align-items:center; justify-content:center;">${unread}</span>` : `<span style="color:#8C8375;">&rarr;</span>`}</div>
          <div data-nav="#/feedback" class="acct-row"><span>Send feedback</span><span style="color:#8C8375;">&rarr;</span></div>
          <div data-nav="#/terms" class="acct-row"><span>Terms of Use</span><span style="font-size:13.5px; color:${p.termsVersion === Store.TERMS_VERSION ? '#8C8375' : '#C4543A'};">${p.termsVersion === Store.TERMS_VERSION ? 'Accepted' : p.termsVersion ? 'Updated' : 'Not accepted'} &rarr;</span></div>
          <div class="acct-row"><span>Privacy</span><span style="color:#8C8375;">&rarr;</span></div>
          <div id="reset-votes" class="acct-row" style="cursor:pointer;"><span>Reset my votes (testing)</span><span style="color:#8C8375;">&rarr;</span></div>
          <div id="delete-data" class="acct-row" style="color:#C4543A; cursor:pointer;"><span>Delete my data</span><span>&rarr;</span></div>
        </div>
        <p style="margin:24px 0 26px; font-size:13px; font-weight:300; line-height:1.7; color:#8C8375;">ArtUP Campus Canvas · Queen's University 2027 pilot · Build 1.0.4</p>
      </div>
    </div>
    <style>.acct-row{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid rgba(27,25,22,.07);font-size:16px;font-weight:300;cursor:pointer;}</style>`;

  root.querySelector('#reset-votes').addEventListener('click', async (e) => {
    if (!confirm('Reset your votes? This clears everything you\'ve voted on (and the points earned from voting) so the queue refills — your registration and submitted photos are untouched.')) return;
    busy(e.currentTarget, '<span>Resetting…</span>');
    try {
      await Store.resetMyVotes();
      toast('Your votes were reset.');
    } catch (err) {
      toast(err.message, 3200);
    }
    account(root);
  });

  root.querySelector('#delete-data').addEventListener('click', async (e) => {
    if (!confirm('Delete your Campus Canvas data? This permanently removes your registration, submitted photos, votes and feedback.')) return;
    busy(e.currentTarget, '<span>Deleting…</span>');
    try {
      await Store.deleteMyData();
    } catch (err) {
      toast(err.message, 3200);
      account(root);
      return;
    }
    toast('Your data has been deleted.');
    Router.go('#/');
  });
}
