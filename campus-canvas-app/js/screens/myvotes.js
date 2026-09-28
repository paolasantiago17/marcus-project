import { Store, photoStyle } from '../store.js';
import { bottomNav, esc } from '../ui.js';

// Everything a participant has voted on, against every photo there is to
// vote on. Votes are final, so this only looks back; it never changes them.
let filter = 'all';
let openImageId = null;

const FILTERS = [
  ['all', 'All', () => true],
  ['like', 'Liked', (v) => v.value === 'like'],
  ['note', 'Notes', (v) => v.value === 'note'],
  ['pass', 'Passed', (v) => v.value === 'pass'],
];
const BADGE = {
  like: { mark: '&#9829;', bg: '#2E6B5C', label: 'You liked this' },
  note: { mark: '&#9998;', bg: '#A6842C', label: 'You liked this and left a note' },
  pass: { mark: '&#10005;', bg: '#8C8375', label: 'You passed on this' },
};
const NOTE_STATUS = {
  pending: 'Waiting for a curator. If it’s approved, it’ll show under the photo as “Anonymous”.',
  approved: 'Shared under this photo as “Anonymous”.',
  rejected: 'Kept private. Only you and the curators can see it.',
  private: 'Kept private. Only you and the curators can see it.',
};

export function myVotes(root) {
  const votes = Store.myVotes();
  const total = Store.votablePhotos().length;
  const left = Store.votingQueue().length;
  const [, , test] = FILTERS.find(([key]) => key === filter) || FILTERS[0];
  const shown = votes.filter(test);
  const pct = total ? Math.round((votes.length / total) * 100) : 0;
  const open = openImageId && votes.find((v) => v.imageId === openImageId);

  root.innerHTML = `
    <div class="screen screen-wide">
      <div class="topbar" style="padding-bottom:14px; display:grid; grid-template-columns:1fr auto 1fr;">
        <button data-nav="#/vote" aria-label="Back to voting" style="justify-self:start; border:none; background:none; padding:0; font-size:20px; color:#8C8375; cursor:pointer;">&larr;</button>
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">My votes</span>
        <span></span>
      </div>

      <div class="scroll" style="padding:0 22px 20px;">
        <div style="margin-bottom:18px;">
          <p class="h-serif" style="font-size:24px; line-height:1.2; margin-bottom:10px;">${votes.length} of ${total} photos voted</p>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
          ${FILTERS.map(([key, label, t]) => `
            <button data-filter="${key}" class="chip ${filter === key ? 'solid' : ''}" style="height:34px; border:1px solid rgba(27,25,22,.12); background:${filter === key ? '' : 'none'}; cursor:pointer;">${label} ${votes.filter(t).length}</button>`).join('')}
        </div>

        ${shown.length ? `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:10px; margin-bottom:22px;">
            ${shown.map((v) => `
              <button data-open="${v.imageId}" aria-label="${esc(v.image.title)}" style="position:relative; padding:0; border:none; border-radius:12px; overflow:hidden; aspect-ratio:1; background-color:#EDE6D8; ${photoStyle(v.image.photo)} cursor:pointer;">
                <span style="position:absolute; right:6px; bottom:6px; width:24px; height:24px; border-radius:12px; background:${BADGE[v.value].bg}; color:#FFFDF8; font-size:12px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,.25);">${BADGE[v.value].mark}</span>
              </button>`).join('')}
          </div>` : `
          <p style="margin:10px 0 24px; text-align:center; font-size:15px; font-weight:300; color:#8C8375;">${votes.length ? 'Nothing here yet.' : 'You haven’t voted on any photos yet.'}</p>`}

        ${left ? `
          <div class="card" style="padding:18px 20px; text-align:center;">
            <p style="margin:0 0 12px; font-size:15px; font-weight:300; color:#4A443A;">${left} photo${left === 1 ? '' : 's'} left to vote on</p>
            <a href="#/vote" class="btn btn-gold" style="width:auto; padding:0 28px; display:inline-flex; align-items:center; justify-content:center;">Keep voting</a>
          </div>` : ''}
      </div>

      <div style="padding:14px 22px 0;">${bottomNav('vote')}</div>
    </div>
    ${open ? detailHTML(open) : ''}`;

  root.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('click', () => { filter = el.dataset.filter; myVotes(root); }));
  root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { openImageId = el.dataset.open; myVotes(root); }));
  const close = () => { openImageId = null; myVotes(root); };
  root.querySelector('#vote-detail-close')?.addEventListener('click', close);
  root.querySelector('#vote-detail')?.addEventListener('click', (e) => { if (e.target.id === 'vote-detail') close(); });
}

function detailHTML(v) {
  const img = v.image;
  // Your own approved note is already shown above, so leave it out here.
  const others = Store.notesFor(img.id).filter((n) => !(v.value === 'note' && n.note === v.note && n.votedAt === v.votedAt));
  return `
    <div id="vote-detail" class="sheet-overlay">
      <div class="sheet" style="padding:0 0 24px; overflow:auto;">
        <div style="width:100%; aspect-ratio:1.42; background-color:#EDE6D8; ${photoStyle(img.photo)}"></div>
        <div style="padding:18px 22px 0;">
          <p class="h-serif" style="font-size:21px; line-height:1.25; margin-bottom:4px;">${esc(img.title)}</p>
          <p style="margin:0 0 14px; font-size:13.5px; font-weight:300; letter-spacing:.06em; color:#8C8375;">by ${esc(img.credit || 'a student')}</p>
          <p style="margin:0 0 16px; display:flex; align-items:center; gap:8px; font-size:14px; color:${BADGE[v.value].bg};">
            <span style="width:22px; height:22px; border-radius:11px; background:${BADGE[v.value].bg}; color:#FFFDF8; font-size:11px; display:inline-flex; align-items:center; justify-content:center;">${BADGE[v.value].mark}</span>
            ${BADGE[v.value].label} · ${new Date(v.votedAt).toLocaleDateString()}
          </p>
          ${v.value === 'note' ? `
            <div style="border-radius:12px; background:#F4EFE5; padding:14px 16px; margin-bottom:16px;">
              <p style="margin:0 0 6px; font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">Your note</p>
              <p style="margin:0 0 8px; font-size:15px; font-weight:300; line-height:1.6; color:#26231E; white-space:pre-wrap;">${esc(v.note)}</p>
              <p style="margin:0; font-size:12.5px; font-weight:300; line-height:1.5; color:#8C8375;">${NOTE_STATUS[v.noteStatus] || NOTE_STATUS.private}</p>
            </div>` : ''}
          ${others.length ? `
            <p style="margin:0 0 10px; font-size:11.5px; letter-spacing:.18em; text-transform:uppercase; color:#A6842C;">What voters noticed</p>
            ${others.map((n) => `
              <div style="margin-bottom:12px; padding-left:12px; border-left:2px solid rgba(166,132,44,.35);">
                <p style="margin:0 0 3px; font-size:14.5px; font-weight:300; line-height:1.6; color:#26231E; white-space:pre-wrap;">“${esc(n.note)}”</p>
                <p style="margin:0; font-size:12px; letter-spacing:.08em; color:#8C8375;">Anonymous</p>
              </div>`).join('')}` : ''}
          <button id="vote-detail-close" class="btn btn-outline" style="margin-top:8px;">Close</button>
        </div>
      </div>
    </div>`;
}
