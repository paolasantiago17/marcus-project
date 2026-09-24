import { Store, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { bottomNav, avatarBtn, toast, busy, esc, preloadPhotos } from '../ui.js';

let celebrating = false;
let touchStartX = null;
let writingNote = false;
let lastGain = null;

export function vote(root) {
  const p = Store.currentParticipant();
  const queue = Store.votingQueue();
  const totalAccepted = Store.acceptedImages().length;
  const votedCount = totalAccepted - queue.length;
  const tier = Store.tierFor(p.points);
  const finished = !celebrating && queue.length === 0;
  const voting = !celebrating && queue.length > 0;
  const current = queue[0];
  if (voting) preloadPhotos(queue.slice(1, 3));
  const gainToShow = lastGain;
  lastGain = null;

  root.innerHTML = `
    <div class="screen screen-wide">
      <div class="topbar" style="padding-bottom:14px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Vote</span>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="pts-pill-wrap">
            <div class="pts-pill ${gainToShow ? 'pts-pulse' : ''}" style="display:flex; align-items:center; gap:8px; height:34px; padding:0 14px; border-radius:17px; background:#15130F;">
              <span style="font-size:12.5px; color:#A6842C;">&#9670;</span>
              <span style="font-size:14px; font-weight:500; letter-spacing:.10em; color:#F3EEE3;">${p.points} pts</span>
            </div>
            ${gainToShow ? `<span class="pts-pop">+${gainToShow}</span>` : ''}
          </div>
          ${avatarBtn(p, Store.unreadCount() > 0)}
        </div>
      </div>

      <div style="padding:0 22px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px;">
          <span style="font-size:12.5px; font-weight:400; letter-spacing:.10em; color:#4A443A;">${tier.prevEarned ? tier.prevEarned.name + ' · next ' + tier.next.name : 'Next: ' + tier.next.name}</span>
          <span style="font-size:12.5px; font-weight:300; color:#8C8375;">${tier.atTop ? 'Top tier reached' : Math.round(tier.next.at - p.points) + ' pts to go'}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${tier.pct.toFixed(1)}%;"></div></div>
      </div>

      <div class="scroll" style="padding:0 22px;">
        ${celebrating ? celebrationHTML(p) : finished ? finishedHTML() : voting ? votingHTML(current, queue.length) : ''}
      </div>

      <div style="padding:14px 22px 0;">
        <p style="margin:0 0 4px; text-align:center; font-size:13.5px; font-weight:300; color:#8C8375;">You've voted on <span style="font-weight:500; color:#1B1916;">${votedCount}</span> of <span style="font-weight:500; color:#1B1916;">${totalAccepted}</span> available images.</p>
        ${!celebrating ? `<p style="margin:0 0 12px; text-align:center;"><span id="jump-points-btn" style="font-size:12.5px; font-weight:300; color:#8C8375; text-decoration:underline; cursor:pointer;">Jump to 25 pts (testing)</span></p>` : ''}
        ${bottomNav('vote')}
      </div>
    </div>
    ${voting && current && writingNote ? noteSheetHTML(current) : ''}`;

  root.querySelector('#jump-points-btn')?.addEventListener('click', async (e) => {
    const before = p.points;
    busy(e.currentTarget, 'Adding points…');
    try {
      await Store.setTestPoints(25);
    } catch (err) {
      toast(err.message, 3200);
      vote(root);
      return;
    }
    const after = Store.currentParticipant().points;
    const t = Store.tierFor(before);
    if (before < t.next.at && after >= t.next.at) celebrating = true;
    else lastGain = after - before;
    vote(root);
  });

  if (celebrating) {
    root.querySelector('#dismiss-celebrate')?.addEventListener('click', () => { celebrating = false; vote(root); });
    return;
  }

  root.querySelector('#reset-votes-btn')?.addEventListener('click', async (e) => {
    busy(e.currentTarget, 'Resetting…');
    try {
      await Store.resetMyVotes();
      toast('Your votes were reset — the queue is back to full.');
    } catch (err) {
      toast(err.message, 3200);
    }
    vote(root);
  });

  if (voting && current) {
    const card = root.querySelector('#vote-card');
    const doVote = (value, note) => {
      const before = p.points;
      Store.castVote(current.id, value, note);
      const after = Store.currentParticipant().points;
      const t = Store.tierFor(before);
      if (before < t.next.at && after >= t.next.at) celebrating = true;
      lastGain = after - before;
      writingNote = false;
      vote(root);
    };
    root.querySelector('#pass-btn')?.addEventListener('click', () => doVote('pass'));
    root.querySelector('#like-btn')?.addEventListener('click', () => doVote('like'));
    root.querySelector('#note-btn')?.addEventListener('click', () => { writingNote = true; vote(root); });

    if (card) {
      card.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
      card.addEventListener('touchend', (e) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (dx > 70) doVote('like');
        else if (dx < -70) doVote('pass');
      }, { passive: true });
    }

    if (writingNote) {
      const textarea = root.querySelector('#note-text');
      const submitBtn = root.querySelector('#note-submit');
      textarea?.focus();
      textarea?.addEventListener('input', () => {
        submitBtn.disabled = !textarea.value.trim();
      });
      submitBtn?.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        doVote('note', text);
      });
      root.querySelector('#note-cancel')?.addEventListener('click', () => { writingNote = false; vote(root); });
      root.querySelector('#note-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'note-overlay') { writingNote = false; vote(root); }
      });
    }
  }
}

function votingHTML(img, remaining) {
  return `
    <div id="vote-card" class="vote-card" style="border-radius:20px; overflow:hidden; background:#FFFFFF; box-shadow:0 18px 40px rgba(27,25,22,.13);">
      <div class="vote-photo-wrap" style="position:relative;">
        <div class="vote-photo" style="width:100%; aspect-ratio:1.42; background-color:#EDE6D8; ${photoStyle(img.photo)} display:block;"></div>
        <div style="position:absolute; left:14px; top:14px; height:28px; padding:0 12px; border-radius:14px; background:rgba(27,25,22,.62); backdrop-filter:blur(6px); display:flex; align-items:center; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:#F3EEE3;">${remaining} left</div>
      </div>
      <div style="padding:18px 20px 20px;">
        <p class="h-serif" style="font-size:21px; line-height:1.25; margin-bottom:4px;">${esc(img.title)}</p>
        <p style="margin:0 0 12px; font-size:13.5px; font-weight:300; letter-spacing:.06em; color:#8C8375;">by ${esc(img.credit || 'a student')}</p>
        <p style="margin:0; font-size:15px; font-weight:300; line-height:1.65; color:#4A443A;">${esc(img.description)}</p>
      </div>
    </div>
    <div style="display:flex; align-items:center; justify-content:center; gap:30px; margin-top:20px;">
      <button id="pass-btn" style="width:66px; height:66px; border-radius:33px; background:#FFFFFF; border:1px solid rgba(196,84,58,.35); color:#C4543A; display:flex; align-items:center; justify-content:center; font-size:14.5px; font-weight:500; letter-spacing:.10em; text-transform:uppercase; cursor:pointer; box-shadow:0 6px 16px rgba(27,25,22,.08);">Pass</button>
      <button id="note-btn" style="height:44px; padding:0 18px; border-radius:22px; border:1px solid rgba(27,25,22,.18); background:#fff; display:flex; align-items:center; font-size:12.5px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:#4A443A; cursor:pointer;">Note +3</button>
      <button id="like-btn" style="width:66px; height:66px; border-radius:33px; background:#2E6B5C; color:#FFFDF8; border:none; display:flex; align-items:center; justify-content:center; font-size:14.5px; font-weight:500; letter-spacing:.10em; text-transform:uppercase; cursor:pointer; box-shadow:0 8px 20px rgba(46,107,92,.30);">Like</button>
    </div>
    <p class="swipe-hint" style="margin:14px 0 0; text-align:center; font-size:13.5px; font-weight:300; color:#8C8375;">Swipe right to like, left to pass</p>
  `;
}

function noteSheetHTML(img) {
  return `
    <div id="note-overlay" class="sheet-overlay">
      <div class="sheet" style="padding:26px 24px 28px;">
        <p class="eyebrow" style="letter-spacing:.20em; margin-bottom:6px;">Note on “${esc(img.title)}”</p>
        <h3 class="h-serif" style="font-size:24px; line-height:1.15; margin-bottom:18px;">What stands out to you?</h3>
        <textarea id="note-text" rows="4" placeholder="Say what you like about this one…" style="border:1px solid rgba(27,25,22,.14); background:#FFFFFF; margin-bottom:16px;"></textarea>
        <button id="note-submit" class="btn btn-gold" disabled style="margin-bottom:12px;">Add note (+3 pts)</button>
        <button id="note-cancel" class="btn btn-outline">Cancel</button>
      </div>
    </div>`;
}

const PRIZE_COPY = {
  Contributor: { headline: "You're in the draw.", prize: '1 entry', detail: "This week's $20 Amazon Gift Card raffle" },
  Curator: { headline: 'Curator status unlocked.', prize: '3 entries', detail: "This week's raffle, plus early access to the collection" },
  Patron: { headline: 'Patron status unlocked.', prize: '5 entries', detail: "This week's raffle, plus your name in the collection notes" },
};

function confettiField() {
  const colors = ['#A6842C', '#2E6B5C', '#C4543A', '#F3EEE3', '#7A5A35'];
  const pieces = Array.from({ length: 16 }, (_, i) => {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 0.25).toFixed(2);
    const duration = (1.1 + Math.random() * 0.7).toFixed(2);
    const color = colors[i % colors.length];
    const rotate = Math.round(Math.random() * 360);
    return `<span class="confetti-piece" style="left:${left}%; background:${color}; transform:rotate(${rotate}deg); animation-delay:${delay}s; animation-duration:${duration}s;"></span>`;
  }).join('');
  return `<div class="confetti-field">${pieces}</div>`;
}

function celebrationHTML(p) {
  const tier = Store.tierFor(p.points);
  const earned = tier.prevEarned;
  const copy = (earned && PRIZE_COPY[earned.name]) || PRIZE_COPY.Contributor;
  return `
    <div style="position:relative; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 0 20px;">
      ${confettiField()}
      <span style="width:64px; height:64px; border-radius:32px; background:#A6842C; display:flex; align-items:center; justify-content:center; margin-bottom:28px; box-shadow:0 10px 24px rgba(166,132,44,.35);">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 6.4L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.6L12 2z" fill="#15130F"/></svg>
      </span>
      <p style="margin:0 0 10px; font-size:12px; letter-spacing:.24em; text-transform:uppercase; color:#A6842C;">${earned ? earned.at : ''} points reached</p>
      <h3 class="h-serif" style="font-size:31px; line-height:1.1; margin-bottom:20px;">${copy.headline}</h3>

      <div style="width:100%; max-width:280px; border-radius:18px; background:#15130F; padding:22px; margin-bottom:24px;">
        <p style="margin:0 0 6px; font-size:12px; letter-spacing:.20em; text-transform:uppercase; color:#9A8F79;">Your prize</p>
        <p class="h-serif" style="margin:0 0 8px; font-size:28px; color:#A6842C;">${copy.prize}</p>
        <p style="margin:0; font-size:14.5px; font-weight:300; line-height:1.6; color:#CFC7B6;">${copy.detail}</p>
      </div>

      <p style="margin:0 0 26px; max-width:260px; font-size:15.5px; font-weight:300; line-height:1.7; color:#5B5449;">${earned ? earned.perk + '.' : ''}</p>
      <button id="dismiss-celebrate" class="btn btn-gold" style="width:auto; padding:0 34px;">Keep voting</button>
    </div>`;
}

function finishedHTML() {
  return `
    <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 0 20px;">
      <span style="width:56px; height:56px; border-radius:28px; border:1px solid #A6842C; display:block; margin-bottom:26px;"></span>
      <h3 class="h-serif" style="font-size:29px; line-height:1.15; margin-bottom:14px;">Nicely done.</h3>
      <p style="margin:0 0 22px; max-width:270px; font-size:15.5px; font-weight:300; line-height:1.7; color:#5B5449;">You've voted on all currently available images. Check back as new images are added.</p>
      <span id="reset-votes-btn" style="font-size:13px; letter-spacing:.10em; text-transform:uppercase; color:#8C8375; cursor:pointer; text-decoration:underline;">Reset my votes (testing)</span>
    </div>`;
}
