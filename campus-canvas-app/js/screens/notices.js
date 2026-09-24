import { Store, SEED_PHOTOS, photoStyle } from '../store.js';
import { Router } from '../router.js';
import { bottomNav, avatarBtn, esc, safeUrl } from '../ui.js';

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function notices(root) {
  const p = Store.currentParticipant();
  const all = Store.liveNotices();
  const read = Store.readNoticeIds();
  const unread = all.filter((n) => !read.has(n.id));
  const [primary, ...rest] = all;

  root.innerHTML = `
    <div class="screen">
      <div class="topbar" style="padding-bottom:20px;">
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">Notices</span>
        <div style="display:flex; align-items:center; gap:8px;">
          ${unread.length ? `<span style="height:24px; min-width:24px; padding:0 8px; border-radius:12px; background:#C4543A; color:#FFFDF8; font-size:11px; font-weight:500; display:flex; align-items:center; justify-content:center;">${unread.length}</span>
          <span style="font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">Unread</span>` : `<span style="font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:#8C8375;">All read</span>`}
          ${avatarBtn(p, unread.length > 0)}
        </div>
      </div>
      <div class="scroll" style="padding:0 24px;">
        ${!all.length ? `<p style="color:#8C8375; font-size:13.5px; padding:40px 0; text-align:center;">Nothing published yet.</p>` : ''}
        ${primary ? noticeCard(primary, !read.has(primary.id), true) : ''}
        ${rest.map((n) => noticeCard(n, !read.has(n.id), false)).join('')}
        <div style="border-radius:18px; background:#F2ECE0; padding:20px; margin-bottom:22px;">
          <p class="eyebrow" style="letter-spacing:.20em;">Read earlier</p>
          <p style="margin:0; font-size:13.5px; font-weight:300; line-height:1.7; color:#4A443A;">Voting is open · Submissions close October 30 · Welcome to Campus Canvas</p>
        </div>
      </div>
      <div style="padding:14px 24px 0;">${bottomNav('notices')}</div>
    </div>`;

  root.querySelectorAll('[data-notice]').forEach((el) => {
    el.addEventListener('click', () => Router.go(`#/notice/${el.dataset.notice}`));
  });
}

function noticeCard(n, isUnread, big) {
  const photo = SEED_PHOTOS[n.title.length % SEED_PHOTOS.length];
  return `
    <div data-notice="${n.id}" class="card" style="overflow:hidden; margin-bottom:14px; cursor:pointer;">
      ${big ? `<div style="width:100%; aspect-ratio:2.1; ${photoStyle(photo)} display:block;"></div>` : ''}
      <div style="padding:${big ? '18px 20px 20px' : '20px'};">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          ${isUnread ? '<span style="width:7px; height:7px; border-radius:4px; background:#C4543A; display:block;"></span>' : ''}
          <span style="font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:#A6842C;">${esc(n.category)}</span>
        </div>
        <p class="h-serif" style="font-size:20px; line-height:1.25; margin-bottom:8px;">${esc(n.title)}</p>
        <p style="margin:0 0 16px; font-size:13.5px; font-weight:300; line-height:1.65; color:#4A443A;">${esc(n.body)}</p>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:11.5px; font-weight:300; color:#8C8375;">${timeAgo(n.publishedAt)}</span>
          ${n.ctaLabel ? `<span style="height:38px; padding:0 18px; border-radius:19px; background:#1B1916; color:#FBF8F2; display:flex; align-items:center; font-size:11px; font-weight:500; letter-spacing:.14em; text-transform:uppercase;">${esc(n.ctaLabel)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

export function noticeDetail(root, { parts }) {
  const id = parts[1];
  const n = Store.state.notices.find((x) => x.id === id);
  Store.markNoticeRead(id);
  if (!n) { Router.go('#/notices'); return; }
  root.innerHTML = `
    <div class="screen">
      <div style="padding:14px 24px 16px; border-bottom:1px solid rgba(27,25,22,.10); display:flex; align-items:center; gap:14px;">
        <button data-nav="#/notices" style="border:none; background:none; font-size:17px; color:#8C8375; cursor:pointer; padding:0;">&larr;</button>
        <span style="font-family:'Bodoni Moda',serif; font-size:12px; letter-spacing:.24em; text-transform:uppercase;">${esc(n.category)}</span>
      </div>
      <div class="scroll" style="padding:26px 24px 0;">
        <h2 class="h-serif" style="font-size:30px; line-height:1.1; margin-bottom:10px;">${esc(n.title)}</h2>
        <p style="margin:0 0 24px; font-size:12.5px; font-weight:300; color:#8C8375;">${timeAgo(n.publishedAt)}</p>
        <p style="margin:0 0 28px; font-size:14.5px; font-weight:300; line-height:1.8; color:#4A443A;">${esc(n.body)}</p>
        ${n.ctaLabel ? `<a href="${safeUrl(n.url)}" target="_blank" rel="noopener" class="btn btn-outline" style="text-decoration:none; margin-bottom:16px;">${esc(n.ctaLabel)}</a>` : ''}
      </div>
    </div>`;
}
